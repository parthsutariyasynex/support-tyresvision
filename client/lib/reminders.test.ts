// Run: npm test --workspace=client
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { reminderReason, waitingFor } from './reminders';

describe('Reminders (header clock): why a chat is waiting and for how long', () => {
  test('reason', () => {
    assert.equal(reminderReason({ kind: 'unassigned', notOpened: false, unread: 3 }), 'New chat · nobody has taken it');
    assert.equal(reminderReason({ kind: 'assigned', notOpened: true, unread: 1 }), 'Assigned to you · not opened yet');
    assert.equal(reminderReason({ kind: 'assigned', notOpened: false, unread: 1 }), 'Assigned to you · 1 new message');
    assert.equal(reminderReason({ kind: 'assigned', notOpened: false, unread: 4 }), 'Assigned to you · 4 new messages');
  });
  test('waiting time: minutes, hours, days', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const ago = (min: number) => new Date(now - min * 60_000).toISOString();
    assert.equal(waitingFor(ago(7), now), 'waiting 7 min');
    assert.equal(waitingFor(ago(60), now), 'waiting 1 h');
    assert.equal(waitingFor(ago(125), now), 'waiting 2 h 5 min');
    assert.equal(waitingFor(ago(60 * 24), now), 'waiting 1 day');
    assert.equal(waitingFor(ago(60 * 24 * 11 + 30), now), 'waiting 11 days');
    assert.equal(waitingFor(new Date(now + 60_000).toISOString(), now), 'waiting 0 min'); // clock skew: never negative
  });
});
