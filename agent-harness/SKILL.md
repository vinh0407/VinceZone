---
name: vincezone-cli
description: Agent-native CLI-Anything harness for inspecting and auditing VinceZone Studio on localhost:40704.
---

# VinceZone Studio CLI Harness

Use `node agent-harness/vincezone-cli.mjs --json <command>` to query the running VinceZone Studio desktop runtime without scraping the DOM.

## Commands
- `ping` — verify server liveness
- `workspace [root]` — list files loaded from local disk
- `android` — query Android SDK, AVDs, and connected ADB devices
- `github` — query GitHub CLI auth status and recent repositories
- `cli-tools` — detect installed AI & developer CLI executables
- `extensions` — scan `.agent/skills`, `.agents/skills`, and global skill directories
- `audit` — run a consolidated health + gap diagnostic across all local APIs
