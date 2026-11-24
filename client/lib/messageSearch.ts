import type { Message } from './inbox';

// "Search in conversation": matches over the messages loaded in the open chat (case-insensitive substring of the
// text; deleted messages have no text). Oldest first, so ↑ walks back in time and ↓ forward, like WhatsApp.
export function findMessageMatches(messages: Pick<Message, 'id' | 'body' | 'deletedAt'>[], query: string): string[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return messages.filter((m) => !m.deletedAt && (m.body || '').toLowerCase().includes(term)).map((m) => m.id);
}

// Splits text into plain and matching segments for highlighting (case-insensitive, keeps the original casing)
export function highlightSegments(text: string, query: string): { text: string; match: boolean }[] {
  const term = query.trim().toLowerCase();
  if (!term || !text) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(term, i);
    if (j === -1) {
      out.push({ text: text.slice(i), match: false });
      break;
    }
    if (j > i) out.push({ text: text.slice(i, j), match: false });
    out.push({ text: text.slice(j, j + term.length), match: true });
    i = j + term.length;
  }
  return out;
}

// --- Chat list search → "Messages" section (like WhatsApp): a message matches when it has all the typed words, in any
// order and any case (the server finds them: searchMessages). Each word is highlighted on its own.

// The typed words (at most 10, each once), as the server reads them
export const searchWords = (query: string) => [...new Set(query.trim().split(/\s+/).filter(Boolean))].slice(0, 10);

// Plain and matching segments of `text`, where any of `words` occurs (case-insensitive; overlapping matches merged)
export function highlightWords(text: string, words: string[]): { text: string; match: boolean }[] {
  if (!text) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const w of words.map((x) => x.toLowerCase()).filter(Boolean)) {
    for (let i = lower.indexOf(w); i !== -1; i = lower.indexOf(w, i + w.length)) ranges.push([i, i + w.length]);
  }
  if (!ranges.length) return [{ text, match: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out: { text: string; match: boolean }[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push({ text: text.slice(at, s), match: false });
    out.push({ text: text.slice(s, e), match: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}

// One line of a long message for its search result: line breaks as spaces, starting a little before the first match
// ("…" where it was cut), so the matching words are always in view
export function searchSnippet(text: string, words: string[], max = 120) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const lower = flat.toLowerCase();
  const first = Math.min(...words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0), flat.length);
  const start = first === flat.length || first < 30 ? 0 : first - 30;
  const piece = flat.slice(start, start + max);
  return `${start > 0 ? '…' : ''}${piece}${start + max < flat.length ? '…' : ''}`;
}
