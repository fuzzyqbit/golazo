/**
 * thumbUrl.test.ts — Unit tests for thumbUrlFor helper.
 *
 * thumbUrlFor must be pure: no I/O, no network, no imports from next/* or node:*.
 * These tests run in vitest node environment without any server.
 */

import { describe, it, expect } from 'vitest';
import { thumbUrlFor } from './thumbUrl.js';

describe('thumbUrlFor', () => {
  it('returns the correct URL for a standard row', () => {
    expect(thumbUrlFor({ kid: 'leo', gameFolder: '2026-05-20_vs_rivers_2-2' })).toBe(
      '/api/asset/leo/2026-05-20_vs_rivers_2-2/thumb.png',
    );
  });

  it('returns the correct URL for a different kid', () => {
    expect(thumbUrlFor({ kid: 'mateo', gameFolder: '2026-05-27_vs_dragons_4-0' })).toBe(
      '/api/asset/mateo/2026-05-27_vs_dragons_4-0/thumb.png',
    );
  });

  it('encodes special characters in kid via encodeURIComponent', () => {
    const url = thumbUrlFor({ kid: 'kid with spaces', gameFolder: '2026-05-01_vs_united_1-0' });
    expect(url).toBe('/api/asset/kid%20with%20spaces/2026-05-01_vs_united_1-0/thumb.png');
    expect(url).not.toContain(' ');
  });

  it('encodes special characters in gameFolder via encodeURIComponent', () => {
    const url = thumbUrlFor({ kid: 'leo', gameFolder: 'folder with/slash' });
    expect(url).toBe('/api/asset/leo/folder%20with%2Fslash/thumb.png');
    expect(url).not.toContain('/api/asset/leo/folder with');
  });

  it('handles unicode characters in gameFolder', () => {
    const url = thumbUrlFor({ kid: 'leo', gameFolder: '2026-05-01_vs_münchen_2-1' });
    expect(url).toContain('/api/asset/leo/');
    expect(url).toContain('thumb.png');
    // encoded form should not contain raw ü
    expect(url).not.toContain('münchen');
  });

  it('always ends with /thumb.png', () => {
    const url = thumbUrlFor({ kid: 'leo', gameFolder: '2026-05-01_vs_test_1-0' });
    expect(url.endsWith('/thumb.png')).toBe(true);
  });

  it('always starts with /api/asset/', () => {
    const url = thumbUrlFor({ kid: 'leo', gameFolder: '2026-05-01_vs_test_1-0' });
    expect(url.startsWith('/api/asset/')).toBe(true);
  });
});
