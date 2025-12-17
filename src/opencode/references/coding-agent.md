# Coding Agent Instructions

Execute these steps EXACTLY in every session to make consistent, incremental progress on the project.

## Session Start Sequence

### Step 1: Orient (ALWAYS do this first)

```bash
# 1. Confirm working directory
pwd

# 2. Read progress file to understand recent work
cat progress.txt

# 3. Check recent git history
git log --oneline -20

# 4. Review feature status
cat feature_list.json | head -100
```

Parse the progress file to understand:

- What was worked on in previous sessions
- Any known issues or bugs
- What was planned as next steps

### Step 2: Start Development Environment

```bash
# Run the init script
./init.sh
```

Wait for the server to start. Note any startup errors.

### Step 3: Sanity Test

Before implementing new features, verify the application is in a working state.

**For web applications:**

1. Navigate to the main URL
2. Test basic functionality (login, view main page, etc.)
3. If using browser automation (Puppeteer/Playwright), run quick verification

**For CLI/API applications:**

1. Run basic commands or API calls
2. Verify expected responses

**If sanity test fails:**

- Do NOT start new feature work
- Fix existing bugs first
- Document fixes in progress file
- Commit fixes before continuing

### Step 4: Select ONE Feature

Review `feature_list.json` and select exactly ONE feature to work on:

**Selection criteria (in order):**

1. Highest priority (`"priority": "high"`)
2. Dependencies satisfied (features it depends on pass)
3. Logical progression (build on recent work)

**Document your selection:**

```
Working on feature: F00X - [description]
```

**CRITICAL: Work on ONE feature only. Do not start multiple features.**

## Implementation Phase

### Step 5: Implement the Feature

Write the code to implement the selected feature. Follow these practices:

1. **Small commits** - Commit after each meaningful change
2. **Test as you go** - Don't wait until the end to test
3. **Clean code** - Write code as if merging to main
4. **No placeholders** - Fully implement, no TODOs for core functionality

### Step 6: Test End-to-End

**This step is MANDATORY before marking any feature as passing.**

**For web applications:**
Use browser automation to test as a user would:

```javascript
// Example Puppeteer test flow
await page.goto('http://localhost:3000');
await page.click('#new-chat-button');
await page.type('#message-input', 'Hello');
await page.click('#send-button');
await page.waitForSelector('.response');
// Take screenshot for verification
await page.screenshot({ path: 'test-result.png' });
```

**For CLI/API applications:**

```bash
# Test actual user workflows
./cli create-item --name "Test"
./cli list-items | grep "Test"
./cli delete-item --name "Test"
```

**Verification checklist:**

- [ ] Feature works as described in steps
- [ ] No regressions in existing functionality
- [ ] Edge cases handled appropriately
- [ ] Error states handled gracefully

### Step 7: Update Feature Status

Only after successful end-to-end testing, update `feature_list.json`:

```json
{
	"id": "F00X",
	"passes": true // ONLY change this field
}
```

**ABSOLUTELY DO NOT:**

- Remove features from the list
- Edit feature descriptions
- Change feature IDs
- Modify test steps

Update the metadata counts:

```json
"metadata": {
  "passing": N+1,
  "failing": M-1
}
```

## Session End Sequence

### Step 8: Git Commit

```bash
git add .
git commit -m "feat(feature-id): brief description

- Implemented [specific functionality]
- Added [files/components]
- Tested end-to-end with [method]

Feature F00X now passing."
```

Use conventional commit format:

- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements
- `docs:` for documentation
- `test:` for test additions

### Step 9: Update Progress File

Append a new session entry to `progress.txt`:

```markdown
---

### Session N - [Feature/Focus]
**Date:** [Current Date]
**Agent Type:** Coding

**Feature Worked On:**
- F00X: [Description]

**Actions Taken:**
- [Specific implementation details]
- [Files modified]
- [Testing performed]

**Test Results:**
- [What was verified]
- [Any edge cases tested]

**Current Status:**
- Features passing: X/Y
- No known bugs (or list bugs if any)

**Next Steps:**
- Recommended next feature: F00Y
- [Any notes for next session]

---
```

### Step 10: Final Commit

```bash
git add progress.txt
git commit -m "docs: update progress log for session N"
```

## Error Recovery

### If you break something:

```bash
# Check what changed
git diff

# Revert if necessary
git checkout -- [file]
# or
git reset --hard HEAD~1
```

### If stuck on a feature:

1. Document the blocker in progress file
2. Commit current work (even if incomplete)
3. Add detailed notes for next session
4. Consider if feature needs to be broken down

### If tests fail repeatedly:

1. Do NOT mark feature as passing
2. Document what's failing and why
3. Consider if the feature description is correct
4. Leave for next session with detailed notes

## Session Checklist

Before ending any session, verify:

- [ ] Feature implemented and tested end-to-end
- [ ] `feature_list.json` updated (only `passes` field changed)
- [ ] Git commits made with descriptive messages
- [ ] `progress.txt` updated with session details
- [ ] No uncommitted changes (`git status` is clean)
- [ ] Development server can still start
- [ ] Basic functionality still works (no regressions)
