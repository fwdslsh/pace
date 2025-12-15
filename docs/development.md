# Development

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

### Using Different SDKs

```bash
# Use Claude SDK (default)
bun run cli.ts --sdk claude --max-sessions 10

# Use OpenCode SDK
bun run cli.ts --sdk opencode

# OpenCode with remote server
OPENCODE_SERVER_URL=http://your-server:4096 bun run cli.ts --sdk opencode
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

# Override SDK home directory for testing
bun run cli.ts run --home-dir /tmp/test-claude --dry-run
bun run cli.ts run --sdk opencode --home-dir /tmp/test-opencode --dry-run
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
