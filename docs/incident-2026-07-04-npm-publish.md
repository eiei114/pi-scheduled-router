# Incident report — failed `Publish to npm` run 28704552385 (2026-07-04)

> **Status:** investigation only. No release workflow, package version, CHANGELOG, npm registry
> state, or release was changed to produce this report. All checks below are non-publishing.
>
> **Investigation issue:** DOT-882.
> **Failed run:** https://github.com/eiei114/pi-scheduled-router/actions/runs/28704552385

## TL;DR / classification

- **Primary cause: duplicate-version.** The run attempted to publish `pi-scheduled-router@0.1.2`,
  which was already public. npm rejected it with `E403` —
  `You cannot publish over the previously published versions: 0.1.2`.
- **Contributing factor: trigger/configuration.** Two publish runs for the same version raced
  because they resolved to **different `concurrency.group` keys** and were therefore not
  serialized, and the "Skip already published version" pre-check (`npm view`) saw a stale `404`
  due to registry read-lag at pre-check time.
- **NOT Trusted Publishing / authentication.** OIDC worked: the failing run successfully signed a
  provenance statement and published it to the Sigstore transparency log *before* the registry
  rejected the duplicate version. The publish reached the registry write endpoint and was rejected
  on version policy, not on credentials.

## Recorded evidence

| Item | Value |
| --- | --- |
| Failed run | `28704552385`, conclusion `failure`, event `workflow_dispatch`, head branch `v0.1.2` (ref `refs/tags/v0.1.2`) |
| Failed run window | created `2026-07-04T11:19:41Z`, updated `2026-07-04T11:20:14Z` |
| Failing step | `Publish to npm` → `npm publish --access public` |
| Package version attempted | `pi-scheduled-router@0.1.2` (`package.json` version `0.1.2`; tag `v0.1.2` → commit `4f9cec3`) |
| Version-bump commit | `d01c563` "chore: bump patch version for sponsor rollout" (`0.1.1` → `0.1.2`), merged via PR #27 |
| npm public state | `0.1.2` **is published** and is `dist-tags.latest`. Versions: `0.1.0`, `0.1.1`, `0.1.2` |
| npm publish time of `0.1.2` | `2026-07-04T11:20:03.806Z` (`npm view ... time`) |
| npm tarball / integrity | `https://registry.npmjs.org/pi-scheduled-router/-/pi-scheduled-router-0.1.2.tgz`, `sha512-JBy5tQBCxoJ1qoO8/sA1qrz5hqBLfpBzOXbOhSD+jKfVzmCwpWqxtQzo5BljULXi0MGzkEZPKz9yMeBKDjauMA==`, shasum `7c7dcf1c053d37fcefac966c0e58574db2b3f6e6` |
| Trusted Publishing | OIDC succeeded — provenance signed and logged (transparency log index `2069645728` in the failed run) |

### Failure output (failed run, `Publish to npm` step)

```text
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=2069645728
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/pi-scheduled-router - You cannot publish over the previously published versions: 0.1.2.
npm error 403 In most cases, you or one of your dependencies are requesting a package version that is forbidden by your security policy, or on a server you do not have access to.
npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-07-04T11_20_08_074Z-debug-0.log
##[error]Process completed with exit code 1.
```

Note: the `Skip already published version` step **passed** with `skip=false` (i.e. it believed
`0.1.2` was not yet on npm), so the workflow proceeded to publish. That is the crux of the race.

## Timeline (two runs, same version, overlapping)

| Time (UTC) | Run `28704548910` — `push` on `main` (PR #27) | Run `28704552385` — `workflow_dispatch` on `v0.1.2` (failed) |
| --- | --- | --- |
| `11:19:31` | created | |
| `11:19:41` | | created |
| `~11:19:5x` | pre-check `npm view ...@0.1.2` → `404` (not yet published) → `skip=false` | pre-check `npm view ...@0.1.2` → `404` (not yet published) → `skip=false` |
| `11:20:01` | `npm publish` → "Publishing to https://registry.npmjs.org/" | |
| `11:20:02` | provenance logged (transparency index `2069644221`) | |
| `11:20:03.806` | **`0.1.2` published to npm** | |
| `11:20:08` | | `npm publish` starts |
| `11:20:11` | | provenance logged (transparency index `2069645728`) |
| `11:20:12` | | **`E403` — cannot publish over `0.1.2`** |
| `11:20:07` / `11:20:14` | `success` / `failure` | |

The registry's recorded publish time for `0.1.2` (`11:20:03.806Z`) falls **between** the failed
run's pre-check (which saw `404`) and its `npm publish` (which saw the duplicate). The push-run won
the race; the dispatch-run collided with it.

## Root cause — current workflow behavior

`.github/workflows/publish.yml` declares:

```yaml
concurrency:
  group: npm-publish-${{ github.event.inputs.ref || github.ref }}
  cancel-in-progress: false
```

The group key depends on the trigger path, so runs for the **same version** land in **different**
groups and are not serialized:

| Trigger path | `inputs.ref` | `github.ref` | Resolved concurrency group |
| --- | --- | --- | --- |
| `push` to `main` (version bump) | — | `refs/heads/main` | `npm-publish-refs/heads/main` |
| `workflow_dispatch` on tag `v0.1.2` (no input) | — | `refs/tags/v0.1.2` | `npm-publish-refs/tags/v0.1.2` |
| `auto-release.yml` dispatch (`-f ref="$TAG"`) | `v0.1.2` | `refs/tags/v0.1.2` | `npm-publish-v0.1.2` |

The failing run used the second group; the winning push-run used the first. Distinct groups ⇒ GitHub
ran them concurrently ⇒ the second `npm publish` hit a version that the first had just created.

Compounding this, the `Skip already published version` gate relies on `npm view`, which reads a
registry path that lags the write endpoint. At pre-check time `0.1.2` was not yet visible, so the
gate set `skip=false` even though a concurrent publish was already in flight. The gate is correct
only when the registry read is fresh and no concurrent publish exists.

`docs/release.md` documents the intended design: `auto-release.yml` is the canonical handoff that
explicitly dispatches `publish.yml`. The additional `push`/`tags`/`release`/`workflow_dispatch`
triggers are redundant fan-in paths that, combined with the version-unaware concurrency key, make
duplicate dispatches possible.

## Reproducible, non-publishing checks

Checks 1–3 contact only read endpoints (or none) and never publish. Check 4 runs local install/build
steps and does not write to the npm registry. Run from the repo root.

### 1. Confirm the target version already exists on the public registry (read-only)

```bash
npm view pi-scheduled-router@0.1.2 version dist.integrity
```

Expected as of July 4, 2026:

```text
version = 0.1.2
dist.integrity = sha512-JBy5tQBCxoJ1qoO8/sA1qrz5hqBLfpBzOXbOhSD+jKfVzmCwpWqxtQzo5BljULXi0MGzkEZPKz9yMeBKDjauMA==
```

Because `0.1.2` is live, any attempt to republish `0.1.2` will fail with `E403` — reproducing the
symptom without publishing.

### 2. Replay the workflow's pre-check logic locally (read-only)

This is the exact logic from the `Skip already published version` step, run by hand:

```bash
name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")
set +e
output=$(npm view "${name}@${version}" version 2>&1); status=$?
set -e
echo "status=$status output=$output"
```

Expected now: `status=0 output=0.1.2` ⇒ the gate would (correctly) set `skip=true`. During the
failed run the same command returned a non-zero `404`, so the gate set `skip=false`. This shows the
gate is only as good as the freshness of the registry read at that instant.

### 3. Static check of the two concurrency groups (no run, no network)

Inspect `.github/workflows/publish.yml` and confirm the `concurrency.group` expression
`${{ github.event.inputs.ref || github.ref }}` resolves to different values for a `push`-to-`main`
run (`refs/heads/main`) versus a tag `workflow_dispatch` (`refs/tags/v0.1.2`). Distinct keys ⇒ the
two runs are not serialized. No GitHub Actions run is required to confirm this — it follows directly
from the YAML and the two trigger events.

### 4. Local build / pack sanity (no write to registry)

`npm ci` is **not** read-only: it removes and reinstalls `node_modules`, may run package lifecycle
scripts, and can emit audit/network traffic. Prefer a disposable checkout when running it.

```bash
npm ci
npm run ci   # typecheck + node:test (59 passing) + npm pack --dry-run
```

Expected: all green; `npm pack --dry-run` lists 15 files with shasum
`7c7dcf1c053d37fcefac966c0e58574db2b3f6e6`, matching the published tarball. This never contacts the
npm write endpoint.

## Minimal safe correction options

These are candidates for a **separate correction issue** — not implemented here. Any change to the
release/publish workflows remains human-owned.

- **Option B (recommended) — single canonical trigger.** Keep `auto-release.yml` as the only path
  that publishes (it already explicitly dispatches `publish.yml --ref <tag>`). Remove the redundant
  `push: branches: [main]`/`paths` and `tags`/`release` fan-in triggers from `publish.yml` so a
  version can only be published once, from one place. This eliminates the dual-trigger race at the
  source.
- **Option A — version-normalized concurrency key.** If multiple triggers must remain, serialize
  by package *version*. GitHub evaluates `concurrency.group` **before any job steps run**, so a
  step output from `package.json` cannot feed the group key. Use either (1) a small prep job that
  reads `package.json` and exposes `version`, then set the publish job's
  `concurrency.group: npm-publish-${{ needs.prep.outputs.version }}`, or (2) derive the key
  directly from the trigger ref/tag when that already maps 1:1 to a version (e.g.
  `npm-publish-${{ github.event.inputs.ref || github.ref_name }}`). Stronger when combined with B.
- **Option C — hardened pre-check.** Re-query the registry immediately before publish. Set
  `skip=true` only when `npm view` **confirms the version already exists** (exit 0 with the expected
  version). A confirmed `404` means `skip=false` (proceed). Timeouts, auth failures, and other
  ambiguous responses must **retry or fail the job explicitly** — do not treat them as `skip=true`,
  or a transient registry outage could suppress a legitimate release. Not sufficient on its own
  (inherently racy under concurrency); use as defense-in-depth alongside A or B.
- **Option D — treat duplicate-version `E403` as benign.** Since republishing an identical version
  is never intended here, exit `0` on an `E403` "cannot publish over" so a benign duplicate does not
  turn the workflow red. Masks real races — recommend only as defense-in-depth, not as the fix.

The smallest safe change is **Option B**; pair with **A** if redundant triggers are intentionally
kept.

## Out of scope (guardrails honored)

This investigation did **not**: edit any release/publish/auto-release workflow, rerun any workflow,
publish or unpublish any package, change `package.json` version, or modify `CHANGELOG.md`. It only
adds this documentation file.
