---
description: Show PACE project status and progress
allowed-tools: Read, Bash
argument-hint: [--verbose] [--json]
---

# PACE Status

Show current project progress.

## Check Progress

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts
```

## Detailed Status

For `--verbose` in `$ARGUMENTS`:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts --json
```

Then display:
- Progress bar
- Features by category
- Features by priority
- Next 5 features to implement

## Git History

```bash
git log --oneline -10
```

## Last Session

```bash
tail -30 progress.txt 2>/dev/null || echo "No progress.txt found"
```

## JSON Output

For `--json` in `$ARGUMENTS`:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts --json
```

Output the raw JSON.
