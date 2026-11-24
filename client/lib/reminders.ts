import { gql } from './api';

// Header → Reminders (clock): the chats waiting for you right now, by the same rules as the reminder pop-ups
// (assigned to you and not opened / with unread customer messages, or new chats nobody has taken).
export type ReminderChat = {
  conversationId: string;
  contactName: string | null;
  contactWaId: string;
  kind: 'assigned' | 'unassigned';
  notOpened: boolean;
  unread: number;
  waitingSince: string;
};
export type Reminders = { minutes: number; chats: ReminderChat[] };

export async function fetchMyReminders() {
  const query = `query MyReminders {
    myReminders { minutes chats { conversationId contactName contactWaId kind notOpened unread waitingSince } }
  }`;
  return (await gql<{ myReminders: Reminders }>(query)).myReminders;
}

// Something that may change the list happened (a reminder arrived, a chat was opened, assigned, closed...):
// the clock reloads it (debounced)
export const REMINDERS_EVENT = 'reminders:refresh';
export const refreshReminders = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REMINDERS_EVENT));
};

// Live events that can change someone's list (a new chat or message, read, assigned / unassigned, closed or snoozed,
// deleted, the workspace's reminder time, a reminder itself). Reminders are shown only in the clock, on every page,
// never as pop-ups.
export const REMINDER_TRIGGERS: ReadonlySet<string> = new Set([
  'chat:new',
  'conversation:started',
  'message:new',
  'conversation:unread',
  'conversation:assigned',
  'assignment:you',
  'assignment:removed',
  'assignment:changed',
  'conversation:status',
  'conversation:deleted',
  'contact:deleted',
  'contact:restored',
  'member:removed',
  'workspace:settings',
  'assignment:reminder',
]);

// "Assigned to you · not opened yet" / "Assigned to you · 2 new messages" / "New chat · nobody has taken it"
export function reminderReason(c: Pick<ReminderChat, 'kind' | 'notOpened' | 'unread'>) {
  if (c.kind === 'unassigned') return 'New chat · nobody has taken it';
  if (c.notOpened) return 'Assigned to you · not opened yet';
  return `Assigned to you · ${c.unread === 1 ? '1 new message' : `${c.unread} new messages`}`;
}

// "waiting 7 min" / "waiting 2 h 5 min" / "waiting 3 days"
export function waitingFor(sinceIso: string, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 60_000));
  if (min < 60) return `waiting ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `waiting ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.floor(h / 24);
  return `waiting ${d} ${d === 1 ? 'day' : 'days'}`;
}
