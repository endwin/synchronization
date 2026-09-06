import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncScheduler } from '../../src/sync/scheduler';

describe('SyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trigger callback at specified interval', () => {
    const triggerFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(triggerFn);

    scheduler.setIntervalMinutes(15);
    expect(triggerFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(triggerFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(triggerFn).toHaveBeenCalledTimes(2);

    scheduler.stop();
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(triggerFn).toHaveBeenCalledTimes(2);
  });

  it('should not start timer if interval <= 0', () => {
    const triggerFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(triggerFn);

    scheduler.setIntervalMinutes(0);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(triggerFn).not.toHaveBeenCalled();
  });
});
