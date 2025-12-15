# Continuation Strategies

This document describes the various approaches for ensuring agents continue working through features automatically.

## Overview

The long-running agent harness supports three continuation strategies:

| Strategy              | Scope                    | Automation Level | Best For        |
| --------------------- | ------------------------ | ---------------- | --------------- |
| In-Context            | Single context window    | Semi-automatic   | Quick sessions  |
| Coordinator Agent     | Single context window    | Automatic        | Medium projects |
| External Orchestrator | Multiple context windows | Fully automatic  | Large projects  |

## Strategy 1: In-Context Continuation

The coding agent continues to the next feature within the same context window.

### How It Works

After completing a feature, the agent:

1. Checks for remaining features
2. Immediately begins the next feature
3. Continues until context limit or blocker

### Activation

Add to project's CLAUDE.md:

```markdown
## Automatic Continuation

After completing any feature, immediately continue to the next feature.
Do NOT wait for user confirmation between features.
```

Or use the `/coordinate` command.

### Limitations

- Limited by context window size
- May slow down as context fills
- Stops at context boundary

## Strategy 2: Coordinator Agent

A specialized agent mode that manages multiple feature implementations.

### How It Works

The coordinator agent:

1. Runs a loop within a single session
2. Executes coding workflow for each feature
3. Handles transitions automatically
4. Tracks progress across features

### Activation

```
/coordinate
```

Or invoke with:

```
You are the Coordinator Agent. Run continuous coding sessions until all features pass or a blocker is encountered.
```

### Advantages

- Maintains momentum within session
- Better progress tracking
- Cleaner session logs

### Limitations

- Still bounded by context window
- Complex context management

## Strategy 3: External Orchestrator

A Python script that runs outside Claude and manages multiple sessions.

### How It Works

The orchestrator:

1. Runs as an external process
2. Invokes Claude for each session
3. Monitors progress after each session
4. Triggers next session automatically
5. Handles failures and retries

### Activation

```bash
# Run until complete
python scripts/orchestrator.py --until-complete

# Run N sessions
python scripts/orchestrator.py --max-sessions 20

# With custom failure threshold
python scripts/orchestrator.py --until-complete --max-failures 5
```

### Advantages

- True multi-context-window operation
- Survives context exhaustion
- Robust failure handling
- Progress monitoring

### Configuration Options

```
--project-dir PATH    Project directory
--max-sessions N      Maximum sessions to run
--max-failures N      Stop after N consecutive failures
--delay SECONDS       Wait between sessions
--until-complete      Run until all features pass
--dry-run             Preview without executing
```

### Example Output

```
==================================================
 LONG-RUNNING AGENT ORCHESTRATOR
==================================================

Project: /path/to/project
Max sessions: unlimited
Starting progress: 5/50 features

SESSION 1
=========
Progress: 5/50 features passing
Next feature: F006 - User can edit profile
[Claude session runs...]
✅ Session completed: 1 feature(s) now passing

SESSION 2
=========
Progress: 6/50 features passing
Next feature: F007 - User can upload avatar
[Claude session runs...]
✅ Session completed: 1 feature(s) now passing

...

🎉 All features passing! Project complete!

ORCHESTRATION SUMMARY
=====================
Sessions run: 45
Features completed: 45
Final progress: 50/50 (100%)
Total time: 3:24:15
```

## Strategy 4: Hooks

Shell scripts that run before/after Claude sessions.

### Available Hooks

**pre-session-hook.sh**

- Validates environment
- Checks feature list
- Verifies git status

**post-session-hook.sh**

- Shows progress
- Displays next feature
- Can trigger next session (with AUTO_CONTINUE=true)

### Installation

```bash
cp hooks/*.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.sh
```

### Configuration

Enable auto-continuation:

```bash
AUTO_CONTINUE=true claude ...
```

## Choosing a Strategy

### Use In-Context Continuation when:

- Project is small (<20 features)
- Features are quick to implement
- You're actively monitoring

### Use Coordinator Agent when:

- Project is medium-sized (20-50 features)
- You want progress tracking
- Session will be long but not multi-day

### Use External Orchestrator when:

- Project is large (50+ features)
- Work will span multiple days
- You want fully autonomous operation
- You need robust failure handling

## Combining Strategies

For maximum effectiveness, combine:

1. **CLAUDE.md** with continuation instructions
2. **Coordinator Agent** for in-session efficiency
3. **External Orchestrator** for multi-session runs
4. **Hooks** for monitoring and validation

Example workflow:

```bash
# Start the orchestrator
python scripts/orchestrator.py --until-complete &

# Orchestrator invokes Claude with coordinator behavior
# Each session uses in-context continuation
# Hooks validate between sessions
# Progress accumulates across sessions
```

## Failure Handling

All strategies include failure handling:

### In-Context

- Document blocker in progress file
- Move to next feature if possible
- Stop after 3 consecutive failures

### Coordinator

- Track consecutive failures
- Skip blocked features
- Summarize blockers at end

### Orchestrator

- Count consecutive failures
- Stop at threshold (default: 3)
- Log all attempts
- Enable retry on restart

## Progress Preservation

All strategies preserve progress through:

1. **feature_list.json** - Feature status persists
2. **progress.txt** - Session logs accumulate
3. **Git commits** - Code changes saved
4. **Metadata updates** - Counts stay accurate

This ensures no work is lost between sessions or after failures.
