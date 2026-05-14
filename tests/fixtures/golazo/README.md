# tests/fixtures/golazo — integration fixture

This fixture exists so vitest integration tests and manual CLI smokes can exercise
the full `golazo prepare` pipeline without depending on a real `~/golazo/<kid>/<game>/`
layout on the operator's machine.

## HOME="$PWD" requirement

`channels.yaml` declares `oauth_token: ~/tests/fixtures/golazo/<kid>.token.json`.
The `~` is expanded against `process.env.HOME` by `src/config/channels.ts`. To make
the expansion resolve to the committed token files under this fixture directory,
callers MUST set HOME to the repo root before running anything that loads the
fixture's channels.yaml.

- **Vitest:** tests call `vi.stubEnv('HOME', process.cwd())` in `beforeAll` (or
  per-test as needed). Plan 03 already established the same pattern for
  `resolveKidFromPath` testing.
- **Manual CLI** (from the repo root):

  ```bash
  HOME="$PWD" npx tsx src/cli/index.ts prepare \
    tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1 \
    --channels-config tests/fixtures/golazo/channels.yaml
  ```

  The `npx tsx` invocation is build-free — no `tsc` step is required before
  exercising the fixture.

## Why tilde paths instead of absolute paths

Absolute paths would bake the developer's home directory into the committed yaml
file, which is non-portable across machines (CI, contributors). Tilde-prefixed
paths combined with HOME stubbing keep the fixture self-contained and
reviewable.

## Files in this fixture

| Path                                       | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `channels.yaml`                            | Two-kid config — `leo` and `mateo` — with tilde-pathed `oauth_token` paths |
| `leo.token.json` / `mateo.token.json`      | `{}` stub token files (existence-only — refresh logic lives in Phase 3)    |
| `leo/2026-05-13_vs_united_3-1/01-clip.mp4` | ~2s H.264 clip, libx264 ultrafast, 320x180@15fps, no audio                 |
| `leo/2026-05-13_vs_united_3-1/02-clip.mp4` | identical pattern, clip #2                                                 |
| `leo/2026-05-13_vs_united_3-1/03-clip.mp4` | identical pattern, clip #3                                                 |
| `leo/2026-05-13_vs_united_3-1/README.md`   | Per-folder regeneration + determinism notes                                |

## Regenerating the clips

```bash
bash scripts/build-fixtures.sh
```

Regeneration may produce different bytes across ffmpeg / libx264 versions —
libx264's multi-threaded encoding is not bit-stable, and the lavfi `testsrc`
filter's output also varies by ffmpeg version. The committed bytes are the
canonical reference. After regenerating, recompute any pinned sha256
expectations in tests (Plan 04 does not pin specific digests; later plans
may).

## Determinism trade-off

The integration fixture intentionally trades byte-stable regeneration for
keeping the clips small (~28KB each) and dependency-light (no committed source
videos). The system tests that DO need byte-stable inputs — `manifestHash`
determinism, music-picker seeding — derive their stability from the COMMITTED
clip bytes (via `computeClipSha256`), not from the regeneration script.
