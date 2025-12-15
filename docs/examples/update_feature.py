#!/usr/bin/env python3
"""
update_feature.py - Safely update feature status in feature_list.json

This script ONLY updates the 'passes' field of a feature, as required by
the long-running agent harness methodology.

Usage:
    python scripts/update_feature.py <feature_id> <pass|fail>
    python scripts/update_feature.py F001 pass
    python scripts/update_feature.py F002 fail
    
Options:
    --file PATH    Path to feature_list.json (default: ./feature_list.json)
    --dry-run      Show what would change without making changes
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
import shutil


def load_feature_list(filepath: Path) -> dict:
    """Load and parse feature_list.json."""
    with open(filepath, 'r') as f:
        return json.load(f)


def save_feature_list(filepath: Path, data: dict, backup: bool = True):
    """Save feature_list.json with optional backup."""
    if backup:
        backup_path = filepath.with_suffix('.json.bak')
        shutil.copy(filepath, backup_path)
    
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def find_feature(data: dict, feature_id: str) -> tuple[int, dict] | tuple[None, None]:
    """Find a feature by ID. Returns (index, feature) or (None, None)."""
    for i, feature in enumerate(data.get('features', [])):
        if feature.get('id') == feature_id:
            return i, feature
    return None, None


def update_metadata(data: dict):
    """Recalculate and update metadata counts."""
    if 'metadata' not in data:
        data['metadata'] = {}
    
    passing = sum(1 for f in data.get('features', []) if f.get('passes'))
    failing = sum(1 for f in data.get('features', []) if not f.get('passes'))
    total = len(data.get('features', []))
    
    data['metadata']['total_features'] = total
    data['metadata']['passing'] = passing
    data['metadata']['failing'] = failing
    data['metadata']['last_updated'] = datetime.now().isoformat()


def update_feature_status(filepath: Path, feature_id: str, passes: bool, dry_run: bool = False) -> bool:
    """
    Update the passes status of a specific feature.
    
    Returns True if successful, False otherwise.
    """
    # Load current data
    try:
        data = load_feature_list(filepath)
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {filepath}: {e}")
        return False
    
    # Find the feature
    index, feature = find_feature(data, feature_id)
    if feature is None:
        print(f"Error: Feature '{feature_id}' not found")
        print("\nAvailable features:")
        for f in data.get('features', [])[:10]:
            status = "✅" if f.get('passes') else "❌"
            print(f"  {status} {f.get('id')}: {f.get('description', '')[:50]}")
        if len(data.get('features', [])) > 10:
            print(f"  ... and {len(data.get('features', [])) - 10} more")
        return False
    
    # Check if this is actually a change
    current_status = feature.get('passes', False)
    if current_status == passes:
        status_str = "passing" if passes else "failing"
        print(f"Feature '{feature_id}' is already marked as {status_str}")
        return True
    
    # Show what will change
    old_status = "passing" if current_status else "failing"
    new_status = "passing" if passes else "failing"
    
    print(f"\nFeature: {feature_id}")
    print(f"Description: {feature.get('description', 'N/A')}")
    print(f"Category: {feature.get('category', 'N/A')}")
    print(f"Change: {old_status} → {new_status}")
    
    if dry_run:
        print("\n[DRY RUN] No changes made")
        return True
    
    # Make the change (ONLY the passes field)
    data['features'][index]['passes'] = passes
    
    # Update metadata
    update_metadata(data)
    
    # Save
    save_feature_list(filepath, data)
    
    print(f"\n✅ Updated feature '{feature_id}' to {new_status}")
    print(f"   Backup saved to {filepath.with_suffix('.json.bak')}")
    
    # Show current stats
    meta = data.get('metadata', {})
    print(f"\nCurrent progress: {meta.get('passing', 0)}/{meta.get('total_features', 0)} features passing")
    
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Safely update feature status in feature_list.json',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python update_feature.py F001 pass      # Mark F001 as passing
    python update_feature.py F002 fail      # Mark F002 as failing
    python update_feature.py F001 pass --dry-run  # Preview change
        """
    )
    parser.add_argument('feature_id', help='The feature ID to update (e.g., F001)')
    parser.add_argument('status', choices=['pass', 'fail'], help='New status: pass or fail')
    parser.add_argument('--file', default='feature_list.json', help='Path to feature_list.json')
    parser.add_argument('--dry-run', action='store_true', help='Show what would change without making changes')
    
    args = parser.parse_args()
    
    filepath = Path(args.file)
    passes = args.status == 'pass'
    
    success = update_feature_status(filepath, args.feature_id, passes, args.dry_run)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
