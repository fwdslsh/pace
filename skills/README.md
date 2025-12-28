# PACE Skills for Claude Code

This directory contains Claude Code skills that replicate the functionality of the PACE CLI tool. These skills enable autonomous, agent-driven feature implementation using Claude Code's skill system.

## Overview

PACE (Pragmatic Agent for Compounding Engineering) is a workflow orchestrator that automates continuous AI-powered coding sessions. These skills provide the same functionality as the CLI but are designed to be invoked within Claude Code sessions.

## Available Skills

### pace-orchestrator

**Invocation:** "run pace", "start pace orchestrator", "implement features"

The main orchestration skill that runs a continuous loop to implement features from `feature_list.json`. It:

- Selects the highest priority failing feature
- Implements the feature following the coding workflow
- Tests end-to-end before marking as passing
- Updates `feature_list.json` and `progress.txt`
- Commits changes to git
- Continues to the next feature until complete or stopped

**Configuration:**
- Max sessions: Unlimited (or specify "run N sessions")
- Max consecutive failures: 3 (stops if stuck)
- Deterministic priority ordering: critical > high > medium > low

### pace-init

**Invocation:** "init pace", "initialize pace project", "set up pace"

Initializes a new PACE project with:

- `feature_list.json` with 50-200+ features
- `init.sh` development startup script
- `progress.txt` progress log
- Initial git commit

### pace-status

**Invocation:** "pace status", "show progress", "what features are left"

Shows comprehensive project status:

- Progress bar and counts
- Breakdown by priority and category
- Next features to implement
- Recent git history
- Last session summary

### pace-validate

**Invocation:** "validate features", "check feature list", "pace validate"

Validates `feature_list.json` structure:

- Required fields check
- Priority value validation
- Duplicate ID detection
- Statistics summary

### pace-update

**Invocation:** "update feature F001 pass", "mark F001 as passing"

Manually updates feature status:

- Mark features as passing or failing
- Creates backup before changes
- Updates metadata counts

## Installation

### Option 1: Copy to .claude/skills (Recommended)

```bash
# Create skills directory in your project
mkdir -p .claude/skills

# Copy all skills
cp -r skills/* .claude/skills/
```

### Option 2: Symlink (for development)

```bash
# From your project root
ln -s /path/to/pace/skills .claude/skills
```

## Hooks Configuration

For autonomous loop continuation, add these hooks to your `.claude/settings.json`:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json; d=json.load(open('feature_list.json')); failing=[f for f in d['features'] if not f.get('passes')]; exit(0 if not failing else 2)\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

This hook prevents the orchestrator from stopping until all features pass.

See `pace-orchestrator/hooks.json` for the complete hooks configuration.

## Workflow

### Starting a New Project

1. Describe your project to Claude Code
2. Invoke: "init pace" or use the pace-init skill
3. Review the generated `feature_list.json`
4. Invoke: "run pace" to start orchestration

### Continuing Development

1. Check status: "pace status"
2. Run orchestrator: "run pace" or "implement next feature"
3. Let it run until completion or intervention needed

### Manual Intervention

- Check progress: "pace status"
- Validate features: "validate features"
- Mark feature manually: "update F001 pass"

## File Structure

```
skills/
├── README.md                    # This file
├── pace-orchestrator/
│   ├── SKILL.md                 # Main orchestration skill
│   └── hooks.json               # Hooks for loop continuation
├── pace-init/
│   └── SKILL.md                 # Project initialization skill
├── pace-status/
│   └── SKILL.md                 # Status reporting skill
├── pace-validate/
│   └── SKILL.md                 # Feature list validation skill
└── pace-update/
    └── SKILL.md                 # Manual status update skill
```

## Project Files

These skills work with the standard PACE files:

| File | Purpose |
|------|---------|
| `feature_list.json` | Source of truth for features and their status |
| `progress.txt` | Session log with implementation history |
| `init.sh` | Development environment startup script |

## Comparison with CLI

| CLI Command | Skill Equivalent |
|-------------|------------------|
| `pace run` | pace-orchestrator skill |
| `pace init` | pace-init skill |
| `pace status` | pace-status skill |
| `pace validate` | pace-validate skill |
| `pace update F001 pass` | pace-update skill |

### Key Differences

1. **Invocation**: Skills are invoked through natural language, CLI uses command-line arguments
2. **Loop Control**: Skills use hooks for loop continuation, CLI has built-in loop
3. **Context**: Skills run within Claude Code session, CLI spawns OpenCode sessions
4. **Interactivity**: Skills are fully interactive, CLI streams progress

### Advantages of Skills

- No external dependencies (OpenCode SDK not required)
- Native Claude Code integration
- Interactive conversation during orchestration
- Can be combined with other Claude Code features
- Simpler deployment (just markdown files)

## Customization

### Modifying Loop Behavior

Edit `pace-orchestrator/SKILL.md` to change:
- Stopping conditions
- Session delay
- Progress tracking

### Adding New Feature Categories

Update the category list in `pace-init/SKILL.md`:
- Add new category names
- Adjust priority recommendations

### Custom Validation Rules

Add new checks to `pace-validate/SKILL.md`:
- Field format validation
- Business rule validation
- Cross-feature validation
