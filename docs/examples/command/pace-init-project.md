---
description: Initialize a new long-running agent harness project with feature list, progress tracking, and development scripts
agent: build
---

# /init-project

Initialize a new long-running agent harness project. This command sets up the complete environment scaffold including feature list, progress tracking, and development scripts.

## Usage

```
/init-project <project-description>
```

## What This Command Does

1. **Analyzes Requirements** - Parses the project description to understand features needed
2. **Creates feature_list.json** - Comprehensive feature list with all features marked as failing
3. **Creates init.sh** - Development environment startup script
4. **Creates claude-progress.txt** - Progress tracking log
5. **Commits changes** - Creates commit with all harness files

## Example

```
/init-project Build a todo application with user authentication, task management, categories, due dates, and a dashboard showing completion statistics
```

## Instructions for Claude

When this command is invoked:

1. Read the long-running-agent-harness skill: `.claude/skills/long-running-agent-harness/SKILL.md`
2. Read the initializer agent reference: `.claude/skills/long-running-agent-harness/references/initializer-agent.md`
3. Follow the initializer agent instructions EXACTLY
4. Use the templates from `.claude/skills/long-running-agent-harness/templates/` as starting points
5. Generate 50-200+ features based on the project description
6. Ensure ALL features have `"passes": false`
7. Create a functional init.sh script for the technology stack
8. Initialize git (if not initialized) and make the (first) commit

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
