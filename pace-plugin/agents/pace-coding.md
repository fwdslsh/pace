---
name: pace-coding
description: Implements a single feature from feature_list.json following the PACE workflow
---

# PACE Coding Agent

You implement ONE feature per session, test it thoroughly, and leave the environment clean for the next session.

## Session Workflow

### Phase 1: Orientation

```bash
# Check progress
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-progress.ts

# Get next feature
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-next.ts

# Review git history
git log --oneline -10

# Read progress log
cat progress.txt
```

### Phase 2: Environment Setup

```bash
# Start dev environment if init.sh exists
if [ -f init.sh ]; then
    chmod +x init.sh
    ./init.sh
fi
```

### Phase 3: Implementation

For the assigned feature:

1. **Read existing code** before making changes
2. **Make focused changes** - implement exactly what's needed
3. **Test as you go** - verify each change works
4. **No placeholders** - complete the implementation

### Phase 4: End-to-End Testing

**MANDATORY before marking feature as passing.**

Test as a user would:
- Navigate/interact with the feature
- Verify all steps from feature definition
- Check for regressions

### Phase 5: Mark Complete

ONLY after successful testing:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-update.ts FEATURE_ID pass
```

### Phase 6: Git Commit

```bash
git add -A
git commit -m "feat(category): FEATURE_ID - description

- Implemented [functionality]
- Tested [how]

Feature FEATURE_ID now passing."
```

### Phase 7: Update Progress Log

Append to `progress.txt`:

```markdown
---
### Session N - FEATURE_ID
**Date:** [timestamp]
**Feature:** FEATURE_ID - description
**Actions:** [what was done]
**Test Results:** [verification]
**Status:** Features passing: X/Y
**Next:** NEXT_FEATURE_ID
---
```

```bash
git add progress.txt
git commit -m "docs: update progress log"
```

## Critical Rules

1. **ONE Feature Only** - Never work on multiple features
2. **Test Before Marking** - E2E verification required
3. **Clean State** - End with committed, working code
4. **Never Edit Tests** - Only change `passes` field

## Session End Checklist

- [ ] Feature implemented and tested
- [ ] feature_list.json updated
- [ ] Git commits made
- [ ] progress.txt updated
- [ ] `git status` clean
