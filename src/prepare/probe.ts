/**
 * ffprobe wrapper (PREP-04).
 *
 * Spawns the system `ffprobe` (resolved from `PATH` — assumed to be the
 * Homebrew install on macOS, since the project is mac-only per the
 * design spec) and parses the `format=duration` field out of stdout.
 *
 * Surface:
 *  - {@link probeDuration} — `(absPath) → Promise<number>` rounded to 3
 *    decimals. Rejects with {@link ProbeError} on non-zero exit OR
 *    non-numeric stdout (the latter indicates a file ffprobe could open
 *    but could not interpret as containing a duration — corrupt headers,
 *    image files, etc.).
 *
 * The 3-decimal rounding matches the design spec's manifest example
 * (`durationSec: 12.345`) and keeps the value JSON-stable so it does not
 * flap when re-probed on the same file across runs.
 *
 * Integration coverage: this module has no unit test in Plan 04 because
 * mocking ffprobe is fragile and provides no real signal (the contract
 * worth testing is "ffprobe on a real mp4 returns the duration"). Plan
 * 05's integration test exercises it end-to-end against the fixture
 * clips committed in Task 2 below.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { ProbeError } from './errors.js';

const execFileAsync = promisify(execFile);

/** Internal shape of the error promisify(execFile) rejects with. */
interface ExecFileError extends Error {
  code?: number | string;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
}

/**
 * Read the float duration (in seconds) of the media file at `absPath`
 * via ffprobe. Returns a number rounded to 3 decimals so the value is
 * JSON-stable across re-probes.
 *
 * Rejects with a {@link ProbeError} when:
 *  - ffprobe exits non-zero (corrupt file, ffprobe missing from PATH,
 *    permission denied, etc.) — the error carries `exitCode` and the
 *    full stderr text.
 *  - ffprobe exits zero but stdout does not parse to a positive number
 *    (e.g. the file has no duration metadata) — `exitCode` is 0 and the
 *    stderr field carries a synthetic explanation.
 */
export async function probeDuration(absPath: string): Promise<number> {
  let stdout: string;
  try {
    const result = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      absPath,
    ]);
    stdout = result.stdout.toString();
  } catch (err) {
    const e = err as ExecFileError;
    // `code` on a child_process error is either a numeric exit code or a
    // string error code (e.g. 'ENOENT' when ffprobe is not on PATH). Coerce
    // numeric codes to numbers; string codes fall through as -1 so the
    // ProbeError exitCode field stays typed as number.
    const exitCode = typeof e.code === 'number' ? e.code : -1;
    const stderr = e.stderr?.toString() ?? e.message ?? '';
    throw new ProbeError({
      filePath: absPath,
      exitCode,
      stderr,
    });
  }

  const trimmed = stdout.trim();
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ProbeError({
      filePath: absPath,
      exitCode: 0,
      stderr: `ffprobe returned non-numeric duration: '${trimmed}'`,
    });
  }

  // Round to 3 decimals so the manifest stores a stable value and equality
  // checks across re-probes do not flap on the last-bit float noise.
  return Math.round(parsed * 1000) / 1000;
}
