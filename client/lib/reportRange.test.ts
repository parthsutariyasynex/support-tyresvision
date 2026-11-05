// Run: npm test --workspace=client
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { daysBetween, fullMonthGrid, longDay, matchReportPreset, reportPresetRange, weekdayName } from './reportRange';

describe('report date-range picker', () => {
  const now = new Date('2026-11-05T10:30:00Z'); // Thursday 5 Nov 2026, 14:30 in Dubai

  test('presets', () => {
    assert.deepEqual(reportPresetRange('monthToDate', now), { from: '2026-11-01', to: '2026-11-05' });
    assert.deepEqual(reportPresetRange('lastMonth', now), { from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(reportPresetRange('thisWeek', now), { from: '2026-11-01', to: '2026-11-05' }); // weeks start Sunday
    assert.deepEqual(reportPresetRange('lastWeek', now), { from: '2026-10-25', to: '2026-10-31' });
    assert.deepEqual(reportPresetRange('last3Months', now), { from: '2026-09-01', to: '2026-11-05' });
    assert.deepEqual(reportPresetRange('yearToDate', now), { from: '2026-01-01', to: '2026-11-05' });
    assert.deepEqual(reportPresetRange('lastYear', now), { from: '2025-01-01', to: '2025-12-31' });
    assert.equal(reportPresetRange('custom', now), null);
  });

  test('last month from 31 March is all of February (no month overflow)', () => {
    assert.deepEqual(reportPresetRange('lastMonth', new Date('2028-03-31T08:00:00Z')), { from: '2028-02-01', to: '2028-02-29' });
  });

  test('a range that matches no preset is custom', () => {
    assert.equal(matchReportPreset('2026-10-01', '2026-10-31', now), 'lastMonth');
    assert.equal(matchReportPreset('2026-10-03', '2026-10-09', now), 'custom');
  });

  test('month grid: full weeks from Sunday, neighbouring days marked outside the month', () => {
    const weeks = fullMonthGrid(2026, 11); // December 2026 starts on a Tuesday
    assert.deepEqual(weeks[0].map((c) => c.day), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
    assert.deepEqual(weeks[0].map((c) => c.inMonth), [false, false, true, true, true, true, true]);
    assert.equal(weeks.length, 5);
    assert.equal(weeks.flat().filter((c) => c.inMonth).length, 31);
  });

  test('labels', () => {
    assert.equal(longDay('2026-11-01'), 'Nov 1, 2026');
    assert.equal(weekdayName('2026-11-05'), 'Thursday');
    assert.equal(daysBetween('2026-11-01', '2026-11-30'), 30);
    assert.equal(daysBetween('2026-11-05', '2026-11-05'), 1);
  });
});
