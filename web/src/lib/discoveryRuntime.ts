/**
 * discoveryRuntime — Phase 6 Plan 04 capstone: module-level singleton that wires
 * the scanner (Plan 01), sqlite cache (Plan 02), and chokidar watcher (Plan 03)
 * into the Next.js process lifecycle.
 *
 * Initialization sequence (inside getDiscoveryRuntime):
 *   1. Resolve rootPath from opts.rootPath ?? resolveGolazoRoot()
 *   2. Resolve dbPath from opts.dbPath ?? DEFAULT_CACHE_DB_PATH
 *   3. openCache({ dbPath })
 *   4. If rootPath does not exist: return early with rootMissing=true, watcher=null
 *   5. scanGolazoRoot(rootPath) → rebuildFromScan(cache, scanResult)
 *   6. startWatcher({ cache, rootPath }) → await watcher.ready
 *   7. Register SIGINT/SIGTERM handlers (idempotent — once per process)
 *
 * Singleton pattern:
 *   - `runtime` holds the resolved DiscoveryRuntime once init completes.
 *   - `initPromise` holds the in-flight Promise during concurrent init so
 *     concurrent callers await the same init, not duplicate SQLite opens.
 *   - shutdownDiscoveryRuntime() resets both to null so test suites can
 *     call getDiscoveryRuntime() again in the next test.
 *
 * Fire-and-forget in instrumentation.ts register():
 *   register() must return promptly so Next.js finishes booting. Web routes
 *   that need the runtime await getDiscoveryRuntime() which returns the
 *   already-resolved singleton on the 2nd+ call (synchronous-equivalent).
 *
 * D-20: WarningBag is in-memory only — stored on the singleton from the most
 *   recent full scan, never persisted. Future Phase 7 dev banner will surface it.
 */

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

import {
  openCache,
  closeCache,
  rebuildFromScan,
  queryAllEpisodes,
  DEFAULT_CACHE_DB_PATH,
  type Cache,
} from './cache';
import { scanGolazoRoot } from './scanner';
import { startWatcher, type WatcherHandle } from './watcher';
import { createWarningBag, type WarningBag } from './warningBag';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Runtime state held by the singleton. */
export interface DiscoveryRuntime {
  cache: Cache;
  /** null when rootPath does not exist on disk at startup. */
  watcher: WatcherHandle | null;
  rootPath: string;
  dbPath: string;
  /** WarningBag from the most recent full scan. D-20: in-memory only. */
  warnings: WarningBag;
  /** true when rootPath did not exist on disk at initialization time. */
  rootMissing: boolean;
}

/** JSON-serializable status snapshot for GET /api/debug/discovery. */
export interface DiscoveryRuntimeStatus {
  rootPath: string;
  dbPath: string;
  episodeCount: number;
  warnings: {
    brokenFolders: number;
    invalidManifests: number;
    invalidPublishRecords: number;
  };
  /** true when the chokidar watcher is running (false when rootMissing). */
  watcherReady: boolean;
  rootMissing: boolean;
}

// ---------------------------------------------------------------------------
// resolveGolazoRoot
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the golazo storage root.
 *
 * Resolution order:
 *   1. env.GOLAZO_ROOT (if set and non-empty) — passed through path.resolve()
 *      (makes relative paths absolute; absolute paths pass through unchanged).
 *      NOTE: tilde (`~`) is NOT expanded — that is a shell-ism. Callers must
 *      pass an absolute path or rely on the default.
 *   2. path.join(os.homedir(), 'golazo')
 *
 * Accepts an explicit env map for testability; defaults to process.env.
 */
export function resolveGolazoRoot(env: Record<string, string | undefined> = process.env): string {
  if (env.GOLAZO_ROOT && env.GOLAZO_ROOT.trim() !== '') {
    return resolve(env.GOLAZO_ROOT);
  }
  return join(homedir(), 'golazo');
}

// ---------------------------------------------------------------------------
// Module-level singleton state (NOT exported)
// ---------------------------------------------------------------------------

let runtime: DiscoveryRuntime | null = null;
let initPromise: Promise<DiscoveryRuntime> | null = null;
let signalHandlersInstalled = false;

// ---------------------------------------------------------------------------
// getDiscoveryRuntime
// ---------------------------------------------------------------------------

/**
 * Lazy singleton initializer.
 *
 * opts.rootPath / opts.dbPath are FOR TESTS ONLY — they are respected only on
 * the first call. Subsequent calls with opts log a warning to stderr and return
 * the existing instance unchanged (no re-init).
 *
 * Production code in instrumentation.ts does NOT pass opts.
 */
export function getDiscoveryRuntime(opts?: {
  rootPath?: string;
  dbPath?: string;
}): Promise<DiscoveryRuntime> {
  // Already initialized
  if (runtime !== null) {
    if (opts !== undefined) {
      process.stderr.write(
        '[discoveryRuntime] opts ignored — singleton already initialized\n',
      );
    }
    return Promise.resolve(runtime);
  }

  // In-flight init (concurrent callers await the same promise)
  if (initPromise !== null) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async (): Promise<DiscoveryRuntime> => {
    const rootPath = opts?.rootPath ?? resolveGolazoRoot();
    const dbPath = opts?.dbPath ?? DEFAULT_CACHE_DB_PATH;

    const cache = openCache({ dbPath });
    const rootMissing = !existsSync(rootPath);

    let newRuntime: DiscoveryRuntime;

    if (rootMissing) {
      const warnings = createWarningBag();
      newRuntime = {
        cache,
        watcher: null,
        rootPath,
        dbPath,
        warnings,
        rootMissing: true,
      };
    } else {
      const scanResult = scanGolazoRoot(rootPath);
      rebuildFromScan(cache, scanResult);
      const watcher = startWatcher({ cache, rootPath });
      await watcher.ready;
      newRuntime = {
        cache,
        watcher,
        rootPath,
        dbPath,
        warnings: scanResult.warnings,
        rootMissing: false,
      };
    }

    // Install SIGINT/SIGTERM handlers exactly once
    if (!signalHandlersInstalled) {
      signalHandlersInstalled = true;
      const handler = (): void => {
        void shutdownDiscoveryRuntime();
      };
      process.once('SIGINT', handler);
      process.once('SIGTERM', handler);
    }

    runtime = newRuntime;
    return newRuntime;
  })();

  // Clear initPromise after settlement so post-shutdown re-init can build fresh promise
  initPromise.then(
    () => {
      initPromise = null;
    },
    () => {
      initPromise = null;
    },
  );

  return initPromise;
}

// ---------------------------------------------------------------------------
// shutdownDiscoveryRuntime
// ---------------------------------------------------------------------------

/**
 * Idempotent shutdown.
 *
 * Steps:
 *   1. Capture and clear the singleton immediately (so re-entrant calls short-circuit)
 *   2. Close the chokidar watcher (if any)
 *   3. Close the sqlite cache
 *
 * Safe to call multiple times. No-op when never initialized.
 */
export async function shutdownDiscoveryRuntime(): Promise<void> {
  const r = runtime;
  if (r === null) return;

  // Clear FIRST — re-entrant calls during async close will see null
  runtime = null;
  initPromise = null;

  if (r.watcher !== null) {
    await r.watcher.close();
  }
  closeCache(r.cache);
}

// ---------------------------------------------------------------------------
// getDiscoveryRuntimeStatus
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper for the debug route.
 *
 * Calls getDiscoveryRuntime() (returns resolved singleton on 2nd+ calls)
 * and builds a JSON-serializable DiscoveryRuntimeStatus snapshot.
 */
export async function getDiscoveryRuntimeStatus(): Promise<DiscoveryRuntimeStatus> {
  const r = await getDiscoveryRuntime();
  const episodeCount = queryAllEpisodes(r.cache).length;

  return {
    rootPath: r.rootPath,
    dbPath: r.dbPath,
    episodeCount,
    warnings: {
      brokenFolders: r.warnings.brokenFolders.length,
      invalidManifests: r.warnings.invalidManifests.length,
      invalidPublishRecords: r.warnings.invalidPublishRecords.length,
    },
    watcherReady: r.watcher !== null,
    rootMissing: r.rootMissing,
  };
}
