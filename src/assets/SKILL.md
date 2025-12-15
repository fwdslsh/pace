---
name: long-running-agent-harness
description: Orchestrate long-running software development across multiple context windows using a two-agent architecture (initializer + coding agent). Use when starting new development projects, resuming work on existing projects, or implementing features incrementally. Enables consistent progress through structured artifacts (feature_list.json, claude-progress.txt, init.sh) and strict incremental workflows.
---

# Long-Running Agent Harness

Enable consistent progress on software projects across multiple context windows using structured artifacts and incremental workflows.

## Core Architecture

Two specialized agent modes work together:

1. **Initializer Agent** - First session only: sets up environment scaffold
2. **Coding Agent** - All subsequent sessions: makes incremental progress

## Quick Start

**Starting a new project:**

```bash
# Read and follow references/initializer-agent.md
```

**Resuming work:**

```bash
# Read and follow references/coding-agent.md
```

## Required Artifacts

All projects MUST maintain these files in the project root:

| File                  | Purpose                            | Format                |
| --------------------- | ---------------------------------- | --------------------- |
| `feature_list.json`   | All features with pass/fail status | JSON (see templates/) |
| `claude-progress.txt` | Session-by-session progress log    | Markdown              |
| `init.sh`             | Environment setup and dev server   | Bash script           |

## Critical Rules

1. **JSON for features** - Use JSON, not Markdown. Claude is less likely to inappropriately modify JSON.
2. **One feature at a time** - Never work on multiple features simultaneously.
3. **Never edit tests** - Only change the `passes` field. Do not remove, rename, or modify feature descriptions.
4. **Test before marking complete** - End-to-end verification required before setting `passes: true`.
5. **Clean state always** - Every session ends with committed, working code.
6. **Git discipline** - Descriptive commits after each meaningful change.

## Workflow Overview

### Initializer Agent (First Run)

1. Analyze user requirements
2. Generate comprehensive `feature_list.json` (all features marked `passes: false`)
3. Create `init.sh` script
4. Initialize `claude-progress.txt`
5. Make initial git commit

See: [references/initializer-agent.md](references/initializer-agent.md)

### Coding Agent (Subsequent Runs)

1. Orient: `pwd`, read progress file, read git log
2. Run `init.sh` to start dev environment
3. Sanity test: verify basic functionality works
4. Select ONE failing feature from `feature_list.json`
5. Implement the feature
6. Do a thorough code review, and address all of the issues
7. Test end-to-end (browser automation if applicable)
8. Update `passes: true` only after verification
9. Git commit with descriptive message
10. Update `claude-progress.txt`

See: [references/coding-agent.md](references/coding-agent.md)

## Templates

Copy templates from `templates/` directory:

- `templates/feature_list.json` - Feature list structure
- `templates/claude-progress.txt` - Progress log format
- `templates/init.sh` - Dev environment script template

## Failure Mode Prevention

| Problem                        | Prevention                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| Declaring victory too early    | Comprehensive feature list with explicit pass/fail tracking |
| Bugs or undocumented progress  | Git commits + progress file updates every session           |
| Premature feature completion   | End-to-end testing required before marking `passes: true`   |
| Time wasted figuring out setup | `init.sh` script provides consistent startup                |
| Trying to do too much          | Strict one-feature-at-a-time rule                           |

## Testing Requirements

For web applications, use browser automation (Puppeteer, Playwright) to:

- Navigate to the application
- Interact as a user would
- Verify expected behavior visually
- Take screenshots for verification

Unit tests and curl commands are insufficient - always verify end-to-end.

## Automatic Continuation

To work through multiple features without stopping:

| Approach     | Use Case                     | Reference                     |
| ------------ | ---------------------------- | ----------------------------- |
| In-context   | Single session, <20 features | Add instructions to CLAUDE.md |
| Coordinator  | Single session, continuous   | `/coordinate` command         |
| Orchestrator | Multi-session, autonomous    | `scripts/orchestrator.py`     |

See: [references/continuation-strategies.md](references/continuation-strategies.md)

### Quick Start: Continuous Mode

For automatic feature-by-feature progress:

```
/coordinate
```

For fully autonomous multi-session operation:

```bash
python scripts/orchestrator.py --until-complete
```
