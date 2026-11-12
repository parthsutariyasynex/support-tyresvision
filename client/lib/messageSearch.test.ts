// Run: npm test --workspace=client
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findMessageMatches, highlightSegments, highlightWords, searchSnippet, searchWords } from './messageSearch';

describe('Search in conversation', () => {
  const msgs = [
    { id: 'm1', body: 'Do you have Michelin 205/55?', deletedAt: null },
    { id: 'm2', body: 'Yes, Michelin and Pirelli in stock', deletedAt: null },
    { id: 'm3', body: 'michelin price?', deletedAt: '2026-10-14T10:00:00.000Z' },
    { id: 'm4', body: 'Sending the quote now', deletedAt: null },
  ];
  test('matches are case-insensitive substrings over loaded, non-deleted messages, oldest first', () => {
    assert.deepEqual(findMessageMatches(msgs, 'michelin'), ['m1', 'm2']);
    assert.deepEqual(findMessageMatches(msgs, 'MICHELIN '), ['m1', 'm2']);
    assert.deepEqual(findMessageMatches(msgs, '205/55'), ['m1']);
    assert.deepEqual(findMessageMatches(msgs, 'quote'), ['m4']);
    assert.deepEqual(findMessageMatches(msgs, 'nothing'), []);
    assert.deepEqual(findMessageMatches(msgs, ''), []);
    assert.deepEqual(findMessageMatches(msgs, '   '), []);
  });
  test('highlighting splits the text around every occurrence, keeping the original casing', () => {
    assert.deepEqual(highlightSegments('Yes, Michelin and michelin', 'michelin'), [
      { text: 'Yes, ', match: false },
      { text: 'Michelin', match: true },
      { text: ' and ', match: false },
      { text: 'michelin', match: true },
    ]);
    assert.deepEqual(highlightSegments('abc', ''), [{ text: 'abc', match: false }]);
    assert.deepEqual(highlightSegments('abc', 'zzz'), [{ text: 'abc', match: false }]);
    assert.deepEqual(highlightSegments('', 'a'), [{ text: '', match: false }]);
    assert.deepEqual(highlightSegments('aaa', 'a'), [{ text: 'a', match: true }, { text: 'a', match: true }, { text: 'a', match: true }]);
  });
});

describe('chat list search: Messages section', () => {
  test('words: split on spaces, each once, at most 10', () => {
    assert.deepEqual(searchWords('  Metzeler   180/60 R17 '), ['Metzeler', '180/60', 'R17']);
    assert.deepEqual(searchWords('a a b'), ['a', 'b']);
    assert.equal(searchWords('1 2 3 4 5 6 7 8 9 10 11 12').length, 10);
    assert.deepEqual(searchWords('   '), []);
  });
  test('each word highlighted on its own, any case, overlaps merged', () => {
    const words = searchWords('racetec metzeler R17');
    const marked = highlightWords('Metzeler 180/60 R17 Racetec TD Slick', words).filter((s) => s.match).map((s) => s.text);
    assert.deepEqual(marked, ['Metzeler', 'R17', 'Racetec']);
    assert.deepEqual(highlightWords('abcd', ['abc', 'bcd']), [{ text: 'abcd', match: true }]);
    assert.deepEqual(highlightWords('no match here', ['xyz']), [{ text: 'no match here', match: false }]);
    assert.equal(highlightWords('Metzeler', ['metz']).map((s) => s.text).join(''), 'Metzeler'); // nothing lost
  });
  test('snippet: one line, the first match in view, … where cut', () => {
    assert.equal(searchSnippet('Line one\nLine two', ['two']), 'Line one Line two');
    const long = `${'x'.repeat(200)} Metzeler Racetec ${'y'.repeat(200)}`;
    const s = searchSnippet(long, ['metzeler'], 120);
    assert.ok(s.startsWith('…') && s.endsWith('…') && s.includes('Metzeler'));
    assert.ok(searchSnippet(`Metzeler ${'z'.repeat(300)}`, ['metzeler'], 120).startsWith('Metzeler'));
  });
});
