---
name: pace-validate
description: "Use when validating the feature_list.json structure, checking for errors, missing fields, or duplicate IDs. Ensures the feature list is properly formatted for orchestration. Invoked with 'validate features', 'check feature list', or 'pace validate'."
---

# PACE Validate Skill

You are the PACE validator. Your role is to validate the `feature_list.json` file and report any structural issues, missing fields, or data problems.

## Validation Protocol

### Step 1: Check File Exists

```bash
if [ ! -f feature_list.json ]; then
    echo "ERROR: feature_list.json not found"
    echo "Run pace-init first to set up the project."
    exit 1
fi
```

### Step 2: Run Comprehensive Validation

```bash
python3 << 'EOF'
import json
import sys
from collections import Counter

print("=" * 60)
print(" PACE Feature List Validation")
print("=" * 60)
print()

# Load file
try:
    with open('feature_list.json', 'r') as f:
        content = f.read()
        data = json.loads(content)
except FileNotFoundError:
    print("❌ INVALID: feature_list.json not found")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"❌ INVALID: JSON parse error at line {e.lineno}: {e.msg}")
    sys.exit(1)

features = data.get('features', [])
metadata = data.get('metadata', {})
errors = []
warnings = []

# Check for empty features
if not features:
    errors.append(("root", "features", "No features found"))

# Required fields for each feature
required_fields = ['id', 'category', 'description', 'priority', 'passes']
valid_priorities = {'critical', 'high', 'medium', 'low'}

# Validate each feature
for i, f in enumerate(features):
    fid = f.get('id', f'index_{i}')

    # Check required fields
    for field in required_fields:
        if field not in f:
            errors.append((fid, field, f"Missing required field: {field}"))
        elif f[field] is None:
            errors.append((fid, field, f"Field is null: {field}"))

    # Check priority value
    if 'priority' in f and f['priority'] not in valid_priorities:
        errors.append((fid, 'priority',
            f"Invalid priority '{f['priority']}'. Must be: critical, high, medium, low"))

    # Check passes is boolean
    if 'passes' in f and not isinstance(f['passes'], bool):
        errors.append((fid, 'passes',
            f"'passes' must be boolean, got {type(f['passes']).__name__}"))

    # Check description is non-empty string
    if 'description' in f:
        if not isinstance(f['description'], str):
            errors.append((fid, 'description', "Description must be string"))
        elif len(f['description'].strip()) == 0:
            errors.append((fid, 'description', "Description is empty"))

    # Check steps is list
    if 'steps' in f:
        if not isinstance(f['steps'], list):
            errors.append((fid, 'steps', "Steps must be an array"))
        elif len(f['steps']) == 0:
            warnings.append((fid, 'steps', "No verification steps defined"))
    else:
        warnings.append((fid, 'steps', "No verification steps defined"))

# Check for duplicate IDs
ids = [f.get('id', '') for f in features]
duplicates = [id for id, count in Counter(ids).items() if count > 1 and id]
for dup in duplicates:
    errors.append((dup, 'id', f"Duplicate feature ID"))

# Check metadata
if not metadata:
    warnings.append(('metadata', 'root', "No metadata section"))
else:
    if 'project_name' not in metadata:
        warnings.append(('metadata', 'project_name', "No project name defined"))
    if 'total_features' in metadata and metadata['total_features'] != len(features):
        warnings.append(('metadata', 'total_features',
            f"Count mismatch: says {metadata['total_features']}, actual {len(features)}"))

# Print results
if errors:
    print("❌ VALIDATION FAILED")
    print()
    print(f"Errors ({len(errors)}):")
    for fid, field, msg in errors:
        print(f"  • [{fid}] {field}: {msg}")
else:
    print("✅ VALIDATION PASSED")

if warnings:
    print()
    print(f"Warnings ({len(warnings)}):")
    for fid, field, msg in warnings:
        print(f"  ⚠ [{fid}] {field}: {msg}")

# Statistics
print()
print("-" * 60)
print("Statistics:")
print(f"  Total features: {len(features)}")

passing = sum(1 for f in features if f.get('passes'))
print(f"  Passing: {passing}")
print(f"  Failing: {len(features) - passing}")

# By category
categories = Counter(f.get('category', 'uncategorized') for f in features)
print()
print("By Category:")
for cat, count in sorted(categories.items()):
    print(f"  {cat}: {count}")

# By priority
priorities = Counter(f.get('priority', 'unknown') for f in features)
print()
print("By Priority:")
priority_order = ['critical', 'high', 'medium', 'low']
for pri in priority_order:
    if pri in priorities:
        print(f"  {pri}: {priorities[pri]}")

print()
print("=" * 60)

# Exit code
sys.exit(1 if errors else 0)
EOF
```

## JSON Output Mode

If user asks for JSON output:

```bash
python3 << 'EOF'
import json
import sys
from collections import Counter

try:
    with open('feature_list.json', 'r') as f:
        data = json.load(f)
except Exception as e:
    print(json.dumps({
        "valid": False,
        "errorCount": 1,
        "errors": [{"featureId": "root", "field": "file", "message": str(e)}],
        "stats": {}
    }))
    sys.exit(1)

features = data.get('features', [])
errors = []
required_fields = ['id', 'category', 'description', 'priority', 'passes']
valid_priorities = {'critical', 'high', 'medium', 'low'}

for i, f in enumerate(features):
    fid = f.get('id', f'index_{i}')
    for field in required_fields:
        if field not in f or f[field] is None:
            errors.append({"featureId": fid, "field": field, "message": f"Missing {field}"})
    if f.get('priority') not in valid_priorities:
        errors.append({"featureId": fid, "field": "priority", "message": "Invalid priority"})

ids = [f.get('id', '') for f in features]
for id, count in Counter(ids).items():
    if count > 1 and id:
        errors.append({"featureId": id, "field": "id", "message": "Duplicate ID"})

passing = sum(1 for f in features if f.get('passes'))
stats = {
    "total": len(features),
    "passing": passing,
    "failing": len(features) - passing,
    "byCategory": dict(Counter(f.get('category', 'uncategorized') for f in features)),
    "byPriority": dict(Counter(f.get('priority', 'unknown') for f in features))
}

print(json.dumps({
    "valid": len(errors) == 0,
    "errorCount": len(errors),
    "errors": errors,
    "stats": stats
}, indent=2))
EOF
```

## Summary Output

Always end with:

```
============================================================
Validation: PASSED/FAILED
Errors: N
Features: X total (Y passing, Z failing)
============================================================
```
