/**
 * cache — sqlite-backed episode index cache.
 *
 * Implements DISC-03's sqlite half. Sync API throughout per D-16 (better-sqlite3).
 * Single-process Next.js server with write-light workload (one scan inserts ~10s-100s
 * rows; UI queries are read-only) — async indirection is net cost, not benefit.
 *
 * Plan 03's chokidar watcher calls `upsertEpisode` / `deleteEpisode` on filesystem
 * events. Plan 04's startup wiring calls `openCache` + `rebuildFromScan(scanGolazoRoot(...))`
 * on app boot. Neither touches sqlite directly — all access goes through this module.
 *
 * Statement memoization via WeakMap<Cache, Map<sql, Statement>> — prepared statements
 * are compiled once per Cache instance, never re-compiled for the same SQL string.
 */
import Database from 'better-sqlite3';
import type { Database as BetterSqliteDB } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  EPISODES_TABLE_SQL,
  EPISODES_INDEX_SQL,
  ROW_TO_EPISODE_INDEX,
  EPISODE_INDEX_TO_ROW,
} from './cacheSchema';
import type { EpisodeIndex, ScanResult } from './episodeIndex';

// ---------------------------------------------------------------------------
// Public types + constants
// ---------------------------------------------------------------------------

/** Opaque Cache handle. Consumers should not access `db` directly. */
export interface Cache {
  db: BetterSqliteDB;
  dbPath: string;
}

/**
 * Default path to the sqlite cache file.
 * Resolves relative to process.cwd() (repo root when Next.js runs).
 * Plan 04 may override via openCache({ dbPath }) on startup to keep tests sandboxed.
 */
export const DEFAULT_CACHE_DB_PATH: string = resolve(process.cwd(), 'web/data/index.db');

// ---------------------------------------------------------------------------
// Statement memoization
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stmtCache = new WeakMap<Cache, Map<string, Database.Statement<any[], any>>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStmt(cache: Cache, sql: string): Database.Statement<any[], any> {
  let m = stmtCache.get(cache);
  if (!m) {
    m = new Map();
    stmtCache.set(cache, m);
  }
  let s = m.get(sql);
  if (!s) {
    s = cache.db.prepare(sql);
    m.set(sql, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open (or create) the sqlite cache database at `opts.dbPath`.
 *
 * Steps:
 * 1. Resolve dbPath (default: DEFAULT_CACHE_DB_PATH)
 * 2. mkdirSync parent directory (recursive — no-op if exists)
 * 3. Open the database (creates file if absent)
 * 4. Set WAL journal mode (concurrent reads without blocking writes)
 * 5. Run CREATE TABLE IF NOT EXISTS (idempotent)
 * 6. Run CREATE INDEX IF NOT EXISTS (idempotent)
 */
export function openCache(opts?: { dbPath?: string }): Cache {
  const dbPath = opts?.dbPath ?? DEFAULT_CACHE_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(EPISODES_TABLE_SQL);
  db.exec(EPISODES_INDEX_SQL);

  return { db, dbPath };
}

/**
 * Close the database connection. Idempotent — safe to call multiple times.
 */
export function closeCache(cache: Cache): void {
  if (cache.db.open) {
    cache.db.close();
  }
}

// ---------------------------------------------------------------------------
// SQL constants (inline for direct access in getStmt)
// ---------------------------------------------------------------------------

const UPSERT_SQL =
  'INSERT OR REPLACE INTO episodes ' +
  '(manifest_hash, kid, game_folder, abs_folder_path, date, opponent, ' +
  'score_for, score_against, result, status, thumb_abs_path, episode_abs_path, ' +
  'publish_video_id, publish_watch_url, clip_count, scanned_at_ms) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

const DELETE_SQL = 'DELETE FROM episodes WHERE manifest_hash = ?';

const QUERY_ALL_SQL =
  'SELECT manifest_hash, kid, game_folder, abs_folder_path, date, opponent, ' +
  'score_for, score_against, result, status, thumb_abs_path, episode_abs_path, ' +
  'publish_video_id, publish_watch_url, clip_count, scanned_at_ms ' +
  'FROM episodes ORDER BY kid ASC, date DESC, game_folder ASC';

const QUERY_BY_HASH_SQL =
  'SELECT manifest_hash, kid, game_folder, abs_folder_path, date, opponent, ' +
  'score_for, score_against, result, status, thumb_abs_path, episode_abs_path, ' +
  'publish_video_id, publish_watch_url, clip_count, scanned_at_ms ' +
  'FROM episodes WHERE manifest_hash = ? LIMIT 1';

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Insert or update one episode row keyed by `manifestHash`.
 * Uses INSERT OR REPLACE so calling with the same `manifestHash` but different
 * fields updates the row (no duplicate inserts).
 */
export function upsertEpisode(cache: Cache, row: EpisodeIndex): void {
  getStmt(cache, UPSERT_SQL).run(...EPISODE_INDEX_TO_ROW(row));
}

/**
 * Delete the episode row with the given `manifestHash`.
 * No-op if no matching row exists.
 */
export function deleteEpisode(cache: Cache, manifestHash: string): void {
  getStmt(cache, DELETE_SQL).run(manifestHash);
}

/**
 * Return all episodes ordered by `kid ASC, date DESC, game_folder ASC`.
 * Matches the ordering contract from Plan 01 test case 9 and scanGolazoRoot.
 * Returns an empty array if the cache is empty.
 */
export function queryAllEpisodes(cache: Cache): EpisodeIndex[] {
  const rows = getStmt(cache, QUERY_ALL_SQL).all() as Record<string, unknown>[];
  return rows.map(ROW_TO_EPISODE_INDEX);
}

/**
 * Return the episode row matching `manifestHash`, or null if no row exists.
 */
export function queryEpisodeByHash(cache: Cache, manifestHash: string): EpisodeIndex | null {
  const row = getStmt(cache, QUERY_BY_HASH_SQL).get(manifestHash) as
    | Record<string, unknown>
    | undefined;
  return row != null ? ROW_TO_EPISODE_INDEX(row) : null;
}

/**
 * Atomically replace all cache rows with the output of a scan.
 *
 * Runs inside a single `db.transaction`:
 *   1. DELETE FROM episodes (clear all existing rows)
 *   2. INSERT OR REPLACE for each row in scanResult.episodes
 *
 * If any insert throws (e.g. CHECK constraint violation), the transaction rolls
 * back and the cache is unchanged — partial state is impossible.
 */
export function rebuildFromScan(cache: Cache, scanResult: ScanResult): void {
  const tx = cache.db.transaction((episodes: EpisodeIndex[]) => {
    cache.db.exec('DELETE FROM episodes;');
    for (const row of episodes) {
      upsertEpisode(cache, row);
    }
  });
  tx(scanResult.episodes);
}
