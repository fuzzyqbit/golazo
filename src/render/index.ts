/**
 * Public barrel for the render subsystem.
 *
 * Single import point for the CLI handler and any Phase 3+ consumers.
 * Re-exports all public contracts from Plans 02-02 (music) and 02-04 (driver).
 */
export { loadMusicPool, type MusicPoolEntry } from './musicPool.js';
export {
  pickTrack,
  type MusicPick,
  type MusicPickStrategy,
  MUSIC_REROLL_LIMIT,
} from './musicPicker.js';
export {
  runRender,
  type RenderResult,
  type RenderReason,
  type RunRenderOpts,
} from './driver.js';
export { prettyOpponent, ACRONYM_ALLOW_LIST } from './opponentPretty.js';
