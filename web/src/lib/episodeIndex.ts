/**
 * EpisodeIndex — the shared row shape that Phase 6 Plan 02's sqlite cache
 * mirrors column-for-column. Plans 03 (watcher) and 04 (Next.js wiring) consume
 * this type directly. Any field added here MUST also be added to Plan 02's
 * CREATE TABLE statement and migration.
 *
 * Status derivation contract (load-bearing — pinned by Plan 01 test case 8):
 *   'published' = manifest + episode.mp4 + thumb.png + valid publish.json
 *   'rendered'  = manifest + episode.mp4 + thumb.png (no publish.json OR invalid publish.json)
 *   'prepared'  = manifest only
 *
 * Ordering contract (pinned by Plan 01 test case 9):
 *   kid ascending → date descending → gameFolder ascending
 * Plan 02's sqlite list query MUST emit the same order.
 */
import type { WarningBag } from './warningBag';

/** Lifecycle status of a game episode — derived from filesystem presence, never stored. */
export type EpisodeStatus = 'prepared' | 'rendered' | 'published';

/**
 * Single episode row — one row per valid game folder (manifest present + folder
 * name parses). Produced by scanGolazoRoot and mirrored by Plan 02's sqlite cache.
 */
export interface EpisodeIndex {
  /** 'sha256:<64hex>' — primary key for sqlite mirror in Plan 02. */
  manifestHash: string;
  /** Kid key (e.g. 'leo', 'mateo') — from the path segment, NOT the manifest body. */
  kid: string;
  /** Game folder basename (e.g. '2026-05-13_vs_united_3-1'). */
  gameFolder: string;
  /** Absolute path to the game folder on disk. */
  absFolderPath: string;
  /** YYYY-MM-DD from the folder name (parseFilename). */
  date: string;
  /** Opponent slug from the folder name. */
  opponent: string;
  scoreFor: number;
  scoreAgainst: number;
  result: 'W' | 'L' | 'D';
  status: EpisodeStatus;
  /** Absolute path to thumb.png — null when status === 'prepared'. */
  thumbAbsPath: string | null;
  /** Absolute path to episode.mp4 — null when status === 'prepared'. */
  episodeAbsPath: string | null;
  /** YouTube videoId — null unless status === 'published'. */
  publishVideoId: string | null;
  /** Canonical watch URL — null unless status === 'published'. */
  publishWatchUrl: string | null;
  /** Count of entries in manifest.clips. */
  clipCount: number;
  /**
   * Date.now() captured at the time this row was produced. Plan 02's sqlite
   * cache uses this for mtime-based invalidation — rows with stale scannedAtMs
   * are re-derived from disk on the next scan.
   */
  scannedAtMs: number;
}

/** Return type of scanGolazoRoot. */
export interface ScanResult {
  episodes: EpisodeIndex[];
  warnings: WarningBag;
}
