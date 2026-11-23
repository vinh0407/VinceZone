# Baton incremental upgrade plan

## Phase 1 — truthful capability discovery

- Detect a fixed allowlist of supported CLI executables in the active server runtime.
- Show installed/not installed separately from authentication and execution availability.
- Add route-level cache prevention and avoid returning executable paths or environment values.
- Document the production runtime limitation.

This phase is implemented by `/api/cli/detect`. It does not spawn a process, inspect credentials,
or establish a CLI session.

## Phase 2 — modularize the client

- Extract the editor/project shell, agent workspace, settings, diagnostics, and Android simulation.
- Move shared domain types into focused modules.
- Add reducer/event boundaries for sessions and task activity.
- Add unit tests for pure state transitions and route validation.

## Phase 3 — local runtime companion

- Build a separately installed, authenticated desktop/daemon companion.
- Own writable workspaces, PTYs, process groups, timeouts, output backpressure, and cancellation.
- Expose a versioned local protocol over a mutually authenticated channel.
- Require per-project command and filesystem scopes.

## Phase 4 — Control Rooms and orchestration

- Model rooms, members, sessions, task graphs, dependencies, approvals, and immutable audit events.
- Implement coordinator/worker assignment, retries, cancellation, and bounded concurrency.
- Stream normalized runtime events rather than provider-specific status strings.

Durable records belong in Payload only after application users, ownership, and access rules are
defined. Operational process state remains in the runtime companion.

## Phase 5 — change and conflict engine

- Generate versioned change sets against a known workspace revision.
- Detect overlapping edits and stale bases before apply.
- Use atomic application, rollback, review gates, and explicit lock leases.
- Record actor, approval, command, and resulting revision in an audit trail.

## Phase 6 — secure remote control

- Add authenticated user accounts and short-lived device pairing.
- Bind each paired device to narrow room/project permissions.
- Require step-up approval for sensitive commands and secret access.
- Support revocation, expiration, rate limiting, and append-only security events.

Each phase must ship with integration tests and capability labels that match what the runtime can
actually prove.
