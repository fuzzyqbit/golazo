# Roadmap: golazo

## Overview

golazo is a local-Mac CLI that transforms folders of soccer highlight clips into branded, per-game YouTube episodes for two kids' channels.

## Shipped Milestones

- ✅ **v1.0 — MVP** (shipped 2026-05-19): 4 phases · 18 plans · 387 tests · 86.72% line coverage · 28/28 v1 requirements (1 override on PUB-05). See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) and [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md).

## Active Milestone

*(none — start the next milestone with `/gsd-new-milestone`)*

## v2 Backlog (carry-forwards from v1.0 close)

- **PUB-05-resumable** — Replace googleapis SDK upload with raw HTTP resumable upload session (initiation POST → session URI → `Content-Range` PUT on retry). Source: Phase 3 verification override.
- **OAuth-DI** — Replace `GOLAZO_OAUTH_MOCK=1` env-var branch in `exchangeCode` with injectable implementation (constructor / factory). Source: Plan 03-01 carry-forward.
- **QA-03-extended** — Commit 6+-clip fixture + integration render to close visual chapter-rhythm regression coverage on the every-3 path. Source: Phase 2 → Phase 4 carry-forward.

---
*Roadmap created: 2026-05-13 by gsd-roadmapper*
*v1.0 shipped: 2026-05-19 — see milestones/v1.0-ROADMAP.md for full phase + plan history*
