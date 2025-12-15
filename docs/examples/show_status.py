#!/usr/bin/env python3
"""
show_status.py - Display current project status for long-running agent harness

Usage:
    python scripts/show_status.py [--file PATH] [--verbose]
    
Displays:
- Feature completion progress
- Next features to work on
- Recent git history
- Summary from progress file
"""

import json
import subprocess
import sys
import argparse
from pathlib import Path


def load_feature_list(filepath: Path) -> dict | None:
    """Load feature_list.json if it exists."""
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def load_progress_file(filepath: Path) -> str | None:
    """Load progress.txt if it exists."""
    try:
        with open(filepath, 'r') as f:
            return f.read()
    except FileNotFoundError:
        return None


def get_git_log(n: int = 10) -> str | None:
    """Get recent git log."""
    try:
        result = subprocess.run(
            ['git', 'log', '--oneline', f'-{n}'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def get_next_features(data: dict, limit: int = 5) -> list[dict]:
    """Get the next features to work on (failing, by priority)."""
    features = data.get('features', [])
    
    # Filter to failing features only
    failing = [f for f in features if not f.get('passes', False)]
    
    # Sort by priority
    priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    failing.sort(key=lambda f: priority_order.get(f.get('priority', 'low'), 4))
    
    return failing[:limit]


def print_progress_bar(passing: int, total: int, width: int = 40):
    """Print a visual progress bar."""
    if total == 0:
        return
    
    pct = passing / total
    filled = int(width * pct)
    empty = width - filled
    
    bar = '█' * filled + '░' * empty
    print(f"  [{bar}] {passing}/{total} ({pct*100:.1f}%)")


def print_status(feature_file: Path, progress_file: Path, verbose: bool = False):
    """Print comprehensive status report."""
    print("\n" + "=" * 60)
    print(" Long-Running Agent Harness - Project Status")
    print("=" * 60 + "\n")
    
    # Load feature list
    data = load_feature_list(feature_file)
    if data is None:
        print("⚠️  feature_list.json not found or invalid")
        print("   Run the initializer agent first to set up the project.\n")
    else:
        meta = data.get('metadata', {})
        total = meta.get('total_features', len(data.get('features', [])))
        passing = meta.get('passing', sum(1 for f in data.get('features', []) if f.get('passes')))
        failing = total - passing
        
        print(f"📊 Feature Progress")
        print(f"   Project: {meta.get('project_name', 'Unknown')}")
        print_progress_bar(passing, total)
        print(f"   ✅ Passing: {passing}")
        print(f"   ❌ Failing: {failing}")
        print()
        
        # Next features to work on
        next_features = get_next_features(data)
        if next_features:
            print("📋 Next Features to Implement:")
            for i, f in enumerate(next_features, 1):
                pri = f.get('priority', 'medium')
                pri_icon = {'critical': '🔴', 'high': '🟠', 'medium': '🟡', 'low': '🟢'}.get(pri, '⚪')
                print(f"   {i}. {pri_icon} [{f.get('id')}] {f.get('description', '')[:50]}")
            print()
        
        # Category breakdown
        if verbose:
            by_category = {}
            for f in data.get('features', []):
                cat = f.get('category', 'uncategorized')
                if cat not in by_category:
                    by_category[cat] = {'passing': 0, 'failing': 0}
                if f.get('passes'):
                    by_category[cat]['passing'] += 1
                else:
                    by_category[cat]['failing'] += 1
            
            print("📁 Progress by Category:")
            for cat, counts in sorted(by_category.items()):
                total_cat = counts['passing'] + counts['failing']
                pct = counts['passing'] / total_cat * 100 if total_cat > 0 else 0
                print(f"   {cat}: {counts['passing']}/{total_cat} ({pct:.0f}%)")
            print()
    
    # Git history
    git_log = get_git_log(5)
    if git_log:
        print("📜 Recent Git History:")
        for line in git_log.split('\n'):
            print(f"   {line}")
        print()
    else:
        print("⚠️  Git repository not found or no commits yet\n")
    
    # Progress file summary
    progress_content = load_progress_file(progress_file)
    if progress_content:
        # Extract last session info
        sessions = progress_content.split('### Session ')
        if len(sessions) > 1:
            last_session = sessions[-1]
            # Get first few lines of last session
            lines = last_session.split('\n')[:10]
            
            print("📝 Last Session Summary:")
            for line in lines:
                if line.strip():
                    print(f"   {line}")
            print()
    else:
        print("⚠️  progress.txt not found\n")
    
    # Working directory
    print(f"📂 Working Directory: {Path.cwd()}")
    print()
    
    # Quick commands reminder
    print("🚀 Quick Commands:")
    print("   ./init.sh              - Start development environment")
    print("   python scripts/validate_features.py  - Validate feature list")
    print("   python scripts/update_feature.py F001 pass  - Mark feature as passing")
    print()


def main():
    parser = argparse.ArgumentParser(description='Display project status for long-running agent harness')
    parser.add_argument('--file', default='feature_list.json', help='Path to feature_list.json')
    parser.add_argument('--progress', default='progress.txt', help='Path to progress file')
    parser.add_argument('--verbose', '-v', action='store_true', help='Show detailed breakdown')
    
    args = parser.parse_args()
    
    print_status(Path(args.file), Path(args.progress), args.verbose)


if __name__ == '__main__':
    main()
