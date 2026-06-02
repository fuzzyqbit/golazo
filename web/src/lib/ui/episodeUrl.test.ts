/**
 * episodeUrl.test.ts — Unit tests for episodeUrlFor helper.
 *
 * episodeUrlFor must be pure: no I/O, no network, no imports from next/* or node:*.
 * These tests run in vitest node environment without any server.
 */

import { describe, it, expect } from 'vitest';
import { episodeUrlFor } from './episodeUrl.js';
import { thumbUrlFor } from './thumbUrl.js';

describe('episodeUrlFor', () => {
  it('returns the correct URL for a standard row (rendered)', () => {
    expect(episodeUrlFor({ kid: 'leo', gameFolder: '2026-05-20_vs_rivers_2-2' })).toBe(
      '/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4',
    );
  });

  it('returns the correct URL for a different kid', () => {
    expect(episodeUrlFor({ kid: 'mateo', gameFolder: '2026-05-27_vs_dragons_4-0' })).toBe(
      '/api/asset/mateo/2026-05-27_vs_dragons_4-0/episode.mp4',
    );
  });

  it('encodes spaces in gameFolder via encodeURIComponent', () => {
    const url = episodeUrlFor({ kid: 'mateo', gameFolder: 'game with spaces' });
    expect(url).toBe('/api/asset/mateo/game%20with%20spaces/episode.mp4');
    expect(url).not.toContain(' ');
  });

  it('encodes path-conflicting slash in kid via encodeURIComponent', () => {
    // The route handler (assertSafeAssetPath in Plan 08-01) rejects this, but
    // the helper itself does not pre-validate — it just encodes faithfully.
    const url = episodeUrlFor({ kid: 'k/id', gameFolder: 'g' });
    expect(url).toBe('/api/asset/k%2Fid/g/episode.mp4');
    expect(url).not.toContain('/api/asset/k/id/');
  });

  it('encodes percent signs in gameFolder', () => {
    const url = episodeUrlFor({ kid: 'leo', gameFolder: 'folder%test' });
    expect(url).toBe('/api/asset/leo/folder%25test/episode.mp4');
  });

  it('handles empty strings without throwing', () => {
    const url = episodeUrlFor({ kid: '', gameFolder: '' });
    expect(url).toBe('/api/asset///episode.mp4');
    expect(url).toContain('/api/asset/');
    expect(url).toContain('/episode.mp4');
  });

  it('always ends with /episode.mp4', () => {
    const url = episodeUrlFor({ kid: 'leo', gameFolder: '2026-05-01_vs_test_1-0' });
    expect(url.endsWith('/episode.mp4')).toBe(true);
  });

  it('always starts with /api/asset/', () => {
    const url = episodeUrlFor({ kid: 'leo', gameFolder: '2026-05-01_vs_test_1-0' });
    expect(url.startsWith('/api/asset/')).toBe(true);
  });

  it('uses the same encoding rule as thumbUrlFor (round-trip encoding parity)', () => {
    const row = { kid: 'kid with spaces', gameFolder: 'folder/slash & special' };
    const episodeUrl = episodeUrlFor(row);
    const thumbUrl = thumbUrlFor(row);

    // Both should encode the same kid segment identically
    const episodeKidSegment = episodeUrl.split('/')[3];
    const thumbKidSegment = thumbUrl.split('/')[3];
    expect(episodeKidSegment).toBe(thumbKidSegment);

    // Both should encode the same gameFolder segment identically
    const episodeFolderSegment = episodeUrl.split('/')[4];
    const thumbFolderSegment = thumbUrl.split('/')[4];
    expect(episodeFolderSegment).toBe(thumbFolderSegment);

    // Only the filename differs
    expect(episodeUrl).toContain('/episode.mp4');
    expect(thumbUrl).toContain('/thumb.png');
  });
});
