---
name: pace-orchestration
description: "Orchestrating PACE feature implementation in an autonomous loop. Use when implementing features from feature_list.json continuously until all pass. Invoke with 'run pace', 'orchestrate features', or 'implement all features'."
---

# PACE Orchestration Skill

Autonomously implement features from `feature_list.json` until completion.

## When to Use

- Implementing multiple features continuously
- Running until all features pass
- Automated feature-driven development

## Orchestration Protocol

### Step 1: Check Progress

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts
```

**If complete:** Stop and report success.

### Step 2: Get Next Feature

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-next.ts --json
```

Returns highest priority failing feature.

### Step 3: Implement Feature

For the selected feature:
1. Read existing code
2. Implement the feature
3. Test thoroughly
4. Verify all steps from feature definition

### Step 4: Mark Complete

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts FEATURE_ID pass
```

### Step 5: Log Progress

Append to `progress.txt` and commit:

```bash
git add -A
git commit -m "feat(category): FEATURE_ID - description"
```

### Step 6: Continue Loop

Check if more features remain:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts --check
```

- Exit 0: Complete, stop
- Exit 2: More work, continue to Step 2

## State Tracking

- `sessionCount`: Features attempted
- `consecutiveFailures`: Reset on success, increment on failure
- `featuresCompleted`: Total marked passing

## Stopping Conditions

1. All features pass (success!)
2. 3+ consecutive failures
3. Max sessions reached
4. User interrupts

## Summary Output

```
============================================================
 PACE ORCHESTRATION SUMMARY
============================================================
Sessions: N
Completed: M features
Progress: X/Y (Z%)
Status: Complete/Stopped
============================================================
```
