# VinceZone Studio — CLI-Anything Harness

`vincezone-cli.mjs` is the agent-native CLI harness for inspecting and auditing a live **VinceZone Studio** desktop runtime (`http://127.0.0.1:40704`).

## Usage

```bash
# Structured full-system audit
node agent-harness/vincezone-cli.mjs --json audit

# Individual subsystem probes
node agent-harness/vincezone-cli.mjs --json ping
node agent-harness/vincezone-cli.mjs --json workspace
node agent-harness/vincezone-cli.mjs --json android
node agent-harness/vincezone-cli.mjs --json github
node agent-harness/vincezone-cli.mjs --json cli-tools
node agent-harness/vincezone-cli.mjs --json extensions

# Interactive REPL
node agent-harness/vincezone-cli.mjs
```
