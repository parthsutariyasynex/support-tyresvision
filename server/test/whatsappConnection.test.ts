// Settings → WhatsApp connection: the checks a new number must pass before the workspace switches to it, against a
// mocked Meta (fetch is replaced, nothing leaves this machine). No database needed (only checkWhatsAppConnection is
// called, which saves nothing; log writes are captured): `npx tsx --test test/whatsappConnection.test.ts`.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const APP_ID = '1494166767104376';
const WABA = '1062833673454992';
const PHONE = '1450979291423917';
const TOKEN = 'EAAG-test-permanent-token-secret';
const input = { wabaId: WABA, phoneNumberId: PHONE, accessToken: TOKEN };

let settings: typeof import('../src/services/settings.js');
let logging: typeof import('../src/services/logging.js');
const saved: import('../src/services/logging.js').LogRecord[] = [];

before(async () => {
  process.env.META_APP_ID = APP_ID; // read when env.ts loads, below
  settings = await import('../src/services/settings.js');
  logging = await import('../src/services/logging.js');
  logging.setLogWriter(async (r) => saved.push(r));
});
after(() => logging?.setLogWriter());

type Replies = { phone?: unknown; numbers?: unknown; debug?: unknown; subscribed?: unknown };
const error = (message: string) => ({ status: 400, body: { error: { message, type: 'OAuthException', code: 100 } } });
const healthy = {
  phone: { status: 200, body: { id: PHONE, display_phone_number: '+971 55 264 7373', verified_name: 'TyresCart' } },
  numbers: { status: 200, body: { data: [{ id: '111' }, { id: PHONE }] } },
  debug: {
    status: 200,
    body: { data: { app_id: APP_ID, type: 'SYSTEM_USER', is_valid: true, expires_at: 0, scopes: ['whatsapp_business_management', 'whatsapp_business_messaging', 'public_profile'] } },
  },
  subscribed: { status: 200, body: { data: [{ whatsapp_business_api_data: { id: APP_ID, name: 'TyresCart' } }] } },
};

// A fake Meta: answers each Graph call from `replies` (healthy unless overridden) and records what was asked
function mockMeta(replies: Replies = {}) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    calls.push({ url: u.pathname + u.search, auth: new Headers(init?.headers).get('authorization') });
    const all = { ...healthy, ...replies } as Record<string, { status: number; body: unknown }>;
    const reply = u.pathname.endsWith('/debug_token')
      ? all.debug
      : u.pathname.endsWith('/phone_numbers')
        ? all.numbers
        : u.pathname.endsWith('/subscribed_apps')
          ? all.subscribed
          : all.phone;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const check = (r: import('../src/services/settings.js').ConnectionTest, key: string) => r.checks.find((c) => c.key === key)!;
const failed = (r: import('../src/services/settings.js').ConnectionTest) => r.checks.filter((c) => !c.ok).map((c) => c.key);

describe('checkWhatsAppConnection', () => {
  test('a correct number, WABA and permanent token for this app passes every check', async () => {
    const { fetchImpl, calls } = mockMeta();
    const r = await settings.checkWhatsAppConnection(input, fetchImpl);
    assert.equal(r.ok, true);
    assert.deepEqual(failed(r), []);
    assert.deepEqual(r.checks.map((c) => c.key), ['number', 'account', 'token', 'app', 'permissions', 'expiry', 'webhook']);
    assert.equal(r.displayPhone, '+971 55 264 7373');
    assert.equal(r.verifiedName, 'TyresCart');
    // Reads only, each with the token being tested
    assert.equal(calls.length, 4);
    assert.ok(calls.every((c) => c.auth === `Bearer ${TOKEN}`));
  });

  test('the result never contains the access token', async () => {
    const r = await settings.checkWhatsAppConnection(input, mockMeta().fetchImpl);
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  });

  test('a temporary token is refused, with when it expires', async () => {
    const debug = { status: 200, body: { data: { ...healthy.debug.body.data, type: 'USER', expires_at: Date.UTC(2026, 10, 3, 14) / 1000 } } };
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ debug }).fetchImpl);
    assert.equal(r.ok, false);
    assert.deepEqual(failed(r), ['expiry']);
    assert.match(check(r, 'expiry').detail, /2026-11-03 14:00 UTC.*permanent/);
  });

  test('missing WhatsApp permissions are named', async () => {
    const debug = { status: 200, body: { data: { ...healthy.debug.body.data, scopes: ['whatsapp_business_management'] } } };
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ debug }).fetchImpl);
    assert.deepEqual(failed(r), ['permissions']);
    assert.match(check(r, 'permissions').detail, /whatsapp_business_messaging/);
  });

  test("a token from another Meta app fails (its webhooks would be signed with that app's secret)", async () => {
    const debug = { status: 200, body: { data: { ...healthy.debug.body.data, app_id: '555' } } };
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ debug }).fetchImpl);
    assert.deepEqual(failed(r), ['app']);
    assert.match(check(r, 'app').detail, new RegExp(`555.*${APP_ID}`));
  });

  test('a number outside the given WABA fails', async () => {
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ numbers: { status: 200, body: { data: [{ id: '111' }] } } }).fetchImpl);
    assert.deepEqual(failed(r), ['account']);
    assert.match(check(r, 'account').detail, new RegExp(WABA));
  });

  test('a WABA not subscribed to the app fails: incoming messages would not arrive', async () => {
    const subscribed = { status: 200, body: { data: [{ whatsapp_business_api_data: { id: '999', name: 'Other app' } }] } };
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ subscribed }).fetchImpl);
    assert.deepEqual(failed(r), ['webhook']);
    assert.match(check(r, 'webhook').detail, /won't arrive/);
  });

  test("Meta's refusals come back as the check's detail", async () => {
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ phone: error('Unsupported get request. Object with ID does not exist') }).fetchImpl);
    assert.equal(r.ok, false);
    assert.equal(r.displayPhone, null);
    assert.match(check(r, 'number').detail, /does not exist/);
  });

  test('an invalid token fails the token check, and the checks that depend on it say why', async () => {
    const r = await settings.checkWhatsAppConnection(input, mockMeta({ debug: error('Invalid OAuth access token') }).fetchImpl);
    assert.deepEqual(failed(r), ['token', 'app', 'permissions', 'expiry']);
    assert.match(check(r, 'token').detail, /Invalid OAuth/);
    assert.match(check(r, 'expiry').detail, /Not checked/);
  });

  test('bad input is refused before Meta is asked', async () => {
    const { fetchImpl, calls } = mockMeta();
    await assert.rejects(settings.checkWhatsAppConnection({ ...input, accessToken: 'short' }, fetchImpl), { code: 'BAD_USER_INPUT' });
    assert.equal(calls.length, 0);
  });

  test("an unreachable Meta is META_UNREACHABLE, and the log doesn't carry the token", async () => {
    saved.length = 0;
    const down = (async (url: string | URL) => {
      throw new TypeError('fetch failed', { cause: new Error(`connect ETIMEDOUT ${String(url)}`) });
    }) as typeof fetch;
    await assert.rejects(settings.checkWhatsAppConnection(input, down), { code: 'META_UNREACHABLE' });
    await new Promise((r) => setImmediate(r)); // logged without awaiting
    assert.ok(saved.length >= 1);
    assert.ok(!JSON.stringify(saved).includes(TOKEN));
  });
});
