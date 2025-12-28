#!/usr/bin/env python3
"""
pace-update-feature.py - Update a feature's pass/fail status

Updates feature_list.json, creates backup, and updates metadata.

Usage:
  python3 pace-update-feature.py <feature-id> pass
  python3 pace-update-feature.py <feature-id> fail
  python3 pace-update-feature.py <feature-id> pass --json
"""

import json
import sys
import shutil
from datetime import datetime
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
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    json_output = '--json' in sys.argv

    if len(args) < 2:
        print("Usage: pace-update-feature.py <feature-id> <pass|fail>")
        sys.exit(1)

    feature_id = args[0]
    new_status = args[1].lower() == 'pass'

    feature_file = find_feature_list()

    try:
        with open(feature_file, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        result = {"success": False, "error": "feature_list.json not found"}
        print(json.dumps(result) if json_output else result["error"])
        sys.exit(1)

    # Find the feature
    feature = None
    feature_index = -1
    for i, f in enumerate(data.get('features', [])):
        if f.get('id') == feature_id:
            feature = f
            feature_index = i
            break

    if feature is None:
        result = {"success": False, "error": f"Feature '{feature_id}' not found"}
        if json_output:
            print(json.dumps(result))
        else:
            print(f"ERROR: Feature '{feature_id}' not found")
            print("\nAvailable features:")
            for f in data.get('features', [])[:10]:
                status = "✓" if f.get('passes') else "✗"
                print(f"  {status} {f['id']}: {f['description'][:50]}")
        sys.exit(1)

    old_status = "passing" if feature.get('passes') else "failing"
    new_status_str = "passing" if new_status else "failing"

    # Check if already at target status
    if feature.get('passes') == new_status:
        result = {
            "success": True,
            "changed": False,
            "featureId": feature_id,
            "status": new_status_str,
            "message": f"Already {new_status_str}"
        }
        if json_output:
            print(json.dumps(result))
        else:
            print(f"Feature '{feature_id}' is already {new_status_str}")
        sys.exit(0)

    # Create backup
    backup_file = str(feature_file) + '.bak'
    shutil.copy(feature_file, backup_file)

    # Update the feature
    data['features'][feature_index]['passes'] = new_status

    # Update metadata
    features = data['features']
    passing = sum(1 for f in features if f.get('passes'))
    failing = len(features) - passing

    if 'metadata' not in data:
        data['metadata'] = {}
    data['metadata']['passing'] = passing
    data['metadata']['failing'] = failing
    data['metadata']['last_updated'] = datetime.now().isoformat()

    # Save
    with open(feature_file, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

    result = {
        "success": True,
        "changed": True,
        "featureId": feature_id,
        "oldStatus": old_status,
        "newStatus": new_status_str,
        "description": feature['description'],
        "category": feature.get('category'),
        "priority": feature.get('priority'),
        "progress": {
            "passing": passing,
            "total": len(features),
            "percentage": round(passing / len(features) * 100, 1) if features else 0
        }
    }

    if json_output:
        print(json.dumps(result))
    else:
        print(f"Feature: {feature_id}")
        print(f"Description: {feature['description']}")
        print(f"Status: {old_status} → {new_status_str}")
        print(f"Progress: {passing}/{len(features)} ({result['progress']['percentage']}%)")

    sys.exit(0)

if __name__ == '__main__':
    main()
