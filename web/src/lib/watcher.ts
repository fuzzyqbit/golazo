/**
 * watcher — chokidar-based filesystem watcher that mutates the sqlite cache on
 * `.golazo/` changes within `<rootPath>/<kid>/<game>/`.
 *
 * Implements DISC-04: chokidar maps filesystem changes under `<root>/<kid>/<game>/.golazo/`
 * to per-game rescans + sqlite mutations within 2 s.
 *
 * Debounce window: 500 ms per folder (D-18 LOCKED). Multiple events for the same
 * game folder within the window collapse into one `rescanGameFolder` call.
 *
 * Watcher closes deterministically: `handle.close()` calls debouncer.flush()
 * BEFORE chokidar.close() — pending events drain while watcher + cache are still
 * attached. After flush, chokidar releases file descriptors.
 *
 * chokidar options rationale:
 * - `ignoreInitial: true` — Plan 04 runs scanGolazoRoot + rebuildFromScan on startup;
 *   chokidar's initial walk would be redundant.
 * - `depth: 4` — covers <root>/<kid>/<game>/.golazo/<file> (4 levels).
 * - `ignored` predicate — chokidar's default regex strips ALL dotfiles including `.golazo/`;
 *   custom predicate allows `.golazo/` while blocking other dotdirs.
 * - `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }` — atomic-write
 *   friendly; keeps test wall-clock under 2.5 s per case.
 *
 * Delete semantics: chokidar fires `unlinkDir` AFTER the dir is gone. We use
 * `queryAllEpisodes + filter by absFolderPath` to find the prior cache row's
 * manifestHash and delete by primary key. With Plan 02's < 50 ms list query,
 * filtering 100 rows in JS is < 1 ms.
 *
 * Broken-manifest semantics (D-20): cache holds last-known-good. Watcher does NOT
 * mutate cache when scanGameFolder returns null AND the folder still exists.
 * WarningBag from per-event rescans is discarded — D-20 (in-memory only; Plan 04
 * surfaces it from the startup scan, NOT from per-event watcher updates).
 *
 * `WatcherHandle.ready: Promise<void>` lets Plan 04 wait for chokidar's initial
 * walk before signaling "watcher armed" in the debug API route.
 */
import chokidar from 'chokidar';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createPerFolderDebouncer } from './watcherDebounce';
import { scanGameFolder } from './scanner';
import {
  type Cache,
  upsertEpisode,
  deleteEpisode,
  queryAllEpisodes,
} from './cache';
import { createWarningBag } from './warningBag';
import type { EpisodeIndex } from './episodeIndex';

// ---------------------------------------------------------------------------
// Exported constants + types
// ---------------------------------------------------------------------------

/** D-18 LOCKED: per-folder debounce window in milliseconds. */
export const WATCHER_DEBOUNCE_MS = 500;

/** Handle returned by startWatcher. */
export interface WatcherHandle {
  /**
   * Closes chokidar AND flushes any pending debounced rescans.
   * Idempotent across multiple calls.
   */
  close(): Promise<void>;

  /**
   * Resolves when chokidar's initial scan completes.
   * Safe to trigger test events after this resolves.
   * Used by Plan 04 startup ordering to wait for "watcher armed".
   */
  ready: Promise<void>;
}

/** Options for startWatcher. */
export interface StartWatcherOpts {
  cache: Cache;
  rootPath: string;
  /**
   * Optional custom rescan function — injected by tests to spy on calls.
   * Defaults to the internal rescanGameFolder using scanGameFolder from scanner.ts.
   * Signature takes only absFolderPath (kid derived from path internally).
   */
  rescan?: (absFolderPath: string) => EpisodeIndex | null;
  /**
   * Optional hook called after each successful cache mutation.
   * Used in tests + Plan 04 future event surface.
   */
  onChange?: (event: {
    kind: 'upsert' | 'delete';
    manifestHash: string;
    absFolderPath: string;
  }) => void;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Derive the canonical game folder absolute path from a chokidar event path.
 *
 * Event paths look like:
 *   <rootPath>/<kid>/<game>/.golazo/manifest.json
 *   <rootPath>/<kid>/<game>/.golazo/episode.mp4
 *   <rootPath>/<kid>/<game>              (unlinkDir at game level)
 *
 * Returns `path.join(rootPath, segments[0], segments[1])` when segments.length >= 2.
 * Returns null when the event is at the root or kid level (< 2 segments) — out of scope.
 */
function gameFolderFromEventPath(eventPath: string, rootPath: string): string | null {
  const rel = path.relative(rootPath, eventPath);
  if (rel === '' || rel.startsWith('..')) {
    return null;
  }
  const segments = rel.split(path.sep);
  const seg0 = segments[0];
  const seg1 = segments[1];
  if (segments.length >= 2 && seg0 !== undefined && seg0 !== '' && seg1 !== undefined && seg1 !== '') {
    return path.join(rootPath, seg0, seg1);
  }
  return null;
}

/**
 * Rescan one game folder and mutate the cache accordingly.
 *
 * - If scanGameFolder succeeds: upsertEpisode + onChange('upsert')
 * - If scanGameFolder returns null AND folder is gone: delete by absFolderPath lookup + onChange('delete')
 * - If scanGameFolder returns null AND folder still exists (broken): no-op (D-20, last-known-good)
 */
export function rescanGameFolder(input: {
  cache: Cache;
  absFolderPath: string;
  onChange?: StartWatcherOpts['onChange'];
}): void {
  const kid = path.basename(path.dirname(input.absFolderPath));
  const warnings = createWarningBag();
  const scannedAtMs = Date.now();

  const row = scanGameFolder({
    absFolderPath: input.absFolderPath,
    kid,
    warnings,
    scannedAtMs,
  });

  if (row !== null) {
    upsertEpisode(input.cache, row);
    input.onChange?.({
      kind: 'upsert',
      manifestHash: row.manifestHash,
      absFolderPath: input.absFolderPath,
    });
    return;
  }

  // row === null
  if (!existsSync(input.absFolderPath)) {
    // Folder is gone — look up matching rows by absFolderPath and delete each
    const cached = queryAllEpisodes(input.cache).filter(
      (r) => r.absFolderPath === input.absFolderPath,
    );
    for (const c of cached) {
      deleteEpisode(input.cache, c.manifestHash);
      input.onChange?.({
        kind: 'delete',
        manifestHash: c.manifestHash,
        absFolderPath: input.absFolderPath,
      });
    }
    // else: folder still exists but is broken — hold last-known-good (D-20)
  }
}

// ---------------------------------------------------------------------------
// startWatcher
// ---------------------------------------------------------------------------

/**
 * Start a chokidar watcher that mutates the sqlite cache on `.golazo/` events
 * under `opts.rootPath/<kid>/<game>/`.
 *
 * Returns a WatcherHandle immediately. Callers that need to wait for chokidar's
 * initial walk to complete should await `handle.ready` before triggering events.
 */
export function startWatcher(opts: StartWatcherOpts): WatcherHandle {
  const { cache, rootPath, onChange } = opts;

  // Default rescan: use the internal helper
  const doRescan =
    opts.rescan != null
      ? (absFolder: string) => opts.rescan!(absFolder)
      : (absFolder: string) => rescanGameFolder({ cache, absFolderPath: absFolder, onChange });

  // Create per-folder debouncer
  const debouncer = createPerFolderDebouncer((absFolder) => {
    doRescan(absFolder);
  }, WATCHER_DEBOUNCE_MS);

  // Custom ignored predicate:
  // - Block node_modules and .git
  // - Allow .golazo/ (chokidar's default regex strips ALL dotfiles — would break our model)
  // - Block all other dot-directories/files
  const ignoredPredicate = (p: string): boolean => {
    if (p.includes('node_modules') || p.includes('/.git/') || p.endsWith('/.git')) {
      return true;
    }
    const rel = path.relative(rootPath, p);
    if (rel === '' || rel.startsWith('..')) {
      return false; // rootPath itself — don't ignore
    }
    const segs = rel.split(path.sep);
    return segs.some((s) => s.startsWith('.') && s !== '.golazo');
  };

  const watcher = chokidar.watch(rootPath, {
    ignoreInitial: true,
    depth: 4,
    ignored: ignoredPredicate,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  // Unified event handler: derive game folder + trigger debouncer
  const handleEvent = (eventPath: string): void => {
    const gameFolder = gameFolderFromEventPath(eventPath, rootPath);
    if (gameFolder !== null) {
      debouncer.trigger(gameFolder);
    }
  };

  watcher.on('add', handleEvent);
  watcher.on('change', handleEvent);
  watcher.on('unlink', handleEvent);
  watcher.on('unlinkDir', handleEvent);

  // Ready promise — resolves when chokidar's initial walk completes
  const ready = new Promise<void>((resolve) => {
    watcher.once('ready', () => resolve());
  });

  let closed = false;

  return {
    ready,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      // Flush BEFORE closing chokidar so pending rescans complete while cache is attached
      debouncer.flush();
      await watcher.close();
    },
  };
}
