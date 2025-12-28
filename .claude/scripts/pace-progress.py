#!/usr/bin/env python3
"""
pace-progress.py - Check PACE feature progress

Reads feature_list.json and outputs current progress status.
Used by both skills and hooks.

Exit codes:
  0 - All features complete OR normal output
  1 - Error reading file
  2 - More features remaining (for hook continuation)

Usage:
  python3 pace-progress.py              # Human-readable output
  python3 pace-progress.py --json       # JSON output
  python3 pace-progress.py --check      # Exit 2 if incomplete (for hooks)
"""

import json
import sys
import os
from pathlib import Path

def find_feature_list():
    """Find feature_list.json in current or parent directories."""
    current = Path.cwd()
    for _ in range(5):  # Check up to 5 levels
        candidate = current / 'feature_list.json'
        if candidate.exists():
            return candidate
        current = current.parent
    return Path('feature_list.json')

def main():
    args = sys.argv[1:]
    json_output = '--json' in args
    check_mode = '--check' in args

    feature_file = find_feature_list()

    try:
        with open(feature_file, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        if json_output:
            print(json.dumps({"error": "feature_list.json not found", "exists": False}))
        else:
            print("ERROR: feature_list.json not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        if json_output:
            print(json.dumps({"error": f"Invalid JSON: {e}", "exists": True}))
        else:
            print(f"ERROR: Invalid JSON in feature_list.json: {e}")
        sys.exit(1)

    features = data.get('features', [])
    metadata = data.get('metadata', {})

    total = len(features)
    passing = sum(1 for f in features if f.get('passes'))
    failing = total - passing
    percentage = (passing / total * 100) if total else 0

    # Get failing features sorted by priority
    priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    failing_features = [f for f in features if not f.get('passes')]
    failing_features.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 4))

    next_feature = failing_features[0] if failing_features else None
    is_complete = failing == 0

    if json_output:
        output = {
            "passing": passing,
            "failing": failing,
            "total": total,
            "percentage": round(percentage, 1),
            "isComplete": is_complete,
            "projectName": metadata.get('project_name'),
            "nextFeature": {
                "id": next_feature['id'],
                "description": next_feature['description'],
                "priority": next_feature['priority'],
                "category": next_feature['category']
            } if next_feature else None
        }
        print(json.dumps(output))
    else:
        print(f"Progress: {passing}/{total} features ({percentage:.1f}%)")
        if is_complete:
            print("ALL FEATURES COMPLETE!")
        elif next_feature:
            print(f"Next: [{next_feature['id']}] ({next_feature['priority']}) {next_feature['description'][:60]}")

    # In check mode, exit 2 if there are remaining features
    if check_mode and not is_complete:
        if next_feature:
            # Send continuation message to stderr (for hooks)
            print(f"Continue to: {next_feature['id']} - {next_feature['description'][:50]}", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)

if __name__ == '__main__':
    main()
