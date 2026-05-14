/**
 * Table-driven test cases for `channels.test.ts`. Extracted to a sibling
 * (non-test) module so the fixtures can be imported by tooling without
 * dragging vitest's runner context into scope. The test file re-exports
 * {@link CHANNELS_TEST_CASES} so any future grep / lint / verify gate
 * can either import it directly here or transitively through the test
 * file.
 */
import { homedir } from 'node:os';

import { ChannelsConfigError, UnknownKidError } from './errors.js';

/**
 * Build a yaml string for a channels file containing leo and mateo with
 * overrides applied per kid. Designed for negative-test rows that swap
 * one leaf at a time; the rest of the file stays identical to the spec
 * example so failures isolate to the field under test.
 */
export function buildYaml(opts: {
  leo?: Partial<{
    name: unknown;
    club: unknown;
    jersey: unknown;
    accent: unknown;
    source: unknown;
    youtube: { channel_id?: unknown; oauth_token?: unknown };
  }>;
  mateo?: Partial<{
    name: unknown;
    club: unknown;
    jersey: unknown;
    accent: unknown;
    source: unknown;
    youtube: { channel_id?: unknown; oauth_token?: unknown };
  }>;
  omitLeoField?: 'name' | 'club' | 'jersey' | 'accent' | 'source';
  extraKid?: { key: string; tokenPath: string };
}): string {
  const leoDefaults = {
    name: '"Leo"',
    club: '"FC Eagles"',
    jersey: '10',
    accent: '"#ffce5a"',
    source: '"Veo"',
    youtube: {
      channel_id: '"UC_LEO"',
      oauth_token: '"./leo.token.json"',
    },
  };
  const mateoDefaults = {
    name: '"Mateo"',
    club: '"City SC"',
    jersey: '7',
    accent: '"#5acfff"',
    source: '"Trace"',
    youtube: {
      channel_id: '"UC_MATEO"',
      oauth_token: '"./mateo.token.json"',
    },
  };

  function fmt(v: unknown): string {
    if (typeof v === 'string') return JSON.stringify(v);
    return String(v);
  }

  const merged = {
    leo: {
      name:
        opts.leo?.name !== undefined ? fmt(opts.leo.name) : leoDefaults.name,
      club:
        opts.leo?.club !== undefined ? fmt(opts.leo.club) : leoDefaults.club,
      jersey:
        opts.leo?.jersey !== undefined
          ? fmt(opts.leo.jersey)
          : leoDefaults.jersey,
      accent:
        opts.leo?.accent !== undefined
          ? fmt(opts.leo.accent)
          : leoDefaults.accent,
      source:
        opts.leo?.source !== undefined
          ? fmt(opts.leo.source)
          : leoDefaults.source,
      youtube: {
        channel_id:
          opts.leo?.youtube?.channel_id !== undefined
            ? fmt(opts.leo.youtube.channel_id)
            : leoDefaults.youtube.channel_id,
        oauth_token:
          opts.leo?.youtube?.oauth_token !== undefined
            ? fmt(opts.leo.youtube.oauth_token)
            : leoDefaults.youtube.oauth_token,
      },
    },
    mateo: {
      name:
        opts.mateo?.name !== undefined
          ? fmt(opts.mateo.name)
          : mateoDefaults.name,
      club:
        opts.mateo?.club !== undefined
          ? fmt(opts.mateo.club)
          : mateoDefaults.club,
      jersey:
        opts.mateo?.jersey !== undefined
          ? fmt(opts.mateo.jersey)
          : mateoDefaults.jersey,
      accent:
        opts.mateo?.accent !== undefined
          ? fmt(opts.mateo.accent)
          : mateoDefaults.accent,
      source:
        opts.mateo?.source !== undefined
          ? fmt(opts.mateo.source)
          : mateoDefaults.source,
      youtube: {
        channel_id:
          opts.mateo?.youtube?.channel_id !== undefined
            ? fmt(opts.mateo.youtube.channel_id)
            : mateoDefaults.youtube.channel_id,
        oauth_token:
          opts.mateo?.youtube?.oauth_token !== undefined
            ? fmt(opts.mateo.youtube.oauth_token)
            : mateoDefaults.youtube.oauth_token,
      },
    },
  };

  type LeafKey = 'name' | 'club' | 'jersey' | 'accent' | 'source';
  const omitted: LeafKey | undefined = opts.omitLeoField;

  const lines: string[] = [];
  lines.push('leo:');
  if (omitted !== 'name') lines.push(`  name: ${merged.leo.name}`);
  if (omitted !== 'club') lines.push(`  club: ${merged.leo.club}`);
  if (omitted !== 'jersey') lines.push(`  jersey: ${merged.leo.jersey}`);
  if (omitted !== 'accent') lines.push(`  accent: ${merged.leo.accent}`);
  if (omitted !== 'source') lines.push(`  source: ${merged.leo.source}`);
  lines.push('  youtube:');
  lines.push(`    channel_id: ${merged.leo.youtube.channel_id}`);
  lines.push(`    oauth_token: ${merged.leo.youtube.oauth_token}`);
  lines.push('mateo:');
  lines.push(`  name: ${merged.mateo.name}`);
  lines.push(`  club: ${merged.mateo.club}`);
  lines.push(`  jersey: ${merged.mateo.jersey}`);
  lines.push(`  accent: ${merged.mateo.accent}`);
  lines.push(`  source: ${merged.mateo.source}`);
  lines.push('  youtube:');
  lines.push(`    channel_id: ${merged.mateo.youtube.channel_id}`);
  lines.push(`    oauth_token: ${merged.mateo.youtube.oauth_token}`);
  if (opts.extraKid) {
    lines.push(`${opts.extraKid.key}:`);
    lines.push('  name: "Extra"');
    lines.push('  club: "Extra FC"');
    lines.push('  jersey: 5');
    lines.push('  accent: "#abcdef"');
    lines.push('  source: "Veo"');
    lines.push('  youtube:');
    lines.push('    channel_id: "UC_EXTRA"');
    lines.push(`    oauth_token: ${JSON.stringify(opts.extraKid.tokenPath)}`);
  }
  return lines.join('\n') + '\n';
}

/** Shape of a single table-driven case. */
export interface ChannelsTestCase {
  /** Human-readable label shown by vitest. */
  readonly name: string;
  /** Inline yaml to write at <tmpDir>/channels.yaml. Empty string = do not write file (case #10). */
  readonly yaml: string;
  /** Token files to touch under tmpDir before invoking the loader. */
  readonly tokenPaths: readonly string[];
  /** When true, call loadChannel(kidToLoad) instead of loadChannelsFile alone. */
  readonly kidToLoad?: string;
  /** Whether the call should throw. */
  readonly shouldThrow: boolean;
  /** Constructor expected on the thrown error (defaults to ChannelsConfigError). */
  readonly errorClass?: typeof ChannelsConfigError | typeof UnknownKidError;
  /** Substrings (regex literals or strings) the error message MUST contain. */
  readonly messageContains?: readonly (string | RegExp)[];
  /** When set, point the loader at this path instead of <tmpDir>/channels.yaml. */
  readonly pathOverride?: string;
  /** When true, pass skipTokenCheck:true to the loader (bypasses existsSync for token files). */
  readonly skipTokenCheck?: boolean;
}

/**
 * Exhaustive table of channels.yaml loader cases. Length asserted by a
 * meta-test (>=14) and re-checkable from any importer without spinning
 * up vitest's runner.
 */
export const CHANNELS_TEST_CASES: readonly ChannelsTestCase[] = [
  // 1. VALID file with both token files present
  {
    name: 'VALID: leo + mateo with both tokens present → loadChannel(leo) returns full config',
    yaml: buildYaml({}),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    kidToLoad: 'leo',
    shouldThrow: false,
  },

  // 2. INVALID HEX '#zzz'
  {
    name: "INVALID HEX '#zzz' on leo.accent",
    yaml: buildYaml({ leo: { accent: '#zzz' } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['leo.accent', 'must match #RRGGBB hex', '#ffce5a'],
  },

  // 3. INVALID HEX missing '#'
  {
    name: "INVALID HEX 'ffce5a' (missing #) on leo.accent",
    yaml: buildYaml({ leo: { accent: 'ffce5a' } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['leo.accent', 'must match #RRGGBB hex'],
  },

  // 4. INVALID HEX wrong length '#ff00'
  {
    name: "INVALID HEX '#ff00' (wrong length) on leo.accent",
    yaml: buildYaml({ leo: { accent: '#ff00' } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['leo.accent', 'must match #RRGGBB hex'],
  },

  // 5. JERSEY 0 on mateo
  {
    name: 'JERSEY 0 on mateo.jersey',
    yaml: buildYaml({ mateo: { jersey: 0 } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['mateo.jersey', 'must be an integer between 1 and 99'],
  },

  // 6. JERSEY 100 on mateo
  {
    name: 'JERSEY 100 on mateo.jersey',
    yaml: buildYaml({ mateo: { jersey: 100 } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['mateo.jersey', 'must be an integer between 1 and 99'],
  },

  // 7. JERSEY -1 on mateo
  {
    name: 'JERSEY -1 on mateo.jersey',
    yaml: buildYaml({ mateo: { jersey: -1 } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['mateo.jersey', 'must be an integer between 1 and 99'],
  },

  // 8. JERSEY as string "10"
  {
    name: "JERSEY as string '10' on mateo.jersey (zod rejects non-number)",
    yaml: buildYaml({ mateo: { jersey: '10' } }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['mateo.jersey'],
  },

  // 9. MISSING required field (drop club from leo)
  {
    name: 'MISSING required field leo.club',
    yaml: buildYaml({ omitLeoField: 'club' }),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: ['leo.club', 'is required'],
  },

  // 10. MISSING channels.yaml file
  {
    name: 'MISSING channels.yaml file → ChannelsConfigError with resolved path',
    yaml: '',
    tokenPaths: [],
    pathOverride: '__NONEXISTENT_DO_NOT_CREATE__/channels.yaml',
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: [
      'channels.yaml not found',
      'copy channels.yaml.example to channels.yaml',
    ],
  },

  // 11. MISSING oauth token file (yaml valid, leo token path does not exist on disk)
  {
    name: 'MISSING oauth token file referenced by leo.youtube.oauth_token',
    yaml: buildYaml({
      leo: { youtube: { oauth_token: './does-not-exist.token.json' } },
    }),
    tokenPaths: ['./mateo.token.json'],
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: [
      'leo.youtube.oauth_token',
      'oauth token file does not exist',
      "run 'golazo auth leo' to create it",
    ],
  },

  // 12. TILDE EXPANSION — at the table level, asserts the loader expanded
  //     `~/` against os.homedir() *before* hitting existsSync. With no
  //     HOME override and a guaranteed-unique segment, the resulting
  //     absolute path will not exist, so loadChannel throws. The error
  //     message MUST contain the expanded home directory (not the
  //     literal `~/`), proving expansion ran. A companion describe-block
  //     in channels.test.ts covers the success path with HOME pointed at
  //     a tmpDir and asserts the resolved oauthTokenPath value directly.
  {
    name: "TILDE EXPANSION: '~/.golazo-test-unique-XYZ123/leo.token.json' is expanded against os.homedir() before existence check",
    yaml: buildYaml({
      leo: {
        youtube: {
          oauth_token: '~/.golazo-test-unique-XYZ123/leo.token.json',
        },
      },
    }),
    tokenPaths: ['./mateo.token.json'],
    kidToLoad: 'leo',
    shouldThrow: true,
    errorClass: ChannelsConfigError,
    messageContains: [
      'leo.youtube.oauth_token',
      homedir(),
      '.golazo-test-unique-XYZ123',
    ],
  },

  // 13. UNKNOWN KID
  {
    name: "UNKNOWN KID 'alice' on valid file with leo + mateo → UnknownKidError",
    yaml: buildYaml({}),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    kidToLoad: 'alice',
    shouldThrow: true,
    errorClass: UnknownKidError,
    messageContains: ['alice', 'leo', 'mateo'],
  },

  // 14. EXTRA UNKNOWN KEY — yaml has a third top-level kid `bobby` —
  //     loads fine, lookup by 'bobby' succeeds.
  {
    name: "EXTRA UNKNOWN KEY 'bobby' loads as a third channel; loadChannel('bobby') succeeds",
    yaml: buildYaml({
      extraKid: { key: 'bobby', tokenPath: './bobby.token.json' },
    }),
    tokenPaths: [
      './leo.token.json',
      './mateo.token.json',
      './bobby.token.json',
    ],
    kidToLoad: 'bobby',
    shouldThrow: false,
  },

  // 15. SKIP TOKEN CHECK — missing token: with skipTokenCheck:true, a yaml whose
  //     oauth_token points at a non-existent path loads successfully; the resolved
  //     oauthTokenPath is the absolute path even though the file does not exist.
  {
    name: 'SKIP TOKEN CHECK — missing token: skipTokenCheck:true allows load even when token file is absent',
    yaml: buildYaml({
      leo: { youtube: { oauth_token: './nonexistent-leo.token.json' } },
    }),
    tokenPaths: ['./mateo.token.json'],
    kidToLoad: 'leo',
    shouldThrow: false,
    skipTokenCheck: true,
  },

  // 16. SKIP TOKEN CHECK — existing token: skipTokenCheck:true also allows load when
  //     token file is present (the flag is permissive, not restrictive).
  {
    name: 'SKIP TOKEN CHECK — existing token: skipTokenCheck:true works equally when token file exists',
    yaml: buildYaml({}),
    tokenPaths: ['./leo.token.json', './mateo.token.json'],
    kidToLoad: 'leo',
    shouldThrow: false,
    skipTokenCheck: true,
  },
] as const;
