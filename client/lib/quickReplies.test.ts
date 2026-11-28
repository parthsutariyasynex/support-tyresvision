// Run: npm test --workspace=client
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { highlightParts, insertQuickReplyText, matchesQuickReply, slashAt } from './quickReplies';

describe('quick replies helpers', () => {
  const at = (text: string, caret = text.length) => slashAt(text, caret)?.query ?? null;
  test('"/" at the start, or after a space or new line, opens the menu; the rest is the search', () => {
    assert.equal(at('/'), '');
    assert.equal(at('/tyrescart'), 'tyrescart');
    assert.equal(at('/Payment Options'), 'Payment Options');
    assert.equal(at('Hello /'), ''); // like WhatsApp Business
    assert.equal(at('Hello /price'), 'price');
    assert.equal(at('Hi\n/'), '');
    assert.deepEqual(slashAt('Hello /pri', 10), { start: 6, query: 'pri' });
    assert.equal(at(''), null);
    assert.equal(at('Hello'), null);
  });
  test('not a slash inside a word, number or link, nor one followed by a space', () => {
    assert.equal(at('265/65'), null);
    assert.equal(at('and/or'), null);
    assert.equal(at('https://tyrescart.ae/'), null);
    assert.equal(at('Hello / '), null);
    assert.equal(at('Hello / thanks'), null);
    assert.equal(at('/a\nb'), null); // the search doesn't run across lines
  });
  test('the search is what is before the cursor', () => {
    assert.equal(at('Hello /price and more', 12), 'price');
    assert.equal(at('Hello /price', 3), null);
  });
  test('picking a reply replaces only the "/search"', () => {
    assert.deepEqual(insertQuickReplyText('Hello /pri', { start: 6, query: 'pri' }, 10, 'Price list'), { text: 'Hello Price list', caret: 16 });
    assert.deepEqual(insertQuickReplyText('/', { start: 0, query: '' }, 1, 'Hi!'), { text: 'Hi!', caret: 3 });
    assert.deepEqual(insertQuickReplyText('A /x B', { start: 2, query: 'x' }, 4, 'Y'), { text: 'A Y B', caret: 3 });
  });

  test('highlights every case-insensitive match and keeps the original text', () => {
    const parts = highlightParts('Welcome to TyresCart.ae, the tyrescart shop', 'TYRESCART');
    assert.deepEqual(parts, [
      { text: 'Welcome to ', match: false },
      { text: 'TyresCart', match: true },
      { text: '.ae, the ', match: false },
      { text: 'tyrescart', match: true },
      { text: ' shop', match: false },
    ]);
    assert.equal(parts.map((p) => p.text).join(''), 'Welcome to TyresCart.ae, the tyrescart shop');
  });

  test('no query, no match, and special characters are treated literally', () => {
    assert.deepEqual(highlightParts('Stockcheck', ''), [{ text: 'Stockcheck', match: false }]);
    assert.deepEqual(highlightParts('Stockcheck', 'xyz'), [{ text: 'Stockcheck', match: false }]);
    assert.deepEqual(highlightParts('AED 150+ (approx.)', '150+ ('), [
      { text: 'AED ', match: false },
      { text: '150+ (', match: true },
      { text: 'approx.)', match: false },
    ]);
  });
});

describe('matchesQuickReply (narrowing while results load)', () => {
  const r = { id: '1', shortcut: 'Hours', description: "We're currently open\nFriday: 09:00", category: 'car_tyres' };
  test('matches shortcut, text or category, case-insensitively; empty search matches everything', () => {
    assert.ok(matchesQuickReply(r, 'hours'));
    assert.ok(matchesQuickReply(r, 'FRIDAY'));
    assert.ok(matchesQuickReply(r, 'car_ty'));
    assert.ok(matchesQuickReply(r, 'car tyres')); // shown as "car tyres"
    assert.ok(matchesQuickReply(r, 'CAR TY'));
    assert.ok(matchesQuickReply(r, '  '));
    assert.ok(!matchesQuickReply(r, 'tyrescart'));
    assert.ok(!matchesQuickReply({ ...r, description: null, category: null }, 'friday'));
  });
});

describe('emojis in quick replies (client)', () => {
  const text = 'Welcome to TyresCart.ae 🇦🇪 — thanks 🤗👨‍🔧';
  test('highlighting never splits an emoji and rebuilds the exact text', () => {
    for (const q of ['tyrescart', '🤗', '🇦🇪', 'thanks 🤗', '👨‍🔧']) {
      const parts = highlightParts(text, q);
      assert.equal(parts.map((p) => p.text).join(''), text);
      for (const p of parts) assert.ok(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(p.text), `split surrogate pair for "${q}"`);
    }
    assert.deepEqual(highlightParts(text, '🤗').filter((p) => p.match).map((p) => p.text), ['🤗']);
  });
  test('"/" search with emojis', () => {
    assert.equal(slashAt('/welcome😊', 10)?.query, 'welcome😊');
    const r = { id: '1', shortcut: 'referring', description: text, category: 'car_tyres' };
    assert.ok(matchesQuickReply(r, '🇦🇪'));
    assert.ok(!matchesQuickReply(r, '😊'));
  });
});
