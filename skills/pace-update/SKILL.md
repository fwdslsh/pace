---
name: pace-update
description: "Use when manually updating a feature's pass/fail status in feature_list.json. Allows marking features as passing or failing. Invoked with 'update feature F001 pass', 'mark F001 as passing', or 'pace update'."
---

# PACE Update Skill

You are the PACE feature updater. Your role is to manually update the pass/fail status of specific features in `feature_list.json`.

## Update Protocol

### Required Information

To update a feature, you need:
1. **Feature ID** - The unique identifier (e.g., F001, AUTH-003)
2. **New Status** - Either `pass` or `fail`

### Step 1: Validate Input

```bash
FEATURE_ID="$1"  # e.g., F001
NEW_STATUS="$2"  # pass or fail

if [ -z "$FEATURE_ID" ]; then
    echo "ERROR: Feature ID required"
    echo "Usage: update <feature-id> <pass|fail>"
    exit 1
fi

if [ "$NEW_STATUS" != "pass" ] && [ "$NEW_STATUS" != "fail" ]; then
    echo "ERROR: Status must be 'pass' or 'fail'"
    echo "Usage: update <feature-id> <pass|fail>"
    exit 1
fi
```

### Step 2: Find and Update Feature

```bash
python3 << EOF
import json
import sys
from datetime import datetime
import shutil

FEATURE_ID = "$FEATURE_ID"
NEW_STATUS = "$NEW_STATUS" == "pass"

# Load current data
try:
    with open('feature_list.json', 'r') as f:
        data = json.load(f)
except FileNotFoundError:
    print("ERROR: feature_list.json not found")
    sys.exit(1)

# Find the feature
features = data.get('features', [])
feature = None
feature_index = -1

for i, f in enumerate(features):
    if f.get('id') == FEATURE_ID:
        feature = f
        feature_index = i
        break

if feature is None:
    print(f"ERROR: Feature '{FEATURE_ID}' not found")
    print()
    print("Available features:")
    for f in features[:10]:
        status = "✓" if f.get('passes') else "✗"
        print(f"  {status} {f['id']}: {f['description'][:50]}")
    if len(features) > 10:
        print(f"  ... and {len(features) - 10} more")
    sys.exit(1)

# Check current status
old_status = "passing" if feature.get('passes') else "failing"
new_status_str = "passing" if NEW_STATUS else "failing"

if feature.get('passes') == NEW_STATUS:
    print(f"Feature '{FEATURE_ID}' is already marked as {old_status}")
    print("No change needed.")
    sys.exit(0)

# Create backup
shutil.copy('feature_list.json', 'feature_list.json.bak')

# Update the feature
features[feature_index]['passes'] = NEW_STATUS

# Update metadata
passing = sum(1 for f in features if f.get('passes'))
failing = len(features) - passing
data['metadata'] = data.get('metadata', {})
data['metadata']['passing'] = passing
data['metadata']['failing'] = failing
data['metadata']['last_updated'] = datetime.now().isoformat()

# Save
with open('feature_list.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')

# Report
print("=" * 60)
print(" PACE Feature Update")
print("=" * 60)
print()
print(f"Feature: {FEATURE_ID}")
print(f"Description: {feature['description']}")
print(f"Category: {feature['category']}")
print(f"Priority: {feature['priority']}")
print()
print(f"Status change: {old_status} → {new_status_str}")
print()
print(f"Backup saved to: feature_list.json.bak")
print()
print(f"Current progress: {passing}/{len(features)} features passing")
print("=" * 60)
EOF
```

## Interactive Mode

If user doesn't provide feature ID, show available features:

```bash
python3 << 'EOF'
import json

with open('feature_list.json', 'r') as f:
    data = json.load(f)

features = data.get('features', [])
failing = [f for f in features if not f.get('passes')]
passing = [f for f in features if f.get('passes')]

print("Feature Status Update")
print("=" * 60)
print()
print(f"Passing ({len(passing)}):")
for f in passing[:5]:
    print(f"  ✓ {f['id']}: {f['description'][:50]}")
if len(passing) > 5:
    print(f"  ... and {len(passing) - 5} more")

print()
print(f"Failing ({len(failing)}):")
for f in failing[:10]:
    print(f"  ✗ {f['id']}: {f['description'][:50]}")
if len(failing) > 10:
    print(f"  ... and {len(failing) - 10} more")

print()
print("To update a feature:")
print("  update <feature-id> pass   - Mark as passing")
print("  update <feature-id> fail   - Mark as failing")
EOF
```

## JSON Output Mode

If user asks for JSON output:

```bash
python3 << EOF
import json
from datetime import datetime
import shutil

FEATURE_ID = "$FEATURE_ID"
NEW_STATUS = "$NEW_STATUS" == "pass"

with open('feature_list.json', 'r') as f:
    data = json.load(f)

features = data.get('features', [])
feature = next((f for f in features if f.get('id') == FEATURE_ID), None)

if not feature:
    print(json.dumps({
        "success": False,
        "featureId": FEATURE_ID,
        "error": "Feature not found"
    }))
    exit(1)

old_status = "passing" if feature.get('passes') else "failing"
new_status_str = "passing" if NEW_STATUS else "failing"

if feature.get('passes') != NEW_STATUS:
    # Make the update
    shutil.copy('feature_list.json', 'feature_list.json.bak')
    for f in features:
        if f.get('id') == FEATURE_ID:
            f['passes'] = NEW_STATUS
            break

    passing = sum(1 for f in features if f.get('passes'))
    data['metadata'] = data.get('metadata', {})
    data['metadata']['passing'] = passing
    data['metadata']['failing'] = len(features) - passing
    data['metadata']['last_updated'] = datetime.now().isoformat()

    with open('feature_list.json', 'w') as f:
        json.dump(data, f, indent=2)

passing = sum(1 for f in features if f.get('passes'))
print(json.dumps({
    "success": True,
    "featureId": FEATURE_ID,
    "oldStatus": old_status,
    "newStatus": new_status_str,
    "description": feature['description'],
    "category": feature['category'],
    "progress": {
        "passing": passing,
        "total": len(features),
        "percentage": round(passing / len(features) * 100, 1)
    }
}, indent=2))
EOF
```

## Batch Update Mode

For updating multiple features at once:

```bash
# Pass a comma-separated list
FEATURES="F001,F002,F003"
STATUS="pass"

python3 << EOF
import json
from datetime import datetime
import shutil

features_to_update = "$FEATURES".split(',')
new_status = "$STATUS" == "pass"

with open('feature_list.json', 'r') as f:
    data = json.load(f)

shutil.copy('feature_list.json', 'feature_list.json.bak')

updated = []
not_found = []

for fid in features_to_update:
    fid = fid.strip()
    found = False
    for f in data['features']:
        if f.get('id') == fid:
            f['passes'] = new_status
            updated.append(fid)
            found = True
            break
    if not found:
        not_found.append(fid)

passing = sum(1 for f in data['features'] if f.get('passes'))
data['metadata']['passing'] = passing
data['metadata']['failing'] = len(data['features']) - passing
data['metadata']['last_updated'] = datetime.now().isoformat()

with open('feature_list.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"Updated {len(updated)} features: {', '.join(updated)}")
if not_found:
    print(f"Not found: {', '.join(not_found)}")
print(f"Progress: {passing}/{len(data['features'])}")
EOF
```

## Summary Output

Always end with:

```
============================================================
Feature: FEATURE_ID
Change: old_status → new_status
Progress: X/Y features passing (Z%)
============================================================
```
