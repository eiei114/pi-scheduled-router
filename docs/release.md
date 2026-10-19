# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: this GitHub repository
- Workflow filename: `publish.yml`

## Human-authorized release

Ordinary pushes and merges never create release tags, GitHub Releases, or publish to npm. After a version bump has been reviewed and merged to `main`, an authorized human must manually run `.github/workflows/auto-release.yml` from the Actions tab on `main` and confirm the required `release_confirmed` input. It creates the version tag and GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag with the same confirmation.

The publish workflow accepts only manual dispatches with `release_confirmed` enabled. It validates that the selected ref is a stable `vMAJOR.MINOR.PATCH` tag and that the package version matches before publishing. Use a direct manual dispatch only when an authorized human intentionally needs to retry a release-tag publish.

The workflow skips `name@version` if that exact package version already exists on npm.

## Verification evidence

The successful v0.1.6 release run (`32579537651`) created the GitHub Release and explicitly dispatched `publish.yml` for `v0.1.6`; the dispatched run (`32579546171`) completed successfully and confirmed that `pi-scheduled-router@0.1.6` was already published. This confirms the documented release-to-publish handoff without changing its contract.

The v0.1.6 release body still contains literal `\\n` sequences. The current `auto-release.yml` source also still constructs `NOTES` with `\\n`, so post-fix behavior cannot be verified from this evidence; a future version bump is required after that fix is present on `main`.

## Workflow guardrail

Do not ship a new Pi OSS package or version bump with only `package.json` changes.
The repository must include the release workflow pair:

- `.github/workflows/auto-release.yml` requires a human `workflow_dispatch` confirmation on `main` before it creates `v<version>` tags and GitHub Releases.
- `.github/workflows/publish.yml` requires an explicit manual dispatch confirmation and publishes a matching version tag through Trusted Publishing.

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

