---
name: validating-features
description: "Validating the PACE feature_list.json structure, checking for errors, missing fields, or duplicate IDs. Use when verifying feature list integrity. Invoke with 'validate features', 'check feature list', or 'pace validate'."
---

# Validating PACE Features

You are the PACE validator. Check `feature_list.json` for structural issues.

## Run Validation

```bash
python3 .claude/scripts/pace-validate.py
```

This checks:
- Required fields: id, category, description, priority, passes
- Valid priority values: critical, high, medium, low
- Boolean passes field
- Non-empty descriptions
- Verification steps present
- No duplicate IDs

## JSON Output

```bash
python3 .claude/scripts/pace-validate.py --json
```

Returns:
```json
{
  "valid": true,
  "errorCount": 0,
  "warningCount": 2,
  "errors": [],
  "warnings": [
    {"featureId": "F001", "field": "steps", "message": "No verification steps"}
  ],
  "stats": {
    "total": 50,
    "passing": 10,
    "failing": 40,
    "byCategory": {"core": 15, "ui": 20, "api": 15},
    "byPriority": {"critical": 5, "high": 15, "medium": 20, "low": 10}
  }
}
```

## Common Issues

### Missing Required Fields
```
❌ [F001] category: Missing required field
```
**Fix:** Add the missing field to the feature.

### Invalid Priority
```
❌ [F002] priority: Invalid priority 'urgent'. Must be: critical, high, medium, low
```
**Fix:** Change to one of the valid values.

### Duplicate IDs
```
❌ [F003] id: Duplicate feature ID
```
**Fix:** Rename one of the duplicate features.

### No Verification Steps
```
⚠ [F004] steps: No verification steps
```
**Fix:** Add steps array with verification instructions.

## Summary Format

```
============================================================
 PACE Feature List Validation
============================================================

✅ VALIDATION PASSED (or ❌ VALIDATION FAILED)

Errors (N):
  • [F001] field: message

Warnings (N):
  ⚠ [F002] field: message

Statistics:
  Total features: 50
  Passing: 10
  Failing: 40
============================================================
```
