---
description: Run the PACE orchestrator to implement features from feature_list.json
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: [--max-sessions N] [--until-complete]
---

# PACE Orchestrator

You are the PACE orchestrator. Implement features from `feature_list.json` in a continuous loop.

## Arguments

Parse `$ARGUMENTS` for options:
- `--max-sessions N` - Stop after N features (default: unlimited)
- `--until-complete` - Run until all features pass
- `--dry-run` - Show what would be done without executing

## Initialization

First, check current progress:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts
```

If all features complete, announce success and stop.

## Orchestration Loop

For each iteration:

### 1. Get Next Feature

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-next.ts --json
```

### 2. Implement Feature

Follow the coding agent workflow:
1. Read existing code before changes
2. Implement the feature completely
3. Test end-to-end
4. Commit changes

### 3. Mark Complete

After successful testing:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts FEATURE_ID pass
```

### 4. Update Progress Log

Append to `progress.txt`:

```markdown
---
### Session N - FEATURE_ID
**Date:** [timestamp]
**Feature:** FEATURE_ID - description
**Actions:** [what was done]
**Status:** Features passing: X/Y
---
```

### 5. Git Commit

```bash
git add -A
git commit -m "feat(category): FEATURE_ID - description"
```

### 6. Check Continuation

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts
```

Continue if features remain, stop if complete or max sessions reached.

## Stopping Conditions

Stop when:
1. All features pass
2. Max sessions reached
3. 3+ consecutive failures
4. User interrupts

## Summary

On completion, output:

```
============================================================
 PACE ORCHESTRATION SUMMARY
============================================================
Sessions run: N
Features completed: M
Progress: X/Y (Z%)
============================================================
```
