/**
 * cacheSchema — single source of truth for the sqlite `episodes` table DDL.
 *
 * Implements D-17 (LOCKED): single denormalized `episodes` table, 16 columns
 * matching EpisodeIndex one-for-one, PK on `manifest_hash`, covering index on
 * `(kid ASC, date DESC, game_folder ASC)`.
 *
 * SQL CHECK constraints enforce the result ('W'|'L'|'D') and status
 * ('prepared'|'rendered'|'published') value vocabularies at the db layer —
 * defense-in-depth beyond TypeScript type checking.
 *
 * Row converters translate between the camelCase TypeScript shape (EpisodeIndex)
 * and the snake_case SQL column names. These are the only two places that know
 * both naming conventions.
 */
import type { EpisodeIndex, EpisodeStatus } from './episodeIndex';

// ---------------------------------------------------------------------------
// Table name
// ---------------------------------------------------------------------------

/** The sqlite table name for episode rows. */
export const EPISODES_TABLE_NAME = 'episodes';

// ---------------------------------------------------------------------------
// DDL: CREATE TABLE
// ---------------------------------------------------------------------------

/**
 * Idempotent CREATE TABLE DDL for the `episodes` table.
 *
 * Column set mirrors EpisodeIndex field-for-field per D-17. All columns are
 * named in snake_case to follow SQL conventions while EpisodeIndex uses camelCase.
 *
 * CHECK constraints pin `result` and `status` to their allowed vocabularies,
 * matching the TypeScript union types for defense-in-depth.
 */
export const EPISODES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS episodes (
  manifest_hash       TEXT PRIMARY KEY,
  kid                 TEXT NOT NULL,
  game_folder         TEXT NOT NULL,
  abs_folder_path     TEXT NOT NULL,
  date                TEXT NOT NULL,
  opponent            TEXT NOT NULL,
  score_for           INTEGER NOT NULL,
  score_against       INTEGER NOT NULL,
  result              TEXT NOT NULL CHECK (result IN ('W','L','D')),
  status              TEXT NOT NULL CHECK (status IN ('prepared','rendered','published')),
  thumb_abs_path      TEXT,
  episode_abs_path    TEXT,
  publish_video_id    TEXT,
  publish_watch_url   TEXT,
  clip_count          INTEGER NOT NULL,
  scanned_at_ms       INTEGER NOT NULL
);
`.trim();

// ---------------------------------------------------------------------------
// DDL: CREATE INDEX
// ---------------------------------------------------------------------------

/**
 * Covering index matching the list-query order used by `queryAllEpisodes`.
 * `kid ASC, date DESC, game_folder ASC` — mirrors the scanner's sort order
 * (Plan 01 test case 9 contract) so the index is always fully utilized.
 */
export const EPISODES_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS episodes_kid_date_folder_idx
  ON episodes (kid ASC, date DESC, game_folder ASC);
`.trim();

// ---------------------------------------------------------------------------
// Row converters
// ---------------------------------------------------------------------------

/**
 * Convert a raw sqlite row (snake_case Record) to a typed EpisodeIndex.
 *
 * Defensive casts for each column — the SQL CHECK constraints already enforce
 * the value vocabulary for `result` and `status`, but the `as` casts here keep
 * TypeScript happy without a runtime schema validation step (which would be
 * expensive on the hot query path).
 */
export function ROW_TO_EPISODE_INDEX(row: Record<string, unknown>): EpisodeIndex {
  return {
    manifestHash: String(row['manifest_hash']),
    kid: String(row['kid']),
    gameFolder: String(row['game_folder']),
    absFolderPath: String(row['abs_folder_path']),
    date: String(row['date']),
    opponent: String(row['opponent']),
    scoreFor: Number(row['score_for']),
    scoreAgainst: Number(row['score_against']),
    result: row['result'] as 'W' | 'L' | 'D',
    status: row['status'] as EpisodeStatus,
    thumbAbsPath: row['thumb_abs_path'] != null ? String(row['thumb_abs_path']) : null,
    episodeAbsPath: row['episode_abs_path'] != null ? String(row['episode_abs_path']) : null,
    publishVideoId: row['publish_video_id'] != null ? String(row['publish_video_id']) : null,
    publishWatchUrl: row['publish_watch_url'] != null ? String(row['publish_watch_url']) : null,
    clipCount: Number(row['clip_count']),
    scannedAtMs: Number(row['scanned_at_ms']),
  };
}

/**
 * Convert a typed EpisodeIndex to a positional args array for `stmt.run(...args)`.
 *
 * Column order matches EPISODES_TABLE_SQL exactly:
 * manifest_hash, kid, game_folder, abs_folder_path, date, opponent,
 * score_for, score_against, result, status, thumb_abs_path, episode_abs_path,
 * publish_video_id, publish_watch_url, clip_count, scanned_at_ms
 *
 * JS `null` passes through as SQL NULL for nullable columns.
 */
export function EPISODE_INDEX_TO_ROW(row: EpisodeIndex): unknown[] {
  return [
    row.manifestHash,
    row.kid,
    row.gameFolder,
    row.absFolderPath,
    row.date,
    row.opponent,
    row.scoreFor,
    row.scoreAgainst,
    row.result,
    row.status,
    row.thumbAbsPath,
    row.episodeAbsPath,
    row.publishVideoId,
    row.publishWatchUrl,
    row.clipCount,
    row.scannedAtMs,
  ];
}
