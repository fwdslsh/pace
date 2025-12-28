# PACE Skills for Claude Code

**DEPRECATED**: This directory contains old/reference implementations.

The production-ready PACE implementation is now a proper Claude Code plugin located at:

```
pace-plugin/
```

## Installation

See `pace-plugin/README.md` for complete installation instructions.

Quick install:

```bash
# Copy plugin to your project
cp -r pace-plugin .claude/plugins/pace
```

## Plugin Structure

The new plugin at `pace-plugin/` includes:

- **Slash commands** (`/pace-run`, `/pace-init`, `/pace-status`, etc.)
- **Agents** (pace-coding, pace-initializer)
- **Skills** (pace-orchestration)
- **Hooks** (SubagentStop for loop continuation)
- **TypeScript/Bun scripts** (not Python)

## Why a Plugin?

The plugin structure provides:

1. **Proper discovery** - Claude Code finds plugins automatically
2. **Bundled components** - Commands, agents, skills, hooks together
3. **TypeScript/Bun** - Same language as the CLI tool
4. **Production-ready** - Follows Claude Code best practices

## Old Files (Reference Only)

The files in this `skills/` directory and the removed `.claude/` directory were earlier attempts that did not follow Claude Code conventions:

- Skills were not in plugin format
- Scripts were in Python (not Bun)
- Hooks were misconfigured
- Structure didn't match Claude Code discovery

These are kept for reference but should not be used.
