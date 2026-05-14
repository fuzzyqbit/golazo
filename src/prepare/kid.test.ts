/**
 * Tests for `resolveKidFromPath` (PREP-02). Each row in
 * `KID_TEST_CASES` is run inside its own tmp dir via `it.each`. Pattern
 * mirrors Plan 02's channels.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { UnknownKidError } from '../config/errors.js';
import { KidPathError } from './errors.js';
import { resolveKidFromPath } from './kid.js';
import {
  DEFAULT_CHANNELS_YAML,
  KID_TEST_CASES,
  type KidTestCase,
} from './kid.test-cases.js';

// Re-export so any tooling that imports the test file transitively still
// sees the named consts. Canonical sibling import for the verify gate is
// `./kid.test-cases.js`.
export { KID_TEST_CASES, type KidTestCase };

describe('resolveKidFromPath: meta-test on case-array length', () => {
  it('case count >= 10', () => {
    expect(KID_TEST_CASES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('resolveKidFromPath (table-driven)', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'golazo-kid-test-'));
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(KID_TEST_CASES.map((c) => [c.name, c] as const))(
    '%s',
    (_label, row) => {
      // Apply HOME override if the row asks for it. Channels.yaml + tokens
      // then live under the HOME-rooted tmpDir, matching the operator's
      // real `~/golazo/...` layout for that row.
      if (row.useHomeOverride) {
        process.env.HOME = tmpDir;
      }

      // Determine where to write channels.yaml (override builder beats default).
      const channelsPath = row.channelsPathBuilder
        ? row.channelsPathBuilder(tmpDir)
        : join(tmpDir, 'channels.yaml');

      // Write the channels.yaml (default or row-specific).
      if (row.writeChannelsYaml !== false) {
        const yamlBody = row.customChannelsYaml ?? DEFAULT_CHANNELS_YAML;
        mkdirSync(dirname(channelsPath), { recursive: true });
        writeFileSync(channelsPath, yamlBody, 'utf8');
      }

      // Touch the token files relative to channels.yaml's parent (matches
      // the Plan 02 loader's path-resolution rule).
      const channelsParentDir = resolve(channelsPath, '..');
      for (const tp of row.tokenPaths) {
        const abs = resolve(channelsParentDir, tp);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, '{}', 'utf8');
      }

      const folderPath = row.folderPathBuilder(tmpDir);
      const opts = row.channelsPathBuilder
        ? { channelsPath: row.channelsPathBuilder(tmpDir) }
        : { channelsPath };

      if (row.expect.kind === 'ok') {
        const result = resolveKidFromPath(folderPath, opts);
        expect(result).toBe(row.expect.value);
      } else {
        const { errorClass, messageContains } = row.expect;
        expect(() => resolveKidFromPath(folderPath, opts)).toThrow(
          errorClass,
        );
        try {
          resolveKidFromPath(folderPath, opts);
          throw new Error('expected throw');
        } catch (err) {
          if (!(err instanceof Error)) throw err;
          expect(err).toBeInstanceOf(errorClass);
          for (const needle of messageContains ?? []) {
            if (typeof needle === 'string') {
              expect(err.message).toContain(needle);
            } else {
              expect(err.message).toMatch(needle);
            }
          }
        }
      }
    },
  );
});

describe('resolveKidFromPath: reuses UnknownKidError from Plan 02 (not redefined)', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'golazo-kid-test-'));
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('UnknownKidError thrown is the same class as src/config/errors.js exports', () => {
    const channelsPath = join(tmpDir, 'channels.yaml');
    writeFileSync(channelsPath, DEFAULT_CHANNELS_YAML, 'utf8');
    writeFileSync(join(tmpDir, 'leo.token.json'), '{}', 'utf8');
    writeFileSync(join(tmpDir, 'mateo.token.json'), '{}', 'utf8');

    try {
      resolveKidFromPath(`${tmpDir}/golazo/alice/2026-05-13_vs_united_3-1`, {
        channelsPath,
      });
      throw new Error('expected throw');
    } catch (err) {
      // The whole point of this assertion: we are catching the canonical
      // Plan 02 class, not a sibling redefinition.
      expect(err).toBeInstanceOf(UnknownKidError);
      // And NOT a KidPathError (unknown kid is the right error vocabulary).
      expect(err).not.toBeInstanceOf(KidPathError);
    }
  });
});
