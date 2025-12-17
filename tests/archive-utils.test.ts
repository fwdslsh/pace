import { describe, expect, test } from 'bun:test';

import { normalizeTimestamp } from '../src/archive-utils';

describe('normalizeTimestamp', () => {
  test('converts valid ISO timestamp to directory-safe format', () => {
    const result = normalizeTimestamp('2025-12-15T17:00:00.000Z');
    expect(result).toBe('2025-12-15_17-00-00');
  });

  test('converts ISO timestamp with different timezone (UTC)', () => {
    const result = normalizeTimestamp('2025-01-01T00:00:00.000Z');
    expect(result).toBe('2025-01-01_00-00-00');
  });

  test('converts ISO timestamp with milliseconds', () => {
    const result = normalizeTimestamp('2025-06-15T23:59:59.999Z');
    expect(result).toBe('2025-06-15_23-59-59');
  });

  test('converts ISO timestamp without milliseconds', () => {
    const result = normalizeTimestamp('2025-03-10T12:30:45Z');
    expect(result).toBe('2025-03-10_12-30-45');
  });

  test('handles ISO timestamp with timezone offset (+00:00)', () => {
    // This timestamp is 14:00 UTC when converted from +02:00
    const result = normalizeTimestamp('2025-12-15T16:00:00+02:00');
    expect(result).toBe('2025-12-15_14-00-00');
  });

  test('handles ISO timestamp with negative timezone offset', () => {
    // This timestamp is 22:00 UTC when converted from -05:00
    const result = normalizeTimestamp('2025-12-15T17:00:00-05:00');
    expect(result).toBe('2025-12-15_22-00-00');
  });

  test('pads single-digit months and days with zeros', () => {
    const result = normalizeTimestamp('2025-01-05T03:07:09.000Z');
    expect(result).toBe('2025-01-05_03-07-09');
  });

  test('returns fallback timestamp for invalid ISO string', () => {
    const result = normalizeTimestamp('invalid-timestamp');
    // Check format matches YYYY-MM-DD_HH-MM-SS
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for empty string', () => {
    const result = normalizeTimestamp('');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for null (type coercion)', () => {
    const result = normalizeTimestamp(null as unknown as string);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for undefined', () => {
    const result = normalizeTimestamp(undefined as unknown as string);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for malformed date string', () => {
    const result = normalizeTimestamp('2025-13-99T99:99:99Z'); // Invalid month/day/time
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('handles year boundaries correctly', () => {
    const result = normalizeTimestamp('2024-12-31T23:59:59.000Z');
    expect(result).toBe('2024-12-31_23-59-59');
  });

  test('handles leap year date correctly', () => {
    const result = normalizeTimestamp('2024-02-29T12:00:00.000Z');
    expect(result).toBe('2024-02-29_12-00-00');
  });

  test('directory-safe format contains no special characters except dash and underscore', () => {
    const result = normalizeTimestamp('2025-12-15T17:00:00.000Z');
    // Should only contain digits, dashes, and one underscore
    expect(result).toMatch(/^[\d-]+_[\d-]+$/);
    expect(result).not.toContain(':');
    expect(result).not.toContain('T');
    expect(result).not.toContain('Z');
    expect(result).not.toContain('.');
  });

  test('fallback timestamp is within reasonable time range (within 1 minute)', () => {
    const before = Date.now();
    const result = normalizeTimestamp('invalid');
    const after = Date.now();

    // Parse the result back to a date
    const match = result.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    expect(match).not.toBeNull();

    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match;
      const resultDate = new Date(
        Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hours),
          parseInt(minutes),
          parseInt(seconds),
        ),
      );

      // Verify the timestamp is within 1 minute of when we called the function
      const resultMs = resultDate.getTime();
      expect(resultMs).toBeGreaterThanOrEqual(before - 1000);
      expect(resultMs).toBeLessThanOrEqual(after + 1000);
    }
  });
});
