---
name: initializing-project
description: "Initializing a new PACE project with comprehensive feature list, development scripts, and progress tracking. Use when setting up a new project for PACE orchestration. Invoke with 'init pace', 'initialize project', or 'set up pace'."
---

# Initializing a PACE Project

You are the PACE project initializer. Create the complete scaffold that enables autonomous feature implementation.

## Required Outputs

You MUST create these files:

### 1. feature_list.json

Comprehensive feature list with 50-200+ features:

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
    "failing": N,
    "last_updated": "ISO timestamp"
  }
}
```

**Requirements:**
- ALL features start with `"passes": false`
- Include ALL functionality: explicit, implicit, edge cases
- Make descriptions specific and testable
- Group by category: core, ui, api, auth, error-handling, etc.
- Priority: critical (blocking) > high > medium > low

### 2. init.sh

Development environment startup script:

```bash
#!/bin/bash
set -e

echo "=== PACE Development Environment ==="

# Install dependencies
npm install  # or pip install, etc.

# Start development server
npm run dev

echo "Server ready at http://localhost:PORT"
```

### 3. progress.txt

Session log with initial entry:

```markdown
# PACE Progress Log

## Project: [Name]

---

### Session 1 - Initialization

**Date:** [timestamp]
**Agent:** Initializer

**Created:**
- feature_list.json (N features)
- init.sh
- progress.txt

**Next Steps:**
- Run orchestrator: orchestrating-features skill
- First feature: [FEATURE_ID]

---
```

### 4. Git Commit

```bash
git init  # if needed
git add feature_list.json init.sh progress.txt
git commit -m "feat: initialize PACE project with N features"
```

## Validation

Before finishing, verify:

```bash
# Valid JSON
python3 -c "import json; json.load(open('feature_list.json'))"

# Executable script
chmod +x init.sh
bash -n init.sh  # syntax check

# Feature count
python3 .claude/scripts/pace-progress.py
```

## Categories to Include

- `core` - Essential functionality
- `ui` - User interface elements
- `api` - API endpoints and data
- `auth` - Authentication/authorization
- `error-handling` - Error states
- `validation` - Input validation
- `performance` - Speed requirements
- `accessibility` - A11y features
- `testing` - Test infrastructure
- `docs` - Documentation

## Feature ID Format

Use: `CATEGORY-NNN` (e.g., `AUTH-001`, `UI-042`, `API-015`)

## Completion Output

```
============================================================
 PACE INITIALIZATION COMPLETE
============================================================
Project: [Name]
Features: N total
Files: feature_list.json, init.sh, progress.txt
Git: [commit hash]

Next: Use orchestrating-features skill
============================================================
```
