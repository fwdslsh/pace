#!/usr/bin/env python3
"""
pace-validate.py - Validate feature_list.json structure

Checks for required fields, valid values, and structural issues.

Exit codes:
  0 - Validation passed
  1 - Validation failed

Usage:
  python3 pace-validate.py              # Human-readable output
  python3 pace-validate.py --json       # JSON output
"""

import json
import sys
from collections import Counter
from pathlib import Path

def find_feature_list():
    """Find feature_list.json in current or parent directories."""
    current = Path.cwd()
    for _ in range(5):
        candidate = current / 'feature_list.json'
        if candidate.exists():
            return candidate
        current = current.parent
    return Path('feature_list.json')

def main():
    json_output = '--json' in sys.argv

    feature_file = find_feature_list()

    # Try to load file
    try:
        with open(feature_file, 'r') as f:
            content = f.read()
            data = json.loads(content)
    except FileNotFoundError:
        result = {"valid": False, "errors": [{"field": "file", "message": "feature_list.json not found"}]}
        print(json.dumps(result) if json_output else "ERROR: feature_list.json not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        result = {"valid": False, "errors": [{"field": "json", "message": f"Parse error: {e}"}]}
        print(json.dumps(result) if json_output else f"ERROR: Invalid JSON: {e}")
        sys.exit(1)

    features = data.get('features', [])
    errors = []
    warnings = []

    # Check for empty features
    if not features:
        errors.append({"featureId": "root", "field": "features", "message": "No features found"})

    # Required fields
    required_fields = ['id', 'category', 'description', 'priority', 'passes']
    valid_priorities = {'critical', 'high', 'medium', 'low'}

    for i, f in enumerate(features):
        fid = f.get('id', f'index_{i}')

        # Check required fields
        for field in required_fields:
            if field not in f:
                errors.append({"featureId": fid, "field": field, "message": f"Missing required field"})
            elif f[field] is None:
                errors.append({"featureId": fid, "field": field, "message": f"Field is null"})

        # Check priority value
        if 'priority' in f and f['priority'] not in valid_priorities:
            errors.append({
                "featureId": fid,
                "field": "priority",
                "message": f"Invalid priority '{f['priority']}'. Must be: critical, high, medium, low"
            })

        # Check passes is boolean
        if 'passes' in f and not isinstance(f['passes'], bool):
            errors.append({
                "featureId": fid,
                "field": "passes",
                "message": f"'passes' must be boolean, got {type(f['passes']).__name__}"
            })

        # Check description
        if 'description' in f:
            if not isinstance(f['description'], str):
                errors.append({"featureId": fid, "field": "description", "message": "Must be string"})
            elif len(f['description'].strip()) == 0:
                errors.append({"featureId": fid, "field": "description", "message": "Empty description"})

        # Check steps
        if 'steps' not in f or not f.get('steps'):
            warnings.append({"featureId": fid, "field": "steps", "message": "No verification steps"})
        elif not isinstance(f.get('steps'), list):
            errors.append({"featureId": fid, "field": "steps", "message": "Steps must be array"})

    # Check for duplicate IDs
    ids = [f.get('id', '') for f in features]
    for id, count in Counter(ids).items():
        if count > 1 and id:
            errors.append({"featureId": id, "field": "id", "message": "Duplicate feature ID"})

    # Statistics
    passing = sum(1 for f in features if f.get('passes'))
    stats = {
        "total": len(features),
        "passing": passing,
        "failing": len(features) - passing,
        "byCategory": dict(Counter(f.get('category', 'uncategorized') for f in features)),
        "byPriority": dict(Counter(f.get('priority', 'unknown') for f in features))
    }

    valid = len(errors) == 0

    if json_output:
        result = {
            "valid": valid,
            "errorCount": len(errors),
            "warningCount": len(warnings),
            "errors": errors,
            "warnings": warnings,
            "stats": stats
        }
        print(json.dumps(result, indent=2))
    else:
        print("=" * 60)
        print(" PACE Feature List Validation")
        print("=" * 60)
        print()

        if valid:
            print("✅ VALIDATION PASSED")
        else:
            print("❌ VALIDATION FAILED")

        if errors:
            print(f"\nErrors ({len(errors)}):")
            for e in errors:
                print(f"  • [{e['featureId']}] {e['field']}: {e['message']}")

        if warnings:
            print(f"\nWarnings ({len(warnings)}):")
            for w in warnings:
                print(f"  ⚠ [{w['featureId']}] {w['field']}: {w['message']}")

        print(f"\nStatistics:")
        print(f"  Total features: {stats['total']}")
        print(f"  Passing: {stats['passing']}")
        print(f"  Failing: {stats['failing']}")

        print("\nBy Category:")
        for cat, count in sorted(stats['byCategory'].items()):
            print(f"  {cat}: {count}")

        print("\nBy Priority:")
        for pri in ['critical', 'high', 'medium', 'low']:
            if pri in stats['byPriority']:
                print(f"  {pri}: {stats['byPriority'][pri]}")

    sys.exit(0 if valid else 1)

if __name__ == '__main__':
    main()
