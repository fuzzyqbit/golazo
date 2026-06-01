import { describe, it, expect } from 'vitest';
import type { EpisodeIndex } from '../episodeIndex.js';
import { filterByKid, sortEpisodes, applyListParams, RESULT_RANK } from './listOps.js';
import type { ListParams } from './listParams.js';

// ---------------------------------------------------------------------------
// Inline fixture — 6 rows covering leo + mateo, W/L/D, varying dates/gameFolders
// ---------------------------------------------------------------------------

const BASE: Pick<
  EpisodeIndex,
  | 'manifestHash'
  | 'absFolderPath'
  | 'scoreFor'
  | 'scoreAgainst'
  | 'status'
  | 'thumbAbsPath'
  | 'episodeAbsPath'
  | 'publishVideoId'
  | 'publishWatchUrl'
  | 'clipCount'
  | 'scannedAtMs'
> = {
  manifestHash: 'sha256:0000',
  absFolderPath: '/golazo/test',
  scoreFor: 1,
  scoreAgainst: 0,
  status: 'prepared',
  thumbAbsPath: null,
  episodeAbsPath: null,
  publishVideoId: null,
  publishWatchUrl: null,
  clipCount: 3,
  scannedAtMs: 0,
};

const FIXTURE: EpisodeIndex[] = [
  // leo rows
  { ...BASE, manifestHash: 'sha256:01', kid: 'leo', gameFolder: '2026-04-01_vs_united_1-0', date: '2026-04-01', opponent: 'united', result: 'W' },
  { ...BASE, manifestHash: 'sha256:02', kid: 'leo', gameFolder: '2026-03-15_vs_city-sc_0-2', date: '2026-03-15', opponent: 'city-sc', result: 'L' },
  { ...BASE, manifestHash: 'sha256:03', kid: 'leo', gameFolder: '2026-04-01_vs_apex_1-1', date: '2026-04-01', opponent: 'apex', result: 'D' },
  // mateo rows
  { ...BASE, manifestHash: 'sha256:04', kid: 'mateo', gameFolder: '2026-04-10_vs_rovers_2-0', date: '2026-04-10', opponent: 'rovers', result: 'W' },
  { ...BASE, manifestHash: 'sha256:05', kid: 'mateo', gameFolder: '2026-03-05_vs_united_0-1', date: '2026-03-05', opponent: 'united', result: 'L' },
  { ...BASE, manifestHash: 'sha256:06', kid: 'mateo', gameFolder: '2026-02-20_vs_eagles_1-1', date: '2026-02-20', opponent: 'eagles', result: 'D' },
];

// ---------------------------------------------------------------------------
// RESULT_RANK
// ---------------------------------------------------------------------------

describe('RESULT_RANK', () => {
  it('maps W:0, D:1, L:2', () => {
    expect(RESULT_RANK).toEqual({ W: 0, D: 1, L: 2 });
  });
});

// ---------------------------------------------------------------------------
// filterByKid
// ---------------------------------------------------------------------------

describe('filterByKid', () => {
  it.each<[string, 'all' | 'leo' | 'mateo', number, string[]]>([
    ['all returns all 6 rows', 'all', 6, []],
    ['leo returns 3 leo rows', 'leo', 3, ['sha256:01', 'sha256:02', 'sha256:03']],
    ['mateo returns 3 mateo rows', 'mateo', 3, ['sha256:04', 'sha256:05', 'sha256:06']],
  ])('%s', (_label, kid, expectedCount, expectedHashes) => {
    const result = filterByKid(kid, FIXTURE);
    expect(result).toHaveLength(expectedCount);
    if (expectedHashes.length > 0) {
      expect(result.map((r) => r.manifestHash)).toEqual(expect.arrayContaining(expectedHashes));
      expect(result.every((r) => r.kid === kid)).toBe(true);
    }
  });

  it('mateo on leo-only fixture returns empty array', () => {
    const leoOnly = FIXTURE.filter((r) => r.kid === 'leo');
    expect(filterByKid('mateo', leoOnly)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [...FIXTURE];
    filterByKid('leo', FIXTURE);
    expect(FIXTURE).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// sortEpisodes
// ---------------------------------------------------------------------------

describe('sortEpisodes', () => {
  it('does NOT mutate the input array', () => {
    const inputOrder = FIXTURE.map((r) => r.manifestHash);
    sortEpisodes(FIXTURE, { key: 'date', dir: 'desc' });
    expect(FIXTURE.map((r) => r.manifestHash)).toEqual(inputOrder);
  });

  it.each<[string, ListParams['sort'], string[]]>([
    [
      'date.desc — newest first',
      { key: 'date', dir: 'desc' },
      // 2026-04-10 (mateo/04), then 2026-04-01 two rows: tie-breaker gameFolder ASC → apex(03) before united(01)
      // then 2026-03-15 (02), 2026-03-05 (05), 2026-02-20 (06)
      ['sha256:04', 'sha256:03', 'sha256:01', 'sha256:02', 'sha256:05', 'sha256:06'],
    ],
    [
      'date.asc — oldest first',
      { key: 'date', dir: 'asc' },
      // 2026-02-20 (06), 2026-03-05 (05), 2026-03-15 (02), then two 2026-04-01: apex(03) before united(01), then 2026-04-10 (04)
      ['sha256:06', 'sha256:05', 'sha256:02', 'sha256:03', 'sha256:01', 'sha256:04'],
    ],
    [
      'opponent.asc — alphabetical by slug',
      { key: 'opponent', dir: 'asc' },
      // apex, city-sc, eagles, rovers, united, united — united tie: leo kid < mateo kid
      ['sha256:03', 'sha256:02', 'sha256:06', 'sha256:04', 'sha256:01', 'sha256:05'],
    ],
    [
      'opponent.desc — reverse alphabetical',
      { key: 'opponent', dir: 'desc' },
      // united (leo), united (mateo), rovers, eagles, city-sc, apex
      ['sha256:01', 'sha256:05', 'sha256:04', 'sha256:06', 'sha256:02', 'sha256:03'],
    ],
    [
      'result.asc — W(0) before D(1) before L(2)',
      { key: 'result', dir: 'asc' },
      // W: 01, 04 — then D: 03, 06 — then L: 02, 05
      // Within same result, tie-breaker: kid asc, date desc, gameFolder asc
      ['sha256:01', 'sha256:04', 'sha256:03', 'sha256:06', 'sha256:02', 'sha256:05'],
    ],
    [
      'result.desc — L(2) before D(1) before W(0)',
      { key: 'result', dir: 'desc' },
      ['sha256:02', 'sha256:05', 'sha256:03', 'sha256:06', 'sha256:01', 'sha256:04'],
    ],
    [
      'kid.asc — leo before mateo',
      { key: 'kid', dir: 'asc' },
      // leo rows: tie-breaker date desc → 2026-04-01 tie → gameFolder asc (apex=03 before united=01) → 2026-03-15 (02)
      // mateo rows: date desc → 2026-04-10 (04), 2026-03-05 (05), 2026-02-20 (06)
      ['sha256:03', 'sha256:01', 'sha256:02', 'sha256:04', 'sha256:05', 'sha256:06'],
    ],
    [
      'kid.desc — mateo before leo',
      { key: 'kid', dir: 'desc' },
      // mateo rows: tie-breaker date desc → 04, 05, 06; leo rows: 03, 01, 02
      ['sha256:04', 'sha256:05', 'sha256:06', 'sha256:03', 'sha256:01', 'sha256:02'],
    ],
  ])('%s', (_label, sort, expectedHashes) => {
    const result = sortEpisodes(FIXTURE, sort);
    expect(result.map((r) => r.manifestHash)).toEqual(expectedHashes);
  });

  it('tie-breaker: same date, different gameFolder falls back to gameFolder ASC', () => {
    // sha256:01 and sha256:03 share date=2026-04-01, kid=leo
    const result = sortEpisodes(FIXTURE, { key: 'date', dir: 'desc' });
    const idx01 = result.findIndex((r) => r.manifestHash === 'sha256:01');
    const idx03 = result.findIndex((r) => r.manifestHash === 'sha256:03');
    // gameFolder: '2026-04-01_vs_united_1-0' vs '2026-04-01_vs_apex_1-1'
    // 'apex' < 'united' so sha256:03 (apex) should come before sha256:01 (united)
    expect(idx03).toBeLessThan(idx01);
  });
});

// ---------------------------------------------------------------------------
// applyListParams
// ---------------------------------------------------------------------------

describe('applyListParams', () => {
  it('kid=leo + sort=date.desc is equivalent to sortEpisodes(filterByKid("leo", rows), sort)', () => {
    const params: ListParams = { sort: { key: 'date', dir: 'desc' }, kid: 'leo' };
    const manual = sortEpisodes(filterByKid('leo', FIXTURE), params.sort);
    const result = applyListParams(params, FIXTURE);
    expect(result).toEqual(manual);
  });

  it('kid=all returns all rows sorted', () => {
    const params: ListParams = { sort: { key: 'date', dir: 'asc' }, kid: 'all' };
    const result = applyListParams(params, FIXTURE);
    expect(result).toHaveLength(6);
    // First should be oldest
    expect(result[0]?.date).toBe('2026-02-20');
  });

  it('kid=mateo returns only mateo rows sorted', () => {
    const params: ListParams = { sort: { key: 'result', dir: 'asc' }, kid: 'mateo' };
    const result = applyListParams(params, FIXTURE);
    expect(result.every((r) => r.kid === 'mateo')).toBe(true);
    // W first, then D, then L
    expect(result[0]?.result).toBe('W');
    expect(result[1]?.result).toBe('D');
    expect(result[2]?.result).toBe('L');
  });
});
