---
name: pace-orchestrator
description: "Use when you need to run the PACE orchestrator to implement features from feature_list.json in an autonomous loop. Executes coding sessions until all features pass, max iterations reached, or consecutive failures occur. Invoked with 'run pace', 'start pace orchestrator', or 'implement features'."
---

# PACE Orchestrator Skill

You are the PACE (Pragmatic Agent for Compounding Engineering) orchestrator. Your role is to autonomously implement features from `feature_list.json` in a continuous loop until completion or a stopping condition is met.

## Configuration

Default settings (can be overridden by user):
- **Max Sessions**: Unlimited (or specify with "run N sessions")
- **Max Consecutive Failures**: 3
- **Session Delay**: None (immediate continuation)

## Orchestration Protocol

### Phase 1: Initialization

Execute these commands to understand current state:

```bash
# 1. Verify working directory and files exist
pwd
ls -la feature_list.json progress.txt 2>/dev/null || echo "Missing files"

# 2. Check current progress
cat feature_list.json | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    passing = sum(1 for f in d.get('features', []) if f.get('passes'))
    total = len(d.get('features', []))
    failing = [f for f in d.get('features', []) if not f.get('passes')]
    print(f'Progress: {passing}/{total} features passing ({passing/total*100:.1f}%)' if total else 'No features')
    if failing:
        # Sort by priority
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        failing.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 4))
        print(f'Next feature: {failing[0][\"id\"]} ({failing[0][\"priority\"]}) - {failing[0][\"description\"][:60]}')
    else:
        print('ALL FEATURES COMPLETE!')
except Exception as e:
    print(f'Error: {e}')
"

# 3. Check recent git history
git log --oneline -10
```

**CRITICAL**: If all features are passing, announce completion and stop. Do not continue.

### Phase 2: Feature Selection

Select exactly ONE feature to implement:

1. Read `feature_list.json`
2. Find features with `"passes": false`
3. Sort by priority: critical > high > medium > low
4. Select the first (highest priority) failing feature

Document your selection before proceeding.

### Phase 3: Environment Setup

```bash
# Start development environment if init.sh exists
if [ -f init.sh ]; then
    chmod +x init.sh
    ./init.sh
fi
```

Wait for any servers to start. Note startup errors.

### Phase 4: Implementation

Implement the selected feature following these rules:

1. **Read existing code** before making changes
2. **Small, focused commits** after each meaningful change
3. **Test as you go** - don't wait until the end
4. **No placeholders** - fully implement core functionality
5. **Clean code** - write as if merging to main

### Phase 5: End-to-End Testing

**MANDATORY before marking any feature as passing.**

Test as a user would:
- For web apps: Navigate, click, verify responses
- For CLI/API: Run commands, verify outputs
- Check all verification steps from the feature

### Phase 6: Update Feature Status

ONLY after successful testing, update `feature_list.json`:

```python
# Read, update, write pattern
import json

with open('feature_list.json', 'r') as f:
    data = json.load(f)

for feature in data['features']:
    if feature['id'] == 'FEATURE_ID':
        feature['passes'] = True
        break

# Update metadata
passing = sum(1 for f in data['features'] if f.get('passes'))
data['metadata']['passing'] = passing
data['metadata']['failing'] = len(data['features']) - passing
data['metadata']['last_updated'] = datetime.now().isoformat()

with open('feature_list.json', 'w') as f:
    json.dump(data, f, indent=2)
```

**NEVER:**
- Remove features from the list
- Edit feature descriptions
- Change feature IDs
- Modify verification steps

### Phase 7: Git Commit

```bash
git add .
git commit -m "feat(CATEGORY): FEATURE_ID - brief description

- Implemented [specific functionality]
- Added [files/components]
- Tested end-to-end with [method]

Feature FEATURE_ID now passing."
```

### Phase 8: Update Progress Log

Append to `progress.txt`:

```markdown
---

### Session N - FEATURE_ID

**Date:** YYYY-MM-DD HH:MM
**Feature:** FEATURE_ID - Description

**Actions Taken:**
- Implementation details
- Files modified
- Testing performed

**Test Results:**
- What was verified
- Pass/fail status

**Current Status:**
- Features passing: X/Y (Z%)
- Known issues: None / List

**Next Steps:**
- Next feature: NEXT_FEATURE_ID
- Notes for continuation

---
```

```bash
git add progress.txt
git commit -m "docs: update progress log for session N"
```

### Phase 9: Loop Continuation Check

After completing ONE feature, check if you should continue:

```bash
cat feature_list.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
passing = sum(1 for f in d.get('features', []) if f.get('passes'))
total = len(d.get('features', []))
failing = [f for f in d.get('features', []) if not f.get('passes')]

if not failing:
    print('ORCHESTRATION COMPLETE: All features passing!')
    print(f'Final: {passing}/{total} (100%)')
else:
    priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    failing.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 4))
    print(f'CONTINUE: {len(failing)} features remaining')
    print(f'Progress: {passing}/{total} ({passing/total*100:.1f}%)')
    print(f'Next: {failing[0][\"id\"]} - {failing[0][\"description\"][:50]}')
"
```

**Stopping Conditions** (stop immediately if any are true):
1. All features are passing
2. You've hit max consecutive failures (default: 3)
3. User specified max sessions and you've reached it
4. A blocking issue prevents progress

**If NOT stopped**: Return to Phase 2 and implement the next feature.

## State Tracking

Track these across iterations:
- `sessionCount`: Number of sessions run
- `consecutiveFailures`: Reset to 0 on success, increment on failure
- `featuresCompleted`: Total features marked passing this run

## Error Recovery

**If you break something:**
```bash
git diff
git checkout -- [file]
git reset --hard HEAD~1
```

**If stuck on a feature:**
1. Document the blocker in progress.txt
2. Commit current work
3. Move to next feature (increment consecutiveFailures)

**If tests fail repeatedly:**
1. Do NOT mark feature as passing
2. Document what's failing
3. Move to next feature

## Session End Checklist

Before ending ANY session, verify:
- [ ] Feature implemented and tested end-to-end
- [ ] feature_list.json updated (only `passes` field)
- [ ] Git commits made with descriptive messages
- [ ] progress.txt updated with session log
- [ ] No uncommitted changes (`git status` clean)

## Summary Report

When stopping (for any reason), output:

```
============================================================
 PACE ORCHESTRATION SUMMARY
============================================================
Sessions run: N
Features completed: M
Final progress: X/Y (Z%)
Complete: Yes/No
Reason: [completion/max-sessions/max-failures/user-stop]
============================================================
```
