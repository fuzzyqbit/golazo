/**
 * Table-driven test cases for `kid.test.ts`. Extracted to a sibling
 * (non-test) module so the named-const array can be imported by tooling
 * (`tsx -e` row-count gates) without dragging vitest's runner context into
 * scope. Mirrors the Plan 02 / Plan 03-Task-1 pattern.
 */

import { UnknownKidError } from '../config/errors.js';
import { KidPathError } from './errors.js';

/**
 * Shape of a single `resolveKidFromPath` test case. The test harness in
 * `kid.test.ts` builds a tmp directory per row, writes the declared
 * channels.yaml + tokens, then invokes the SUT with `folderPathBuilder`
 * (which receives the tmp dir so each row can construct paths relative to
 * its own scratch space).
 */
export interface KidTestCase {
  /** Human-readable label shown by vitest. */
  readonly name: string;
  /**
   * Whether to use the operator's real `~/golazo/...` layout via `HOME`
   * override. When true, the harness sets `process.env.HOME = tmpDir` and
   * resolves the channels.yaml + tokens under `<tmpDir>/golazo/...`.
   * When false, the harness puts channels.yaml at `<tmpDir>/channels.yaml`
   * and the folder path is built directly by `folderPathBuilder`.
   */
  readonly useHomeOverride?: boolean;
  /**
   * Whether to write a channels.yaml file (defaults to true). Set false
   * for cases where channels.yaml itself is intentionally absent (none of
   * the rows here use this — included for future extensibility).
   */
  readonly writeChannelsYaml?: boolean;
  /**
   * Token files to touch under the tmp dir. Paths are resolved against
   * the tmp dir (so use bare names like `'leo.token.json'`).
   */
  readonly tokenPaths: readonly string[];
  /**
   * Builds the absolute path that will be passed to
   * `resolveKidFromPath`. Receives the tmp dir so each row controls its
   * own input. Return a string — may be absolute (most rows) or relative
   * (the "relative path" failure row).
   */
  readonly folderPathBuilder: (tmpDir: string) => string;
  /**
   * When set, the test harness will pass `{ channelsPath: <this> }` to
   * `resolveKidFromPath`. Receives the tmp dir. When unset, the channels
   * path defaults to `<tmpDir>/channels.yaml`.
   */
  readonly channelsPathBuilder?: (tmpDir: string) => string;
  /** What to assert. */
  readonly expect:
    | { readonly kind: 'ok'; readonly value: string }
    | {
        readonly kind: 'throws';
        readonly errorClass:
          | typeof KidPathError
          | typeof UnknownKidError;
        /** Substrings the error message MUST contain. */
        readonly messageContains?: readonly (string | RegExp)[];
      };
  /**
   * Custom channels.yaml string for rows that need a non-standard kid
   * roster. When unset, the harness writes the default leo+mateo file.
   */
  readonly customChannelsYaml?: string;
}

/**
 * Default channels.yaml string used by most rows: leo + mateo with
 * relative-path tokens that the harness creates inside the tmp dir.
 */
export const DEFAULT_CHANNELS_YAML = [
  'leo:',
  '  name: "Leo"',
  '  club: "FC Eagles"',
  '  jersey: 10',
  '  accent: "#ffce5a"',
  '  source: "Veo"',
  '  youtube:',
  '    channel_id: "UC_LEO"',
  '    oauth_token: "./leo.token.json"',
  'mateo:',
  '  name: "Mateo"',
  '  club: "City SC"',
  '  jersey: 7',
  '  accent: "#5acfff"',
  '  source: "Trace"',
  '  youtube:',
  '    channel_id: "UC_MATEO"',
  '    oauth_token: "./mateo.token.json"',
  '',
].join('\n');

/**
 * Mateo-only channels.yaml (used by the channelsPath-override row to
 * prove the loader was pointed at this file instead of the default).
 */
export const MATEO_ONLY_CHANNELS_YAML = [
  'mateo:',
  '  name: "Mateo"',
  '  club: "City SC"',
  '  jersey: 7',
  '  accent: "#5acfff"',
  '  source: "Trace"',
  '  youtube:',
  '    channel_id: "UC_MATEO"',
  '    oauth_token: "./mateo.token.json"',
  '',
].join('\n');

/**
 * Exhaustive table of `resolveKidFromPath` cases. Length asserted by a
 * meta-test (>= 10) and re-checkable from any importer.
 */
export const KID_TEST_CASES: readonly KidTestCase[] = [
  // 1. VALID leo: tmpDir/golazo/leo/<game-folder>
  {
    name: 'VALID: absolute path under <tmp>/golazo/leo/<game> returns "leo"',
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/leo/2026-05-13_vs_united_3-1`,
    expect: { kind: 'ok', value: 'leo' },
  },

  // 2. VALID mateo
  {
    name: 'VALID: absolute path under <tmp>/golazo/mateo/<game> returns "mateo"',
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/mateo/2026-05-12_vs_city-sc_2-2`,
    expect: { kind: 'ok', value: 'mateo' },
  },

  // 3. VALID with trailing slash on the absolute path
  {
    name: 'VALID: trailing slash on path is stripped before segmenting',
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/leo/2026-05-13_vs_united_3-1/`,
    expect: { kind: 'ok', value: 'leo' },
  },

  // 4. VALID home-relative resolved: HOME=<tmp>, path under <HOME>/golazo/leo/
  {
    name: 'VALID: path under <HOME>/golazo/leo (HOME overridden to tmpDir) returns "leo"',
    useHomeOverride: true,
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/leo/2026-05-13_vs_united_3-1`,
    expect: { kind: 'ok', value: 'leo' },
  },

  // 5. UNKNOWN kid 'alice' under /golazo/alice
  {
    name: 'UNKNOWN: alice under /golazo/alice throws UnknownKidError listing leo, mateo',
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/alice/2026-05-13_vs_united_3-1`,
    expect: {
      kind: 'throws',
      errorClass: UnknownKidError,
      messageContains: ['alice', 'leo', 'mateo'],
    },
  },

  // 6. NO 'golazo' segment in path at all
  {
    name: "NO 'golazo' segment in path → KidPathError with expected layout",
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: () => '/tmp/random/2026-05-13_vs_united_3-1',
    expect: {
      kind: 'throws',
      errorClass: KidPathError,
      messageContains: ['~/golazo/<kid>/<game-folder>/'],
    },
  },

  // 7. 'golazo' is the LAST segment — no kid follows
  {
    name: "'golazo' is the last segment → KidPathError",
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) => `${tmpDir}/golazo`,
    expect: {
      kind: 'throws',
      errorClass: KidPathError,
      messageContains: ['~/golazo/<kid>/<game-folder>/'],
    },
  },

  // 8. 'golazo' followed only by the game folder (no kid segment in between)
  //    — the candidate kid is the game-folder name, which fails kid validation
  //    with UnknownKidError listing the real keys.
  {
    name: "'golazo' followed by game folder only → UnknownKidError (treats game folder as candidate kid)",
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/2026-05-13_vs_united_3-1`,
    expect: {
      kind: 'throws',
      errorClass: UnknownKidError,
      messageContains: ['2026-05-13_vs_united_3-1', 'leo', 'mateo'],
    },
  },

  // 9. RELATIVE path → KidPathError with 'path must be absolute'
  {
    name: "RELATIVE path → KidPathError reason 'path must be absolute'",
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: () => 'leo/2026-05-13_vs_united_3-1',
    expect: {
      kind: 'throws',
      errorClass: KidPathError,
      messageContains: ['path must be absolute'],
    },
  },

  // 10. EXPLICIT channelsPath override: write a separate channels.yaml that
  //     only contains 'mateo' at a custom path; verify the override is
  //     forwarded so the loader uses THIS file and rejects 'leo' with
  //     UnknownKidError listing only ['mateo'].
  {
    name: "channelsPath override is forwarded to loadChannelsFile (leo rejected when override has only mateo)",
    tokenPaths: ['mateo.token.json'],
    customChannelsYaml: MATEO_ONLY_CHANNELS_YAML,
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/leo/2026-05-13_vs_united_3-1`,
    channelsPathBuilder: (tmpDir) => `${tmpDir}/custom-channels.yaml`,
    expect: {
      kind: 'throws',
      errorClass: UnknownKidError,
      messageContains: ['leo', 'mateo'],
    },
  },

  // 11. NESTED golazo: when the absolute path contains MORE THAN ONE
  //     `golazo` segment (e.g. the project's own checkout at
  //     `/Users/.../code/golazo/tests/fixtures/golazo/leo/...`, or any
  //     operator workspace that nests one golazo inside another), the
  //     resolver picks the INNERMOST golazo. This case used to fail
  //     before Plan 05's fix (resolveKidFromPath was using indexOf,
  //     which picked the outermost golazo and shadowed the real kid).
  //     The fix is `lastIndexOf` — see kid.ts for the rationale.
  {
    name: 'NESTED: path with two golazo segments resolves to the innermost (lastIndexOf semantics)',
    tokenPaths: ['leo.token.json', 'mateo.token.json'],
    folderPathBuilder: (tmpDir) =>
      `${tmpDir}/golazo/outer/golazo/leo/2026-05-13_vs_united_3-1`,
    expect: { kind: 'ok', value: 'leo' },
  },
] as const;
