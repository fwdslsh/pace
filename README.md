# pace: Pragmatic Agent for Compounding Engineering

## Long-Running Agent Harness & Compound Engineering

A Bun/TypeScript implementation that orchestrates continuous coding agent sessions using **multiple agent SDKs** for maximum visibility and flexibility. Supports both the Claude Agent SDK and OpenCode SDK.

## Features

- **Multi-SDK Support**: Choose between Claude Agent SDK or OpenCode SDK at runtime
- **Full Visibility**: Stream all messages, tool uses, and results from agent sessions
- **Automatic Feature Progression**: Works through features in priority order
- **Session Management**: Configurable session limits, failure thresholds, and delays
- **Progress Tracking**: Monitors feature completion and provides detailed statistics
- **Rich Output**: Shows system messages, assistant responses, tool executions, and results
- **JSON Output**: Machine-readable output for scripting and CI/CD integration
- **Home Directory Override**: Custom SDK home directories for testing and multi-environment setups
- **Comprehensive Testing**: Full test suite with 90+ tests covering all functionality

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


## License

CC-BY-4.0 License - see [LICENSE](LICENSE) file for details.
