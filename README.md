# pace

## Pragmatic Agent for Compounding Engineering

A Bun/TypeScript workflow orchestrator built on the **OpenCode SDK** for maximum flexibility and control. Pace automates continuous coding agent sessions, working through features in priority order until your project is complete.

## Features

- **Built on OpenCode SDK**: Full access to OpenCode's capabilities including custom agents, plugins, and model selection
- **Configurable via pace.json**: Customize models, agents, orchestration behavior, and permissions
- **Full Visibility**: Stream all messages, tool uses, and results from agent sessions
- **Automatic Feature Progression**: Works through features in priority order
- **Session Management**: Configurable session limits, failure thresholds, and delays
- **Progress Tracking**: Monitors feature completion and provides detailed statistics
- **Project Archiving**: Automatically archives existing project files when re-initializing, preserving previous work in timestamped directories
- **Rich Output**: Shows system messages, assistant responses, tool executions, and results
- **JSON Output**: Machine-readable output for scripting and CI/CD integration
- **Comprehensive Testing**: Full test suite with 100+ tests covering all functionality

## Installation

### Quick Install (Recommended)

Install the latest version using the installation script:

```bash
# Install system-wide (requires sudo)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash

# Install to user directory (~/.local/bin)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash -s -- --user

# Install specific version
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash -s -- --version v0.2.0
```

### Install via NPM

```bash
# Global installation
npm install -g @fwdslsh/pace

# Or use npx (no installation required)
npx @fwdslsh/pace --help
```

## Usage

`pace` provides multiple commands for different tasks.

### CLI Command Formats

```bash
pace [COMMAND] [OPTIONS]               # Installed globally
npx @fwdslsh/pace [COMMAND] [OPTIONS]  # Using npx (no install)
```

**Available Commands:**

- `init` - Initialize a new pace project with features
- `run` - Run the orchestrator (default)
- `status` - Show project status and progress
- `validate` - Validate feature_list.json structure
- `update` - Update a feature's pass/fail status
- `help` - Show help message

> **For Developers:** If you're running from source, see [docs/development.md](docs/development.md#running-from-source) for usage with `bun run cli.ts`.

### Common Operations Quick Reference

| Task               | Command                           |
| ------------------ | --------------------------------- |
| Initialize project | `pace init -p "Build a todo app"` |
| Run orchestrator   | `pace`                            |
| Run until complete | `pace --until-complete`           |
| Check status       | `pace status`                     |
| Validate features  | `pace validate`                   |
| Update feature     | `pace update F001 pass`           |
| Get help           | `pace help`                       |

### Quick Start

**Initialize a new pace project:**

```bash
# From a prompt
pace init -p "Build a todo app with user authentication and categories"

# From a requirements file
pace init --file requirements.txt

# Or inline
pace init "Build a REST API for inventory management"
```

This creates:

- `feature_list.json` with 50-200+ features
- `init.sh` development environment script
- `progress.txt` progress log
- Git repository with initial commit

**Run the orchestrator:**

```bash
pace
# or explicitly
pace run --max-sessions 10
```

**Check project status:**

```bash
pace status
pace status --verbose
pace status --json   # JSON output for scripting
```

**Validate feature list:**

```bash
pace validate
pace validate --json  # JSON output
```

**Update feature status:**

```bash
pace update F001 pass
pace update F002 fail
pace update F001 pass --json  # JSON output
```

### Common Options

**Run until all features pass:**

```bash
pace --until-complete
```

**Run a specific number of sessions:**

```bash
pace --max-sessions 20
```

**Adjust failure tolerance:**

```bash
pace --max-failures 5
```

**Preview without executing:**

```bash
pace --dry-run --max-sessions 5
```

### Command Options

**Run Command:**

```
--project-dir, -d DIR    Project directory (default: current directory)
--max-sessions, -n N     Maximum number of sessions to run (default: 10)
--max-failures, -f N     Stop after N consecutive failures (default: 3)
--delay SECONDS          Seconds to wait between sessions (default: 5)
--until-complete         Run until all features pass (implies unlimited sessions)
--dry-run                Show what would be done without executing
--verbose, -v            Show detailed output
--json                   Output results in JSON format
--help, -h               Show this help message
```

**Init Command:**

```
--prompt, -p TEXT        Project description prompt
--file PATH              Path to file containing project description
--dry-run                Show what would be done without executing
--verbose, -v            Show detailed output during initialization
--json                   Output results in JSON format
```

**Status Command:**

```
--verbose, -v            Show detailed breakdown by category
--json                   Output results in JSON format
--project-dir, -d DIR    Project directory (default: current directory)
```

**Validate Command:**

```
--json                   Output results in JSON format
--project-dir, -d DIR    Project directory (default: current directory)
```

**Update Command:**

```
pace update <feature-id> <pass|fail>
--json                   Output results in JSON format
--project-dir, -d DIR    Project directory (default: current directory)
```

## How It Works

### Project Archiving

When you run `pace init` in a directory that already contains project files (`feature_list.json` or `progress.txt`), pace automatically archives the existing files before initializing a new project. This allows you to safely start fresh while preserving your previous work.

**When Archiving Occurs:**

- Running `pace init` when `feature_list.json` already exists
- Files are moved to `.runs/<timestamp>/` before new initialization
- Previous project state is preserved for reference or recovery

**Archive Directory Structure:**

```
.runs/
├── 2025-12-15_17-00-00/
│   ├── feature_list.json
│   └── progress.txt
├── 2025-12-16_10-30-45/
│   ├── feature_list.json
│   └── progress.txt
└── 2025-12-17_14-22-18/
    ├── feature_list.json
    └── progress.txt
```

Each archive directory is named using the timestamp from `metadata.last_updated` in your `feature_list.json`. If this field is missing, pace uses the current timestamp as a fallback. The format is `YYYY-MM-DD_HH-MM-SS` for easy sorting and readability.

**Example Scenario:**

```bash
# First project initialization
$ pace init -p "Build a todo app"
✓ Created feature_list.json (50 features)
✓ Created progress.txt
✓ Created init.sh

# Later, start a new project in the same directory
$ pace init -p "Build an inventory system"
📂 Existing project files found
📦 Archiving to .runs/2025-12-15_17-00-00/
✓ Archived feature_list.json
✓ Archived progress.txt
✓ Created feature_list.json (75 features)
✓ Created progress.txt
✓ Created init.sh
```

The `.runs/` directory is automatically added to `.gitignore` to prevent archived runs from being committed to version control, though you can customize this behavior if you want to track your project history.

**Customizing Archive Directory:**

You can configure a custom archive directory by adding an `archiveDir` setting to your `pace.json` file:

```json
{
  "pace": {
    "archiveDir": ".archives"
  }
}
```

With this configuration, archives will be stored in `.archives/<timestamp>/` instead of the default `.runs/<timestamp>/`. This is useful if you want to:

- Use a more descriptive directory name
- Keep archives in a different location
- Match your project's existing archive structure

### Workflow

1. **Orient**: Reads project state from `feature_list.json` and progress files
2. **Select Feature**: Chooses the next failing feature by priority (critical → high → medium → low)
3. **Execute**: Creates an OpenCode session with the coding agent prompt
4. **Stream Output**: Shows all tool uses and results in real-time
5. **Verify**: Checks if the feature was marked as passing in `feature_list.json`
6. **Repeat**: Continues to next feature or stops based on conditions

### Stopping Conditions

The orchestrator stops when:

- All features are passing (success!)
- Maximum sessions reached
- Maximum consecutive failures reached
- User interrupts (Ctrl+C)

### Output Examples

**Session Start:**

```
============================================================
SESSION 1: Feature F001
============================================================
Description: Implement user authentication with JWT tokens...
Priority: critical
Category: auth
```

**Session Summary:**

```
------------------------------------------------------------
Session Summary:
  Duration: 45.3s
  Tool calls: 23
  Feature completed: Yes
------------------------------------------------------------
```

**Orchestration Summary:**

```
============================================================
 ORCHESTRATION SUMMARY
============================================================
Sessions run: 5
Features completed: 4
Final progress: 12/15 (80.0%)
Total time: 5m 23s
Complete: No
============================================================
```

## Configuration

### pace.json

Pace uses the same configuration format as OpenCode, extended with a `pace` section for CLI-specific settings. Create a `pace.json`, `pace.config.json`, or `.pace.json` file in your project root:

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "agent": {
    "pace-coding": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "pace-code-reviewer": {
      "model": "anthropic/claude-opus-4-20250514"
    }
  },
  "command": {
    "pace-review": {
      "agent": "pace-code-reviewer"
    }
  },
  "permission": {
    "edit": "allow",
    "bash": {
      "*": "ask",
      "git *": "allow",
      "npm *": "allow",
      "bun *": "allow"
    }
  },
  "pace": {
    "orchestrator": {
      "maxSessions": 50,
      "maxFailures": 5,
      "sessionDelay": 5000
    }
  }
}
```

The configuration uses OpenCode's schema with these additions:

- **model**: Default model for all agents (format: `provider/model-name`)
- **agent**: Per-agent model overrides (e.g., `pace-coding`, `pace-initializer`)
- **command**: Command configurations
- **permission**: OpenCode's native permission system
- **pace**: CLI-specific settings (stripped before passing to OpenCode)
  - **orchestrator.maxSessions**: Maximum sessions to run
  - **orchestrator.maxFailures**: Stop after N consecutive failures
  - **orchestrator.sessionDelay**: Delay between sessions (ms)

CLI arguments override config file settings.

## OpenCode Plugin

For interactive use within OpenCode TUI, install the pace plugin to add custom tools, agents, and commands:

### Installation

```bash
# Copy to project-local plugin directory
mkdir -p .opencode/plugin
cp pace-plugin.ts .opencode/plugin/

# Or install globally
mkdir -p ~/.config/opencode/plugin
cp pace-plugin.ts ~/.config/opencode/plugin/
```

### Custom Agents

The plugin provides five specialized agents (loaded from `src/opencode/agents/`):

| Agent                       | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| **pace-coding**             | Implements a single feature following the pace workflow |
| **pace-coordinator**        | Orchestrates multiple coding sessions                   |
| **pace-initializer**        | Sets up new pace projects                               |
| **pace-code-reviewer**      | Reviews code for quality, security, and best practices  |
| **pace-practices-reviewer** | Captures learnings and patterns from completed work     |

### Custom Commands

The plugin provides eight slash commands (loaded from `src/opencode/commands/`):

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `/pace-init`          | Initialize a new pace project               |
| `/pace-next`          | Implement the next highest-priority feature |
| `/pace-continue [id]` | Continue work on a specific or next feature |
| `/pace-coordinate`    | Run continuous sessions until complete      |
| `/pace-review`        | Review code changes                         |
| `/pace-compound`      | Capture learnings and patterns              |
| `/pace-status`        | Show current project progress               |
| `/pace-complete <id>` | Mark a feature as complete                  |

### Custom Tools

The plugin adds tools for workflow management:

| Tool                    | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `pace_get_status`       | Get feature progress and next recommended feature |
| `pace_get_next_feature` | Get the highest-priority failing feature          |
| `pace_get_feature`      | Get detailed information about a specific feature |
| `pace_update_feature`   | Mark a feature as passing or failing              |
| `pace_list_failing`     | List all failing features sorted by priority      |
| `pace_spawn_session`    | Spawn a child session for feature implementation  |
| `pace_orchestrate`      | Run full orchestration loop with child sessions   |

### Example Session

```
> /pace-status
Progress: 5/12 features passing (41.7%)
Next feature: AUTH-003 - Add password reset flow

> /pace-next
Beginning work on AUTH-003...
[Agent follows the pace workflow automatically]

> /pace-review
Reviewing recent changes...
[Code reviewer agent analyzes changes]

> /pace-complete AUTH-003
Feature AUTH-003 marked as passing.
```

## Architecture

Pace is built on the OpenCode SDK, which provides:

- **Embedded Server**: Spawns its own OpenCode server instance
- **Event Streaming**: Real-time monitoring via Server-Sent Events
- **Session Metrics**: Tracks tool calls, duration, and success rates
- **Self-Contained**: No external dependencies required
- **Flexible Backend**: Support for multiple AI providers

### Agent Workflow

Each coding session follows a structured workflow:

1. **Orient** - Read project state, progress files, and recent changes
2. **Start Environment** - Run init.sh to prepare the development environment
3. **Sanity Test** - Verify basic functionality works
4. **Implement** - Write code for the assigned feature
5. **Test End-to-End** - Verify the feature works as expected
6. **Update Status** - Mark feature as passing in feature_list.json
7. **Commit** - Git commit with descriptive message
8. **Update Progress** - Add session entry to progress log

## Development

### Running from Source

```bash
# Clone the repository
git clone https://github.com/fwdslsh/pace.git
cd pace

# Install dependencies
bun install

# Run tests
bun test

# Run CLI
bun run cli.ts --help
bun run cli.ts init -p "My project" --dry-run
bun run cli.ts run --max-sessions 5 --dry-run
```

### Building

```bash
# Build for current platform
bun run build

# Build for all platforms
bun run build:all
```

### Linting

The project uses ESLint and Prettier to ensure code quality and consistent formatting.

```bash
# Run linter to check for code issues
bun run lint

# Format all source files with Prettier
bun run format
```

## License

CC-BY-4.0 License - see [LICENSE](LICENSE) file for details.
