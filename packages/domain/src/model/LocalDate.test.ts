import { describe, expect, it } from 'vitest';
import { epochMillis } from './EpochMillis.js';
import { LocalDate } from './LocalDate.js';
import { InvalidLocalDateError } from '../errors/InvalidLocalDateError.js';

describe('LocalDate', () => {
  it('round-trips through the epoch day', () => {
    for (const text of ['1970-01-01', '2026-09-21', '2000-02-29', '1999-12-31', '2100-03-01']) {
      expect(LocalDate.fromEpochDay(LocalDate.parse(text).toEpochDay()).toString()).toBe(text);
    }
  });

  it('reads the calendar date out of an instant in UTC', () => {
    // 2026-09-21T22:00:00Z
    expect(LocalDate.fromEpochMillis(epochMillis(1_790_028_000_000)).toString()).toBe('2026-09-21');
  });

  it('places instants before the epoch on the right day', () => {
    expect(LocalDate.fromEpochMillis(epochMillis(-1)).toString()).toBe('1969-12-31');
  });

  it('knows which Februaries have 29 days', () => {
    expect(LocalDate.of(2024, 2, 29).toString()).toBe('2024-02-29');
    expect(LocalDate.of(2000, 2, 29).toString()).toBe('2000-02-29');
    expect(() => LocalDate.of(1900, 2, 29)).toThrow(InvalidLocalDateError);
    expect(() => LocalDate.of(2025, 2, 29)).toThrow(InvalidLocalDateError);
  });

  it('rejects impossible parts', () => {
    expect(() => LocalDate.of(2026, 13, 1)).toThrow(InvalidLocalDateError);
    expect(() => LocalDate.of(2026, 0, 1)).toThrow(InvalidLocalDateError);
    expect(() => LocalDate.of(2026, 4, 31)).toThrow(InvalidLocalDateError);
    expect(() => LocalDate.parse('21-09-2026')).toThrow(InvalidLocalDateError);
  });

  it('adds days across a month and a year boundary', () => {
    expect(LocalDate.parse('2026-01-31').plusDays(1).toString()).toBe('2026-02-01');
    expect(LocalDate.parse('2026-12-31').plusDays(1).toString()).toBe('2027-01-01');
    expect(LocalDate.parse('2026-03-01').plusDays(-1).toString()).toBe('2026-02-28');
  });

  it('counts the days between two dates', () => {
    // A potato campaign is about 120 days; the Simulator will lean on this.
    expect(LocalDate.parse('2026-09-21').daysUntil(LocalDate.parse('2027-01-19'))).toBe(120);
    expect(LocalDate.parse('2026-09-21').daysUntil(LocalDate.parse('2026-09-21'))).toBe(0);
  });

  it('serialises as an ISO calendar date', () => {
    expect(JSON.stringify({ date: LocalDate.parse('2026-09-21') })).toBe('{"date":"2026-09-21"}');
  });
});
