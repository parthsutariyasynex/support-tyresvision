import { useSyncExternalStore } from 'react';

// Unsent text in a chat's message box (WhatsApp-style drafts): kept per chat while you switch chats, and in this
// browser (localStorage) so a reload or a closed tab doesn't lose it. A reply draft and a note draft are kept
// apart, so a note is never brought back as a message to the customer. Sending (or emptying the box) removes it;
// drafts untouched for DRAFT_DAYS are dropped.

export type DraftMode = 'reply' | 'note';
export type Draft = { text: string; mode: DraftMode; at: number };

const KEY = 'support:drafts';
const DRAFT_DAYS = 14;
const MAX_LENGTH = 10000;

let drafts: Record<string, Draft> | null = null;
const listeners = new Set<() => void>();

function load(): Record<string, Draft> {
  if (drafts) return drafts;
  drafts = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Draft>;
    const oldest = Date.now() - DRAFT_DAYS * 86_400_000;
    for (const [id, d] of Object.entries(raw ?? {}))
      if (d && typeof d.text === 'string' && d.text.trim() && (d.mode === 'reply' || d.mode === 'note') && d.at > oldest) drafts[id] = d;
  } catch {
    // unreadable or blocked storage: start empty
  }
  return drafts;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  // Typing saves a moment later, not on every key
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(drafts ?? {}));
    } catch {
      // private mode or full storage: drafts still last while the app is open
    }
  }, 300);
}

export function getDraft(conversationId: string): Draft | null {
  if (typeof window === 'undefined') return null;
  return load()[conversationId] ?? null;
}

// Saves the box's text for this chat; empty text removes the draft
export function setDraft(conversationId: string, text: string, mode: DraftMode) {
  if (typeof window === 'undefined') return;
  const all = load();
  const before = all[conversationId];
  if (!text.trim()) {
    if (!before) return;
    delete all[conversationId];
  } else {
    if (before && before.text === text && before.mode === mode) return;
    all[conversationId] = { text: text.slice(0, MAX_LENGTH), mode, at: Date.now() };
  }
  drafts = { ...all };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the app changed the drafts
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    drafts = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

// Every chat's draft (for the chat list's "Draft:" previews); re-renders when one changes
export function useDrafts(): Record<string, Draft> {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}
const EMPTY: Record<string, Draft> = {};
