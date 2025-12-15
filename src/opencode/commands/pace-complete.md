---
description: Mark a feature as complete (passing) after verification
---

# /pace-complete

Mark a feature as complete (passing) after successful end-to-end verification.

## Usage

```
/pace-complete <feature-id>
```

## What This Command Does

1. **Validates Feature ID** - Confirms feature exists
2. **Updates Status** - Changes `passes` to `true` in feature_list.json
3. **Updates Metadata** - Increments passing count, decrements failing
4. **Creates Backup** - Saves feature_list.json.bak
5. **Logs Completion** - Adds entry to progress.txt

## Example

```
/pace-complete F015
```

## Pre-requisites

Before using this command, you MUST have:

1. Implemented the feature completely
2. Tested end-to-end as a user would
3. Verified all steps in the feature description work
4. Committed all code changes
5. Reviewed the code (use `/pace-review`)

## What Gets Updated

**feature_list.json:**

```json
{
  "id": "F015",
  "passes": true  // Changed from false
}
```

**Metadata:**

```json
{
  "passing": 16,  // Incremented
  "failing": 34   // Decremented
}
```

## Critical Rules

- ONLY use after successful end-to-end testing
- NEVER mark features as passing without verification
- NEVER modify feature descriptions or steps
- ALWAYS commit code changes before marking complete

$ARGUMENTS
