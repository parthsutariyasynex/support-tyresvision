import { z } from 'zod';
import type { AuthPayload } from '../auth.js';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import { AppError } from './errors.js';
import { requireAdmin } from './permissions.js';
import { parse } from './validate.js';
import { logFailure } from './logging.js';

const connectSchema = z.object({
  wabaId: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  accessToken: z.string().trim().min(10),
});

// Never select accessToken here: this is what clients get to see
const publicFields = { wabaId: true, phoneNumberId: true, displayPhone: true } as const;

export function getWhatsAppAccount(workspaceId: string) {
  return prisma.whatsAppAccount.findUnique({ where: { workspaceId }, select: publicFields });
}

// Permissions a token needs: sending and receiving, and reading the account (numbers, templates, subscriptions)
const REQUIRED_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'];

export type ConnectionCheckKey = 'number' | 'account' | 'token' | 'app' | 'permissions' | 'expiry' | 'webhook';
export type ConnectionCheck = { key: ConnectionCheckKey; ok: boolean; detail: string };
export type ConnectionTest = { ok: boolean; displayPhone: string | null; verifiedName: string | null; checks: ConnectionCheck[] };

// One Graph API read with the token being tested. Meta's refusals come back as a message (never the token);
// only an unreachable Meta throws.
async function graphGet(path: string, accessToken: string, fetchImpl: typeof fetch) {
  const r = await fetchImpl(`${env.graphBase}/${env.graphVersion}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const, body } : { ok: false as const, error: String(body?.error?.message ?? `Meta answered ${r.status}`) };
}

// Everything a number needs before the workspace switches to it, asked of Meta (reads only, nothing changes there):
// the number exists and belongs to the WABA, the token is valid, permanent, has the WhatsApp permissions and was
// issued for this server's Meta app (META_APP_ID: the app whose secret signs the webhooks), and the WABA is
// subscribed to that app so incoming messages arrive. Saves nothing.
export async function checkWhatsAppConnection(rawInput: unknown, fetchImpl: typeof fetch = fetch): Promise<ConnectionTest> {
  const { wabaId, phoneNumberId, accessToken } = parse(connectSchema, rawInput);
  const appId = env.metaAppId;
  let phone, numbers, debug, subscribed;
  try {
    [phone, numbers, debug, subscribed] = await Promise.all([
      graphGet(`${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, accessToken, fetchImpl),
      graphGet(`${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=200`, accessToken, fetchImpl),
      graphGet(`debug_token?input_token=${encodeURIComponent(accessToken)}`, accessToken, fetchImpl),
      graphGet(`${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken, fetchImpl),
    ]);
  } catch (err) {
    // Only the error's own message: never the request (debug_token has the token in its address)
    void logFailure('whatsapp.connect_unreachable', "Couldn't reach Meta to check the WhatsApp number", new Error((err as Error)?.message ?? String(err)), { category: 'whatsapp' });
    throw new AppError('Could not reach Meta. Try again.', 502, 'META_UNREACHABLE');
  }

  const checks: ConnectionCheck[] = [];
  const add = (key: ConnectionCheckKey, ok: boolean, detail: string) => checks.push({ key, ok, detail });
  const displayPhone: string | null = phone.ok ? (phone.body?.display_phone_number ?? null) : null;
  const verifiedName: string | null = phone.ok ? (phone.body?.verified_name ?? null) : null;

  add('number', phone.ok, phone.ok ? `Phone number ID is ${displayPhone ?? 'a number'}${verifiedName ? ` (${verifiedName})` : ''}` : phone.error);

  if (!numbers.ok) add('account', false, numbers.error);
  else {
    const inWaba = (numbers.body?.data ?? []).some((n: any) => String(n?.id) === phoneNumberId);
    add('account', inWaba, inWaba ? 'The number belongs to this WhatsApp Business account' : `The number isn't in WhatsApp Business account ${wabaId}`);
  }

  const token = debug.ok ? debug.body?.data : null;
  if (!token) {
    const why = debug.ok ? 'Meta returned no details for this token' : debug.error;
    for (const key of ['token', 'app', 'permissions', 'expiry'] as const) add(key, false, key === 'token' ? why : 'Not checked: the token could not be read');
  } else {
    add('token', token.is_valid === true, token.is_valid === true ? 'The token is valid' : String(token.error?.message ?? 'The token is not valid'));
    const tokenApp = token.app_id ? String(token.app_id) : '';
    if (!appId) add('app', false, `META_APP_ID isn't set on the server, so it can't confirm the token is for the app that signs the webhooks (the token is for app ${tokenApp || 'unknown'})`);
    else add('app', tokenApp === appId, tokenApp === appId ? `Issued for Meta app ${appId}` : `The token is for Meta app ${tokenApp || 'unknown'}, but the server's META_APP_ID is ${appId}`);
    const scopes: string[] = Array.isArray(token.scopes) ? token.scopes : [];
    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    add('permissions', !missing.length, missing.length ? `Missing permission: ${missing.join(', ')}` : `Has ${REQUIRED_SCOPES.join(' and ')}`);
    // 0 means it never expires (a system user token generated with "Never")
    const expiresAt = Number(token.expires_at ?? -1);
    add(
      'expiry',
      expiresAt === 0,
      expiresAt === 0
        ? 'Never expires'
        : expiresAt > 0
          ? `Expires ${new Date(expiresAt * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC: use a permanent system user token`
          : "Meta didn't say when it expires: use a permanent system user token",
    );
  }

  if (!subscribed.ok) add('webhook', false, subscribed.error);
  else {
    const apps: string[] = (subscribed.body?.data ?? []).map((a: any) => String(a?.whatsapp_business_api_data?.id ?? a?.id ?? ''));
    const target = appId || (token?.app_id ? String(token.app_id) : '');
    const ok = !!target && apps.includes(target);
    add('webhook', ok, ok ? `The account is subscribed to app ${target}: incoming messages will arrive` : `The account isn't subscribed to app ${target || '(unknown)'}, so incoming messages won't arrive. Subscribe it in Meta first.`);
  }

  return { ok: checks.every((c) => c.ok), displayPhone, verifiedName, checks };
}

// Settings → WhatsApp connection → Test connection: the checks only, nothing is saved. Admins only.
export async function testWhatsAppConnection(auth: AuthPayload, rawInput: unknown) {
  await requireAdmin(auth);
  return checkWhatsAppConnection(rawInput);
}

// Manual connect (paste IDs from Meta). Replace with Embedded Signup for real customers. Admins only:
// it changes which number the whole workspace sends from. Saved only when every check passes, so the current
// number stays connected until the new one is verified.
export async function connectWhatsApp(auth: AuthPayload, rawInput: unknown) {
  await requireAdmin(auth);
  const { workspaceId } = auth;
  const { wabaId, phoneNumberId, accessToken } = parse(connectSchema, rawInput);

  const test = await checkWhatsAppConnection({ wabaId, phoneNumberId, accessToken });
  if (!test.ok) {
    const number = test.checks.find((c) => c.key === 'number' && !c.ok);
    if (number) throw new AppError(number.detail || 'Invalid credentials', 400, 'INVALID_CREDENTIALS');
    const failed = test.checks.filter((c) => !c.ok).map((c) => c.detail);
    throw new AppError(`Connection test failed: ${failed.join(' · ')}`, 400, 'CONNECTION_TEST_FAILED');
  }

  const taken = await prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });
  if (taken && taken.workspaceId !== workspaceId)
    throw new AppError('Number is connected to another workspace', 409, 'NUMBER_TAKEN');

  const data = { wabaId, phoneNumberId, accessToken, displayPhone: test.displayPhone };
  return prisma.whatsAppAccount.upsert({
    where: { workspaceId },
    update: { ...data, updatedBy: auth.userId },
    create: { workspaceId, ...data, createdBy: auth.userId },
    select: publicFields,
  });
}
