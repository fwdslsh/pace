---
description: Select and implement the highest-priority incomplete feature following the coding agent workflow
agent: build
---

# /next-feature

Automatically select and implement the highest-priority incomplete feature following the coding agent workflow.

## Usage

```
/next-feature
```

## What This Command Does

This command automatically:

1. **Reads Progress** - Checks claude-progress.txt and feature_list.json
2. **Finds Failing Feature** - Selects highest-priority incomplete feature
3. **Implements** - Writes complete code for the feature
4. **Tests End-to-End** - Verifies feature works as intended
5. **Commits** - Creates git commit with descriptive message
6. **Updates Status** - Marks feature as passing in feature_list.json
7. **Logs Progress** - Adds session entry to claude-progress.txt

## Workflow

This command follows the **Long-Running Agent Harness** coding agent workflow:

### 1. Orient

```bash
pwd
cat claude-progress.txt | tail -50
git log --oneline -10
```

### 2. Start Environment

```bash
./init.sh
```

### 3. Sanity Test

- Verify server starts successfully
- Check basic functionality still works
- Fix any existing bugs before new work

### 4. Select Feature

- Read feature_list.json
- Find first feature with `"passes": false`
- Select by priority order (lowest priority number = highest priority)
- Document feature selection before starting

### 5. Implement

- Write clean, complete code for the feature
- No placeholders or TODOs
- Follow project coding standards
- Commit after meaningful changes

### 6. Test End-to-End

- Test as a user would (browser automation for web features)
- Verify all steps in feature description work
- Do NOT skip this step

### 7. Update Status

- Change ONLY the `"passes"` field to `true`
- Never modify feature description or steps

### 8. Commit

```bash
git add .
git commit -m "feat(scope): description

Feature F0XX now passing."
```

### 9. Update Progress

- Append session entry to claude-progress.txt

### 10. Continue or Stop

- Check for remaining features
- Ask user if they want to continue

## Feature Selection Priority

Features are selected by priority number (ascending):

1. **Priority 1** - Critical foundation features
2. **Priority 2** - Core functionality
3. **Priority 3-5** - Standard features
4. **Priority 6-10** - Enhanced features and utilities

Within same priority, select by feature ID (F001, F002, F003, etc.)

## Critical Rules

- **Work on exactly ONE feature** - Never work on multiple features simultaneously
- **Test before marking complete** - End-to-end verification required
- **Never edit feature descriptions** - Only change the `passes` field
- **Commit frequently** - After each meaningful change
- **Keep environment clean** - No broken code, no uncommitted changes
