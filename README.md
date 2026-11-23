# VinceZone Studio

**VinceZone Studio** is a native desktop multi-agent engineering IDE built with **Electron**, **Next.js**, **React**, **Monaco Editor**, and **Tailwind CSS** using a **VS Code Dark Modern** interface. It runs locally on **`http://localhost:40704`**.

## Key Capabilities

- **VS Code Dark Modern Desktop UI**: Native Electron window (`electron/main.cjs`), Title Bar with Command Center (`Ctrl+K`), Activity Bar, nested local disk Explorer, Monaco Editor (`vs-dark`), integrated local PowerShell/Shell Terminal, and dynamic blue/purple VS Code Status Bar.
- **VinceZone Multi-Agent Control Center**:
  - Department specialists with exclusive file territories (`@PM`, `@ARCH`, `@FE`, `@BE`, `@DB`, `@QA`, `@DEVOPS`) and **FE ↔ BE API Contract** enforcement (`src/lib/vincezone-protocol.ts`).
  - Layout-driven topologies: **3:3 Peer**, **2:4 Dual-Planner**, and **1:6 PM Orchestrator**.
  - **Real-time Agent Mail Exchange Animation**: SVG quadratic Bézier flight paths and animated envelopes between agent panels with Replay / Preview and Mail Log timeline.
  - Interactive **Approve & Execute** task graph resume (`approvedTasks`) and structured **Diff Review** with stale-base & territory conflict checks.
- **Edit Memory & Rollback (`REV-001`, `REV-002`...)**: Automatic snapshots on manual save or patch apply, supporting 1-click UI restore and natural-language rollback prompts (`"rollback REV-001"`, `"revert page.tsx"`, `"khôi phục code"`).
- **Security Hardening**: DNS-verified SSRF protection (`src/lib/provider-url.ts`), no-redirect upstream fetch, per-client rate limiting, and loopback-only guards for local disk FS & terminal APIs (`src/lib/local-guard.ts`).

## Running VinceZone Studio

```bash
# Install dependencies (including Electron binary)
pnpm install

# Launch native Desktop Application on http://localhost:40704
pnpm desktop

# Or run the local server directly on http://localhost:40704
pnpm dev
```

## Verification

```bash
pnpm typecheck
pnpm test
pnpm format
```
