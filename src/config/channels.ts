/**
 * channels.yaml loader. Parses the file, validates with zod, expands
 * tilde-prefixed token paths, and verifies each declared OAuth token file
 * exists on disk. Every failure mode throws a {@link ChannelsConfigError}
 * (or {@link UnknownKidError} for `loadChannel` lookups) carrying field,
 * reason, and remediation suitable for the CLI to print verbatim.
 *
 * All I/O is synchronous: channels.yaml is tiny and loaded once per
 * command invocation, so `readFileSync` / `existsSync` keep call sites
 * (manifest builder, render driver, publish client) simple.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ChannelsConfigError, UnknownKidError } from './errors.js';
import type { ChannelConfig, ChannelsFile, KidKey } from './types.js';

/** Default path used when callers don't pass `opts.path`. */
export const CHANNELS_FILE_DEFAULT = './channels.yaml';

/** Zod schema for a single kid's entry in channels.yaml (snake_case yaml side). */
const channelEntrySchema = z.object({
  name: z.string().min(1),
  club: z.string().min(1),
  jersey: z.number().int().min(1).max(99),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must match #RRGGBB hex'),
  source: z.string().min(1),
  youtube: z.object({
    channel_id: z.string().min(1),
    oauth_token: z.string().min(1),
  }),
});

/** Zod schema for the whole file: a record of kid-key → entry. */
const channelsFileSchema = z.record(z.string().min(1), channelEntrySchema);

/**
 * Translate a zod issue into the field/reason/remediation triple the
 * operator sees. Each branch covers a failure mode the test suite
 * exercises directly — see `src/config/channels.test.ts`.
 */
function describeZodIssue(issue: z.core.$ZodIssue): {
  field: string;
  reason: string;
  remediation: string;
} {
  // Build the dotted field path: ['leo','accent'] → 'leo.accent'. Keep the
  // yaml-side snake_case names (channel_id, oauth_token) since that's what
  // operators see in the file.
  const field =
    issue.path.length > 0
      ? issue.path.map((segment) => String(segment)).join('.')
      : '(root)';

  // Accent regex failure
  if (
    issue.code === 'invalid_format' &&
    typeof issue.message === 'string' &&
    issue.message.toLowerCase().includes('#rrggbb hex')
  ) {
    return {
      field,
      reason: 'must match #RRGGBB hex',
      remediation: `edit channels.yaml and set ${field} to a hex like #ffce5a`,
    };
  }
  // Older / alternate code path: zod 4 may emit `invalid_string` for regex
  // failures depending on validation kind. Fall back on path match.
  if (field.endsWith('.accent')) {
    return {
      field,
      reason: 'must match #RRGGBB hex',
      remediation: `edit channels.yaml and set ${field} to a hex like #ffce5a`,
    };
  }
  // Jersey range / type failures
  if (field.endsWith('.jersey')) {
    if (issue.code === 'invalid_type') {
      return {
        field,
        reason: 'must be an integer between 1 and 99',
        remediation: `edit channels.yaml and set ${field} to an integer between 1 and 99`,
      };
    }
    if (
      issue.code === 'too_small' ||
      issue.code === 'too_big' ||
      issue.code === 'not_multiple_of'
    ) {
      return {
        field,
        reason: 'must be an integer between 1 and 99',
        remediation: `edit channels.yaml and set ${field} to an integer between 1 and 99`,
      };
    }
  }
  // Missing required key (zod 4 emits `invalid_type` with input=undefined
  // for omitted keys on z.object).
  if (issue.code === 'invalid_type') {
    return {
      field,
      reason: 'is required',
      remediation: `add ${field} to channels.yaml`,
    };
  }
  // Empty string on a min(1) field
  if (issue.code === 'too_small') {
    return {
      field,
      reason: 'must be a non-empty string',
      remediation: `edit channels.yaml and provide a value for ${field}`,
    };
  }
  // Fallback — emit the zod message verbatim so we never silently swallow
  // a new failure mode.
  return {
    field,
    reason: issue.message,
    remediation: `edit channels.yaml and correct ${field}`,
  };
}

/**
 * Expand a leading `~` against `os.homedir()`. `~` alone and `~/foo` are
 * both supported; any other path is returned unchanged so absolute and
 * relative paths flow through untouched (relative paths are resolved
 * against the channels.yaml's parent directory by the loader).
 */
function expandTilde(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) {
    return resolve(homedir(), input.slice(2));
  }
  return input;
}

/**
 * Load + validate the entire channels.yaml file.
 *
 * Throws {@link ChannelsConfigError} on:
 *  - missing file (with the resolved absolute path + remediation)
 *  - yaml syntax error
 *  - any zod validation failure (invalid hex, jersey out of range, missing key, etc.)
 *  - any declared OAuth token file that does not exist on disk after tilde expansion
 *    (skipped when `opts.skipTokenCheck === true` — used by `golazo auth` which
 *    runs BEFORE any token exists)
 */
export function loadChannelsFile(
  opts: { path?: string; skipTokenCheck?: boolean } = {},
): ChannelsFile {
  const filePath = resolve(opts.path ?? CHANNELS_FILE_DEFAULT);

  if (!existsSync(filePath)) {
    throw new ChannelsConfigError({
      field: '(file)',
      reason: `channels.yaml not found at ${filePath}`,
      remediation:
        'copy channels.yaml.example to channels.yaml and edit per-kid values',
      source: filePath,
    });
  }

  const raw = readFileSync(filePath, 'utf8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ChannelsConfigError({
      field: '(yaml)',
      reason: msg,
      remediation: 'fix yaml syntax in channels.yaml',
      source: filePath,
    });
  }

  const result = channelsFileSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    if (firstIssue) {
      const { field, reason, remediation } = describeZodIssue(firstIssue);
      throw new ChannelsConfigError({
        field,
        reason,
        remediation,
        source: filePath,
      });
    }
    // Defensive fallback — zod should always produce at least one issue
    // when success === false.
    throw new ChannelsConfigError({
      field: '(unknown)',
      reason: 'channels.yaml failed validation',
      remediation: 'compare your channels.yaml against channels.yaml.example',
      source: filePath,
    });
  }

  // Assemble the camelCased ChannelsFile, expanding tildes and verifying
  // each token file exists. We expand against the parent dir of
  // channels.yaml so relative paths in tests "just work".
  const fileParentDir = resolve(filePath, '..');
  const out: ChannelsFile = {};
  for (const [kidKey, entry] of Object.entries(result.data)) {
    if (!entry) continue;
    const tokenRaw = entry.youtube.oauth_token;
    const tokenExpanded = expandTilde(tokenRaw);
    const tokenResolved = resolve(fileParentDir, tokenExpanded);

    if (!opts.skipTokenCheck && !existsSync(tokenResolved)) {
      throw new ChannelsConfigError({
        field: `${kidKey}.youtube.oauth_token`,
        reason: `oauth token file does not exist at ${tokenResolved}`,
        remediation: `run 'golazo auth ${kidKey}' to create it`,
        source: tokenResolved,
      });
    }

    const config: ChannelConfig = {
      kid: kidKey,
      name: entry.name,
      club: entry.club,
      jersey: entry.jersey,
      accent: entry.accent,
      source: entry.source,
      youtube: {
        channelId: entry.youtube.channel_id,
        oauthTokenPath: tokenResolved,
      },
    };
    out[kidKey] = config;
  }
  return out;
}

/**
 * Load channels.yaml and return the {@link ChannelConfig} for one kid.
 *
 * Throws {@link UnknownKidError} if the requested key is not present in
 * the loaded file; the error lists every valid key so the operator can
 * see what's actually available.
 *
 * All exceptions {@link loadChannelsFile} can throw also propagate here.
 */
export function loadChannel(
  kidKey: KidKey,
  opts: { path?: string; skipTokenCheck?: boolean } = {},
): ChannelConfig {
  const file = loadChannelsFile(opts);
  const entry = file[kidKey];
  if (!entry) {
    throw new UnknownKidError({
      kidKey,
      validKeys: Object.keys(file),
    });
  }
  return entry;
}
