# 2026-05-13_vs_united_3-1 — fixture game folder

Three committed `NN-clip.mp4` H.264 files used by integration tests for
`discoverClips`, `probeDuration`, `computeClipSha256`, and the Plan 05
manifest builder.

## Files

| File          | Codec / settings                                    | ffprobe duration |
| ------------- | --------------------------------------------------- | ---------------- |
| `01-clip.mp4` | libx264 ultrafast, 320x180@15fps, yuv420p, no audio | ~2.0 s           |
| `02-clip.mp4` | identical pattern                                   | ~2.0 s           |
| `03-clip.mp4` | identical pattern                                   | ~2.0 s           |

Total fixture size: ~85 KB (committed as binary).

## Regeneration

```bash
bash scripts/build-fixtures.sh
```

The script uses `ffmpeg`'s `lavfi` `testsrc` filter so it has no external
asset dependencies.

## Determinism note (corrected)

Fixtures are committed binary bytes. Regenerating via `build-fixtures.sh`
**may produce different bytes** if libx264 threading or the installed
ffmpeg version differs across machines — libx264's multi-threaded encoder
is not bit-stable, and the lavfi `testsrc` filter's output can also vary
by ffmpeg version.

After regenerating, recompute any sha256 expectations pinned in tests
(Plan 04 only pins the regex SHAPE — `^sha256:[0-9a-f]{64}$` — not the
exact bytes; future plans may pin specific digests, in which case those
tests will fail loudly and need to be updated).

## What this fixture is NOT for

- It is NOT a visual reference for the rendered output — that lives under
  `tests/snapshots/` once Plan 02/Phase 4 lands.
- It is NOT an example of operator-supplied footage — operators export
  real clips from Veo or Trace. The fixture only has to be ffprobe-valid
  H.264 so the pipeline can walk it.
