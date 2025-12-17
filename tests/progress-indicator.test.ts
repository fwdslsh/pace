import { describe, expect, test, afterEach } from 'bun:test';
import { ProgressIndicator, createProgressIndicator } from '../src/progress-indicator';

describe('ProgressIndicator', () => {
  let indicator: ProgressIndicator;

  afterEach(() => {
    if (indicator) {
      indicator.stop();
    }
  });

  test('should create progress indicator with default options', () => {
    indicator = new ProgressIndicator();
    expect(indicator).toBeDefined();
    expect(indicator.getCount()).toBe(0);
  });

  test('should create progress indicator with custom options', () => {
    indicator = new ProgressIndicator({
      trackWidth: 30,
      showEmojis: false,
      showElapsed: false,
      showCount: true,
      countLabel: 'tests',
    });
    expect(indicator).toBeDefined();
    expect(indicator.getCount()).toBe(0);
  });

  test('should increment count', () => {
    indicator = new ProgressIndicator();
    expect(indicator.getCount()).toBe(0);
    indicator.increment();
    expect(indicator.getCount()).toBe(1);
    indicator.increment();
    expect(indicator.getCount()).toBe(2);
  });

  test('should update with action', () => {
    indicator = new ProgressIndicator();
    indicator.update({ action: 'write' });
    expect(indicator.getCount()).toBe(0); // Count should not change
  });

  test('should update with count', () => {
    indicator = new ProgressIndicator();
    indicator.update({ count: 5 });
    expect(indicator.getCount()).toBe(5);
  });

  test('should update with both action and count', () => {
    indicator = new ProgressIndicator();
    indicator.update({ action: 'read', count: 3 });
    expect(indicator.getCount()).toBe(3);
  });

  test('should start and stop without errors', () => {
    indicator = new ProgressIndicator();
    expect(() => indicator.start()).not.toThrow();
    expect(() => indicator.stop()).not.toThrow();
  });

  test('should handle multiple start calls', () => {
    indicator = new ProgressIndicator();
    indicator.start();
    indicator.start(); // Should not cause issues
    expect(() => indicator.stop()).not.toThrow();
  });

  test('should handle multiple stop calls', () => {
    indicator = new ProgressIndicator();
    indicator.start();
    indicator.stop();
    indicator.stop(); // Should not cause issues
    expect(indicator.getCount()).toBe(0);
  });

  test('createProgressIndicator helper should create and start indicator', () => {
    indicator = createProgressIndicator({
      trackWidth: 15,
      countLabel: 'items',
    });
    expect(indicator).toBeDefined();
    expect(indicator.getCount()).toBe(0);
  });
});
