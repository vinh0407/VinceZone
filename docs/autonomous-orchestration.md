# Autonomous orchestration runtime

Baton's coordinator flow is implemented by `POST /api/orchestrate`. It is a request-time SSE route
that calls the configured OpenAI-compatible provider directly:

1. The coordinator runtime decides whether delegation is useful and returns a bounded task graph.
2. Baton validates assignees and file references against the submitted agent roster and project
   snapshot.
3. Ready tasks are invoked in dependency order with bounded concurrency. Each worker receives an
   explicit structured task contract and only the relevant project context.
4. Failed dependencies block downstream calls, and unresolved cycles fail without invoking a
   worker.
5. Worker reports are delivered to a final coordinator review call.

## Layout-driven team topology

The selected chat layout is also the runtime communication contract:

- **3:3 peer room:** six agents independently analyze the request. Their proposals are explicitly
  delivered to every peer, included in each execution prompt, and synthesized into distinct tasks
  so the full room works from shared plans.
- **2:4 planning room:** the two agents on the left exchange proposals, each performs a refinement
  call after receiving the other proposal, and the resulting plan is delegated to the four workers
  on the right. Task messages are distributed between both planners.
- **1:6 coordinator room:** the single agent on the left analyzes the project, creates the bounded
  task graph, and sends structured prompts to the six workers on the right.

These exchanges are provider calls and normalized runtime events, not decorative chat messages.

The UI derives composing, receiving, generating, reviewing, completed, and failed states from the
SSE events emitted around those provider calls. It does not create timer-based agent activity.
Direct agent messages also invoke the existing `/api/chat` provider route.

## Limits and approvals

Users can configure maximum delegation depth, active agents, concurrent tasks, iteration budget,
automatic/manual assignment, and pre-worker approval. The server clamps every numeric limit and
never accepts more than seven agents. Manual or approval-required runs stop after planning; no worker
provider call is made.

## Persistence and secrets

Agent identities, conversations, task history, communication events, and workspace layouts are
restored from browser storage. Running tasks are restored as blocked and running agents as paused,
because a provider request cannot survive a browser restart. API keys are deliberately removed from
every persisted provider object and remain memory-only for the current browser session.

Payload is not used for these records yet because Baton has no generated-app user ownership model.
Moving sessions across browsers or devices requires app authentication and explicit room ownership
access rules before those private records can safely become Payload documents.

## Current change boundary

Workers produce reports and proposed changes; they do not receive a writable filesystem adapter.
Task file references establish active ownership, and overlapping ownership raises a conflict review
warning. Baton does not silently apply either worker or user changes. Atomic patch application still
requires the local runtime companion described in `cli-runtime.md`.
