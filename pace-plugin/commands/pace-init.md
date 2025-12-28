---
description: Initialize a new PACE project with feature list and development scripts
allowed-tools: Read, Write, Bash, Glob
argument-hint: [project description or --file path]
---

# PACE Project Initialization

Set up a new project for PACE orchestration.

## Arguments

Parse `$ARGUMENTS`:
- Direct text: Project description
- `--file PATH`: Read description from file

## Required Outputs

Create these files:

### 1. feature_list.json

```json
{
  "features": [
    {
      "id": "CATEGORY-001",
      "category": "core",
      "description": "Clear, testable description",
      "priority": "critical|high|medium|low",
      "steps": ["Verification step 1", "Step 2"],
      "passes": false
    }
  ],
  "metadata": {
    "project_name": "Project Name",
    "created_at": "YYYY-MM-DD",
    "total_features": N,
    "passing": 0,
    "failing": N
  }
}
```

Requirements:
- 50-200+ features depending on complexity
- ALL start with `"passes": false`
- Include explicit and implicit features
- Make descriptions testable

### 2. init.sh

```bash
#!/bin/bash
set -e
echo "=== PACE Development Environment ==="
# Install dependencies
# Start dev server
echo "Ready at http://localhost:PORT"
```

### 3. progress.txt

```markdown
# PACE Progress Log

## Project: [Name]

---
### Session 1 - Initialization
**Date:** [timestamp]
**Created:** feature_list.json, init.sh, progress.txt
**Features:** N total
**Next:** Run /pace-run
---
```

### 4. Git Commit

```bash
git add feature_list.json init.sh progress.txt
git commit -m "feat: initialize PACE project with N features"
```

## Validation

Verify with:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-validate.ts
```

## Completion

Output summary:

```
============================================================
 PACE INITIALIZATION COMPLETE
============================================================
Project: [Name]
Features: N
Files: feature_list.json, init.sh, progress.txt
Next: /pace-run
============================================================
```
