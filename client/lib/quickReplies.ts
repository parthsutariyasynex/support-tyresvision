import { gql } from './api';

// WhatsApp Business-style quick replies: typing "/" in the message box offers these
export type QuickReply = { id: string; shortcut: string; description: string | null; category: string | null };

// Up to 100 (the API maximum), so "/" alone lists every reply a workspace normally has
export async function fetchQuickReplies(search: string) {
  const query = `query QuickReplies($s: String) { quickReplies(search: $s, first: 100) { id shortcut description category } }`;
  return (await gql<{ quickReplies: QuickReply[] }>(query, { s: search || null })).quickReplies;
}

// Settings → Saved replies: the same list plus who added / last edited each one and when
export type SavedReply = QuickReply & { createdAt: string | null; createdByName: string | null; updatedAt: string | null; updatedByName: string | null };

export async function fetchSavedReplies(search: string) {
  const query = `query SavedReplies($s: String) { quickReplies(search: $s, first: 100) { id shortcut description category createdAt createdByName updatedAt updatedByName } }`;
  return (await gql<{ quickReplies: SavedReply[] }>(query, { s: search || null })).quickReplies;
}

// Same rule as the server (case-insensitive partial match on shortcut, text or category), used to narrow
// results that are still loading so the menu never offers a reply that doesn't match what's typed
export function matchesQuickReply(reply: QuickReply, search: string) {
  const t = search.trim().toLowerCase();
  if (!t) return true;
  // Categories are shown with spaces ("car tyres") but stored with underscores ("car_tyres")
  const category = reply.category?.toLowerCase().replace(/_/g, ' ');
  return [reply.shortcut, reply.description].some((v) => !!v && v.toLowerCase().includes(t)) || !!category?.includes(t.replace(/_/g, ' '));
}

// The "/" being typed, as in WhatsApp Business: at the start of the message or after a space or new line, up to the
// cursor; what follows it is the search. "Hello /pri|" -> { start: 6, query: 'pri' }; "Hi\n/|" -> query ''.
// Not a "/" right after a letter, digit or symbol (50/60, and/or, links), nor one followed straight away by a space
// ("Hello / ") or across lines.
export type SlashToken = { start: number; query: string };
export const SLASH_QUERY_MAX = 60;
export function slashAt(text: string, caret: number): SlashToken | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const start = before.lastIndexOf('/');
  if (start === -1) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (/^\s/.test(query) || query.includes('\n') || query.length > SLASH_QUERY_MAX) return null;
  return { start, query };
}

// Picking a reply replaces just the "/search" (from the "/" to the cursor) with the reply's text; what was written
// before and after it stays. Returns the new text and where the cursor goes (after the inserted reply).
export function insertQuickReplyText(text: string, token: SlashToken, caret: number, reply: string) {
  const before = text.slice(0, token.start);
  const after = text.slice(Math.max(caret, token.start));
  return { text: before + reply + after, caret: before.length + reply.length };
}

// Splits text into parts, marking each case-insensitive occurrence of `query` (for highlighting)
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

// ---- Settings → Saved replies: create / edit / delete (owners, admins and supervisors; the server checks)
export type QuickReplyInput = { shortcut: string; description: string; category: string | null };

const QUICK_REPLY_FIELDS = 'id shortcut description category';

export async function createQuickReply(input: QuickReplyInput) {
  const query = `mutation CreateQuickReply($input: CreateQuickReplyInput!) { createQuickReply(input: $input) { ${QUICK_REPLY_FIELDS} } }`;
  return (await gql<{ createQuickReply: QuickReply }>(query, { input: { ...input, category: input.category ?? '' } })).createQuickReply;
}

export async function updateQuickReply(id: string, input: Partial<QuickReplyInput>) {
  const query = `mutation UpdateQuickReply($id: ID!, $input: UpdateQuickReplyInput!) { updateQuickReply(id: $id, input: $input) { ${QUICK_REPLY_FIELDS} } }`;
  // null category means "clear it": send "" so the server doesn't treat it as "unchanged"
  const body = 'category' in input ? { ...input, category: input.category ?? '' } : input;
  return (await gql<{ updateQuickReply: QuickReply }>(query, { id, input: body })).updateQuickReply;
}

export async function deleteQuickReply(id: string) {
  await gql(`mutation DeleteQuickReply($id: ID!) { deleteQuickReply(id: $id) }`, { id });
}

// Same roles the server allows to manage saved replies
export const canManageQuickReplies = (role: string) => ['owner', 'admin', 'supervisor'].includes(role);
