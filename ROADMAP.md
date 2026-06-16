# Roadmap — pi-scheduled-router

> Living document. Maintained alongside the weekly maintenance seed planner.
> The **Maintenance seeds** section lists bounded 30–90 minute tasks intended to become
> future maintenance issues. Treat that section as the queue; everything above it is context.
>
> Last reviewed: 2026-06-16 (v0.1.1).

## Current status

| Item | Value |
|---|---|
| Latest release | **v0.1.1** (2026-06-08), published to npm via Trusted Publishing |
| Development phase | Initial development complete; early maintenance / hardening |
| Next planned | Patch/minor hardening releases (0.1.x) toward a 0.2.0 feature release |
| CI | typecheck + 38 node:test tests + `npm pack --dry-run`, on push & PR; version-bump guard on PR |
| Release pipeline | `auto-release.yml` → tag/release → `publish.yml` (Trusted Publishing, no `NPM_TOKEN`) |

`pi-scheduled-router` selects an AI provider/model at session start based on the time of
day, driven by a YAML time-slot config. v0.1.x is functionally complete for its core
promise (time → model). The roadmap below focuses on correctness, testability, docs, and
CI hygiene rather than new features.

## What has shipped

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

Source issues behind v0.1.0 (the four initial development tracks):

1. `01-extension-scaffold-types-config` — extension scaffold, types, config loader.
2. `02-slot-matcher` — slot matching semantics incl. day-spanning.
3. `03-session-hook-model-selection` — session-start selection + fallback.
4. `04-commands-tool-readme-release` — commands, tool, README, release pipeline.

## Short-term goals (next 2–3 releases)

The next releases stay on `0.1.x` for hardening, then consolidate into `0.2.0`.

1. **Correctness & observability of config.** Surface hidden state in configs (overlapping
   slots, unintentional gaps) so users can tell *why* a slot does or does not fire.
2. **Close the test/coverage gap for user-facing surfaces.** The matcher and config loader
   are well tested; the extension entrypoint (hooks, commands, tool) is not.
3. **Onboarding & docs.** Provide a copyable, annotated example config and a dedicated
   configuration reference.
4. **CI hygiene.** Verify the release workflow actually creates GitHub Releases (see
   technical debt) and keep the version-bump guard healthy.

## Known technical debt

- **Release workflow token bug (fixed).** `.github/workflows/auto-release.yml` previously ended its
  final step with `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` plus a **literal backslash-n** suffix
  that corrupted the token for `gh release create` and `gh workflow run`. The stray suffix has been
  removed. → See [SEED-5](#seed-5--audit-and-fix-auto-releaseyml-token-line).
- **Test-only matcher path ignores timezone.** `matchSlot(config, nowOverride)` uses
  `nowOverride.getHours()` (local time) and ignores `config.timezone`. Harmless today because
  the override is only used in tests, but it is an inconsistency that will bite if that path is
  reused. → See [SEED-3](#seed-3--pin-or-fix-matchslot-nowoverride-timezone-handling).
- **Sync I/O in async path (fixed).** `loadConfig` previously used blocking `readFileSync` while
  `ensureConfig` and the save path are async. → See [SEED-6](#seed-6--make-loadconfig-async).
- **No formatter/linter.** Only `.editorconfig` is present; no Prettier/ESLint or format
  check in CI. Style drift is caught only by `tsc`.
- **README example is the only config example.** No annotated, copyable example file and no
  dedicated config reference doc.

## Areas needing improvement

- **Docs** — only `docs/release.md` exists. Add a configuration reference and an annotated
  example config.
- **Tests** — matcher/config coverage is strong; extension (commands/tool/hooks) coverage is
  zero. `paths.ts` is exercised indirectly via `resolveConfigPath` but not unit-tested in
  isolation.
- **Config UX** — no detection of overlapping or duplicate slots; first-match-wins silently
  masks later slots. Validation only checks individual entries, not their interaction.
- **CI** — release-workflow reliability (above) and optional format check.

---

## Maintenance seeds

Candidate maintenance issues for future weekly seeds. Each is scoped to **30–90 minutes** and
written with enough context (what / why / acceptance) to be picked up directly. Seeds are
independent and can be taken in any order unless noted.

### SEED-1 — Detect overlapping / duplicate time slots in config validation

- **What.** `validateConfig` (`lib/config.ts`) validates each slot independently but never
  compares slots. Add a check that flags **fully-overlapping or identical** `from`–`to`
  ranges (the case where first-match-wins silently masks a later slot). Report overlaps as a
  warning/info from the `validate` action of the `scheduled_router_config` tool, without
  changing match behavior.
- **Why.** Users cannot tell why a configured slot never fires. Overlaps are the most common
  cause and are currently invisible.
- **Scope.** ~45–60 min.
- **Files.** `lib/config.ts` (new check + tests in `tests/config.test.mjs`); surface in
  `extensions/index.ts` tool `validate` result.
- **Acceptance.**
  - [ ] Overlap/duplicate detection implemented and unit-tested (overlap, identical range, and
        clean multi-slot configs).
  - [ ] `validate` action reports overlaps without rejecting a technically-valid config.
  - [ ] Matching behavior unchanged; all existing tests still pass; `npm run ci` green.

### SEED-2 — Unit tests for the extension (hooks, commands, tool)

- **What.** `extensions/index.ts` has no tests. Add a test file that drives the extension
  through a lightweight mock `ExtensionAPI` / `ExtensionContext` and covers:
  - `formatStatus()` output for matched slot, default (no match), and not-configured states.
  - `/scheduled:status` and `/scheduled:configure` command handlers (configure sends the
    prompt via `pi.sendUserMessage`).
  - `scheduled_router_config` tool: `read` (found / not configured), `status`, `validate`
    (valid + invalid YAML + schema error), and `save` (confirm yes/no, writes file, reloads,
    reselects). Include the model-not-found → default fallback path in `trySelectModel`.
- **Why.** All user-facing behavior is untested; refactors silently risk regressions.
- **Scope.** ~60–90 min.
- **Files.** new `tests/extension.test.mjs`; mirror the `mockCtx` pattern already in
  `tests/config.test.mjs`.
- **Acceptance.**
  - [ ] New test file covering the cases above.
  - [ ] `npm run ci` green with no real Pi runtime required (fully mocked).

### SEED-3 — Pin or fix `matchSlot` nowOverride timezone handling

- **What.** `matchSlot(config, nowOverride)` (in `lib/matcher.ts`) calls
  `nowOverride.getHours()` and **ignores `config.timezone`**. Decide the intended contract
  and implement + test it: either (a) make the override honor the configured timezone, or
  (b) keep current behavior and document/test it explicitly so the contract is pinned.
- **Why.** The test helper diverges from production timezone-aware matching; reusing the path
  would introduce a latent timezone bug.
- **Scope.** ~30–45 min.
- **Files.** `lib/matcher.ts`, `tests/matcher.test.mjs`.
- **Acceptance.**
  - [ ] Decision recorded in a code comment / docstring.
  - [ ] Test(s) added that pin the chosen contract (e.g. override in a non-local timezone
        config).
  - [ ] `npm run ci` green.

### SEED-4 — Annotated example config + configuration reference doc

- **What.** Add a copyable, commented example config (e.g.
  `docs/examples/scheduled-router.example.yaml`) covering timezone, a normal slot, a
  day-spanning slot, and the required `default`. Add `docs/configuration.md` documenting every
  field, first-match-wins semantics, `from` inclusive / `to` exclusive, `24:00` support, and
  the config resolution order (project `.pi/` overrides the agent dir). Link to it from the
  README.
- **Why.** The only example today is an un-annotated snippet in the README; semantics are
  scattered. Improves onboarding and reduces misconfigured-slot support load.
- **Scope.** ~45–60 min.
- **Files.** new `docs/examples/scheduled-router.example.yaml`, new `docs/configuration.md`,
  `README.md` (link), `package.json` `files` already includes `docs/`.
- **Acceptance.**
  - [ ] Example file present and valid against `validateConfig`.
  - [ ] `docs/configuration.md` documents all fields + resolution order.
  - [ ] README links to the new doc; `npm run ci` (incl. `pack:check`) green.

### SEED-5 — Audit and fix `auto-release.yml` token line

- **What.** `.github/workflows/auto-release.yml` final step had a **literal `\n`** (backslash-n)
  suffix on `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, corrupting the token used by
  `gh release create` and `gh workflow run`. The stray suffix has been removed.
- **Why.** Suspected silent CI bug. npm publishes still work via the `v*.*.*` tag trigger, so
  it hides easily, but the auto-created GitHub Release + dispatch handoff is likely broken.
- **Scope.** ~30–45 min.
- **Files.** `.github/workflows/auto-release.yml`; optionally a note in `docs/release.md`.
- **Acceptance.**
  - [x] Stray trailing `\n` removed; line ends with `}}`.
  - [ ] Verified (via Actions run history or a dry observation) that the `gh release` step runs
        with a valid token — or documented why it was already working.
  - [ ] `npm run ci` green; no accidental change to the dispatch handoff contract described in
        `docs/release.md`.

### SEED-6 — Make `loadConfig` async

- **What.** `loadConfig` (`lib/config.ts`) reads the config with blocking `readFileSync`
  while its caller `ensureConfig` (`extensions/index.ts`) and the `save` path are already
  async. Convert `loadConfig` to async (`fs/promises` `readFile`) and update callers and tests.
- **Why.** Removes blocking I/O from the `session_start` hook and resolves the sync/async
  inconsistency.
- **Scope.** ~30–45 min.
- **Files.** `lib/config.ts`, `extensions/index.ts` (`ensureConfig`), `tests/config.test.mjs`.
- **Acceptance.**
  - [x] `loadConfig` is async and awaited at all call sites.
  - [ ] Tests updated to `await`; behavior unchanged; `npm run ci` green.

### SEED-7 (optional, lower priority) — Add a format/lint check to CI

- **What.** Add Prettier (and optionally ESLint) with a `format:check` script and wire it into
  `npm run ci`. Keep config minimal and consistent with existing style.
- **Why.** Currently only `.editorconfig` + `tsc` guard style; PR diffs can drift.
- **Scope.** ~45–60 min.
- **Acceptance.**
  - [ ] Prettier config added; existing files pass `prettier --check`.
  - [ ] `format:check` runs in CI; `npm run ci` green.

---

## How to update this file

- When a seed is promoted to an issue, move it out of **Maintenance seeds** (or mark it
  **promoted → &lt;issue key&gt;**) and add any new gap discovered during that work as a fresh
  seed.
- Keep **Current status** and **What has shipped** in sync with `package.json` version and
  `CHANGELOG.md` after each release.
- Prefer adding 30–90 minute, well-scoped seeds over open-ended goals.
