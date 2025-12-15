---
description: Run continuous coding sessions until all features pass or a stopping condition is met
agent: pace-coordinator
---

# /pace-coordinate

Run continuous coding sessions, making progress on multiple features automatically. This command orchestrates multiple feature implementations within a single context window.

## Usage

```
/pace-coordinate
```

## What This Command Does

1. **Checks Progress** - Reviews current feature completion status
2. **Runs Loop** - Executes coding workflow for each feature
3. **Handles Transitions** - Automatically moves to next feature
4. **Tracks Results** - Logs success/failure of each session
5. **Knows When to Stop** - Stops on completion, blockers, or max failures

## Stopping Conditions

The coordination loop stops when:

1. **All features pass** - Project is complete!
2. **Consecutive failures** - 3+ sessions without progress
3. **Blocking issue** - Documented blocker needing human input
4. **Environment failure** - init.sh fails repeatedly
5. **Context limit** - Approaching context window limits

## Progress Tracking

The coordinator maintains a running summary:

```markdown
## Coordination Session Summary

Started: [timestamp]
Sessions completed: N
Features completed: M
Current progress: X/Y (Z%)

### Session Log:

- Session 1: F001 (5 min)
- Session 2: F002 (8 min)
- Session 3: F003 blocked on API
- Session 4: F004 (3 min)
```

## Failure Handling

### If a feature cannot be completed:

1. Document the issue in claude-progress.txt
2. Mark any partial progress
3. Move to the next feature (don't get stuck)
4. After 3 consecutive failures, pause for review

### If environment breaks:

1. Attempt recovery with git reset
2. Re-run init.sh
3. If still failing, document and stop

## Critical Rules

1. **Never stop after one feature** - Continue until complete or blocked
2. **Maintain momentum** - Quick transitions between features
3. **Track everything** - Log each session's outcome
4. **Fail gracefully** - Don't get stuck on one feature
5. **Know when to stop** - Recognize genuine blockers
