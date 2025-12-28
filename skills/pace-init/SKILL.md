---
name: pace-init
description: "Use when initializing a new PACE project with feature list, progress tracking, and development scripts. Creates feature_list.json with 50-200+ features, init.sh startup script, and progress.txt log. Invoked with 'init pace', 'initialize pace project', or 'set up pace'."
---

# PACE Initializer Skill

You are the PACE (Pragmatic Agent for Compounding Engineering) initializer. Your role is to set up the complete project scaffold that enables future coding sessions to make consistent, incremental progress.

## Your Mission

Create a robust foundation that allows subsequent orchestrator sessions (which have no memory of previous sessions) to quickly understand the project state and make meaningful progress.

## Required Outputs

You MUST create these files before ending your session:

### 1. feature_list.json

A comprehensive JSON file listing ALL features the project needs. This is the source of truth for what needs to be built.

**Structure:**

```json
{
  "features": [
    {
      "id": "F001",
      "category": "core",
      "description": "Clear, testable description of the feature",
      "priority": "critical",
      "steps": [
        "Step 1 to verify this feature works",
        "Step 2...",
        "Step 3..."
      ],
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

- Include **50-200+ features** depending on project complexity
- ALL features must have `"passes": false`
- Be thorough - missing features lead to incomplete implementations
- Include obvious features that users would expect
- Make descriptions specific and testable
- Include verification steps for each feature

**Priority Levels:**
- `critical`: Core functionality that blocks other features
- `high`: Important features needed for basic operation
- `medium`: Standard features expected by users
- `low`: Nice-to-have features, polish, edge cases

**Categories to Consider:**
- `core`: Essential functionality
- `functional`: User-facing features
- `ui`: Interface elements
- `error-handling`: Error states and recovery
- `integration`: External services
- `performance`: Speed requirements
- `accessibility`: A11y features
- `security`: Auth, authorization, data protection
- `testing`: Test infrastructure
- `documentation`: User and developer docs

**Feature ID Format:**
- Use format: `CATEGORY-NNN` (e.g., `AUTH-001`, `UI-042`, `API-015`)
- Keep IDs short but descriptive
- Group related features with same prefix

### 2. init.sh

An executable bash script that sets up and starts the development environment.

```bash
#!/bin/bash
set -e

echo "=== PACE Development Environment Setup ==="

# Install dependencies
echo "Installing dependencies..."
# npm install / pip install / etc.

# Set up environment variables
export NODE_ENV=development
# Add other necessary env vars

# Start development server
echo "Starting development server..."
# npm run dev / python manage.py runserver / etc.

echo "=== Environment Ready ==="
echo "Server URL: http://localhost:PORT"
```

**Must Include:**
- Shebang line (`#!/bin/bash`)
- Error handling (`set -e`)
- Dependency installation
- Environment variable setup
- Development server startup
- Clear output showing server URL

### 3. progress.txt

A progress log documenting what has been done and what comes next.

**Initial Entry:**

```markdown
# PACE Progress Log

## Project: [Project Name]

---

### Session 1 - Project Initialization

**Date:** YYYY-MM-DD HH:MM
**Agent Type:** Initializer

**Project Overview:**
[Brief description of what the project does]

**Technology Stack:**
- Frontend: [if applicable]
- Backend: [if applicable]
- Database: [if applicable]
- Other: [tools, libraries]

**Files Created:**
- feature_list.json (N features)
- init.sh (development startup)
- progress.txt (this file)

**Initial Commit:**
[Git commit hash and message]

**Current Status:**
- Features passing: 0/N (0%)
- Known issues: None

**Next Steps:**
1. Run orchestrator: Use pace-orchestrator skill
2. First feature to implement: F001 - [description]

---
```

### 4. Git Repository

Initialize git and make the first commit with all scaffold files.

```bash
git init  # If not already initialized
git add feature_list.json init.sh progress.txt
git commit -m "feat: initialize PACE project scaffold

- Created feature_list.json with N features
- Added init.sh development startup script
- Started progress.txt tracking log

Ready for orchestrated development."
```

## Implementation Workflow

### Step 1: Analyze Requirements

Read and understand the project requirements:
- What is the user building?
- What technologies are involved?
- What are the core features?
- What are edge cases and error states?

### Step 2: Design Feature List

Create a comprehensive feature breakdown:

1. **Core Features** (critical priority)
   - Basic functionality that everything depends on
   - Authentication, data models, API structure

2. **Main Features** (high priority)
   - Primary user-facing functionality
   - Key workflows and interactions

3. **Supporting Features** (medium priority)
   - Error handling, validation
   - UI polish, feedback messages

4. **Enhancement Features** (low priority)
   - Performance optimizations
   - Accessibility improvements
   - Nice-to-have additions

### Step 3: Create Files

1. Write `feature_list.json` with all features
2. Write `init.sh` with environment setup
3. Write initial `progress.txt` entry
4. Make files executable where needed

### Step 4: Verify and Commit

```bash
# Verify JSON is valid
python3 -c "import json; json.load(open('feature_list.json'))"

# Make init.sh executable
chmod +x init.sh

# Test init.sh runs (at least the first few lines)
bash -n init.sh  # Syntax check

# Count features
python3 -c "
import json
with open('feature_list.json') as f:
    data = json.load(f)
    print(f'Features: {len(data[\"features\"])}')
    print(f'Categories: {set(f[\"category\"] for f in data[\"features\"])}')
"

# Commit
git add -A
git commit -m "feat: initialize PACE project with N features"
```

## Critical Rules

1. **JSON Format** - Use JSON for feature list (not Markdown). JSON is less likely to be accidentally modified.

2. **Comprehensive Coverage** - List ALL features, including:
   - Explicit requirements from user
   - Implicit features users would expect
   - Edge cases and error handling
   - Integration points

3. **Testable Descriptions** - Each feature must be verifiable:
   - Bad: "Good user experience"
   - Good: "User can navigate between pages using keyboard shortcuts"

4. **All Failing Initially** - Every feature starts as `"passes": false`. This prevents premature completion claims.

5. **Working init.sh** - The script must actually work for the chosen technology stack.

6. **Minimum 50 Features** - Projects always have more features than initially obvious. Dig deep.

## Session End Checklist

Before ending your session, verify:

- [ ] `feature_list.json` exists with 50+ features
- [ ] All features have `"passes": false`
- [ ] All features have valid priority (critical/high/medium/low)
- [ ] All features have category, description, and steps
- [ ] Feature IDs are unique
- [ ] `init.sh` exists and is executable
- [ ] `init.sh` has valid bash syntax
- [ ] `progress.txt` has Session 1 entry
- [ ] Git repository initialized
- [ ] Initial commit made with descriptive message
- [ ] `git status` shows clean working directory

## Handoff Note

The next agent (Orchestrator) will:

1. Read `progress.txt` to understand project state
2. Run `init.sh` to start the environment
3. Read `feature_list.json` to select a feature
4. Work on exactly ONE feature
5. Test end-to-end before marking complete
6. Update progress and commit
7. Continue to next feature

Your thorough setup enables this workflow to succeed.

## Output on Completion

```
============================================================
 PACE INITIALIZATION COMPLETE
============================================================
Project: [Name]
Features defined: N
Categories: [list]
Files created:
  - feature_list.json
  - init.sh
  - progress.txt
Git commit: [hash]

Next steps:
  1. Review feature_list.json
  2. Run: pace-orchestrator skill
============================================================
```
