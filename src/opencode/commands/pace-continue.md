---
description: Continue work on an existing pace project, optionally targeting a specific feature
agent: pace-coding
---

# /pace-continue

Continue work on an existing pace project. This command follows the coding agent workflow to make incremental progress.

## Usage

```
/pace-continue [feature-id]
```

If `feature-id` is provided, work on that specific feature. Otherwise, automatically select the highest-priority failing feature.

## What This Command Does

1. **Orients** - Reads progress file, git log, and feature list
2. **Starts Environment** - Runs init.sh to start dev server
3. **Sanity Tests** - Verifies basic functionality still works
4. **Selects Feature** - Picks ONE feature to implement
5. **Implements** - Writes code for the selected feature
6. **Tests End-to-End** - Verifies feature works as a user would use it
7. **Updates Status** - Marks feature as passing (only after verification)
8. **Commits** - Creates descriptive git commit
9. **Logs Progress** - Updates progress.txt

## Example

```
/pace-continue
```

```
/pace-continue F015
```

## Session Checklist

Before ending the session, verify:

- [ ] Feature fully implemented
- [ ] End-to-end testing completed
- [ ] feature_list.json updated (passes field only)
- [ ] Git commit made with descriptive message
- [ ] progress.txt updated with session entry
- [ ] No uncommitted changes
- [ ] Development server still starts
- [ ] Basic functionality still works

## Critical Rules

- Work on exactly ONE feature per session
- NEVER modify feature descriptions or remove features
- ONLY update the `passes` field in feature_list.json
- MUST test end-to-end before marking as passing
- MUST leave environment in clean, working state
- MUST commit all changes with descriptive messages
- MUST update progress file with session details

$ARGUMENTS
