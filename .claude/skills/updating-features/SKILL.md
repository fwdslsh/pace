---
name: updating-features
description: "Updating PACE feature pass/fail status manually. Use when marking a feature as passing or failing. Invoke with 'update feature F001 pass', 'mark feature complete', or 'pace update'."
---

# Updating PACE Feature Status

You are the PACE feature updater. Manually update feature pass/fail status.

## Update a Feature

```bash
python3 .claude/scripts/pace-update-feature.py FEATURE_ID pass
# or
python3 .claude/scripts/pace-update-feature.py FEATURE_ID fail
```

This will:
1. Create a backup (feature_list.json.bak)
2. Update the feature's `passes` field
3. Update metadata counts
4. Update last_updated timestamp

## JSON Output

```bash
python3 .claude/scripts/pace-update-feature.py F001 pass --json
```

Returns:
```json
{
  "success": true,
  "changed": true,
  "featureId": "F001",
  "oldStatus": "failing",
  "newStatus": "passing",
  "description": "Feature description",
  "category": "core",
  "priority": "high",
  "progress": {
    "passing": 11,
    "total": 50,
    "percentage": 22.0
  }
}
```

## Check Available Features

To see what features can be updated:

```bash
python3 .claude/scripts/pace-progress.py --json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Passing: {d[\"passing\"]}')
print(f'Failing: {d[\"failing\"]}')
"
```

## Batch Updates

For multiple features, run the command multiple times:

```bash
python3 .claude/scripts/pace-update-feature.py F001 pass
python3 .claude/scripts/pace-update-feature.py F002 pass
python3 .claude/scripts/pace-update-feature.py F003 pass
```

## Undo (Restore Backup)

If you need to undo:

```bash
cp feature_list.json.bak feature_list.json
```

## Summary Format

```
============================================================
 PACE Feature Update
============================================================
Feature: F001
Description: [description]
Status: failing → passing
Progress: 11/50 (22.0%)
============================================================
```
