# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: this GitHub repository
- Workflow filename: `publish.yml`

## Publish

```bash
npm version patch
git push
```

On `main`, `.github/workflows/auto-release.yml` checks `package.json` version. If `v<version>` does not exist yet, it creates the tag, creates the GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag.

The `v*.*.*` tag also triggers `.github/workflows/publish.yml`, which runs CI and publishes to npm when tags are pushed manually.
Publishing also runs when a GitHub Release is published, and can be run manually from GitHub Actions with `workflow_dispatch`.

The workflow skips `name@version` if that exact package version already exists on npm.

## Verification evidence

The successful v0.1.6 release run (`32579537651`) created the GitHub Release and explicitly dispatched `publish.yml` for `v0.1.6`; the dispatched run (`32579546171`) completed successfully and confirmed that `pi-scheduled-router@0.1.6` was already published. This confirms the documented release-to-publish handoff without changing its contract.

The v0.1.6 release body still contains literal `\\n` sequences. The current `auto-release.yml` source also still constructs `NOTES` with `\\n`, so post-fix behavior cannot be verified from this evidence; a future version bump is required after that fix is present on `main`.

## Workflow guardrail

Do not ship a new Pi OSS package or version bump with only `package.json` changes.
The repository must include the release workflow pair:

- `.github/workflows/auto-release.yml` creates `v<version>` tags and GitHub Releases from `main` version bumps.
- `.github/workflows/publish.yml` publishes to npm through Trusted Publishing.

Important: tags or releases created by `GITHUB_TOKEN` do not reliably fan out into another workflow through normal `push.tags` or `release.published` triggers. The template keeps publishing reliable by having `auto-release.yml` explicitly dispatch `publish.yml` after creating the tag/release. If you change the release flow, keep one explicit handoff path: `workflow_dispatch` from auto-release, `repository_dispatch`, or `workflow_run` on the auto-release workflow.

## GitHub Actions requirements

- `permissions: id-token: write`
- `permissions: actions: write` on auto-release so it can dispatch `publish.yml`
- `auto-release.yml` must call `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`, or `publish.yml` must have an equivalent explicit handoff trigger such as `workflow_run`
- GitHub-hosted runner
- Node.js 24, so the release job uses a current npm CLI for Trusted Publishing
- No `NPM_TOKEN`
- `npm publish` from the configured workflow file

## First release checklist

- [ ] `package.json` name is final
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] CHANGELOG.md has the release date

