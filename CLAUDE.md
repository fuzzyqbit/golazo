<!-- GSD:project-start source:PROJECT.md -->
## Project

**golazo**

A local-Mac CLI that turns folders of downloaded soccer highlight clips into branded, per-game YouTube episodes for two kids (12yo + 7yo). The 12-year-old's footage comes from Veo (full match — operator exports highlights manually); the 7-year-old's comes from Trace (per-player auto-clips). Each kid has their own YouTube channel; episodes are uploaded as unlisted for operator review before being flipped public.

**Core Value:** Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.

### Constraints

- **Tech stack**: Node.js + TypeScript + Remotion 4.x + commander.js + zod — operator runs locally on macOS; Remotion chosen for typographic strength and programmatic composition
- **Runtime**: macOS only — system `ffmpeg` and `ffprobe` from Homebrew assumed. No CI rendering across OSes
- **Music licensing**: YouTube Audio Library only — small pool committed under `remotion/assets/music/`
- **Publishing**: every upload is `privacyStatus: "unlisted"` — system has no path to publish public. Operator flip is the only public gate
- **Determinism**: same input clips must produce same music selection and same `manifestHash` on every machine — re-renders must not flap
- **Quotas**: YouTube Data API daily quota (10k units; `videos.insert` ≈ 1600) caps roughly 6 uploads/day on default quota — design must surface quota errors cleanly
- **Privacy**: OAuth tokens are personal credentials — token paths are gitignored; never committed
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
