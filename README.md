# Pi Scheduled Router

[![CI](https://github.com/eiei114/pi-scheduled-router/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-scheduled-router/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-scheduled-router/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-scheduled-router/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-scheduled-router.svg)](https://www.npmjs.com/package/pi-scheduled-router)
[![npm downloads](https://img.shields.io/npm/dm/pi-scheduled-router.svg)](https://www.npmjs.com/package/pi-scheduled-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

> Switch Pi's AI provider and model based on time of day — YAML time-slot configuration, session-start selection.

## What this is

`pi-scheduled-router` is a Pi extension that selects an AI provider and model at session start based on the current time. Define time slots in a YAML config file and Pi picks the matching model automatically — morning light models, afternoon heavy lifters, night deep thinkers. No weighted balancing, no daily counts: just time → model.

This router is **mutually exclusive** with `pi-weighted-model-router`. Install one or the other.

## Features

- Time-slot-based provider/model selection at session start
- YAML configuration (`scheduled-router.yaml`) with project-local override
- Day-spanning slots (e.g. `22:00` → `02:00`)
- Required default model for uncovered time ranges
- First-match-wins slot evaluation
- Configurable timezone
- Install in user agent dir or per-project

## Install

```bash
pi install npm:pi-scheduled-router
```

Pin a specific version:

```bash
pi install npm:pi-scheduled-router@0.1.3
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-scheduled-router -l
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-scheduled-router
```

Try it without permanently installing:

```bash
pi -e npm:pi-scheduled-router
```

## Quick start

1. Install the package.
2. Create `~/.pi/scheduled-router.yaml`:

```yaml
version: 1
timezone: "Asia/Tokyo"
default:
  provider: deepseek
  model: deepseek-v4-pro

slots:
  - from: "10:00"
    to: "15:00"
    provider: cursor
    model: composer-2.5

  - from: "15:00"
    to: "24:00"
    provider: openai-codex
    model: gpt-5.4
```

3. Start a new Pi session — the model is selected based on the current time.
4. Run `/scheduled:status` to see current selection.

**Validation rules:** Only `version`, `timezone`, `default`, and `slots` are allowed at the top level. Each slot must have a non-zero duration (`from` must differ from `to`). Times use `HH:MM` with minutes `00`–`59` and hours `00`–`24` (`24:00` only).

**Overlap warnings:** Slots are evaluated in order and first match wins. If a later slot is fully covered by earlier slots (for example duplicate ranges, `09:00`–`17:00` before `13:00`–`15:00`, or covered day-spanning slots such as `22:00`–`02:00`), the config is still valid but `scheduled_router_config validate`, `scheduled_router_config save`, and `/scheduled:status`/tool `status` show a `Config warnings:` summary so you can reorder or split slots.

Or use `/scheduled:configure` to set up time slots interactively with your agent.

## Commands

### `/scheduled:status`

Show current time, matched slot, and selected model. No arguments.

### `/scheduled:configure`

Start a guided conversation with your agent to set up or modify the router's time slots. The agent will ask questions one at a time and save the configuration via the `scheduled_router_config` tool.

## Tools

### `scheduled_router_config`

AI-facing tool for programmatic config management.

| Parameter | Type | Description |
|---|---|---|
| `action` | `"read" \| "status" \| "validate" \| "save"` | Operation to perform |
| `configYaml` | `string` (optional) | Full YAML content (required for validate/save) |

Actions:
- `read` — return current YAML config content
- `status` — show current time, matched slot, and model
- `validate` — validate YAML config without saving
- `save` — confirm with user, write to disk, reselect model

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoint |
| `lib/` | Shared TypeScript helpers (types, config, matcher) |
| `docs/` | Optional supporting docs |

## Development

```bash
npm install
npm run ci
```

## Development flow

```txt
Vault notes -> PRD -> Issues -> implement -> ci/check -> release -> save learnings
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md) for setup details.

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-scheduled-router
- GitHub: https://github.com/eiei114/pi-scheduled-router
- Issues: https://github.com/eiei114/pi-scheduled-router/issues

## License

MIT
