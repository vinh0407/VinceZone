# CLI runtime boundary

## What Baton detects now

`GET /api/cli/detect` scans the deployment server's `PATH` for three fixed executable names:
`claude`, `codex`, and `gemini`. The response contains names, executable identifiers, booleans, and
an explicit `authentication: "unknown"` value. It never accepts a command or path from the client,
never spawns a process, and never returns full filesystem paths.

Detection describes the server runtime serving the request. It does not describe the user's laptop,
prove that credentials are configured, or mean a CLI session can be started. The response is
`no-store` because installations can change.

## Required managed runtime

Real CLI support requires a persistent local companion rather than a serverless route:

1. Pair the web app with a user-controlled companion.
2. Register an allowlisted CLI adapter and discover its version/capabilities.
3. Create a PTY/process group with a scoped workspace and sanitized environment.
4. Stream structured stdout/stderr events with bounded buffering.
5. Support input, resize, timeout, cancellation, and orphan cleanup.
6. Gate command and filesystem capabilities through explicit approvals.
7. Keep credentials in the companion or provider secret store, never in Payload events.

The web UI should display distinct states for unavailable, detected, paired, authenticated, running,
paused, failed, and stopped. Authentication must remain unknown until a CLI-specific, non-destructive
adapter can verify it reliably.
