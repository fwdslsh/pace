---
name: orchestrating-features
description: "Orchestrating PACE feature implementation in an autonomous loop. Use when implementing features from feature_list.json continuously until all pass, max iterations reached, or consecutive failures occur. Invoke with 'run pace', 'orchestrate features', or 'implement all features'."
---

# Orchestrating PACE Features

You are the PACE (Pragmatic Agent for Compounding Engineering) orchestrator. Your role is to autonomously implement features from `feature_list.json` in a continuous loop until completion or a stopping condition is met.

## Prerequisites

Ensure these files exist:
- `feature_list.json` - Feature definitions with pass/fail status
- `progress.txt` - Session log
- `.claude/scripts/` - Helper scripts (pace-progress.py, pace-update-feature.py, etc.)

## Orchestration Loop

Execute this loop until stopped:

### Step 1: Check Current Progress

```bash
python3 .claude/scripts/pace-progress.py
```

**If output shows "ALL FEATURES COMPLETE!"**: Stop and report success.

### Step 2: Get Next Feature

```bash
python3 .claude/scripts/pace-next-feature.py
```

This returns the highest priority failing feature (critical > high > medium > low).

### Step 3: Implement the Feature

For the selected feature:

1. **Read existing code** - Understand the codebase before changes
2. **Make focused changes** - Implement exactly what the feature requires
3. **Test thoroughly** - Verify all verification steps from the feature
4. **Commit incrementally** - Small, meaningful commits

### Step 4: Mark Feature Complete

After successful testing:

```bash
python3 .claude/scripts/pace-update-feature.py FEATURE_ID pass
```

### Step 5: Update Progress Log

Append to `progress.txt`:

```markdown
---

### Session N - FEATURE_ID

**Date:** [timestamp]
**Feature:** FEATURE_ID - [description]

**Actions Taken:**
- [what was implemented]
- [files modified]

**Test Results:**
- [verification results]

**Status:** Features passing: X/Y

---
```

### Step 6: Git Commit

```bash
git add -A
git commit -m "feat(category): FEATURE_ID - brief description"
git add progress.txt
git commit -m "docs: update progress log"
```

### Step 7: Continue or Stop

Check progress again:

```bash
python3 .claude/scripts/pace-progress.py --check
```

**Continue if:** More features remain AND consecutiveFailures < 3
**Stop if:** All complete OR 3+ consecutive failures OR user requested stop

## State Tracking

Track across iterations:
- `sessionCount` - Increment after each feature attempt
- `consecutiveFailures` - Reset on success, increment on failure
- `featuresCompleted` - Total features marked passing

## Stopping Conditions

Stop immediately when:
1. All features pass (success!)
2. 3+ consecutive failures without progress
3. User specifies max sessions reached
4. Blocking issue prevents any progress

## Error Recovery

**If implementation fails:**
1. Do NOT mark feature as passing
2. Document issue in progress.txt
3. Increment consecutiveFailures
4. Move to next feature

**If stuck:**
```bash
git diff                    # See changes
git checkout -- .           # Discard changes
git reset --hard HEAD~1     # Undo last commit
```

## Summary Report

On stopping, output:

```
============================================================
 PACE ORCHESTRATION SUMMARY
============================================================
Sessions run: N
Features completed: M
Final progress: X/Y (Z%)
Complete: Yes/No
============================================================
```
