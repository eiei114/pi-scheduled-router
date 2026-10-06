# Roadmap — pi-scheduled-router

> Living document. Maintained alongside the weekly maintenance seed planner.
> The **Maintenance seeds** section lists bounded 30–90 minute tasks intended to become
> future maintenance issues. Treat that section as the queue; everything above it is context.
>
> Last reviewed: 2026-10-06 (v0.1.12).

## Current status

| Item | Value |
|---|---|
| Latest release | **0.1.12** (2026-10-01), published through the Trusted Publishing release flow |
| Development phase | Post-0.1.0 hardening complete; maintenance and edge-case coverage before 0.2.0 |
| Next planned | Add non-whole-hour timezone coverage, then refresh the roadmap/test drift guard before 0.2.0 planning |
| CI | typecheck + **81** node:test tests + `npm pack --dry-run`, on push & PR; version-bump guard on PR |
| Release pipeline | `auto-release.yml` → tag/release → `publish.yml` (Trusted Publishing, no `NPM_TOKEN`) |

`pi-scheduled-router` selects an AI provider/model at session start based on the time of
day, driven by a YAML time-slot config. v0.1.x delivers the core promise (time → model) with
strong validation, overlap warnings, extension test coverage, and timezone-aware matching.
The roadmap below focuses on docs, edge-case coverage, CI hygiene, and small UX gaps rather
than new routing features.

## What has shipped

### v0.1.6 — 2026-08-22

- Maintenance batch: dependency bumps (TypeScript 7, `@types/node`), masked-slot overlap
  warnings surfaced in validate/save/status, extension command/tool test coverage, README
  sponsor links, and `docs-consistency.test.mjs` guards for README pin + maintenance baseline.

### v0.1.5 — 2026-08-04

- Version bump for Discord release webhook verification.

### v0.1.1 — 2026-06-08

- Fix: missing JSDoc docstrings on internal validation helpers and `StringEnum` to meet the
  docstring coverage threshold (DOT-194).

### v0.1.0 — 2026-06-07 (initial release)

- Time-slot-based model selection at session start.
- YAML config (`scheduled-router.yaml`) with project-local (`.pi/`) override over the agent dir.
- First-match-wins slot evaluation; `from` inclusive, `to` exclusive; `24:00` supported.
- Day-spanning slots (e.g. `22:00` → `02:00`).
- Configurable IANA timezone (defaults to system local); required `default` model for gaps.
- Session-start auto-selection with model-not-found fallback to `default`.
- Commands: `/scheduled:status`, `/scheduled:configure`.
- Tool: `scheduled_router_config` (read / status / validate / save).
- CI pipeline (typecheck, tests, pack check) and Trusted Publishing release workflow.

### Hardening landed on `main` since v0.1.1 (not yet called out in semver notes)

- **Masked-slot overlap warnings** — `analyzeSlotWarnings` flags identical, contained, and
  day-spanning overlaps; surfaced via validate/save/status (formerly SEED-1).
- **Extension test coverage** — hooks, commands, and config tool exercised in
  `tests/extension-validate.test.mjs` (formerly SEED-2).
- **`matchSlot` timezone contract** — injected `Date` values honor `config.timezone` via
  `getNowInTimezone`; pinned by tests and docstring (formerly SEED-3, PR #51).
- **Async `loadConfig`** — uses `fs/promises` `readFile`; awaited at all call sites
  (formerly SEED-6).
- **Zero-duration slot rejection** — invalid `from === to` ranges rejected at validation.
- **DST transition coverage** — spring-forward / fall-back cases for `America/New_York`.
- **Maintenance health baseline** — `docs/maintenance-health-check.md` + drift guards.
- **SDK maintenance** — updated `@earendil-works/pi-*` dependencies to `0.99.1` in v0.1.12.
- **Status documentation** — documented dry-run route matching and linked the configuration reference.

## Short-term goals (next 1–2 releases)

Focus for upcoming `0.1.x` patches and the planned `0.2.0` minor:

1. **Timezone edge-case coverage.** Extend matcher tests beyond whole-hour zones and US DST
   to non-standard offsets (e.g. `Asia/Kolkata` +05:30).
2. **Roadmap drift protection.** Add a consistency check for this file's package version and
   test total so weekly seeds are based on repository truth.
3. **CI hygiene.** Consider an optional formatter check and verify the post-fix auto-release
   GitHub Release handoff on a future version bump.
4. **Keep maintenance baselines fresh.** After each release, sync this file, `CHANGELOG.md`,
   and `docs/maintenance-health-check.md`.

## Known technical debt

- **Release workflow token bug (fixed).** Stray literal `\n` suffix removed from
  `auto-release.yml` `GH_TOKEN` line. End-to-end verification in Actions history is still
  outstanding. → See [SEED-5](#seed-5--verify-auto-releaseyml-github-release-step).
- **matchSlot nowOverride timezone (fixed).** Contract documented and test-pinned.
- **Sync I/O in async path (fixed).** `loadConfig` is async.
- **No formatter/linter.** Only `.editorconfig` is present; no Prettier/ESLint or format
  check in CI. → See [SEED-7](#seed-7-optional-lower-priority--add-a-formatlint-check-to-ci).
- **Maintenance health baseline is stale.** It still names v0.1.6 and should be refreshed for
  the v0.1.12 release. → See [SEED-11](#seed-11--refresh-maintenance-health-baseline).
- **Non-whole-hour timezone gaps.** No assertions for offsets like +05:30 or +12:45.
  → See [SEED-8](#seed-8--non-whole-hour-timezone-test-coverage).

## Areas needing improvement

- **Docs** — the configuration reference and annotated example are now shipped; the
  maintenance-health baseline still needs a v0.1.12 refresh.
- **Tests** — 81 tests cover matcher, config, extension, session-start, status, smoke, and
  docs consistency. `lib/paths.ts` is exercised indirectly but has no dedicated unit file.
- **Config UX** — overlap warnings exist; no guided reorder/split suggestions beyond the
  warning text.
- **CI** — release-workflow verification and optional format check remain open.

---

## Maintenance seeds

Candidate maintenance issues for future weekly seeds. Each is scoped to **30–90 minutes** and
written with enough context (what / why / acceptance) to be picked up directly. Seeds are
independent and can be taken in any order unless noted.

### SEED-11 — Refresh maintenance health baseline

- **What.** Update `docs/maintenance-health-check.md` for v0.1.12, the current 81-test
  inventory, current release notes, and the latest workflow evidence.
- **Why.** The health baseline is still labeled 2026-W32 / v0.1.6, so it can mislead the
  weekly seed planner even though the drift tests remain green.
- **Scope.** ~30–45 min.
- **Files.** `docs/maintenance-health-check.md` (and tests only if the baseline format changes).
- **Acceptance.**
  - [ ] Release/version and test inventory match repository truth.
  - [ ] `npm run ci` green; no production or release action performed.

### SEED-4 — Annotated example config + configuration reference doc (completed)

- **What.** Add a copyable, commented example config and a dedicated configuration reference.
- **Why.** Improves onboarding and reduces misconfigured-slot support load.
- **Result.** ✅ Done on `main`: `docs/examples/scheduled-router.example.yaml`,
  `docs/configuration.md`, README links, and docs-consistency coverage are present.

### SEED-5 — Verify `auto-release.yml` GitHub Release step

- **What.** The stray literal `\n` on the `GH_TOKEN` line in `.github/workflows/auto-release.yml`
  has been removed. Confirm via Actions run history (or a controlled dry observation) that
  `gh release create` and the publish dispatch succeed with a valid token. Document the outcome
  in `docs/release.md` if behavior differs from expectations.
- **Why.** npm publishes still work via the `v*.*.*` tag trigger, so a broken Release step
  hides easily; operators need confidence the handoff is healthy.
- **Scope.** ~30–45 min.
- **Files.** `.github/workflows/auto-release.yml` (read-only unless a fix is needed),
  `docs/release.md` (note).
- **Acceptance.**
  - [ ] Evidence recorded (Actions log excerpt or written observation) that the release step
        completes with a valid token.
  - [ ] `docs/release.md` updated if the handoff contract needs clarification.
  - [ ] No accidental change to the dispatch contract; `npm run ci` green.

### SEED-7 (optional, lower priority) — Add a format/lint check to CI

- **What.** Add Prettier (and optionally ESLint) with a `format:check` script and wire it into
  `npm run ci`. Keep config minimal and consistent with existing style.
- **Why.** Currently only `.editorconfig` + `tsc` guard style; PR diffs can drift.
- **Scope.** ~45–60 min.
- **Acceptance.**
  - [ ] Prettier config added; existing files pass `prettier --check`.
  - [ ] `format:check` runs in CI; `npm run ci` green.

### SEED-8 — Non-whole-hour timezone test coverage

- **What.** Add matcher tests for at least one non-whole-hour IANA zone (e.g. `Asia/Kolkata`
  +05:30) and optionally a quarter-hour offset (e.g. `Pacific/Chatham` +12:45). Assert
  `getNowInTimezone` + `matchSlot` select the expected slot at a boundary instant.
- **Why.** Current DST coverage uses `America/New_York`; fractional-hour zones are a common
  real-world gap called out in `docs/maintenance-health-check.md`.
- **Scope.** ~30–45 min.
- **Files.** `tests/matcher.test.mjs`; optionally a short note in `docs/maintenance-health-check.md`.
- **Acceptance.**
  - [ ] At least one +05:30 (or similar) test added and passing.
  - [ ] `npm run ci` green; no change to production matching semantics unless a bug is found
        (if so, fix + changelog note in the same PR).

### SEED-9 — Unit tests for `lib/paths.ts`

- **What.** Extract or mirror the `resolveConfigPath` scenarios already in `tests/config.test.mjs`
  into a focused `tests/paths.test.mjs` (or expand config tests) covering project-vs-agent
  precedence, missing files, and symlink/relative edge cases if applicable.
- **Why.** Path resolution is security-sensitive (which config file wins) but only tested
  indirectly today; a dedicated file makes regressions obvious.
- **Scope.** ~30–45 min.
- **Files.** new `tests/paths.test.mjs`, `lib/paths.ts` (read-only unless bug found).
- **Acceptance.**
  - [ ] Dedicated tests for all documented resolution-order cases.
  - [ ] `npm run ci` green; maintenance-health-check test total updated if counts change.

### SEED-10 — ROADMAP drift guard in docs-consistency tests

- **What.** Extend `tests/docs-consistency.test.mjs` to assert that `ROADMAP.md` **Current
  status** table matches `package.json` version and that the documented test total matches
  `npm test` count (mirroring the maintenance-health-check guard).
- **Why.** This file is the seed planner's primary input; stale version or test counts cause
  the planner to skip or mis-scope weekly seeds (the original DOT-1009 trigger).
- **Scope.** ~30–45 min.
- **Files.** `tests/docs-consistency.test.mjs`, `ROADMAP.md` (ensure fields are parseable).
- **Acceptance.**
  - [ ] Test fails if ROADMAP version or test count drifts from repo truth.
  - [ ] `npm run ci` green.

---

## Promoted / completed seeds (archive)

These seeds are done on `main`. Keep for history; do not re-queue unless scope regresses.

| Seed | Summary | Status |
|---|---|---|
| SEED-1 | Masked-slot overlap warnings | ✅ Done (v0.1.6 batch) |
| SEED-2 | Extension hooks/commands/tool tests | ✅ Done (`extension-validate.test.mjs`) |
| SEED-3 | `matchSlot` nowOverride timezone contract | ✅ Done (PR #51) |
| SEED-6 | Async `loadConfig` | ✅ Done |

---

## How to update this file

- When a seed is promoted to an issue, move it to **Promoted / completed seeds** (or mark
  **promoted → &lt;issue key&gt;**) and add any new gap discovered during that work as a fresh
  seed under **Maintenance seeds**.
- Keep **Current status** and **What has shipped** in sync with `package.json` version and
  `CHANGELOG.md` after each release.
- Prefer adding 30–90 minute, well-scoped seeds over open-ended goals.
- After editing, run `npm run ci` and confirm the test total here matches `npm test` output.
