# pace

## Pragmatic Agent for Compounding Engineering

A Bun/TypeScript implementation that orchestrates continuous coding agent sessions using **multiple agent SDKs** for maximum visibility and flexibility. Supports both the Claude Agent SDK and OpenCode SDK.

## Features

- **Multi-SDK Support**: Choose between Claude Agent SDK or OpenCode SDK at runtime
- **OpenCode-Native Architecture**: Custom agents and commands loaded from markdown files
- **Configurable via pace.json**: Customize models, agents, commands, and permissions
- **Full Visibility**: Stream all messages, tool uses, and results from agent sessions
- **Child Session Orchestration**: Spawn autonomous child sessions for feature implementation
- **Automatic Feature Progression**: Works through features in priority order
- **Session Management**: Configurable session limits, failure thresholds, and delays
- **Progress Tracking**: Monitors feature completion and provides detailed statistics
- **Rich Output**: Shows system messages, assistant responses, tool executions, and results
- **JSON Output**: Machine-readable output for scripting and CI/CD integration
- **Home Directory Override**: Custom SDK home directories for testing and multi-environment setups
- **Comprehensive Testing**: Full test suite with 120+ tests covering all functionality

## Installation

### Quick Install (Recommended)

Install the latest version using the installation script:

```bash
# Install system-wide (requires sudo)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash

# Install to user directory (~/.local/bin)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash -s -- --user

# Install specific version
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash -s -- --version v0.1.0
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

- `run` - Run the orchestrator (default)
- `status` - Show project status and progress
- `validate` - Validate feature_list.json structure
- `update` - Update a feature's pass/fail status
- `help` - Show help message

> **For Developers:** If you're running from source, see [docs/development.md](docs/development.md#running-from-source) for usage with `bun run cli.ts`.

### Common Operations Quick Reference

| Task | Command |
|------|---------|
| Run orchestrator | `pace` |
| Check status | `pace status` |
| Validate features | `pace validate` |
| Update feature | `pace update F001 pass` |
| Use OpenCode SDK | `pace --sdk opencode` |
| Run until complete | `pace --until-complete` |
| Get help | `pace help` |

### Quick Start

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

**Using OpenCode SDK:**

```bash
pace run --sdk opencode
```

**Override SDK home directory:**

```bash
# Useful for testing or multi-environment setups
pace run --home-dir /custom/path/.claude
pace run --home-dir ~/.config/opencode-test
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
--sdk SDK                Agent SDK to use: 'claude' or 'opencode' (default: claude)
--project-dir, -d DIR    Project directory (default: current directory)
--home-dir DIR           Override SDK home directory (~/.claude or ~/.config/opencode)
--max-sessions, -n N     Maximum number of sessions to run (default: 10)
--max-failures, -f N     Stop after N consecutive failures (default: 3)
--delay SECONDS          Seconds to wait between sessions (default: 5)
--until-complete         Run until all features pass (implies unlimited sessions)
--dry-run                Show what would be done without executing
--json                   Output results in JSON format
--help, -h               Show this help message
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

### Environment Variables

**For Claude SDK (default):**

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

**For OpenCode SDK:**

```bash
# Optional - defaults to http://localhost:4096
export OPENCODE_SERVER_URL=http://localhost:4096
```

## How It Works

### Workflow

1. **Orient**: Reads project state from `feature_list.json` and `claude-progress.txt`
2. **Select Feature**: Chooses the next failing feature by priority (critical → high → medium → low)
3. **Execute**: Invokes Claude Agent SDK with the coding agent prompt
4. **Stream Output**: Shows all system messages, tool uses, and results in real-time
5. **Verify**: Checks if the feature was marked as passing in `feature_list.json`
6. **Repeat**: Continues to next feature or stops based on conditions

### Stopping Conditions

The orchestrator stops when:

- All features are passing (success!)
- Maximum sessions reached
- Maximum consecutive failures reached
- User interrupts (Ctrl+C)

### Output Examples

**System Initialization:**

```
📋 Session initialized:
  - Model: claude-sonnet-4-5-20250929
  - CWD: /path/to/project
  - Tools: Read, Write, Edit, Bash, Grep, Glob, ...
  - Permission mode: acceptEdits
```

**Tool Execution:**

```
🔧 Tool: Read
   Input: {
     "file_path": "/path/to/file.ts",
     "offset": 1,
     "limit": 50
   }

✅ Tool result: [file contents...]
```

**Session Result:**

```
🎯 Session Result
============================================================
Status: success
Turns: 12
Duration: 45.32s
API Time: 38.21s
Cost: $0.0234
Tokens: 15234 in / 2891 out
Cache: 12890 read / 0 created

Result: Feature AUTH-001 implemented successfully
============================================================
```

## SDK Comparison

### Claude Agent SDK

The default SDK provides rich integration with Anthropic's Claude:

1. **Full Tool Visibility**: See every tool call Claude makes with inputs and outputs
2. **Session Management**: Automatic conversation history and context management
3. **Permission Control**: Fine-grained control over file edits and command execution
4. **Cost Tracking**: Built-in usage and cost reporting per session
5. **Project Context**: Automatic loading of `CLAUDE.md` and project settings
6. **Better Debugging**: Clear visibility into why Claude makes each decision

**Usage:**

```bash
pace --sdk claude --max-sessions 10
```

**Requirements:**

- `ANTHROPIC_API_KEY` environment variable
- Internet connection to Anthropic API

### OpenCode SDK

Alternative SDK for OpenCode-powered agent sessions:

1. **Local or Remote**: Connect to local or hosted OpenCode servers
2. **Event Streaming**: Real-time session events and status updates
3. **Flexible Backend**: Support for multiple AI providers
4. **Session Management**: Create and monitor sessions programmatically

**Usage:**

```bash
# Local OpenCode server (default)
pace --sdk opencode

# Remote OpenCode server
OPENCODE_SERVER_URL=http://your-server:4096 pace --sdk opencode
```

**Requirements:**

- OpenCode server running (default: `http://localhost:4096`)
- Optional: Custom server URL via `OPENCODE_SERVER_URL`

### Which SDK to Choose?

| Feature              | OpenCode SDK |Claude SDK  |
| -------------------- | ------------ |----------  |
| Cost Tracking        | ✅           | ✅         |
| Tool Call Details    | ✅           | ✅         |
| Streaming Events     | ✅           | ✅         |
| Local Execution      | ✅           | ❌         |
| Multiple Providers   | ✅           | ❌         |
| Built-in Permissions | ✅           | ✅         |
| Requires API Key     | Varies       | ✅         |

## OpenCode-Native Orchestrator

For deeper integration with OpenCode, use the standalone `pace-opencode` orchestrator. This version uses the OpenCode SDK's embedded server capabilities for maximum control:

### Features

- **Embedded Server**: Spawns its own OpenCode server instance
- **Event Streaming**: Real-time monitoring via Server-Sent Events
- **Session Metrics**: Tracks tool calls, duration, and success rates
- **Self-Contained**: No external OpenCode server required
- **Configurable via pace.json**: Customize models, agents, and behavior

### Usage

```bash
# Run the OpenCode-native orchestrator
bun run opencode-orchestrator.ts

# Or use the npm script
bun run opencode

# With options
bun run opencode -- --max-sessions 10 --verbose

# Preview mode
bun run opencode:dry-run
```

### Options

```
--project-dir, -d DIR    Project directory (default: current directory)
--port N                 Port for OpenCode server (default: random)
--max-sessions, -n N     Maximum sessions (default: from pace.json or unlimited)
--max-failures, -f N     Stop after N consecutive failures (default: from pace.json or 3)
--verbose, -v            Show detailed output
--dry-run                Preview without executing
--help, -h               Show this help
```

### Configuration (pace.json)

Create a `pace.json`, `pace.config.json`, or `.pace.json` file in your project root:

```json
{
  "defaultModel": "anthropic/claude-sonnet-4-20250514",
  "agents": {
    "pace-coding": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "pace-code-reviewer": {
      "model": "anthropic/claude-opus-4-20250514"
    },
    "pace-practices-reviewer": {
      "enabled": false
    }
  },
  "commands": {
    "pace-review": {
      "agent": "pace-code-reviewer"
    }
  },
  "orchestrator": {
    "maxSessions": 50,
    "maxFailures": 5,
    "sessionDelay": 5000
  },
  "permissions": {
    "autoAllowEdit": true,
    "autoAllowSafeBash": true,
    "allowedBashPatterns": ["git *", "npm *", "bun *"]
  }
}
```

CLI arguments override config file settings.

## OpenCode Plugin

For interactive use within OpenCode, install the pace plugin to add custom tools, agents, and commands:

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

| Agent | Description |
|-------|-------------|
| **pace-coding** | Implements a single feature following the pace workflow |
| **pace-coordinator** | Orchestrates multiple coding sessions |
| **pace-initializer** | Sets up new pace projects |
| **pace-code-reviewer** | Reviews code for quality, security, and best practices |
| **pace-practices-reviewer** | Captures learnings and patterns from completed work |

### Custom Commands

The plugin provides eight slash commands (loaded from `src/opencode/commands/`):

| Command | Description |
|---------|-------------|
| `/pace-init` | Initialize a new pace project |
| `/pace-next` | Implement the next highest-priority feature |
| `/pace-continue [id]` | Continue work on a specific or next feature |
| `/pace-coordinate` | Run continuous sessions until complete |
| `/pace-review` | Review code changes |
| `/pace-compound` | Capture learnings and patterns |
| `/pace-status` | Show current project progress |
| `/pace-complete <id>` | Mark a feature as complete |

### Custom Tools

The plugin adds tools for workflow management:

| Tool | Description |
|------|-------------|
| `pace_get_status` | Get feature progress and next recommended feature |
| `pace_get_next_feature` | Get the highest-priority failing feature |
| `pace_get_feature` | Get detailed information about a specific feature |
| `pace_update_feature` | Mark a feature as passing or failing |
| `pace_list_failing` | List all failing features sorted by priority |
| `pace_spawn_session` | Spawn a child session for feature implementation |
| `pace_orchestrate` | Run full orchestration loop with child sessions |

### Child Session Orchestration

The plugin supports spawning child sessions for autonomous feature implementation:

```
> /pace-coordinate --max-sessions 10

Starting orchestration...
Session 1: Implementing F001 - User authentication...
  [Session completed in 45s - Feature now passing]
Session 2: Implementing F002 - Dashboard layout...
  [Session completed in 38s - Feature now passing]
...
Orchestration complete: 8/10 features passing
```

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


## License

CC-BY-4.0 License - see [LICENSE](LICENSE) file for details.
