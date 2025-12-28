# PACE Plugin for Claude Code

Production-ready Claude Code plugin that provides the same functionality as the PACE CLI tool.

## Overview

PACE (Pragmatic Agent for Compounding Engineering) is a workflow orchestrator that automates continuous AI-powered coding sessions. This plugin brings PACE directly into Claude Code.

## Installation

### Option 1: Copy to project

```bash
# From your project root
cp -r pace-plugin .claude/plugins/pace
```

### Option 2: Symlink (for development)

```bash
# From your project root
mkdir -p .claude/plugins
ln -s /path/to/pace/pace-plugin .claude/plugins/pace
```

## Structure

```
pace-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin metadata
├── commands/                     # Slash commands
│   ├── pace-run.md              # /pace-run - Run orchestrator
│   ├── pace-init.md             # /pace-init - Initialize project
│   ├── pace-status.md           # /pace-status - Show progress
│   ├── pace-validate.md         # /pace-validate - Validate features
│   └── pace-update.md           # /pace-update - Update feature status
├── agents/                       # Agent definitions
│   ├── pace-coding.md           # Feature implementation agent
│   └── pace-initializer.md      # Project initialization agent
├── skills/                       # Auto-invoked skills
│   └── pace-orchestration/
│       └── SKILL.md             # Orchestration skill
├── hooks/
│   └── hooks.json               # Event handlers for loop continuation
├── scripts/                      # TypeScript/Bun utilities
│   ├── pace-lib.ts              # Core library
│   ├── pace-progress.ts         # Check progress
│   ├── pace-next.ts             # Get next feature
│   ├── pace-update.ts           # Update feature status
│   └── pace-validate.ts         # Validate feature list
└── README.md
```

## Commands

| Command | Description |
|---------|-------------|
| `/pace-run` | Run the orchestrator loop |
| `/pace-init` | Initialize a new PACE project |
| `/pace-status` | Show current progress |
| `/pace-validate` | Validate feature_list.json |
| `/pace-update F001 pass` | Update feature status |

## How It Works

### 1. Initialize Project

```
/pace-init Build a todo app with authentication
```

Creates:
- `feature_list.json` with 50-200+ features
- `init.sh` development startup script
- `progress.txt` session log

### 2. Run Orchestrator

```
/pace-run
```

The orchestrator:
1. Gets the highest priority failing feature
2. Implements the feature
3. Tests end-to-end
4. Marks as passing
5. Commits to git
6. Continues until complete

### 3. Check Progress

```
/pace-status
```

Shows:
- Progress bar
- Passing/failing counts
- Next features to implement

## Hooks

The `hooks/hooks.json` configures automatic behavior:

### SubagentStop Hook

Runs when an agent tries to stop. If features remain:
- Exits with code 2 (blocking)
- Sends continuation message
- Agent continues to next feature

### PostToolUse Hook

After file writes:
- Shows current progress
- Helps track implementation

## Scripts

All scripts are written in TypeScript and run with Bun:

```bash
# Check progress
bun scripts/pace-progress.ts
bun scripts/pace-progress.ts --json
bun scripts/pace-progress.ts --check  # Exit 2 if incomplete

# Get next feature
bun scripts/pace-next.ts
bun scripts/pace-next.ts --json
bun scripts/pace-next.ts --id

# Update feature
bun scripts/pace-update.ts F001 pass
bun scripts/pace-update.ts F001 fail --json

# Validate
bun scripts/pace-validate.ts
bun scripts/pace-validate.ts --json
```

## Comparison with CLI

| CLI | Plugin |
|-----|--------|
| `pace init` | `/pace-init` |
| `pace run` | `/pace-run` |
| `pace status` | `/pace-status` |
| `pace validate` | `/pace-validate` |
| `pace update F001 pass` | `/pace-update F001 pass` |

## Requirements

- Claude Code 1.0.0+
- Bun runtime (for scripts)

## Files Used

| File | Purpose |
|------|---------|
| `feature_list.json` | Feature definitions and status |
| `progress.txt` | Session history log |
| `init.sh` | Development environment startup |

## License

MIT
