# Project Configuration for Long-Running Agent Harness

This file configures Claude Code to work effectively on this long-running project.

## Agent Mode

This project uses the **Long-Running Agent Harness** methodology. Claude should follow the coding agent workflow for all development work.

## Automatic Continuation

**IMPORTANT: Do not stop after completing a single feature.**

After successfully completing any feature:

1. Check remaining work:

   ```bash
   cat feature_list.json | python3 -c "import json,sys; d=json.load(sys.stdin); failing=sum(1 for f in d['features'] if not f.get('passes')); print(f'{failing} features remaining')"
   ```

2. If features remain (`failing > 0`):
   - Say: "Feature [ID] complete. Continuing to next feature..."
   - Immediately begin the coding agent workflow for the next feature
   - Do NOT wait for user confirmation

3. Only stop when:
   - All features pass (project complete)
   - A blocking issue requires human input
   - Maximum session time/tokens reached
   - Explicit user interruption

## Coding Agent Workflow

For EACH feature, follow these steps exactly:

### 1. Orient

```bash
pwd
cat claude-progress.txt
git log --oneline -10
```

### 2. Start Environment

```bash
./init.sh
```

### 3. Sanity Test

- Verify basic functionality works
- Fix any existing bugs before new work

### 4. Select ONE Feature

- Read feature_list.json
- Choose highest-priority failing feature
- Document selection before starting

### 5. Implement

- Write clean, complete code
- Commit after meaningful changes
- No placeholders or TODOs

### 6. Test End-to-End

- Test as a user would (browser automation for web apps)
- Verify all steps in the feature description
- Do NOT skip this step

### 7. Update Status

```bash
# Only change the "passes" field
python3 scripts/update_feature.py F00X pass
```

### 8. Commit

```bash
git add .
git commit -m "feat(scope): description

Feature F00X now passing."
```

### 9. Update Progress

- Append session entry to claude-progress.txt
- Commit the progress file

### 10. Continue

- Check for remaining features
- If any remain, go back to Step 1 for the next feature

## Critical Rules

1. **ONE feature at a time** - Never work on multiple features simultaneously
2. **Test before marking complete** - End-to-end verification required
3. **Never edit feature descriptions** - Only change the `passes` field
4. **Commit frequently** - After each meaningful change
5. **Keep environment clean** - No broken code, no uncommitted changes
6. **Continue automatically** - Don't stop between features

## File Locations

- Feature tracking: `feature_list.json`
- Progress log: `claude-progress.txt`
- Environment setup: `init.sh`
- Utility scripts: `scripts/`

## Stopping Conditions

Only stop the session when:

1. ✅ All features in feature_list.json have `"passes": true`
2. 🛑 A feature requires information/access you don't have
3. 🛑 The environment is broken and cannot be fixed
4. 🛑 The user explicitly asks you to stop
5. 🛑 You've hit a context/token limit

When stopping due to a blocker:

- Document the issue clearly in claude-progress.txt
- Explain what's needed to continue
- Commit all progress so far
