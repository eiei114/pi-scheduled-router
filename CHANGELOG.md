# Changelog

## Unreleased

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.1] - 2026-06-08

### Fixed

- Missing JSDoc docstrings on internal validation helpers and `StringEnum` to meet docstring coverage threshold (80%).

## [0.1.0] - 2026-06-07

### Added

- Initial release: time-slot-based model selection for Pi.
- YAML configuration (`scheduled-router.yaml`) with project-local override.
- Time slot matching: first-match-wins evaluation with `from` inclusive, `to` exclusive.
- Day-spanning slot support (e.g. `22:00` → `02:00`).
- Configurable IANA timezone (defaults to system local).
- Required default model for uncovered time ranges.
- Session-start automatic model selection (`session_start` hook).
- Model-not-found fallback: notify + try default.
- `/scheduled:status` command — show current time, matched slot, model.
- `/scheduled:configure` command — guide for configuration via agent.
- `scheduled_router_config` tool — read / status / validate / save YAML config.
- CI pipeline with typecheck, 31 tests, and npm pack check.

