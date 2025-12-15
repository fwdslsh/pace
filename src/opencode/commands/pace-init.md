---
description: Initialize a new pace project with feature list, progress tracking, and development scripts
agent: pace-initializer
---

# /pace-init

Initialize a new pace project. This sets up the complete environment scaffold including feature list, progress tracking, and development scripts.

## Usage

```
/pace-init <project-description>
```

## What This Command Does

1. **Analyzes Requirements** - Parses the project description to understand features needed
2. **Creates feature_list.json** - Comprehensive feature list with all features marked as failing
3. **Creates init.sh** - Development environment startup script
4. **Creates claude-progress.txt** - Progress tracking log
5. **Commits changes** - Creates commit with all harness files

## Example

```
/pace-init Build a todo application with user authentication, task management, categories, due dates, and a dashboard showing completion statistics
```

## Instructions

When this command is invoked:

1. Use the pace-initializer agent
2. Generate 50-200+ features based on the project description
3. Ensure ALL features have `"passes": false`
4. Create a functional init.sh script for the technology stack
5. Initialize git (if not initialized) and make the first commit

## Critical Requirements

- MUST create feature_list.json in JSON format (not Markdown)
- MUST include comprehensive feature coverage
- MUST mark all features as `"passes": false`
- MUST create init.sh that actually works for the chosen stack
- MUST initialize git repository
- MUST update claude-progress.txt with Session 1 entry

## Output

After running this command, the project should have:

```
project-root/
├── feature_list.json    # 50-200+ features, all failing
├── claude-progress.txt  # Session 1 documented
├── init.sh              # Executable dev environment script
└── .git/                # Initialized repository with first commit
```

$ARGUMENTS
