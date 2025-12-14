# Orchestrator - Long-Running Agent Harness

A Bun/TypeScript implementation that orchestrates continuous coding agent sessions using **multiple agent SDKs** for maximum visibility and flexibility. Supports both the Claude Agent SDK and OpenCode SDK.

## Features

- **Multi-SDK Support**: Choose between Claude Agent SDK or OpenCode SDK at runtime
- **Full Visibility**: Stream all messages, tool uses, and results from agent sessions
- **Automatic Feature Progression**: Works through features in priority order
- **Session Management**: Configurable session limits, failure thresholds, and delays
- **Progress Tracking**: Monitors feature completion and provides detailed statistics
- **Rich Output**: Shows system messages, assistant responses, tool executions, and results

## Installation

First, install dependencies:

```bash
bun install
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

### Quick Start

Run the orchestrator with default settings (Claude SDK, 10 sessions max):

```bash
bun run cli.ts
```

Or use the npm script:

```bash
npm run cli
```

**Using OpenCode SDK:**

```bash
bun run cli.ts --sdk opencode
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

### All Options

```
--sdk SDK                Agent SDK to use: 'claude' or 'opencode' (default: claude)
--project-dir, -d DIR    Project directory (default: current directory)
--max-sessions, -n N     Maximum number of sessions to run (default: 10)
--max-failures, -f N     Stop after N consecutive failures (default: 3)
--delay SECONDS          Seconds to wait between sessions (default: 5)
--until-complete         Run until all features pass (implies unlimited sessions)
--dry-run                Show what would be done without executing
--help, -h               Show this help message
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

## Development

To modify the orchestrator behavior, edit key sections:

- **Prompt Construction**: `buildCodingPrompt()` method
- **Feature Selection**: `getNextFeature()` method
- **Success Criteria**: Check in `runCodingSession()` after execution
- **Output Formatting**: Message handling in the `for await` loop

## License

Same as parent project.
