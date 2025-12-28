# PACE Skills for Claude Code

**IMPORTANT**: This directory contains reference copies. The actual working skills are installed in `.claude/skills/`.

## Installed Location

The PACE skills and supporting infrastructure are installed at:

```
.claude/
├── settings.json              # Hooks configuration (critical for loop continuation)
├── scripts/                   # Helper scripts used by skills and hooks
│   ├── pace-progress.py       # Check progress, supports --check for hooks
│   ├── pace-next-feature.py   # Get next feature to implement
│   ├── pace-update-feature.py # Update feature pass/fail status
│   └── pace-validate.py       # Validate feature_list.json
└── skills/                    # Skill definitions
    ├── orchestrating-features/
    │   └── SKILL.md           # Main orchestration loop
    ├── initializing-project/
    │   └── SKILL.md           # Project initialization
    ├── checking-progress/
    │   └── SKILL.md           # Status reporting
    ├── validating-features/
    │   └── SKILL.md           # Feature validation
    └── updating-features/
        └── SKILL.md           # Manual status updates
```

## How Skills Work in Claude Code

### Discovery
Claude Code discovers skills from:
1. `.claude/skills/` (project-level) ← **Where these are installed**
2. `~/.config/claude/skills/` (user-level)

### Activation
Skills are activated by semantic matching against their description. When you say something like "run pace" or "orchestrate features", Claude Code matches it to the `orchestrating-features` skill.

### Hooks
Hooks in `.claude/settings.json` enable autonomous behavior:
- **SubagentStop**: Runs `pace-progress.py --check` to block stopping if features remain
- **PostToolUse**: Shows progress after file writes

## Available Skills

| Skill Name | Invocation Examples | Purpose |
|------------|---------------------|---------|
| `orchestrating-features` | "run pace", "orchestrate features" | Autonomous feature implementation loop |
| `initializing-project` | "init pace", "initialize project" | Set up new PACE project |
| `checking-progress` | "pace status", "check progress" | Show project status |
| `validating-features` | "validate features" | Validate feature_list.json |
| `updating-features` | "update F001 pass" | Manual status updates |

## Helper Scripts

The `.claude/scripts/` directory contains Python scripts that provide reusable functionality:

| Script | Usage | Description |
|--------|-------|-------------|
| `pace-progress.py` | `python3 .claude/scripts/pace-progress.py` | Check overall progress |
| `pace-progress.py --json` | JSON output | Machine-readable progress |
| `pace-progress.py --check` | For hooks | Exit 2 if incomplete (triggers continuation) |
| `pace-next-feature.py` | Get next feature | Returns highest priority failing feature |
| `pace-update-feature.py F001 pass` | Update status | Mark feature as passing/failing |
| `pace-validate.py` | Validate structure | Check feature_list.json for errors |

## Workflow

### New Project
```
1. "initialize project" or "init pace"
2. Review generated feature_list.json
3. "run pace" or "orchestrate features"
```

### Continuing
```
1. "check progress" to see status
2. "run pace" to continue orchestration
```

### Manual Control
```
- "validate features" to check structure
- "update F001 pass" to mark feature manually
```

## Comparison with CLI

| CLI | Skill |
|-----|-------|
| `pace init` | initializing-project |
| `pace run` | orchestrating-features |
| `pace status` | checking-progress |
| `pace validate` | validating-features |
| `pace update F001 pass` | updating-features |

## Re-installation

If you need to reinstall or move to another project:

```bash
# Copy entire .claude directory
cp -r .claude /path/to/other/project/

# Or just the skills
cp -r .claude/skills/* /path/to/other/project/.claude/skills/
cp -r .claude/scripts/* /path/to/other/project/.claude/scripts/
cp .claude/settings.json /path/to/other/project/.claude/settings.json
```

## Note on Old Directory

The `skills/pace-*` directories in this folder are the original (incorrect) location. They are kept for reference but are NOT used by Claude Code. The working skills are in `.claude/skills/`.
