---
name: pace-status
description: "Use when checking PACE project status, viewing feature progress, or getting an overview of what has been completed. Shows passing/failing features, next features to implement, and recent activity. Invoked with 'pace status', 'show progress', or 'what features are left'."
---

# PACE Status Skill

You are the PACE status reporter. Your role is to provide comprehensive project status information based on `feature_list.json` and `progress.txt`.

## Status Report Protocol

Execute these commands to gather and display status:

### Step 1: Check File Existence

```bash
ls -la feature_list.json progress.txt 2>/dev/null || echo "Missing required files"
```

If files are missing, inform user they need to run `pace-init` first.

### Step 2: Parse Feature Progress

```bash
python3 << 'EOF'
import json
from collections import defaultdict

try:
    with open('feature_list.json', 'r') as f:
        data = json.load(f)
except FileNotFoundError:
    print("ERROR: feature_list.json not found")
    print("Run pace-init first to set up the project.")
    exit(1)
except json.JSONDecodeError as e:
    print(f"ERROR: Invalid JSON in feature_list.json: {e}")
    exit(1)

features = data.get('features', [])
metadata = data.get('metadata', {})

# Overall progress
passing = sum(1 for f in features if f.get('passes'))
failing = len(features) - passing
total = len(features)
pct = (passing / total * 100) if total else 0

print("=" * 60)
print(" PACE PROJECT STATUS")
print("=" * 60)
print()
print(f"Project: {metadata.get('project_name', 'Unknown')}")
print(f"Last Updated: {metadata.get('last_updated', 'Unknown')}")
print()

# Progress bar
bar_width = 40
filled = int(bar_width * pct / 100)
bar = "█" * filled + "░" * (bar_width - filled)
print(f"Progress: [{bar}] {passing}/{total} ({pct:.1f}%)")
print(f"  ✅ Passing: {passing}")
print(f"  ❌ Failing: {failing}")
print()

# By priority
priority_order = ['critical', 'high', 'medium', 'low']
by_priority = defaultdict(lambda: {'passing': 0, 'failing': 0})
for f in features:
    pri = f.get('priority', 'low')
    if f.get('passes'):
        by_priority[pri]['passing'] += 1
    else:
        by_priority[pri]['failing'] += 1

print("By Priority:")
priority_icons = {'critical': '🔴', 'high': '🟠', 'medium': '🟡', 'low': '🟢'}
for pri in priority_order:
    stats = by_priority[pri]
    total_pri = stats['passing'] + stats['failing']
    if total_pri > 0:
        icon = priority_icons.get(pri, '⚪')
        print(f"  {icon} {pri.capitalize()}: {stats['passing']}/{total_pri}")
print()

# By category
by_category = defaultdict(lambda: {'passing': 0, 'failing': 0})
for f in features:
    cat = f.get('category', 'uncategorized')
    if f.get('passes'):
        by_category[cat]['passing'] += 1
    else:
        by_category[cat]['failing'] += 1

print("By Category:")
for cat in sorted(by_category.keys()):
    stats = by_category[cat]
    total_cat = stats['passing'] + stats['failing']
    pct_cat = (stats['passing'] / total_cat * 100) if total_cat else 0
    print(f"  {cat}: {stats['passing']}/{total_cat} ({pct_cat:.0f}%)")
print()

# Next features to implement
failing_features = [f for f in features if not f.get('passes')]
failing_features.sort(key=lambda x: priority_order.index(x.get('priority', 'low'))
                      if x.get('priority', 'low') in priority_order else 4)

if failing_features:
    print("Next Features to Implement:")
    for i, f in enumerate(failing_features[:5], 1):
        icon = priority_icons.get(f.get('priority', 'low'), '⚪')
        desc = f.get('description', '')[:50]
        print(f"  {i}. {icon} [{f['id']}] {desc}")
    if len(failing_features) > 5:
        print(f"  ... and {len(failing_features) - 5} more")
else:
    print("🎉 ALL FEATURES COMPLETE!")

print()
EOF
```

### Step 3: Show Git History

```bash
echo "Recent Git History:"
git log --oneline -10 2>/dev/null | while read line; do
    echo "  $line"
done || echo "  No git history or not a git repository"
echo
```

### Step 4: Show Last Session from Progress Log

```bash
python3 << 'EOF'
try:
    with open('progress.txt', 'r') as f:
        content = f.read()

    # Find the last session
    sessions = content.split('### Session ')
    if len(sessions) > 1:
        last_session = sessions[-1]
        lines = last_session.split('\n')[:15]  # First 15 lines
        print("Last Session Summary:")
        for line in lines:
            if line.strip():
                print(f"  {line}")
    else:
        print("No session history in progress.txt")
except FileNotFoundError:
    print("No progress.txt found")
except Exception as e:
    print(f"Error reading progress.txt: {e}")

print()
EOF
```

### Step 5: Show Working Directory

```bash
echo "Working Directory: $(pwd)"
echo
```

### Step 6: Quick Commands Reference

```bash
echo "Quick Commands:"
echo "  Use pace-init skill       - Initialize a new project"
echo "  Use pace-orchestrator     - Run the orchestrator loop"
echo "  Use pace-status           - Show this status (you're here)"
echo "  Use pace-validate         - Validate feature list"
echo "  Use pace-update F001 pass - Update feature status"
echo
```

## Verbose Mode

If user asks for verbose or detailed status, also include:

### All Failing Features

```bash
python3 << 'EOF'
import json

with open('feature_list.json', 'r') as f:
    data = json.load(f)

failing = [f for f in data['features'] if not f.get('passes')]
priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
failing.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 4))

print("All Failing Features:")
print("-" * 60)
for f in failing:
    print(f"[{f['id']}] ({f['priority']}) {f['category']}")
    print(f"  {f['description']}")
    if f.get('steps'):
        print("  Steps:")
        for i, step in enumerate(f['steps'], 1):
            print(f"    {i}. {step}")
    print()
EOF
```

### Feature List Validation

```bash
python3 << 'EOF'
import json
from collections import Counter

with open('feature_list.json', 'r') as f:
    data = json.load(f)

features = data.get('features', [])
errors = []

# Check for duplicate IDs
ids = [f['id'] for f in features]
duplicates = [id for id, count in Counter(ids).items() if count > 1]
if duplicates:
    errors.append(f"Duplicate IDs: {duplicates}")

# Check required fields
required = ['id', 'category', 'description', 'priority', 'passes']
for f in features:
    missing = [field for field in required if field not in f]
    if missing:
        errors.append(f"Feature {f.get('id', 'UNKNOWN')} missing: {missing}")

# Check priority values
valid_priorities = {'critical', 'high', 'medium', 'low'}
for f in features:
    if f.get('priority') not in valid_priorities:
        errors.append(f"Feature {f['id']} has invalid priority: {f.get('priority')}")

if errors:
    print("Validation Errors:")
    for e in errors:
        print(f"  ❌ {e}")
else:
    print("✅ Feature list validation passed")
EOF
```

## JSON Output Mode

If user asks for JSON output:

```bash
python3 << 'EOF'
import json
from collections import defaultdict

with open('feature_list.json', 'r') as f:
    data = json.load(f)

features = data.get('features', [])
metadata = data.get('metadata', {})

passing = sum(1 for f in features if f.get('passes'))
total = len(features)

# By category stats
by_category = defaultdict(lambda: {'passing': 0, 'failing': 0, 'total': 0})
for f in features:
    cat = f.get('category', 'uncategorized')
    by_category[cat]['total'] += 1
    if f.get('passes'):
        by_category[cat]['passing'] += 1
    else:
        by_category[cat]['failing'] += 1

# Next features
failing = [f for f in features if not f.get('passes')]
priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
failing.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 4))

output = {
    "progress": {
        "passing": passing,
        "failing": total - passing,
        "total": total,
        "percentage": round(passing / total * 100, 1) if total else 0
    },
    "projectName": metadata.get('project_name'),
    "lastUpdated": metadata.get('last_updated'),
    "byCategory": dict(by_category),
    "nextFeatures": [
        {
            "id": f['id'],
            "description": f['description'],
            "priority": f['priority'],
            "category": f['category']
        }
        for f in failing[:5]
    ],
    "workingDirectory": __import__('os').getcwd()
}

print(json.dumps(output, indent=2))
EOF
```

## Output Summary

Always end with a clear summary:

```
============================================================
Summary: X/Y features passing (Z%)
Next: [FEATURE_ID] - [description]
============================================================
```
