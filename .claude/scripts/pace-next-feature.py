#!/usr/bin/env python3
"""
pace-next-feature.py - Get the next feature to implement

Returns the highest priority failing feature from feature_list.json.

Usage:
  python3 pace-next-feature.py              # Human-readable output
  python3 pace-next-feature.py --json       # JSON output with full feature details
  python3 pace-next-feature.py --id         # Just the feature ID
"""

import json
import sys
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
    id_only = '--id' in sys.argv

    feature_file = find_feature_list()

    try:
        with open(feature_file, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        if json_output:
            print(json.dumps({"error": "feature_list.json not found", "feature": None}))
        else:
            print("ERROR: feature_list.json not found")
        sys.exit(1)

    features = data.get('features', [])

    # Get failing features sorted by priority
    priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    failing = [f for f in features if not f.get('passes')]
    failing.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 4))

    if not failing:
        if json_output:
            print(json.dumps({"complete": True, "feature": None, "message": "All features complete"}))
        elif id_only:
            print("")
        else:
            print("ALL FEATURES COMPLETE!")
        sys.exit(0)

    next_feature = failing[0]
    passing = sum(1 for f in features if f.get('passes'))
    total = len(features)

    if id_only:
        print(next_feature['id'])
    elif json_output:
        print(json.dumps({
            "complete": False,
            "feature": {
                "id": next_feature['id'],
                "description": next_feature['description'],
                "priority": next_feature['priority'],
                "category": next_feature.get('category'),
                "steps": next_feature.get('steps', [])
            },
            "progress": {
                "passing": passing,
                "failing": len(failing),
                "total": total,
                "percentage": round(passing / total * 100, 1) if total else 0
            },
            "remainingCount": len(failing)
        }, indent=2))
    else:
        priority_icons = {'critical': '🔴', 'high': '🟠', 'medium': '🟡', 'low': '🟢'}
        icon = priority_icons.get(next_feature.get('priority', 'low'), '⚪')

        print(f"Next Feature: {icon} [{next_feature['id']}]")
        print(f"Priority: {next_feature['priority']}")
        print(f"Category: {next_feature.get('category', 'uncategorized')}")
        print(f"Description: {next_feature['description']}")
        print()
        if next_feature.get('steps'):
            print("Verification Steps:")
            for i, step in enumerate(next_feature['steps'], 1):
                print(f"  {i}. {step}")
            print()
        print(f"Progress: {passing}/{total} ({len(failing)} remaining)")

    sys.exit(0)

if __name__ == '__main__':
    main()
