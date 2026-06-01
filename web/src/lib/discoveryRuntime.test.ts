/**
 * discoveryRuntime.test.ts — unit tests for the Phase 6 Plan 04 singleton.
 *
 * Eight cases covering: singleton identity, shutdown idempotency, missing-root
 * graceful path, env-var resolution, full-init against fixture, opts-ignored-after-
 * first-init warning, concurrent-init race, shutdown-before-init no-op.
 *
 * Each test calls `await shutdownDiscoveryRuntime()` in afterEach to reset the
 * module-level singleton so tests remain isolated.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  getDiscoveryRuntime,
  shutdownDiscoveryRuntime,
  resolveGolazoRoot,
  getDiscoveryRuntimeStatus,
} from './discoveryRuntime';
import { queryAllEpisodes } from './cache';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dir, '../..', 'tests/fixtures/golazo');

function tmpDbPath(): string {
  return join(tmpdir(), `golazo-runtime-${randomUUID()}.db`);
}

function tmpSandbox(): string {
  return mkdtempSync(join(tmpdir(), 'golazo-rt-'));
}

// ---------------------------------------------------------------------------
// afterEach: always reset the singleton
// ---------------------------------------------------------------------------

afterEach(async () => {
  await shutdownDiscoveryRuntime();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discoveryRuntime', () => {
  it('case 1: SINGLETON IDENTITY — two calls return the same object reference', async () => {
    const dbPath = tmpDbPath();
    const rootPath = FIXTURE_ROOT;

    const a = await getDiscoveryRuntime({ rootPath, dbPath });
    const b = await getDiscoveryRuntime({ rootPath, dbPath });

    expect(Object.is(a, b)).toBe(true);
    expect(Object.is(a.cache.db, b.cache.db)).toBe(true);
    expect(Object.is(a.watcher, b.watcher)).toBe(true);
  }, 10_000);

  it('case 2: SHUTDOWN IDEMPOTENCY — double-shutdown is safe; re-init returns new instance', async () => {
    const dbPath = tmpDbPath();
    const a = await getDiscoveryRuntime({ rootPath: FIXTURE_ROOT, dbPath });

    await shutdownDiscoveryRuntime();
    await expect(shutdownDiscoveryRuntime()).resolves.toBeUndefined();

    // Re-init after shutdown returns a new instance
    const dbPath2 = tmpDbPath();
    const b = await getDiscoveryRuntime({ rootPath: FIXTURE_ROOT, dbPath: dbPath2 });
    expect(Object.is(a, b)).toBe(false);
  }, 10_000);

  it('case 3: ROOT MISSING GRACEFUL — non-existent root sets rootMissing=true, watcher=null, empty episodes', async () => {
    const dbPath = tmpDbPath();
    const runtime = await getDiscoveryRuntime({
      rootPath: '/nonexistent/path/that/cannot/exist',
      dbPath,
    });

    expect(runtime.rootMissing).toBe(true);
    expect(runtime.watcher).toBeNull();
    expect(runtime.warnings.brokenFolders).toHaveLength(0);
    expect(runtime.warnings.invalidManifests).toHaveLength(0);
    expect(runtime.warnings.invalidPublishRecords).toHaveLength(0);
    expect(queryAllEpisodes(runtime.cache)).toHaveLength(0);
  }, 10_000);

  it('case 4: ENV-VAR RESOLUTION — GOLAZO_ROOT overrides default; missing or empty falls back to ~/golazo', () => {
    expect(resolveGolazoRoot({ GOLAZO_ROOT: '/some/explicit/path' } as Record<string, string | undefined>)).toBe('/some/explicit/path');
    expect(resolveGolazoRoot({} as Record<string, string | undefined>)).toBe(join(homedir(), 'golazo'));
    // Tilde is NOT expanded — that is a shell-ism; env vars are absolute/relative paths
    // resolveGolazoRoot uses path.resolve so relative paths are made absolute from cwd
    const tildeResult = resolveGolazoRoot({ GOLAZO_ROOT: '~/golazo' } as Record<string, string | undefined>);
    expect(tildeResult).not.toBe(join(homedir(), 'golazo')); // tilde not expanded
    expect(tildeResult).toContain('golazo'); // still contains the word golazo
  });

  it('case 5: FULL INIT AGAINST FIXTURE — 3 episodes, 1 broken folder, status snapshot correct', async () => {
    const dbPath = tmpDbPath();
    const rootPath = FIXTURE_ROOT;

    const runtime = await getDiscoveryRuntime({ rootPath, dbPath });

    expect(runtime.rootMissing).toBe(false);
    expect(runtime.watcher).not.toBeNull();
    expect(queryAllEpisodes(runtime.cache)).toHaveLength(3);
    expect(runtime.warnings.brokenFolders).toHaveLength(1);
    expect(runtime.warnings.invalidManifests).toHaveLength(0);
    expect(runtime.warnings.invalidPublishRecords).toHaveLength(0);

    const status = await getDiscoveryRuntimeStatus();
    expect(status.episodeCount).toBe(3);
    expect(status.warnings.brokenFolders).toBe(1);
    expect(status.warnings.invalidManifests).toBe(0);
    expect(status.warnings.invalidPublishRecords).toBe(0);
    expect(status.watcherReady).toBe(true);
    expect(status.rootMissing).toBe(false);
    expect(status.rootPath).toContain('golazo');
    expect(status.dbPath).toBe(dbPath);
  }, 10_000);

  it('case 6: OPTS IGNORED AFTER FIRST INIT — second call with different opts returns same instance + logs warning', async () => {
    const dbPath = tmpDbPath();
    const rootPath = FIXTURE_ROOT;
    const dbPath2 = tmpDbPath();
    const sandbox = tmpSandbox();

    const stderrSpy = vi.spyOn(process.stderr, 'write');

    const a = await getDiscoveryRuntime({ rootPath, dbPath });
    const b = await getDiscoveryRuntime({ rootPath: sandbox, dbPath: dbPath2 });

    expect(Object.is(a, b)).toBe(true);

    // Implementation writes to process.stderr directly
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('opts ignored');

    stderrSpy.mockRestore();
    rmSync(sandbox, { recursive: true, force: true });
  }, 10_000);

  it('case 7: CONCURRENT INIT RACE — parallel calls return the same instance (no double-open)', async () => {
    const dbPath = tmpDbPath();
    const rootPath = FIXTURE_ROOT;

    const [a, b] = await Promise.all([
      getDiscoveryRuntime({ rootPath, dbPath }),
      getDiscoveryRuntime({ rootPath, dbPath }),
    ]);

    expect(Object.is(a, b)).toBe(true);
    expect(Object.is(a.cache.db, b.cache.db)).toBe(true);
  }, 10_000);

  it('case 8: SHUTDOWN BEFORE INIT IS NO-OP — resolves without throwing', async () => {
    // Singleton was never initialized (afterEach already shut it down)
    await expect(shutdownDiscoveryRuntime()).resolves.toBeUndefined();
  });
});
