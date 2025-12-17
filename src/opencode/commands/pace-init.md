# Initializer Agent Instructions

Execute these steps EXACTLY when starting a new long-running project. This is the foundation that enables all future coding sessions to work effectively.

## Prerequisites

- User has provided a project specification or requirements
- Git is available in the environment
- Development tools for the target stack are installed

## Step 1: Analyze Requirements

Read the user's project specification carefully. Identify:

- Core functionality required
- User-facing features
- Technical requirements (frameworks, APIs, databases)
- Implicit features users would expect

## Step 2: Create Feature List

Generate `feature_list.json` in the project root with comprehensive features.

**CRITICAL RULES:**

- Include ALL features, even seemingly obvious ones
- Every feature MUST have `"passes": false` initially
- Use specific, testable descriptions
- Include step-by-step verification instructions
- Organize by category (functional, ui, integration, etc.)

**Feature Structure:**

```json
{
	"features": [
		{
			"id": "F001",
			"category": "functional",
			"description": "User can create a new item",
			"priority": "high",
			"steps": [
				"Navigate to main interface",
				"Click 'New Item' button",
				"Fill in required fields",
				"Click 'Save'",
				"Verify item appears in list"
			],
			"passes": false
		}
	],
	"metadata": {
		"project_name": "",
		"created_at": "",
		"total_features": 0,
		"passing": 0,
		"failing": 0
	}
}
```

**Aim for 50-200+ features** depending on project complexity. Be thorough - missing features lead to incomplete implementations.

## Step 3: Create init.sh Script

Generate `init.sh` that:

1. Installs dependencies if needed
2. Sets up environment variables
3. Starts development server(s)
4. Outputs URLs for accessing the application
5. Handles cleanup on exit

**Template:**

```bash
#!/bin/bash
set -e

echo "=== Initializing Development Environment ==="

# Install dependencies
echo "Installing dependencies..."
# npm install / pip install / etc.

# Set environment variables
export NODE_ENV=development
# Add other env vars as needed

# Start development server
echo "Starting development server..."
# npm run dev / python manage.py runserver / etc.

echo "=== Server running at http://localhost:PORT ==="
echo "Press Ctrl+C to stop"
```

## Step 4: Initialize Progress File

Create `claude-progress.txt`:

```markdown
# Project Progress Log

## Project: [Project Name]

## Created: [Date]

---

### Session 1 - Initialization

**Date:** [Current Date]
**Agent Type:** Initializer

**Actions Taken:**

- Created feature_list.json with [N] features
- Generated init.sh script
- Set up initial project structure
- Made initial git commit

**Environment Setup:**

- Framework: [e.g., React, Django]
- Development server: [URL]
- Key dependencies: [list]

**Next Steps:**

- Begin implementing features starting with highest priority
- First target: [F001 - description]

---
```

## Step 5: Initialize Git Repository

```bash
# Initialize if not already a git repo
git init 2>/dev/null || true

# Add all files
git add .

# Initial commit
git commit -m "chore: initialize project with long-running agent harness

- Add feature_list.json with N features (all failing)
- Add init.sh for development environment setup
- Add claude-progress.txt for session tracking
- Set up initial project structure"
```

## Step 6: Verify Setup

Before ending the session:

1. Run `init.sh` to verify it works
2. Confirm `feature_list.json` is valid JSON
3. Verify git commit was successful
4. Review `claude-progress.txt` for completeness

## Output Checklist

At session end, confirm these files exist and are committed:

- [ ] `feature_list.json` - All features listed, all `passes: false`
- [ ] `init.sh` - Executable, starts dev environment
- [ ] `claude-progress.txt` - Session 1 documented
- [ ] Initial git commit made with descriptive message

## Handoff to Coding Agent

The coding agent will now be able to:

1. Read the progress file to understand project state
2. Run `init.sh` to start the environment
3. Select a feature from `feature_list.json` to implement
4. Make incremental progress with proper tracking
