/**
 * Tests for `computeClipSha256` and `computeManifestHash` (PREP-07 input
 * half). All assertions are pure: a known-content tmp file for the
 * per-clip hash, and synthetic `{file, sha256}` pairs for the manifest
 * hash. No fixture mp4 is required at this layer — Plan 05 wires the real
 * fixture into the orchestrator integration test.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeClipSha256, computeManifestHash } from './hash.js';

// Precomputed sha256 of the UTF-8 bytes for the literal string 'test'.
// Source: $ printf 'test' | shasum -a 256
const SHA256_OF_TEST = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'golazo-hash-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('computeClipSha256', () => {
  it("hashes a tmp file containing 'test' to the precomputed sha256 hex", async () => {
    const filePath = join(tmpDir, 'tiny.bin');
    writeFileSync(filePath, 'test');
    const hex = await computeClipSha256(filePath);
    expect(hex).toBe(SHA256_OF_TEST);
  });

  it('returns a 64-char lowercase hex digest with no prefix', async () => {
    const filePath = join(tmpDir, 'tiny.bin');
    writeFileSync(filePath, 'test');
    const hex = await computeClipSha256(filePath);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hex.startsWith('sha256:')).toBe(false);
  });

  it('produces different hashes for different content', async () => {
    const a = join(tmpDir, 'a.bin');
    const b = join(tmpDir, 'b.bin');
    writeFileSync(a, 'test');
    writeFileSync(b, 'TEST');
    const [hashA, hashB] = await Promise.all([computeClipSha256(a), computeClipSha256(b)]);
    expect(hashA).not.toBe(hashB);
  });

  it('handles an empty file deterministically (sha256 of empty input)', async () => {
    // sha256 of empty bytes is a well-known constant.
    const SHA256_OF_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const filePath = join(tmpDir, 'empty.bin');
    writeFileSync(filePath, '');
    const hex = await computeClipSha256(filePath);
    expect(hex).toBe(SHA256_OF_EMPTY);
  });

  it('rejects when the file does not exist', async () => {
    const missing = join(tmpDir, 'no-such-file.bin');
    await expect(computeClipSha256(missing)).rejects.toThrow();
  });
});

describe('computeManifestHash', () => {
  const folderName = '2026-05-13_vs_united_3-1';
  const pairs = [
    { file: '01-clip.mp4', sha256: 'a'.repeat(64) },
    { file: '02-clip.mp4', sha256: 'b'.repeat(64) },
    { file: '03-clip.mp4', sha256: 'c'.repeat(64) },
  ];

  it('format: output matches /^sha256:[0-9a-f]{64}$/', () => {
    const hash = computeManifestHash(folderName, pairs);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('determinism: same (folderName, pairs) returns same hash on 10 calls', () => {
    const first = computeManifestHash(folderName, pairs);
    for (let i = 0; i < 10; i++) {
      expect(computeManifestHash(folderName, pairs)).toBe(first);
    }
  });

  it('pair-order independence: reversed pairs produce same hash', () => {
    const forward = computeManifestHash(folderName, pairs);
    const reversed = computeManifestHash(folderName, pairs.slice().reverse());
    expect(reversed).toBe(forward);
  });

  it('pair-order independence: arbitrary permutation produces same hash', () => {
    const forward = computeManifestHash(folderName, pairs);
    // shuffle deterministically: [pairs[2], pairs[0], pairs[1]]
    const shuffled = [pairs[2]!, pairs[0]!, pairs[1]!];
    const result = computeManifestHash(folderName, shuffled);
    expect(result).toBe(forward);
  });

  it('folder-name sensitivity: changing folderName changes the hash', () => {
    const original = computeManifestHash(folderName, pairs);
    const changed = computeManifestHash('2026-05-13_vs_united_3-2', pairs);
    expect(changed).not.toBe(original);
  });

  it('pair-content sensitivity: changing one sha256 changes the hash', () => {
    const original = computeManifestHash(folderName, pairs);
    const mutated = [pairs[0]!, pairs[1]!, { file: '03-clip.mp4', sha256: 'd'.repeat(64) }];
    expect(computeManifestHash(folderName, mutated)).not.toBe(original);
  });

  it('pair-file-name sensitivity: changing one filename changes the hash', () => {
    const original = computeManifestHash(folderName, pairs);
    const renamed = [pairs[0]!, pairs[1]!, { file: '03-other.mp4', sha256: pairs[2]!.sha256 }];
    expect(computeManifestHash(folderName, renamed)).not.toBe(original);
  });

  it('canonical input format is folderName + \\n + sorted "file:sha256" pairs joined by \\n', () => {
    // Independently compute the expected hash to assert the exact contract.
    // The contract (documented in the plan and the design spec) is:
    //   canonical = folderName + '\n' + pairs.sort(by file).map(p => p.file + ':' + p.sha256).join('\n')
    //   output = 'sha256:' + sha256(canonical)
    // If this assertion ever fails, Phase 2 will silently flap manifestHash
    // across machines — DO NOT relax it.
    const sorted = pairs.slice().sort((a, b) => a.file.localeCompare(b.file));
    const canonical = folderName + '\n' + sorted.map((p) => p.file + ':' + p.sha256).join('\n');
    const expected = 'sha256:' + createHash('sha256').update(canonical).digest('hex');
    expect(computeManifestHash(folderName, pairs)).toBe(expected);
  });

  it('handles empty pairs array (folderName-only hash)', () => {
    const hash = computeManifestHash(folderName, []);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Sanity: empty-pairs hash must NOT equal the populated-pairs hash.
    const populated = computeManifestHash(folderName, pairs);
    expect(hash).not.toBe(populated);
  });
});
