# Configuration reference

`pi-scheduled-router` reads a YAML file named `scheduled-router.yaml`. At session start the extension loads the file, validates it, and selects the provider/model for the current time.

For a copyable starting point, see [`examples/scheduled-router.example.yaml`](examples/scheduled-router.example.yaml).

## File locations and resolution order

The router looks for config in this order:

1. **Project-local:** `<cwd>/.pi/scheduled-router.yaml` — used when the file exists in the current project.
2. **Agent directory:** `~/.pi/scheduled-router.yaml` — fallback when no project-local file is present.

Project-local config always wins when both exist. Install the package with `pi install npm:pi-scheduled-router -l` to keep a project-scoped copy under `.pi/`.

If neither file exists, the extension shows a warning and does not select a scheduled model.

## Top-level fields

Only four top-level keys are allowed. Any other key causes validation to fail.

| Field | Required | Type | Description |
|---|---|---|---|
| `version` | yes | number | Config schema version. Must be `1`. |
| `timezone` | no | string | IANA timezone name (for example `Asia/Tokyo`, `America/New_York`). When omitted, matching uses the system local clock. |
| `default` | yes | object | Provider/model used when no slot matches the current time. |
| `slots` | yes | array | Ordered list of time slots. At least one entry is required. |

### `default`

| Field | Required | Type | Description |
|---|---|---|---|
| `provider` | yes | string | Pi provider id (non-empty). |
| `model` | yes | string | Model id for that provider (non-empty). |

### `slots[]`

Each slot is an object with four required fields:

| Field | Required | Type | Description |
|---|---|---|---|
| `from` | yes | string | Start time in `HH:MM` format (**inclusive**). |
| `to` | yes | string | End time in `HH:MM` format (**exclusive**). |
| `provider` | yes | string | Pi provider id for this slot. |
| `model` | yes | string | Model id for this slot. |

## Time format and matching semantics

### `HH:MM` rules

- Hours are `00`–`24`; minutes are `00`–`59`.
- `24:00` is allowed and means end-of-day. When the hour is `24`, minutes must be `00` (`24:01`–`24:59` are invalid).
- Each slot must have non-zero duration: `from` and `to` cannot be equal.

### Inclusive `from`, exclusive `to`

For a normal same-day slot `10:00`–`15:00`:

- `10:00` is included.
- `15:00` is **not** included (the slot ends just before 15:00).

Adjacent slots such as `09:00`–`12:00` and `12:00`–`15:00` do not overlap; the boundary minute belongs to the later slot only through the exclusive `to` of the earlier slot.

### Day-spanning slots

When `from` is later than `to` (for example `22:00`–`02:00`), the slot spans midnight:

- Active from `22:00` through `23:59`, and from `00:00` up to (but not including) `02:00`.

### First-match wins

Slots are evaluated **in array order**. The first slot whose range contains the current time is selected. Later slots that overlap an earlier match are never reached for those minutes.

Put broader or higher-priority ranges before narrower ones. Reorder slots if overlap warnings (below) show a later entry is fully masked.

### Timezone behavior

When `timezone` is set, the current instant is converted to hour/minute in that IANA zone before matching. When omitted, the runner's local clock is used.

## Overlap warnings

Configs with overlapping or duplicate ranges remain **valid**, but the router detects slots that are fully covered by earlier entries and emits **masked-slot** warnings via:

- `scheduled_router_config` tool action `validate`
- `scheduled_router_config` tool action `save`
- `/scheduled:status` and the tool `status` action

Warning examples:

- Identical ranges (`09:00`–`17:00` followed by another `09:00`–`17:00`).
- Contained ranges (`09:00`–`17:00` before `13:00`–`15:00`).
- Day-spanning overlaps (a `22:00`–`02:00` slot fully covered by earlier evening and morning slots).

Warnings do not block saving or session start. They indicate a later slot will never match because an earlier slot already covers those minutes.

## Validation errors

Common validation failures:

| Condition | Result |
|---|---|
| Missing or unsupported `version` | Error |
| Missing `default` or empty `provider` / `model` | Error |
| `slots` missing, not an array, or empty | Error |
| Slot missing `from`, `to`, `provider`, or `model` | Error |
| Invalid `HH:MM` value or zero-duration slot | Error |
| Unknown top-level key | Error |
| Invalid IANA `timezone` | Error |

Use the `scheduled_router_config` tool with action `validate` to check YAML before saving, or run `/scheduled:configure` for guided setup.

## Related commands and tools

| Surface | Purpose |
|---|---|
| `/scheduled:status` | Show current time, matched slot, and selected model. |
| `/scheduled:configure` | Guided conversation to create or edit config. |
| `scheduled_router_config` (`read`, `status`, `validate`, `save`) | Programmatic config access for agents. |

See the [README](../README.md) for install steps and quick-start examples.
