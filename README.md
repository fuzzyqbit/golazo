# golazo

Local-Mac CLI that turns folders of downloaded soccer highlight clips into branded,
per-game YouTube episodes for two kids' channels. The 12-year-old's footage comes from
Veo (full match — operator exports highlights manually); the 7-year-old's comes from
Trace (per-player auto-clips). Each kid has their own YouTube channel; episodes are
uploaded as unlisted for operator review before being flipped public.

## Status

Phase 1 in progress.

## Quick start

```sh
npm install
npm run build
./dist/cli/index.js --help
```

## Subcommands

```
golazo prepare <folder>   Parse metadata, scan clips, write manifest.json
golazo render  <folder>   Render episode.mp4 + thumb.png via Remotion
golazo publish <folder>   Upload episode.mp4 to YouTube as unlisted
golazo auth    <kid>      One-time YouTube OAuth flow for a channel
golazo all     <folder>   Convenience: prepare → render → publish
```

Only `prepare` (Plan 05) and the scaffold are implemented in Phase 1; the remaining
subcommands return `<name>: not yet implemented` until their phases land.
