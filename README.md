# Orchestrator - Long-Running Agent Harness

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

### Install from Source

For development or building from source:

```bash
git clone https://github.com/fwdslsh/pace.git
cd pace
bun install
bun run cli.ts --help
```

### Build Binaries

To create standalone executables:

```bash
# Build for current platform
bun run build

# Build for all platforms
bun run build:all
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

## Usage

The orchestrator provides multiple commands for different tasks:

```bash
bun run cli.ts [COMMAND] [OPTIONS]
```

**Available Commands:**
- `run` - Run the orchestrator (default)
- `status` - Show project status and progress
- `validate` - Validate feature_list.json structure
- `update` - Update a feature's pass/fail status
- `help` - Show help message

### Quick Start

**Run the orchestrator:**

```bash
bun run cli.ts
# or explicitly
bun run cli.ts run --max-sessions 10
```

**Check project status:**

```bash
bun run cli.ts status
bun run cli.ts status --verbose
bun run cli.ts status --json   # JSON output for scripting
```

**Validate feature list:**

```bash
bun run cli.ts validate
bun run cli.ts validate --json  # JSON output
```

**Update feature status:**

```bash
bun run cli.ts update F001 pass
bun run cli.ts update F002 fail
bun run cli.ts update F001 pass --json  # JSON output
```

**Using OpenCode SDK:**

```bash
bun run cli.ts run --sdk opencode
```

**Override SDK home directory:**

```bash
# Useful for testing or multi-environment setups
bun run cli.ts run --home-dir /custom/path/.claude
bun run cli.ts run --home-dir ~/.config/opencode-test
```

### Common Options

**Run until all features pass:**

```bash
bun run cli.ts --until-complete
# or
npm run cli:complete
```

**Run a specific number of sessions:**

```bash
bun run cli.ts --max-sessions 20
```

**Adjust failure tolerance:**

```bash
bun run cli.ts --max-failures 5
```

**Preview without executing:**

```bash
bun run cli.ts --dry-run --max-sessions 5
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
bun run cli.ts update <feature-id> <pass|fail>
--json                   Output results in JSON format
--project-dir, -d DIR    Project directory (default: current directory)
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

## JSON Output for Scripting and CI/CD

All commands support `--json` flag for machine-readable output, perfect for scripting and CI/CD integration.

### Status JSON Output

```bash
bun run cli.ts status --json
```

```json
{
  "progress": {
    "passing": 5,
    "failing": 3,
    "total": 8,
    "percentage": 62.5
  },
  "projectName": "My Project",
  "nextFeatures": [
    {
      "id": "F001",
      "description": "Feature description",
      "priority": "high",
      "category": "core"
    }
  ],
  "workingDirectory": "/path/to/project"
}
```

### Validation JSON Output

```bash
bun run cli.ts validate --json
```

```json
{
  "valid": true,
  "errorCount": 0,
  "errors": [],
  "stats": {
    "total": 8,
    "passing": 5,
    "failing": 3,
    "byCategory": {
      "core": 3,
      "ui": 2,
      "api": 3
    },
    "byPriority": {
      "critical": 1,
      "high": 3,
      "medium": 3,
      "low": 1
    }
  }
}
```

### Update JSON Output

```bash
bun run cli.ts update F001 pass --json
```

```json
{
  "success": true,
  "featureId": "F001",
  "oldStatus": "failing",
  "newStatus": "passing",
  "description": "Feature description",
  "category": "core",
  "progress": {
    "passing": 6,
    "total": 8,
    "percentage": 75
  }
}
```

### Run JSON Output

```bash
bun run cli.ts run --json --max-sessions 5
```

```json
{
  "sdk": "claude",
  "sessionsRun": 5,
  "featuresCompleted": 2,
  "finalProgress": "7/8",
  "completionPercentage": 87.5,
  "elapsedTime": "5m 32s",
  "isComplete": false,
  "progress": {
    "passing": 7,
    "total": 8
  }
}
```

### CI/CD Integration Example

```bash
#!/bin/bash
# ci-test.sh - Run orchestrator and check exit code

# Run orchestrator
bun run cli.ts run --max-sessions 10 --json > results.json
EXIT_CODE=$?

# Parse results
PASSING=$(jq '.progress.passing' results.json)
TOTAL=$(jq '.progress.total' results.json)

echo "Test Results: $PASSING/$TOTAL features passing"

# Exit with orchestrator's exit code (0 if complete, 1 if incomplete)
exit $EXIT_CODE
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
bun run cli.ts --sdk claude --max-sessions 10
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
bun run cli.ts --sdk opencode

# Remote OpenCode server
OPENCODE_SERVER_URL=http://your-server:4096 bun run cli.ts --sdk opencode
```

**Requirements:**
- OpenCode server running (default: `http://localhost:4096`)
- Optional: Custom server URL via `OPENCODE_SERVER_URL`

### Which SDK to Choose?

| Feature              | Claude SDK | OpenCode SDK |
| -------------------- | ---------- | ------------ |
| Cost Tracking        | ✅         | ❌           |
| Tool Call Details    | ✅         | ✅           |
| Streaming Events     | ✅         | ✅           |
| Local Execution      | ❌         | ✅           |
| Multiple Providers   | ❌         | ✅           |
| Built-in Permissions | ✅         | ❌           |
| Requires API Key     | ✅         | Varies       |

## Integration with Feature List

The orchestrator expects a `feature_list.json` file in the project directory with this structure:

```json
{
	"features": [
		{
			"id": "AUTH-001",
			"description": "Implement user authentication",
			"priority": "critical",
			"passes": false
		},
		{
			"id": "UI-002",
			"description": "Add dark mode toggle",
			"priority": "medium",
			"passes": true
		}
	],
	"metadata": {
		"lastUpdated": "2025-11-28T10:30:00Z"
	}
}
```

## Troubleshooting

### Claude SDK Issues

**Agent SDK not found:**

```bash
bun install @anthropic-ai/claude-agent-sdk
```

**API key not set:**

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

**Permission errors:**
The orchestrator uses `permissionMode: 'acceptEdits'` to auto-accept file edits. Adjust in the code if you need different behavior.

### OpenCode SDK Issues

**OpenCode SDK not found:**

```bash
bun install @opencode-ai/sdk
```

**Cannot connect to OpenCode server:**

1. Make sure OpenCode server is running:
   ```bash
   # Check if server is accessible
   curl http://localhost:4096/health
   ```

2. Set custom server URL if needed:
   ```bash
   export OPENCODE_SERVER_URL=http://your-server:4096
   ```

**Session events not streaming:**

- OpenCode SDK uses event streaming with session ID filtering
- Check that the OpenCode server is properly emitting events
- Verify network connectivity to the server

### General Issues

**No features progressing:**
Check that:

1. The coding agent prompt is appropriate for your project
2. Features are clearly defined in `feature_list.json`
3. The project environment is properly initialized (see `init.sh`)
4. The selected SDK is properly configured and accessible

## Comparison to Python Version

| Feature       | Python Version           | TypeScript (Bun) Version     |
| ------------- | ------------------------ | ---------------------------- |
| Runtime       | Python 3                 | Bun                          |
| API           | Subprocess to Claude CLI | Claude Agent SDK             |
| Visibility    | Command output only      | Full message streaming       |
| Tool Tracking | None                     | Complete with inputs/outputs |
| Cost Tracking | None                     | Built-in per session         |
| Performance   | Subprocess overhead      | Direct SDK calls             |
| Debugging     | Limited                  | Rich event stream            |

## Project Structure

The codebase is organized into modular components for better maintainability:

```
pace/
├── cli.ts                    # Main CLI entry point
├── src/
│   ├── types.ts              # Shared TypeScript type definitions
│   ├── feature-manager.ts    # Feature list operations (load, save, query)
│   ├── validators.ts         # Feature list validation logic
│   ├── status-reporter.ts    # Status display and reporting
│   ├── orchestrator.ts       # Main orchestration logic
│   └── sdk/
│       ├── base.ts           # SDK abstraction interface
│       ├── claude.ts         # Claude Agent SDK implementation
│       └── opencode.ts       # OpenCode SDK implementation
├── tests/                    # Comprehensive test suite (90+ tests)
│   ├── feature-manager.test.ts
│   ├── validators.test.ts
│   ├── status-reporter.test.ts
│   ├── orchestrator.test.ts
│   └── cli.test.ts
├── examples/
│   ├── show_status.py        # Python reference implementation
│   ├── update_feature.py     # Python reference implementation
│   └── validate_features.py  # Python reference implementation
└── package.json
```

### Module Responsibilities

- **cli.ts**: Command-line interface, argument parsing, command routing
- **orchestrator.ts**: Main orchestration loop, session management, stopping conditions
- **feature-manager.ts**: All operations on feature_list.json (CRUD, queries, statistics)
- **validators.ts**: Validation logic for feature lists, error formatting
- **status-reporter.ts**: Display project status, progress, git history
- **sdk/**: SDK implementations following the AgentSessionRunner interface
  - **base.ts**: Interface definition for SDK runners
  - **claude.ts**: Claude Agent SDK wrapper with full event streaming
  - **opencode.ts**: OpenCode SDK wrapper with event streaming

## Testing

The project includes a comprehensive test suite with 90+ tests covering all functionality.

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test tests/feature-manager.test.ts

# Run with verbose output
bun test --verbose
```

### Test Coverage

The test suite includes:

- **Unit Tests**:
  - `tests/feature-manager.test.ts` - Feature list operations (41 tests)
  - `tests/validators.test.ts` - Validation logic (13 tests)
  - `tests/status-reporter.test.ts` - Status reporting (13 tests)
  - `tests/orchestrator.test.ts` - Orchestration logic (14 tests)

- **Integration Tests**:
  - `tests/cli.test.ts` - End-to-end CLI testing (20 tests)

### Test Organization

```
tests/
├── feature-manager.test.ts   # Feature CRUD operations
├── validators.test.ts         # Feature list validation
├── status-reporter.test.ts    # Status display and JSON output
├── orchestrator.test.ts       # Session orchestration
└── cli.test.ts                # CLI integration tests
```

### Writing New Tests

Tests use Bun's built-in test runner:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

describe('MyFeature', () => {
	beforeEach(() => {
		// Setup code
	});

	afterEach(() => {
		// Cleanup code
	});

	it('should do something', () => {
		expect(1 + 1).toBe(2);
	});
});
```

### Home Directory Override for Testing

Use `--home-dir` to test with different SDK configurations without affecting your main setup:

```bash
# Test with a temporary Claude config
bun run cli.ts run --home-dir /tmp/test-claude --dry-run

# Test with a separate OpenCode config
bun run cli.ts run --sdk opencode --home-dir /tmp/test-opencode --dry-run
```

## Development

### Modifying Orchestrator Behavior

Key areas to customize:

- **Prompt Construction**: `src/orchestrator.ts` - `buildCodingPrompt()` method
- **Feature Selection**: `src/feature-manager.ts` - `getNextFeature()` method
- **Success Criteria**: `src/orchestrator.ts` - `runCodingSession()` after execution
- **Output Formatting**: `src/sdk/claude.ts` or `src/sdk/opencode.ts` - message handling

### Adding New SDK Implementations

1. Create a new file in `src/sdk/` (e.g., `src/sdk/myai.ts`)
2. Implement the `AgentSessionRunner` interface from `src/sdk/base.ts`
3. Add the SDK choice to `SDKChoice` type in `src/types.ts`
4. Update `Orchestrator.getSessionRunner()` in `src/orchestrator.ts`
5. Update CLI help text and README

### Adding New Commands

1. Add command to the `ParsedArgs['command']` union in `cli.ts`
2. Create a `handle<Command>()` function
3. Add command to the `switch` statement in `main()`
4. Update `printHelp()` with command documentation

## Release Process

PACE uses automated GitHub Actions for building and releasing:

### Creating a Release

1. **Tag a version:**
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

2. **Automated workflow:**
   - Builds binaries for all platforms (Linux, macOS, Windows on x64 and arm64)
   - Creates GitHub release with binaries attached
   - Publishes to npm registry as `@fwdslsh/pace`

### Manual Workflow Dispatch

You can also trigger releases manually from GitHub Actions:

```
Actions → Release → Run workflow → Enter tag (e.g., v0.2.0)
```

### Binary Artifacts

Each release includes standalone executables:
- `pace-linux-x64` - Linux x86_64
- `pace-linux-arm64` - Linux ARM64
- `pace-darwin-x64` - macOS Intel
- `pace-darwin-arm64` - macOS Apple Silicon
- `pace-windows-x64.exe` - Windows x86_64

### Installation Methods

Users can install PACE via:

1. **Installation script** (recommended):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash
   ```

2. **NPM** (for Node.js/Bun projects):
   ```bash
   npm install -g @fwdslsh/pace
   ```

3. **Direct download** from GitHub releases:
   ```bash
   wget https://github.com/fwdslsh/pace/releases/latest/download/pace-linux-x64
   chmod +x pace-linux-x64
   mv pace-linux-x64 /usr/local/bin/pace
   ```

## License

MIT License - see [LICENSE](LICENSE) file for details.
