/**
 * Derives kid identity (`leo`, `mateo`, …) from the absolute folder path
 * of a per-game directory under `~/golazo/<kid>/<game>/`. Validates the
 * candidate against the kid keys declared in `channels.yaml` by delegating
 * to `loadChannelsFile` (Plan 02), and reuses {@link UnknownKidError} from
 * `src/config/errors.js` so the error vocabulary stays consistent across
 * the codebase.
 *
 * Implements PREP-02 (kid identity from path).
 *
 * @throws {KidPathError} when the path is relative, lacks a `golazo`
 *   segment, or has `golazo` as its final segment (no kid follows).
 * @throws {UnknownKidError} when the candidate kid (segment immediately
 *   after `golazo`) is not present in the loaded channels.yaml.
 * @throws {ChannelsConfigError} (from Plan 02) when channels.yaml itself
 *   fails to load (missing file, yaml syntax, zod failure, missing token).
 */
import { isAbsolute, normalize, sep } from 'node:path';

import { loadChannelsFile } from '../config/channels.js';
import { UnknownKidError } from '../config/errors.js';
import { KidPathError } from './errors.js';

/** The canonical parent-directory name under which kid folders live. */
const GOLAZO_SEGMENT = 'golazo';

/**
 * Resolve the kid key from an absolute folder path. The path must live
 * under a directory named `golazo`, with the kid as the immediate child:
 * `<anywhere>/golazo/<kid>/<game-folder>/`.
 *
 * @param absoluteFolderPath absolute path to a game folder
 * @param opts.channelsPath  optional override of the channels.yaml path
 *                           (forwarded to {@link loadChannelsFile})
 * @returns the validated kid key (string) as declared in channels.yaml
 */
export function resolveKidFromPath(
  absoluteFolderPath: string,
  opts: { channelsPath?: string } = {},
): string {
  if (!isAbsolute(absoluteFolderPath)) {
    throw new KidPathError({
      folderPath: absoluteFolderPath,
      reason: 'path must be absolute',
    });
  }

  // Normalize collapses `..` and duplicate separators. Then strip any
  // trailing separator so `.../leo/game/` and `.../leo/game` produce the
  // same segment list.
  const trailingSepRe = new RegExp(`\\${sep}+$`);
  const normalized = normalize(absoluteFolderPath).replace(trailingSepRe, '');
  const segments = normalized.split(sep).filter((s) => s.length > 0);

  // Use lastIndexOf rather than indexOf so paths that themselves live
  // under a parent directory named `golazo` (e.g. the project's own
  // checkout at `/Users/.../code/golazo/tests/fixtures/golazo/leo/...`,
  // or any operator-side workspace that happens to nest one `golazo`
  // inside another) resolve to the INNERMOST golazo. This is the
  // semantic that matches operator intent: the closest enclosing
  // `golazo/<kid>/<game-folder>/` triple is the one that owns the game
  // folder. With first-occurrence semantics, the project-root `golazo`
  // would shadow the fixture path and the kid would resolve to
  // `tests`, which surfaced as a real verify-gate failure during Plan
  // 05's integration smoke. See Plan 05 SUMMARY deviations.
  const golazoIdx = segments.lastIndexOf(GOLAZO_SEGMENT);
  if (golazoIdx === -1 || golazoIdx >= segments.length - 1) {
    throw new KidPathError({
      folderPath: absoluteFolderPath,
      reason: `no '${GOLAZO_SEGMENT}' directory followed by a kid segment found in path`,
    });
  }

  const candidate = segments[golazoIdx + 1];
  if (candidate === undefined || candidate.length === 0) {
    /* c8 ignore next 4 -- defensive; the bounds check above prevents this */
    throw new KidPathError({
      folderPath: absoluteFolderPath,
      reason: `segment after '${GOLAZO_SEGMENT}' is empty`,
    });
  }

  // Forward the channelsPath override to the Plan 02 loader. Any failure
  // mode (missing file, yaml syntax, zod failure, missing OAuth token)
  // propagates as ChannelsConfigError — that vocabulary belongs to the
  // loader, not this function.
  const file =
    opts.channelsPath !== undefined
      ? loadChannelsFile({ path: opts.channelsPath })
      : loadChannelsFile();

  if (!(candidate in file)) {
    throw new UnknownKidError({
      kidKey: candidate,
      validKeys: Object.keys(file),
    });
  }

  return candidate;
}
