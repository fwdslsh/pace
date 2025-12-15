---
description: Continue work on an existing long-running agent harness project following the coding agent workflow
agent: build
---

# /continue-work

Continue work on an existing long-running agent harness project. This command follows the coding agent workflow to make incremental progress.

## Usage

```
/continue-work [feature-id]
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
/continue-work
```

```
/continue-work F015
```

## Instructions for Claude

When this command is invoked:

1. Read the long-running-agent-harness skill: `.claude/skills/long-running-agent-harness/SKILL.md`
2. Read the coding agent reference: `.claude/skills/long-running-agent-harness/references/coding-agent.md`
3. Follow the coding agent instructions EXACTLY
4. Execute the orientation sequence:

   ```bash
   pwd
   cat progress.txt
   git log --oneline -20
   cat feature_list.json
   ```

5. Run `./init.sh` to start the development environment
6. Perform sanity test on basic functionality
7. Select ONE feature (highest priority failing, or specified feature)
8. Implement the feature completely
9. Test end-to-end (browser automation for web apps)
10. Update feature_list.json ONLY the `passes` field
11. Git commit with descriptive message
12. Update progress.txt with session entry

## Critical Rules

- Work on exactly ONE feature per session
- NEVER modify feature descriptions or remove features
- ONLY update the `passes` field in feature_list.json
- MUST test end-to-end before marking as passing
- MUST leave environment in clean, working state
- MUST commit all changes with descriptive messages
- MUST update progress file with session details

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
