# Handoff: rendering + uploading on macOS 15+

This Mac runs **macOS 13**, which **cannot render**. Remotion 4.0.461 ships a native
compositor (`@remotion/compositor-darwin-arm64`, its own ffprobe/ffmpeg + `libavdevice.dylib`)
**built for macOS 15** — it `SIGABRT`s on macOS 13 (`Symbol not found: _AVCaptureDeviceTypeContinuityCamera`).
No code change fixes this; rendering requires **macOS 15 (Sequoia) or later**.

Everything else is done and travels to the new machine unchanged.

## What's already done (on this Mac / in the repo)
- ✅ **OAuth loopback fix** merged to `main` — `golazo auth` auto-captures the consent code
  via a `127.0.0.1` server (no more pasting). (`auth leo` already succeeded against real Google.)
- ✅ **`browserExecutable` patch** merged to `main` — `render` honors `GOLAZO_BROWSER_EXECUTABLE`
  to use a specific Chrome binary. (Cleared the Chrome-launch hang on macOS 13; the *compositor*
  wall above is the remaining blocker. On macOS 15+ you usually don't need this env var at all.)
- ✅ `channels.yaml` created (gitignored): `leo` has real channel_id `UCGem0uPi_ZD8L-ZMau_gWlg`.
  ⚠️ branding (club/jersey/source) still placeholder; `mateo` channel_id still placeholder.
- ✅ Google **Desktop OAuth client** created; creds in `~/.golazo/credentials.sh` (gitignored, 0600).
- ✅ Leo token at `~/.golazo/leo.token.json`.

## Copy these from this Mac to the macOS 15 machine (NOT in git — gitignored secrets/config)
- `~/.golazo/credentials.sh`     (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
- `~/.golazo/leo.token.json`     (or just re-run `golazo auth leo` there)
- `<repo>/channels.yaml`         (or recreate from `channels.yaml.example`)

## Steps on the macOS 15+ machine
1. `git clone git@github.com:fuzzyqbit/golazo.git && cd golazo`
2. `npm install && npm run build`
3. Put `channels.yaml` in the repo root; put creds + token under `~/.golazo/`.
   (If you skipped the token, run `source ~/.golazo/credentials.sh && node dist/cli/index.js auth leo`.)
4. Fix `channels.yaml` branding for real episodes: leo's real `club`, `jersey`, `source`;
   and fill `mateo` channel_id (+ `auth mateo`) if doing mateo.
5. Arrange a game's clips at `~/golazo/<kid>/<game-folder>/` — folder name must match
   `YYYY-MM-DD_vs_<opponent>_<for>-<against>` (see `src/prepare/filename.ts` / fixtures for the exact convention).
6. Render + publish:
   ```
   source ~/.golazo/credentials.sh
   node dist/cli/index.js all ~/golazo/leo/<game-folder>
   # (= prepare → render → publish unlisted; or run the three subcommands separately)
   ```
   On macOS 15+ Remotion's own Chrome works, so `GOLAZO_BROWSER_EXECUTABLE` is not needed.
   If you ever need it: `export GOLAZO_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell`.

## Reminders
- Every upload is **unlisted** by design — flip to public manually in YouTube Studio.
- OAuth app is in **Testing** mode → refresh tokens expire ~weekly; re-run `auth <kid>` when uploads start failing with an auth error.
- Quota: `videos.insert` ≈ 1600 units; ~6 uploads/day on the default 10k/day.
