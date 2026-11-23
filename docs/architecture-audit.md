# Baton architecture audit

## Technical assessment

Baton already provides a credible IDE shell: Monaco editing, browser-selected project snapshots,
multi-project tabs, OpenAI-compatible API agents, provider/model settings, agent-to-agent
delegation, diff review, layout presets, and dense editor/diagnostic surfaces. The terminal,
debugger, Android device, task statuses, and file-change workflow are currently simulations or
local UI state; they are not process, device, or filesystem runtimes.

The strongest reusable pieces are the Monaco shell, agent panel and layout UI, validated provider
proxy, provider configuration, local interaction state, and dark design tokens. The main
architectural constraint is `src/components/ide/ide-workspace.tsx`: it combines most domain types,
state, persistence, orchestration, and rendering in one large client component.

## Capability matrix

| Area                   | Current state                                                                       | Required upgrade                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Projects               | Browser-selected snapshots and local persistence                                    | Explicit writable project adapter and conflict-safe change sets               |
| API agents             | Real streamed OpenAI-compatible requests                                            | Durable sessions, task events, approvals, and audit records                   |
| CLI agents             | Allowlisted server-runtime executable detection                                     | Persistent local/desktop runtime with PTY ownership and cancellation          |
| Terminal/debug/Android | Interactive simulations                                                             | Runtime adapters that report real capability and lifecycle events             |
| Coordination           | Provider-backed coordinator/worker protocol, bounded task graph, SSE runtime events | Durable cross-device rooms, retries, cancellation, and signed audit ownership |
| Changes                | File ownership warnings and approval-gated diff surface                             | Writable project adapter, versioned patches, atomic apply/rollback            |
| Remote                 | Not implemented                                                                     | Authenticated device pairing, scoped commands, revocation, audit trail        |
| Testing                | Type/build checks only                                                              | Unit, route, component, and runtime-adapter integration suites                |

## Refactoring priorities

1. Split the workspace into feature components and domain hooks.
2. Define independent project, session, task, runtime, provider, change, permission, and remote types.
3. Replace duplicated message/runtime state with an event-driven session store.
4. Continue replacing legacy IDE simulations with events emitted by real adapters. Agent communication and orchestration statuses already use normalized provider runtime events.
5. Keep capability labels explicit: detected, connected, authenticated, running, and simulated must
   never be used interchangeably.

## Risks

- Serverless deployment lifecycles are unsuitable for long-running PTYs and CLI child processes.
- Browser folder imports do not grant unrestricted filesystem access or guaranteed write-back.
- Secrets must remain server-side or session-only and must not enter Payload or browser persistence.
- A mobile controller needs app authentication plus a separate persistent runtime; a web UI alone
  cannot safely control a developer machine.
- Existing simulations can create false confidence unless every surface clearly states its runtime
  boundary.
