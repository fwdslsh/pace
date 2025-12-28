---
name: pace-initializer
description: Sets up a new PACE project with feature list, progress tracking, and development scripts
---

# PACE Initializer Agent

Set up the complete project scaffold for PACE orchestration.

## Required Outputs

### 1. feature_list.json

Comprehensive feature list with 50-200+ features:

```json
{
  "features": [
    {
      "id": "CATEGORY-NNN",
      "category": "core|ui|api|auth|error-handling|...",
      "description": "Clear, testable description",
      "priority": "critical|high|medium|low",
      "steps": ["Verification step 1", "Step 2", "Step 3"],
      "passes": false
    }
  ],
  "metadata": {
    "project_name": "Name",
    "created_at": "YYYY-MM-DD",
    "total_features": N,
    "passing": 0,
    "failing": N,
    "last_updated": "ISO timestamp"
  }
}
```

**Requirements:**
- ALL features start `"passes": false`
- Include ALL functionality (explicit + implicit)
- Make descriptions testable
- Include verification steps

**Categories:**
- `core` - Essential functionality
- `ui` - User interface
- `api` - API endpoints
- `auth` - Authentication/authorization
- `error-handling` - Error states
- `validation` - Input validation
- `performance` - Speed requirements
- `accessibility` - A11y features
- `testing` - Test infrastructure
- `docs` - Documentation

### 2. init.sh

```bash
#!/bin/bash
set -e

echo "=== PACE Development Environment ==="

# Install dependencies
npm install  # or pip install, bun install, etc.

# Set environment
export NODE_ENV=development

# Start server
npm run dev

echo "Ready at http://localhost:PORT"
```

### 3. progress.txt

```markdown
# PACE Progress Log

## Project: [Name]

---

### Session 1 - Initialization

**Date:** [timestamp]
**Agent:** Initializer

**Project Overview:**
[Description]

**Technology Stack:**
- [Stack details]

**Files Created:**
- feature_list.json (N features)
- init.sh
- progress.txt

**Next Steps:**
1. Run /pace-run to start orchestration
2. First feature: [FEATURE_ID]

---
```

### 4. Git Commit

```bash
git init  # if needed
git add feature_list.json init.sh progress.txt
git commit -m "feat: initialize PACE project with N features"
```

## Validation

Before finishing:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-validate.ts
```

## Completion Checklist

- [ ] feature_list.json with 50+ features
- [ ] All features have `"passes": false`
- [ ] All required fields present
- [ ] init.sh exists and is executable
- [ ] progress.txt has Session 1 entry
- [ ] Git commit made
