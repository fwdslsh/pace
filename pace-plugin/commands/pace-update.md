---
description: Update a feature's pass/fail status
allowed-tools: Bash
argument-hint: <feature-id> <pass|fail>
---

# PACE Update

Manually update feature status.

## Parse Arguments

From `$ARGUMENTS`:
- `$1` - Feature ID (e.g., F001, AUTH-003)
- `$2` - Status: `pass` or `fail`

## Update Feature

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts $1 $2
```

## Example

```bash
# Mark F001 as passing
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts F001 pass

# Mark AUTH-003 as failing
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts AUTH-003 fail
```

## JSON Output

For `--json` in `$ARGUMENTS`:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts $1 $2 --json
```
