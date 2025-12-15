## Usage

```bash
# Run the orchestrator (uses Claude SDK by default)
pace

# Run with OpenCode SDK
pace --sdk opencode

# Run until all features pass
pace --until-complete

# Run a specific number of sessions
pace --max-sessions 20

# Check project status
pace status

# Validate feature_list.json
pace validate

# Update feature status
pace update F001 pass
```

## Features

- **Multi-SDK Support**: Choose between Claude Agent SDK or OpenCode SDK at runtime
- **Full Visibility**: Stream all messages, tool uses, and results from agent sessions
- **Automatic Feature Progression**: Works through features in priority order
- **Session Management**: Configurable session limits, failure thresholds, and delays
- **Progress Tracking**: Monitors feature completion and provides detailed statistics
- **JSON Output**: Machine-readable output for scripting and CI/CD integration

## Installation

```bash
# Quick install (recommended)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash

# Install via npm
npm install -g @fwdslsh/pace

# Or use npx (no installation required)
npx @fwdslsh/pace --help
```
