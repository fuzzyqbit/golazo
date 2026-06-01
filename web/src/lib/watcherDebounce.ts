/**
 * watcherDebounce — per-key debounce for chokidar filesystem events.
 *
 * Per-key debounce: each key (canonical game folder absolute path) has its own
 * timer; multiple triggers within `windowMs` for the same key collapse into a
 * single fn(key) call. Different keys are independent (no global coalescing).
 *
 * `fn` may return a Promise — the debouncer fires it via `void` so unhandled
 * rejections surface to the runtime. chokidar event handlers run in a top-level
 * scope, so an unhandled rejection is the correct failure mode for this layer.
 *
 * Plan 03 of Phase 6 LOCKED windowMs = 500 (D-18).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerFolderDebouncer {
  /**
   * Schedule fn(key) to fire after windowMs of quiet for this key.
   * Subsequent triggers within the window restart the timer.
   */
  trigger(key: string): void;

  /**
   * Force-fire all pending timers immediately (synchronously).
   * Used in close() to drain queued events before shutting down.
   */
  flush(): void;

  /**
   * Drop all pending timers without firing.
   * Used in close() when queued events should be abandoned.
   */
  cancel(): void;

  /** Total count of pending keys (for tests and diagnostics). */
  pendingCount(): number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a per-folder debouncer.
 *
 * @param fn - Callback invoked with the key after `windowMs` of quiet.
 *             May return a Promise; unhandled rejections surface to runtime.
 * @param windowMs - Quiet window in milliseconds. D-18 LOCKS this at 500 ms
 *                   for Plan 03's watcher usage.
 */
export function createPerFolderDebouncer(
  fn: (key: string) => void | Promise<void>,
  windowMs: number,
): PerFolderDebouncer {
  const timers = new Map<string, NodeJS.Timeout>();

  function trigger(key: string): void {
    const existing = timers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const t = setTimeout(() => {
      timers.delete(key);
      void fn(key);
    }, windowMs);
    timers.set(key, t);
  }

  function flush(): void {
    // Snapshot entries to avoid mutation-during-iteration issues
    const entries = Array.from(timers.entries());
    timers.clear();
    for (const [key, timer] of entries) {
      clearTimeout(timer);
      void fn(key);
    }
  }

  function cancel(): void {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  }

  function pendingCount(): number {
    return timers.size;
  }

  return { trigger, flush, cancel, pendingCount };
}
