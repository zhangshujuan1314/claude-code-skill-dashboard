# Skills Dashboard

Local read-only inventory dashboard for Claude Code skills.

## Usage

```bash
# Scan skills and generate dashboard
node scan.mjs

# Open in browser
start skills.generated.html   # Windows
open skills.generated.html    # macOS

# Optional: dev server with auto-reload
node serve.mjs
```

## Privacy

Default mode shows paths with `~` prefix. For sharing:
```bash
node scan.mjs --privacy share
```

## Test

```bash
node test/run-all.mjs
```
