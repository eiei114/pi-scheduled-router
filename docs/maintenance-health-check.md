# Maintenance Health Check (2026-W32)

Baseline review before the next feature cycle. No router behavior changes in this maintenance pass.

## Package completeness (pi-extension-template policy)

| Item | Status | Notes |
|------|--------|-------|
| `LICENSE` | ✅ | MIT |
| `SECURITY.md` | ✅ | Vulnerability reporting policy present |
| `CODE_OF_CONDUCT.md` | ✅ | Present |
| `CONTRIBUTING.md` | ✅ | Dev flow documented (`npm run ci`) |
| `CHANGELOG.md` | ✅ | v0.1.5 current on `main` |
| README badges | ✅ | CI, Publish, npm version/downloads, License, Pi package, Trusted Publishing |
| `docs/release.md` | ✅ | Trusted Publishing + auto-release handoff documented |
| `.github/workflows/ci.yml` | ✅ | typecheck + test + pack:check + version:check on PRs |
| `.github/workflows/publish.yml` | ✅ | `id-token: write`, no `NPM_TOKEN` |
| `.github/workflows/auto-release.yml` | ✅ | Dispatches `publish.yml` on version bump |

## CI verification

- **Local `npm run ci`:** pass (typecheck, 70 tests, `npm pack --dry-run`).
- **Workflow pinning:** `actions/checkout@v7`, `actions/setup-node@v7`.

## Test inventory

| File | Tests | Focus |
|------|-------|-------|
| `tests/config.test.mjs` | 28 | YAML validation, timezone IANA check, slot overlap warnings |
| `tests/matcher.test.mjs` | 23 | Slot matching, day-spanning, DST boundaries |
| `tests/session-start.test.mjs` | 7 | Session-start model selection and fallbacks |
| `tests/status.test.mjs` | 5 | Status formatting and config warnings |
| `tests/extension-validate.test.mjs` | 3 | `scheduled_router_config` validate warnings |
| `tests/docs-consistency.test.mjs` | 3 | README pin + maintenance baseline drift guard |
| `tests/smoke.test.mjs` | 1 | End-to-end validate + match |
| **Total** | **70** | **70 pass / 0 fail** |

## Edge-case review (gaps)

### Timezone corner cases

- **DST transitions:** Covered for `America/New_York` spring-forward / fall-back in `tests/matcher.test.mjs`.
- **Non-whole-hour zones:** No assertions for `Asia/Kolkata` (+05:30) or `Pacific/Chatham` (+12:45).
- **`nowOverride` in tests:** When `config.timezone` is set, injected `Date` values are evaluated in that IANA timezone via `getNowInTimezone` (see `matchSlot evaluates injected now in configured timezone` and `matchSlot uses timezone offset when injected now differs from local`). Configs without `timezone` still use the runner's local clock.

### `scheduled-router.yaml` validation gaps

- **Zero-duration slots:** Rejected by `validateConfig`.
- **Unsorted / overlapping slots:** Allowed by design (first-match wins); `analyzeSlotWarnings` surfaces masked-slot warnings.
- **Extra YAML keys:** Rejected by strict top-level schema.

## Docs freshness

- README pin example, `package.json` version, and `docs-consistency.test.mjs` are aligned on `0.1.5`.
- CONTRIBUTING uses `npm run ci` (not `pnpm`); `package.json` has no `pnpm` scripts — npm is the canonical package manager.

## Fixes in this maintenance PR

- Refresh stale 2026-07 maintenance baseline (31-test inventory, `actions/checkout@v6`) to match the current 70-test suite and `@v7` workflow pins.
- Add `docs-consistency.test.mjs` guards so README pin and maintenance baseline totals stay in sync.

## Follow-up issues filed

- **DOT-482** — DST transition test coverage for `getNowInTimezone` / `matchSlot` (addressed on `main`; close or repurpose if no further scope remains)
- **DOT-483** — Reject zero-duration slots and harden YAML validation (addressed on `main`; close or repurpose if no further scope remains)
