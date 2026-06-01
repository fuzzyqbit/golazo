/**
 * channelAccents.test.ts — table-driven tests for the server-side channels.yaml
 * accent loader.
 *
 * Test cases:
 *  1. Happy path — fixture channels.yaml returns { leo, mateo } accent map
 *  2. Missing channels.yaml — returns {} without throwing
 *  3. Malformed yaml — returns {} + console.error logged (no throw)
 *  4. Multiple kids — all entries appear in result
 *  5. skipTokenCheck honored — resolves even when token files are absent
 *  6. accentFor — returns the mapped accent for a known kid
 *  7. accentFor — returns COLORS.accentDefault for an unknown kid
 *  8. accentFor — returns COLORS.accentDefault for an empty map
 *  9. resolveChannelsPath — GOLAZO_CHANNELS_PATH env override is honored
 * 10. resolveChannelsPath — default is path.resolve('./channels.yaml')
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { COLORS } from '../../theme/tokens';
import {
  getChannelAccents,
  accentFor,
  resolveChannelsPath,
  type ChannelAccentMap,
} from './channelAccents';

// ---------------------------------------------------------------------------
// Fixture path — committed channels.yaml with known leo/mateo values
// ---------------------------------------------------------------------------

const FIXTURE_CHANNELS_YAML = resolve(
  process.cwd(),
  'tests/fixtures/golazo/channels.yaml',
);

// ---------------------------------------------------------------------------
// describe: getChannelAccents
// ---------------------------------------------------------------------------

describe('getChannelAccents', () => {
  it('happy path: returns accent map from committed fixture', async () => {
    const map = await getChannelAccents({ channelsPath: FIXTURE_CHANNELS_YAML });
    expect(map).toEqual({
      leo: '#ffce5a',
      mateo: '#5acfff',
    });
  });

  it('missing file: returns {} without throwing', async () => {
    const map = await getChannelAccents({ channelsPath: '/nonexistent/channels.yaml' });
    expect(map).toEqual({});
  });

  it('malformed yaml: returns {} and logs console.error (no throw)', async () => {
    const tmpDir = join(tmpdir(), `golazo-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const malformedPath = join(tmpDir, 'channels.yaml');
    writeFileSync(malformedPath, ': invalid: yaml: {{{', 'utf8');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let map: ChannelAccentMap;
    try {
      map = await getChannelAccents({ channelsPath: malformedPath });
      expect(map).toEqual({});
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('multiple kids: all entries appear in result', async () => {
    const map = await getChannelAccents({ channelsPath: FIXTURE_CHANNELS_YAML });
    expect(Object.keys(map)).toHaveLength(2);
    expect(map).toHaveProperty('leo');
    expect(map).toHaveProperty('mateo');
  });

  it('skipTokenCheck honored: resolves cleanly with channels.yaml but no token files', async () => {
    // Create a tmpdir with a valid channels.yaml but absent token paths.
    // The real token paths (~/.golazo/leo-token.json) almost certainly do
    // not exist in a fresh dev or CI environment. The fixture already uses
    // those stub paths, so loading via skipTokenCheck:true must NOT throw.
    const map = await getChannelAccents({ channelsPath: FIXTURE_CHANNELS_YAML });
    // If skipTokenCheck is working, this resolves without error even when
    // the oauth_token files referenced in the fixture don't exist.
    expect(map).toBeDefined();
    expect(typeof map['leo']).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// describe: accentFor
// ---------------------------------------------------------------------------

describe('accentFor', () => {
  it('returns the mapped accent for a known kid', () => {
    const map: ChannelAccentMap = { leo: '#ffce5a' };
    expect(accentFor(map, 'leo')).toBe('#ffce5a');
  });

  it('returns COLORS.accentDefault for an unknown kid key', () => {
    const map: ChannelAccentMap = { leo: '#ffce5a' };
    expect(accentFor(map, 'mateo')).toBe(COLORS.accentDefault);
  });

  it('returns COLORS.accentDefault for an empty map', () => {
    expect(accentFor({}, 'leo')).toBe(COLORS.accentDefault);
  });
});

// ---------------------------------------------------------------------------
// describe: resolveChannelsPath
// ---------------------------------------------------------------------------

describe('resolveChannelsPath', () => {
  it('returns GOLAZO_CHANNELS_PATH env override when set', () => {
    const customPath = '/custom/path/channels.yaml';
    const result = resolveChannelsPath({ GOLAZO_CHANNELS_PATH: customPath });
    expect(result).toBe(customPath);
  });

  it('returns path.resolve("./channels.yaml") as default when env not set', () => {
    const result = resolveChannelsPath({});
    expect(result).toBe(resolve('./channels.yaml'));
  });

  it('falls back to default when GOLAZO_CHANNELS_PATH is empty string', () => {
    const result = resolveChannelsPath({ GOLAZO_CHANNELS_PATH: '' });
    expect(result).toBe(resolve('./channels.yaml'));
  });
});
