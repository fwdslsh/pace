#!/usr/bin/env python3
"""
validate_features.py - Validate feature_list.json structure and content

Usage:
    python scripts/validate_features.py [path/to/feature_list.json]
    
If no path provided, looks for feature_list.json in current directory.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

def validate_feature(feature: dict, index: int) -> list[str]:
    """Validate a single feature entry."""
    errors = []
    feature_id = feature.get('id', f'index-{index}')
    
    # Required fields
    required = ['id', 'category', 'description', 'priority', 'steps', 'passes']
    for field in required:
        if field not in feature:
            errors.append(f"Feature {feature_id}: Missing required field '{field}'")
    
    # Type validation
    if 'id' in feature and not isinstance(feature['id'], str):
        errors.append(f"Feature {feature_id}: 'id' must be a string")
    
    if 'category' in feature and not isinstance(feature['category'], str):
        errors.append(f"Feature {feature_id}: 'category' must be a string")
    
    if 'description' in feature and not isinstance(feature['description'], str):
        errors.append(f"Feature {feature_id}: 'description' must be a string")
    
    if 'priority' in feature:
        valid_priorities = ['critical', 'high', 'medium', 'low']
        if feature['priority'] not in valid_priorities:
            errors.append(f"Feature {feature_id}: 'priority' must be one of {valid_priorities}")
    
    if 'steps' in feature:
        if not isinstance(feature['steps'], list):
            errors.append(f"Feature {feature_id}: 'steps' must be an array")
        elif len(feature['steps']) == 0:
            errors.append(f"Feature {feature_id}: 'steps' array cannot be empty")
        else:
            for i, step in enumerate(feature['steps']):
                if not isinstance(step, str):
                    errors.append(f"Feature {feature_id}: step {i+1} must be a string")
    
    if 'passes' in feature and not isinstance(feature['passes'], bool):
        errors.append(f"Feature {feature_id}: 'passes' must be a boolean")
    
    # Content validation
    if 'description' in feature and len(feature.get('description', '')) < 10:
        errors.append(f"Feature {feature_id}: description too short (min 10 chars)")
    
    return errors


def validate_metadata(metadata: dict) -> list[str]:
    """Validate the metadata section."""
    errors = []
    
    required = ['project_name', 'total_features', 'passing', 'failing']
    for field in required:
        if field not in metadata:
            errors.append(f"Metadata: Missing required field '{field}'")
    
    if 'total_features' in metadata and 'passing' in metadata and 'failing' in metadata:
        total = metadata['total_features']
        passing = metadata['passing']
        failing = metadata['failing']
        
        if passing + failing != total:
            errors.append(f"Metadata: passing ({passing}) + failing ({failing}) != total_features ({total})")
    
    return errors


def validate_feature_list(filepath: Path) -> tuple[bool, list[str], dict]:
    """
    Validate a feature_list.json file.
    
    Returns:
        (is_valid, errors, stats)
    """
    errors = []
    stats = {
        'total': 0,
        'passing': 0,
        'failing': 0,
        'by_category': {},
        'by_priority': {}
    }
    
    # Check file exists
    if not filepath.exists():
        return False, [f"File not found: {filepath}"], stats
    
    # Parse JSON
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return False, [f"Invalid JSON: {e}"], stats
    
    # Check top-level structure
    if 'features' not in data:
        errors.append("Missing 'features' array at top level")
        return False, errors, stats
    
    if not isinstance(data['features'], list):
        errors.append("'features' must be an array")
        return False, errors, stats
    
    # Validate each feature
    seen_ids = set()
    for i, feature in enumerate(data['features']):
        # Check for duplicate IDs
        fid = feature.get('id')
        if fid:
            if fid in seen_ids:
                errors.append(f"Duplicate feature ID: {fid}")
            seen_ids.add(fid)
        
        # Validate feature
        feature_errors = validate_feature(feature, i)
        errors.extend(feature_errors)
        
        # Collect stats
        if feature.get('passes'):
            stats['passing'] += 1
        else:
            stats['failing'] += 1
        stats['total'] += 1
        
        cat = feature.get('category', 'uncategorized')
        stats['by_category'][cat] = stats['by_category'].get(cat, 0) + 1
        
        pri = feature.get('priority', 'unknown')
        stats['by_priority'][pri] = stats['by_priority'].get(pri, 0) + 1
    
    # Validate metadata if present
    if 'metadata' in data:
        metadata_errors = validate_metadata(data['metadata'])
        errors.extend(metadata_errors)
        
        # Check metadata matches actual counts
        meta = data['metadata']
        if meta.get('total_features') != stats['total']:
            errors.append(f"Metadata total_features ({meta.get('total_features')}) doesn't match actual count ({stats['total']})")
        if meta.get('passing') != stats['passing']:
            errors.append(f"Metadata passing ({meta.get('passing')}) doesn't match actual count ({stats['passing']})")
        if meta.get('failing') != stats['failing']:
            errors.append(f"Metadata failing ({meta.get('failing')}) doesn't match actual count ({stats['failing']})")
    
    is_valid = len(errors) == 0
    return is_valid, errors, stats


def print_report(filepath: Path, is_valid: bool, errors: list[str], stats: dict):
    """Print validation report."""
    print(f"\n{'='*60}")
    print(f"Feature List Validation Report")
    print(f"File: {filepath}")
    print(f"{'='*60}\n")
    
    if is_valid:
        print("✅ VALID - No errors found\n")
    else:
        print(f"❌ INVALID - {len(errors)} error(s) found\n")
        print("Errors:")
        for error in errors:
            print(f"  • {error}")
        print()
    
    print("Statistics:")
    print(f"  Total features: {stats['total']}")
    print(f"  Passing: {stats['passing']} ({stats['passing']/max(stats['total'],1)*100:.1f}%)")
    print(f"  Failing: {stats['failing']} ({stats['failing']/max(stats['total'],1)*100:.1f}%)")
    
    if stats['by_category']:
        print(f"\n  By Category:")
        for cat, count in sorted(stats['by_category'].items()):
            print(f"    {cat}: {count}")
    
    if stats['by_priority']:
        print(f"\n  By Priority:")
        priority_order = ['critical', 'high', 'medium', 'low', 'unknown']
        for pri in priority_order:
            if pri in stats['by_priority']:
                print(f"    {pri}: {stats['by_priority'][pri]}")
    
    print()


def main():
    # Get filepath from args or use default
    if len(sys.argv) > 1:
        filepath = Path(sys.argv[1])
    else:
        filepath = Path('feature_list.json')
    
    is_valid, errors, stats = validate_feature_list(filepath)
    print_report(filepath, is_valid, errors, stats)
    
    sys.exit(0 if is_valid else 1)


if __name__ == '__main__':
    main()
