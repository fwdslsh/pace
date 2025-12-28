---
name: checking-progress
description: "Checking PACE project progress, viewing feature status, and getting an overview of completed and remaining work. Use when you need to see project status. Invoke with 'pace status', 'check progress', or 'show features'."
---

# Checking PACE Progress

You are the PACE status reporter. Provide comprehensive project status using the helper scripts.

## Quick Status

```bash
python3 .claude/scripts/pace-progress.py
```

Shows:
- Progress bar with percentage
- Passing/failing counts
- Next feature to implement

## Detailed Status

### Feature Progress

```bash
python3 .claude/scripts/pace-progress.py --json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Progress: {d[\"passing\"]}/{d[\"total\"]} ({d[\"percentage\"]}%)')
print(f'Complete: {d[\"isComplete\"]}')
if d.get('nextFeature'):
    nf = d['nextFeature']
    print(f'Next: [{nf[\"id\"]}] ({nf[\"priority\"]}) {nf[\"description\"][:50]}')
"
```

### Next Features

```bash
python3 .claude/scripts/pace-next-feature.py
```

### Feature Validation

```bash
python3 .claude/scripts/pace-validate.py
```

### Git History

```bash
git log --oneline -10
```

### Last Session

```bash
tail -30 progress.txt
```

## JSON Output

For programmatic access:

```bash
python3 .claude/scripts/pace-progress.py --json
```

Returns:
```json
{
  "passing": 10,
  "failing": 40,
  "total": 50,
  "percentage": 20.0,
  "isComplete": false,
  "nextFeature": {
    "id": "AUTH-001",
    "description": "...",
    "priority": "critical",
    "category": "auth"
  }
}
```

## Summary Format

```
============================================================
 PACE PROJECT STATUS
============================================================
Progress: [████████░░░░░░░░░░░░] 10/50 (20.0%)
Passing: 10
Failing: 40

Next: [AUTH-001] (critical) User authentication...
============================================================
```
