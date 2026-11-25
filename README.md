<div align="center">
  <img src="public/logo.png" alt="VinceZone Studio Logo" width="84" height="84" />
  <h1>VinceZone Studio</h1>
  <p>
    <strong>Local-First Multi-Agent Desktop IDE</strong> — Obsidian Dark Modern &amp; Burnished Gold · In-Process Electron (<code>vincezone://studio</code>, 0 open TCP ports)
  </p>

  <p>
    <a href="https://github.com/vinh0407/VinceZone/releases/latest/download/VinceZone-Studio-Setup-2.2.0.exe">
      <img src="https://img.shields.io/badge/⬇%20Download%20Setup%20v2.2.0-Windows%20(.exe)-c9a24d?style=for-the-badge&logo=windows&logoColor=111111&labelColor=1e1c17" alt="Download Windows Setup" />
    </a>
    <a href="https://github.com/vinh0407/VinceZone/releases/latest">
      <img src="https://img.shields.io/badge/All%20Releases-Windows%20%7C%20macOS%20%7C%20Linux-262626?style=for-the-badge" alt="All Releases" />
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-2.2.0-c9a24d?style=flat-square" alt="Version 2.2.0" />
    <img src="https://img.shields.io/badge/tests-106%20passing-4c9a5e?style=flat-square" alt="Tests Passing" />
    <img src="https://img.shields.io/badge/Electron-35-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 35" />
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/license-MIT-858585?style=flat-square" alt="MIT License" />
  </p>
</div>

---

## Download & Install

| Platform | Package | Direct Link |
|---|---|---|
| **Windows (x64)** | Setup Installer (`.exe`) | [**Download VinceZone-Studio-Setup-2.2.0.exe**](https://github.com/vinh0407/VinceZone/releases/latest/download/VinceZone-Studio-Setup-2.2.0.exe) |
| **Linux (x86_64)** | AppImage (`.AppImage`) | [**Download VinceZone-Studio-2.2.0-x86_64.AppImage**](https://github.com/vinh0407/VinceZone/releases/latest/download/VinceZone-Studio-2.2.0-x86_64.AppImage) |
| **All Platforms** | Windows / macOS / Linux | [**Browse GitHub Releases**](https://github.com/vinh0407/VinceZone/releases/latest) |

> **Zero Localhost Ports:** Packaged desktop builds serve the entire Next.js 16 backend inside Electron via a custom `vincezone://studio` protocol — no exposed local TCP port and no background terminal window.

---

## Core Capabilities

### Multi-Agent Control Center (`Ctrl+Shift+A`)
- **1:6 PM Captain Mode (`focus1`)**: `@PM` is always locked as Team Captain on the large left panel while specialists operate in parallel on the right grid. Also supports `2:4 Plan` and `3:3 Peer` topologies.
- **PM Project-Analysis Team Recruitment**: Click **PM Tuyển Nhóm** or type *"tạo nhóm cho dự án này"* — `@PM` analyzes the repository stack, recruits the exact specialists needed (`@ARCH`, `@FE`, `@BE`, `@UIUX`, `@DB`, `@MOBILE`, `@AI`, `@SEC`, `@QA`, `@DEVOPS`, `@PERF`, `@DOCS`), assigns their pre-configured models, and briefs each member on their exact scope and boundaries.
- **Per-Role Model Selector**: Configure a default provider/model for each of the **13 fixed specialist roles** in `Settings → Providers` while keeping **`@CUSTOM`** completely free to improvise any model.
- **Full Autonomous Execution & Skills**: Built-in AI tools for coding (`write_file`, `patch_file`), executing code (`run_code` for `.ts`, `.js`, `.py`, `.go`, `.ps1`, `.sh`), shell commands (`run_shell` with 1-click **Auto-Run** toggle or **Allow/Deny** approval cards), Git (`git_action`), MCP servers (persistent stdio/HTTP pool), and installed skills (`list_skills`, `use_skill`, `/skill`, `/combo:...`).
- **Isolated Agent Git Worktrees**: Spin up, assign per agent, merge, and clean up isolated `vz-agent/*` Git worktrees directly from the Multi-Agent toolbar.
- **Multimodal Vision, Context Meter, Undo & Export**: Paste screenshots (`Ctrl+V`), monitor live Context Window `%` with 1-click `Compact`, undo any prompt turn with `REV-xxx` file rollback, reuse templates from the **Prompt Library**, and export transcripts to Markdown.

### Native IDE & Engineering Engine
- **TypeScript AST Language Service**: Real `ts.createLanguageService` powering `F12` Go to Definition, `Shift+F12` Find References, Hover type/JSDoc info, and scope-safe `F2` Cross-File Rename (with automatic fallback index for Python, Kotlin, Go, and Rust), plus Explorer **Outline** & `Ctrl+Shift+O`.
- **Local Semantic Code Search**: Built-in TF-IDF cosine vector index over symbol chunks (`AI` search mode in Explorer, `@semantic:` chat mentions, and `semantic_search` agent tool).
- **Format Document & Format on Save**: Automatic Biome / Prettier / Ruff / JSON formatting via `Shift+Alt+F`, breadcrumb `Format` button, or `Format on Save (Ctrl+S)`.
- **Complete Git GUI**: Stage, unstage, **1-click Commit & Push** (with auto-upstream on new branches), AI commit message generator, branch switcher, stash, pull, inline **Git Blame**, **3-Way Merge Conflict Resolver**, and visual SVG **Git Graph**.
- **Multi-Language Debugger, Live Terminal & Android Emulator**: Node.js V8 Inspector CDP + Attach Port (`9229`), Python `pdb`, Watch Expressions, multi-tab interactive terminal, Web Preview, and live Android AVD Emulator with ADB Logcat streaming.
- **Security & Diagnostics**: Loopback & Cross-Origin guards, DNS-verified SSRF protection, symlink escape guard, Electron `safeStorage` DPAPI API key encryption, redacted Diagnostic Log Exporter, and rotating desktop crash logs.

---

## Development from Source

```bash
# 1. Install dependencies
pnpm install

# 2. Run in local web dev mode (http://127.0.0.1:40704)
pnpm dev

# 3. Launch native Electron desktop app
pnpm desktop
```

## Build & Verification

```bash
pnpm typecheck        # TypeScript strict check
pnpm test             # Vitest suite (26 files / 106 tests)
pnpm build:exe        # Build standalone desktop/VinceZone Studio/VinceZone Studio.exe
pnpm build:installer  # Build Windows NSIS Setup (.exe) or Portable ZIP
```

## License

Released under the [MIT License](LICENSE).
