/**
 * watcherDebounce.test.ts — unit tests for createPerFolderDebouncer.
 *
 * All timer tests use vi.useFakeTimers() for deterministic execution.
 * No real-clock dependency.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerFolderDebouncer } from './watcherDebounce';

describe('createPerFolderDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. SINGLE TRIGGER FIRES AFTER WINDOWMS: fires after exact window, not before', () => {
    const spy = vi.fn();
    const d = createPerFolderDebouncer(spy, 500);
    d.trigger('foo');
    vi.advanceTimersByTime(499);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledWith('foo');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('2. RAPID TRIGGERS COALESCE: multiple triggers within window collapse into one call', () => {
    const spy = vi.fn();
    const d = createPerFolderDebouncer(spy, 500);
    d.trigger('foo');
    vi.advanceTimersByTime(400);
    d.trigger('foo');
    vi.advanceTimersByTime(400);
    d.trigger('foo');
    vi.advanceTimersByTime(499);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('3. INDEPENDENT KEYS: different keys each trigger their own fire', () => {
    const spy = vi.fn();
    const d = createPerFolderDebouncer(spy, 500);
    d.trigger('foo');
    d.trigger('bar');
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('foo');
    expect(spy).toHaveBeenCalledWith('bar');
  });

  it('4. FLUSH FORCES IMMEDIATE FIRE: flush fires all pending immediately without double-fire', () => {
    const spy = vi.fn();
    const d = createPerFolderDebouncer(spy, 500);
    d.trigger('foo');
    d.trigger('bar');
    d.flush();
    expect(spy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    // No double-fire after flush
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('5. CANCEL SUPPRESSES PENDING: cancel drops all pending timers without firing', () => {
    const spy = vi.fn();
    const d = createPerFolderDebouncer(spy, 500);
    d.trigger('foo');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
    expect(d.pendingCount()).toBe(0);
  });

  it('6. PENDINGCOUNT TRACKS: accurately reports number of pending keys', () => {
    const spy = vi.fn();
    const d = createPerFolderDebouncer(spy, 500);
    d.trigger('foo');
    d.trigger('bar');
    expect(d.pendingCount()).toBe(2);
    vi.advanceTimersByTime(500);
    expect(d.pendingCount()).toBe(0);
  });

  it('7. ASYNC FN SUPPORTED: async callbacks are invoked correctly', async () => {
    const asyncSpy = vi.fn().mockResolvedValue(undefined);
    const d2 = createPerFolderDebouncer(asyncSpy, 500);
    d2.trigger('foo');
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(asyncSpy).toHaveBeenCalledWith('foo');
  });
});
