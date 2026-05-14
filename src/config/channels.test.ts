import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  CHANNELS_FILE_DEFAULT,
  loadChannel,
  loadChannelsFile,
} from './channels.js';
import { ChannelsConfigError } from './errors.js';
import {
  buildYaml,
  CHANNELS_TEST_CASES,
  type ChannelsTestCase,
} from './channels.test-cases.js';

// Re-export so any tooling that imports the test file transitively still
// sees the named const (the canonical sibling import is via
// `./channels.test-cases.js`, which is what the verify gate uses).
export { CHANNELS_TEST_CASES, type ChannelsTestCase };

describe('loadChannel + loadChannelsFile (table-driven)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'golazo-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('table contains >= 14 cases', () => {
    expect(CHANNELS_TEST_CASES.length).toBeGreaterThanOrEqual(14);
  });

  it.each(CHANNELS_TEST_CASES.map((c) => [c.name, c] as const))(
    '%s',
    (_label, row) => {
      // Touch declared token files (relative to tmpDir)
      for (const tp of row.tokenPaths) {
        const abs = resolve(tmpDir, tp);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, '{}', 'utf8');
      }

      // Write channels.yaml if provided
      if (row.yaml.length > 0) {
        writeFileSync(join(tmpDir, 'channels.yaml'), row.yaml, 'utf8');
      }

      // Determine the channels.yaml path the loader should use.
      const channelsPath = row.pathOverride
        ? resolve(tmpDir, row.pathOverride)
        : join(tmpDir, 'channels.yaml');

      const call = (): unknown =>
        row.kidToLoad !== undefined
          ? loadChannel(row.kidToLoad, { path: channelsPath })
          : loadChannelsFile({ path: channelsPath });

      if (row.shouldThrow) {
        const expectedClass = row.errorClass ?? ChannelsConfigError;
        expect(call).toThrow(expectedClass);
        try {
          call();
          throw new Error('expected throw');
        } catch (err) {
          if (!(err instanceof Error)) throw err;
          for (const needle of row.messageContains ?? []) {
            if (typeof needle === 'string') {
              expect(err.message).toContain(needle);
            } else {
              expect(err.message).toMatch(needle);
            }
          }
        }
      } else {
        const result = call();
        if (row.kidToLoad !== undefined) {
          // Must be a ChannelConfig with kid filled in
          expect(result).toMatchObject({ kid: row.kidToLoad });
          const config = result as {
            kid: string;
            name: string;
            club: string;
            jersey: number;
            accent: string;
            source: string;
            youtube: { channelId: string; oauthTokenPath: string };
          };
          expect(typeof config.name).toBe('string');
          expect(typeof config.club).toBe('string');
          expect(typeof config.jersey).toBe('number');
          expect(typeof config.accent).toBe('string');
          expect(typeof config.source).toBe('string');
          expect(typeof config.youtube.channelId).toBe('string');
          expect(typeof config.youtube.oauthTokenPath).toBe('string');
        } else {
          expect(typeof result).toBe('object');
        }
      }
    },
  );
});

describe('loadChannel: tilde expansion success path (HOME override)', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'golazo-test-home-'));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("expands '~/.golazo/leo.token.json' to <HOME>/.golazo/leo.token.json before existence check", () => {
    // Sanity: homedir() reflects the overridden HOME
    expect(homedir()).toBe(tmpDir);

    // Create the token file at the expanded location.
    const expandedTokenPath = join(tmpDir, '.golazo', 'leo.token.json');
    mkdirSync(dirname(expandedTokenPath), { recursive: true });
    writeFileSync(expandedTokenPath, '{}', 'utf8');

    // Mateo's token still lives under the same tmpDir (absolute path).
    const mateoTokenPath = join(tmpDir, 'mateo.token.json');
    writeFileSync(mateoTokenPath, '{}', 'utf8');

    const yamlStr = buildYaml({
      leo: { youtube: { oauth_token: '~/.golazo/leo.token.json' } },
      mateo: { youtube: { oauth_token: mateoTokenPath } },
    });
    const channelsPath = join(tmpDir, 'channels.yaml');
    writeFileSync(channelsPath, yamlStr, 'utf8');

    const leo = loadChannel('leo', { path: channelsPath });

    expect(leo.kid).toBe('leo');
    expect(leo.youtube.oauthTokenPath).toBe(expandedTokenPath);
    expect(existsSync(leo.youtube.oauthTokenPath)).toBe(true);
  });
});

describe('CHANNELS_FILE_DEFAULT', () => {
  it('is a relative path to channels.yaml in cwd', () => {
    expect(CHANNELS_FILE_DEFAULT).toBe('./channels.yaml');
  });
});
