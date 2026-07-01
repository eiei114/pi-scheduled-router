# Maintenance Health Check (2026-07)

Baseline review before the next feature cycle. No router behavior changes in this maintenance pass.

## Package completeness (pi-extension-template policy)

| Item | Status | Notes |
|------|--------|-------|
| `LICENSE` | ✅ | MIT |
| `SECURITY.md` | ✅ | Vulnerability reporting policy present |
| `CODE_OF_CONDUCT.md` | ✅ | Present |
| `CONTRIBUTING.md` | ✅ | Dev flow documented (`npm run ci`) |
| `CHANGELOG.md` | ✅ | v0.1.0 dated 2026-06-07 |
| README badges | ✅ | CI, Publish, npm version/downloads, License, Pi package, Trusted Publishing |
| `docs/release.md` | ✅ | Trusted Publishing + auto-release handoff documented |
| `.github/workflows/ci.yml` | ✅ | typecheck + test + pack:check |
| `.github/workflows/publish.yml` | ✅ | `id-token: write`, no `NPM_TOKEN` |
| `.github/workflows/auto-release.yml` | ✅ | Dispatches `publish.yml` on version bump |

## CI verification

- **GitHub Actions `CI` on `main`:** last run succeeded (2026-06-27, merge of DOT-285).
- **Local `npm run ci`:** pass (typecheck, 31 tests, `npm pack --dry-run`).
- **Workflow pinning:** `actions/checkout@v6`, `actions/setup-node@v6`.

## Test inventory

| File | Tests | Focus |
|------|-------|-------|
| `tests/config.test.mjs` | 13 | YAML validation, timezone IANA check |
| `tests/matcher.test.mjs` | 17 | Slot matching, day-spanning, boundaries |
| `tests/smoke.test.mjs` | 1 | End-to-end validate + match |
| **Total** | **31** | **31 pass / 0 fail** |

## Edge-case review (gaps)

### Timezone corner cases

- **DST transitions:** No tests for spring-forward / fall-back (e.g. `America/New_York`). `Intl.DateTimeFormat` handles offsets, but slot boundaries during ambiguous/skipped hours are untested.
- **Non-whole-hour zones:** No assertions for `Asia/Kolkata` (+05:30) or `Pacific/Chatham` (+12:45). Smoke tests only check hour/minute ranges.
- **`nowOverride` in tests:** `matchSlot(config, date)` uses local `Date` hours/minutes, not `config.timezone`. Production path uses `getNowInTimezone(config.timezone)` — test helper limitation only.

### `scheduled-router.yaml` validation gaps

- **Zero-duration slots:** `from: "10:00", to: "10:00"` is accepted (always empty range).
- **Unsorted / overlapping slots:** Allowed by design (first-match wins); no lint/warning for likely misconfiguration.
- **Extra YAML keys:** Silently ignored (no strict schema).

## Docs freshness

- README, `docs/release.md`, and `CHANGELOG.md` are internally consistent on Trusted Publishing and v0.1.0 scope.
- CONTRIBUTING uses `npm run ci` (not `pnpm`); `package.json` has no `pnpm` scripts — npm is the canonical package manager.

## Fixes in this maintenance PR

- Remove stray `\\n` suffix on `GH_TOKEN` in `.github/workflows/auto-release.yml` (could corrupt the token env value).

## Follow-up issues filed

- **DOT-482** — DST transition test coverage for `getNowInTimezone` / `matchSlot`
- **DOT-483** — Reject zero-duration slots and harden YAML validation
