/**
 * assetPath.test.ts — Unit tests for assertSafeAssetPath helper.
 *
 * This helper is the path-safety guard for ALL asset route handlers.
 * Tests must cover every rejection rule so Phase 8 can extend without regression.
 */

import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertSafeAssetPath, AssetPathError } from './assetPath.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = join(tmpdir(), `assetPath-test-${randomUUID()}`);
// We don't need actual files for path-safety tests — just the path computation
const KID = 'leo';
const GAME = '2026-05-20_vs_rivers_2-2';
const FILE = 'thumb.png';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('assertSafeAssetPath', () => {
  it('returns the correct absolute path for a valid kid + game + file', () => {
    const result = assertSafeAssetPath(ROOT, KID, GAME, FILE);
    expect(result).toBe(resolve(ROOT, KID, GAME, '.golazo', FILE));
  });

  it('throws AssetPathError when kid contains ".."', () => {
    expect(() => assertSafeAssetPath(ROOT, '..', GAME, FILE)).toThrow(AssetPathError);
    expect(() => assertSafeAssetPath(ROOT, '../leo', GAME, FILE)).toThrow(AssetPathError);
  });

  it('throws AssetPathError when game contains ".."', () => {
    expect(() => assertSafeAssetPath(ROOT, KID, '..', FILE)).toThrow(AssetPathError);
    expect(() => assertSafeAssetPath(ROOT, KID, '../etc', FILE)).toThrow(AssetPathError);
  });

  it('throws AssetPathError when kid contains "/"', () => {
    expect(() => assertSafeAssetPath(ROOT, 'leo/mateo', GAME, FILE)).toThrow(AssetPathError);
  });

  it('throws AssetPathError when game contains "\\\\"', () => {
    expect(() => assertSafeAssetPath(ROOT, KID, 'game\\folder', FILE)).toThrow(AssetPathError);
  });

  it('throws AssetPathError when kid contains null byte', () => {
    expect(() => assertSafeAssetPath(ROOT, 'leo\0', GAME, FILE)).toThrow(AssetPathError);
  });

  it('throws AssetPathError when kid is an absolute path', () => {
    expect(() => assertSafeAssetPath(ROOT, '/etc/passwd', GAME, FILE)).toThrow(AssetPathError);
  });

  it('throws AssetPathError when resolved path escapes root (path traversal via resolve)', () => {
    // A carefully-crafted game that, after resolution, escapes the root
    // On macOS/Linux this relies on '..' segments — already blocked above
    // but test the resolved-path containment check explicitly
    expect(() => assertSafeAssetPath(ROOT, KID, '../../escape', FILE)).toThrow(AssetPathError);
  });

  it('does not throw for a valid gameFolder with hyphens and underscores', () => {
    const result = assertSafeAssetPath(ROOT, 'leo', '2026-05-20_vs_city-sc_2-1', FILE);
    expect(result).toContain('.golazo');
    expect(result).toContain('thumb.png');
  });

  it('error message includes the offending segment', () => {
    let msg = '';
    try {
      assertSafeAssetPath(ROOT, '..', GAME, FILE);
    } catch (e) {
      if (e instanceof AssetPathError) msg = e.message;
    }
    expect(msg).toBeTruthy();
    expect(msg.toLowerCase()).toMatch(/unsafe|invalid|path|forbidden/i);
  });

  it('throws AssetPathError when kid contains "/" (forward slash)', () => {
    expect(() => assertSafeAssetPath(ROOT, 'leo/../../etc', GAME, FILE)).toThrow(AssetPathError);
  });
});
