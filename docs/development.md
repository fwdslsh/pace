# Development

## Project Structure

The codebase is organized into modular components for better maintainability:

```
pace/
├── cli.ts                    # Main CLI entry point with orchestration
├── pace-plugin.ts            # OpenCode plugin for TUI integration
├── src/
│   ├── types.ts              # Shared TypeScript type definitions
│   ├── feature-manager.ts    # Feature list operations (load, save, query)
│   ├── validators.ts         # Feature list validation logic
│   ├── status-reporter.ts    # Status display and reporting
│   └── opencode/
│       ├── pace-config.ts    # Configuration loading (pace.json)
│       ├── agents/           # Agent prompt markdown files
│       │   ├── coding-agent.md
│       │   ├── coordinator-agent.md
│       │   ├── initializer-agent.md
│       │   ├── code-reviewer.md
│       │   └── practices-reviewer.md
│       └── commands/         # Command markdown files
│           ├── pace-init.md
│           ├── pace-next.md
│           └── ...
├── tests/                    # Comprehensive test suite (100+ tests)
│   ├── feature-manager.test.ts
│   ├── validators.test.ts
│   ├── status-reporter.test.ts
│   ├── pace-config.test.ts
│   └── cli.test.ts
├── docs/
│   ├── examples/             # Example agents and commands
│   ├── SDK_PROGRAMMATIC_USAGE.md
│   ├── PLUGIN_EXTENSION_POINTS.md
│   └── ...
└── package.json
```

### Module Responsibilities

- **cli.ts**: Command-line interface, argument parsing, orchestration loop, command handlers
- **pace-plugin.ts**: OpenCode plugin providing custom agents, commands, and tools
- **feature-manager.ts**: All operations on feature_list.json (CRUD, queries, statistics)
- **validators.ts**: Validation logic for feature lists, error formatting
- **status-reporter.ts**: Display project status, progress, git history
- **opencode/pace-config.ts**: Configuration loading from pace.json
- **opencode/agents/**: Agent prompt definitions in markdown format
- **opencode/commands/**: Command definitions in markdown format

## Install from Source

For development or building from source:

```bash
git clone https://github.com/fwdslsh/pace.git
cd pace
bun install
bun run cli.ts --help
```

## Running from Source

When developing or running pace from source, use `bun run cli.ts` instead of the `pace` command. All CLI functionality is available using this format.

### Basic Commands

```bash
# Initialize a new project
bun run cli.ts init -p "Build a todo app"
bun run cli.ts init --file requirements.txt

# Run the orchestrator
bun run cli.ts
bun run cli.ts run --max-sessions 10

# Check project status
bun run cli.ts status
bun run cli.ts status --verbose
bun run cli.ts status --json

# Validate feature list
bun run cli.ts validate
bun run cli.ts validate --json

# Update feature status
bun run cli.ts update F001 pass
bun run cli.ts update F002 fail
bun run cli.ts update F001 pass --json
```

### Common Development Options

```bash
# Run until all features pass
bun run cli.ts --until-complete

# Run a specific number of sessions
bun run cli.ts --max-sessions 20

# Adjust failure tolerance
bun run cli.ts --max-failures 5

# Preview without executing (dry run)
bun run cli.ts --dry-run --max-sessions 5

# Use custom OpenCode config directory
bun run cli.ts run --config-dir /path/to/opencode-config --dry-run
```

### JSON Output for Development

```bash
# Status with JSON output
bun run cli.ts status --json

# Validation with JSON output
bun run cli.ts validate --json

# Update with JSON output
bun run cli.ts update F001 pass --json

# Run with JSON output
bun run cli.ts run --json --max-sessions 5
```

### Build Binaries

To create standalone executables:

```bash
# Build for current platform
bun run build

# Build for all platforms
bun run build:all
```

### Modifying Orchestrator Behavior

Key areas to customize:

- **Prompt Construction**: `cli.ts` - `buildCodingAgentPrompt()` function
- **Feature Selection**: `src/feature-manager.ts` - `getNextFeature()` method
- **Success Criteria**: `cli.ts` - `runCodingSession()` after execution
- **Agent Prompts**: `src/opencode/agents/*.md` - Agent behavior definitions
- **Configuration**: `src/opencode/pace-config.ts` - Config loading and defaults

### Adding New Agents

1. Create a new markdown file in `src/opencode/agents/` (e.g., `my-agent.md`)
2. Add frontmatter with agent metadata
3. Register the agent in `pace-plugin.ts`
4. Optionally add model configuration in `pace-config.ts`

### Adding New Commands

1. Add command to the `ParsedArgs['command']` union in `cli.ts`
2. Create a `handle<Command>()` function
3. Add command to the `switch` statement in `main()`
4. Update `printHelp()` with command documentation
5. Optionally create a matching markdown file in `src/opencode/commands/`

## Integration with Feature List

The orchestrator expects a `feature_list.json` file in the project directory with this structure:

```json
{
 "features": [
  {
   "id": "AUTH-001",
   "description": "Implement user authentication",
   "priority": "critical",
   "category": "auth",
   "steps": ["Create login form", "Add JWT validation"],
   "passes": false
  },
  {
   "id": "UI-002",
   "description": "Add dark mode toggle",
   "priority": "medium",
   "category": "ui",
   "steps": ["Add theme context", "Create toggle button"],
   "passes": true
  }
 ],
 "metadata": {
  "project_name": "My Project",
  "last_updated": "2025-01-01T10:30:00Z"
 }
}
```

## Configuration

pace can be configured via `pace.json`, `pace.config.json`, or `.pace.json`:

```json
{
  "defaultModel": "anthropic/claude-sonnet-4-20250514",
  "agents": {
    "pace-coding": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "pace-code-reviewer": {
      "model": "anthropic/claude-opus-4-20250514"
    }
  },
  "orchestrator": {
    "maxSessions": 50,
    "maxFailures": 5,
    "sessionDelay": 5000
  }
}
```

## Testing

The project includes a comprehensive test suite with 100+ tests covering all functionality.

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
  - `tests/feature-manager.test.ts` - Feature list operations
  - `tests/validators.test.ts` - Validation logic
  - `tests/status-reporter.test.ts` - Status reporting
  - `tests/pace-config.test.ts` - Configuration loading

- **Integration Tests**:
  - `tests/cli.test.ts` - End-to-end CLI testing

### Test Organization

```
tests/
├── feature-manager.test.ts   # Feature CRUD operations
├── validators.test.ts         # Feature list validation
├── status-reporter.test.ts    # Status display and JSON output
├── pace-config.test.ts        # Configuration loading
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

## Release Process

pace uses automated GitHub Actions for building and releasing:

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

Users can install pace via:

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
