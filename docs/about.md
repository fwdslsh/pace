# About pace

**pace: Pragmatic Agent for Compounding Engineering**

pace is a harness for long-running AI coding agents that implements two cutting-edge patterns: multi-context window persistence and compounding engineering. It enables agents to work effectively across hours or days, with each feature making the next easier to build.

## Core Concepts

### Long-Running Agent Harness

Traditional AI agents struggle when tasks span multiple context windows. As Anthropic's research shows, "the core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before."

pace solves this through:

1. **Initializer Agent**: Sets up the environment with structured artifacts on first run:
   - `feature_list.json` - Comprehensive feature requirements
   - `claude-progress.txt` - Session-to-session handoff notes
   - `init.sh` - Development server startup script
   - Initial git commit establishing project baseline

2. **Coding Agent**: Makes incremental progress in every session:
   - Reads progress files and git history to orient itself
   - Selects highest-priority failing feature to work on
   - Implements feature incrementally, not attempting to one-shot
   - Tests thoroughly before marking features complete
   - Leaves clean state with git commits and progress updates

This architecture enables agents to "quickly understand the state of work when starting with a fresh context window" by reading structured artifacts rather than guessing what happened previously.

### Compounding Engineering

Traditional software engineering has diminishing returns - each feature increases complexity, making subsequent features harder to build. pace inverts this equation.

As Dan Shipper explains: "In compounding engineering, your goal is to make the next feature easier to build from the feature that you just added."

pace implements this through:

1. **Systematic Knowledge Capture**: After each feature, document:
   - What worked in the plan and what needed adjustment
   - Issues discovered during testing that weren't caught earlier
   - Common mistakes the agent made
   - Patterns and best practices for reuse

2. **Knowledge Codification**: Embed learnings into:
   - `CLAUDE.md` - Global coding standards and patterns
   - Slash commands - Repeatable workflows (e.g., `/test-with-validation`)
   - Subagents - Specialized validators
   - Hooks - Automated checks preventing regressions

3. **Accelerating Productivity**: Each completed feature contributes to a "self-teaching codebase" where accumulated knowledge helps agents (and humans) be immediately productive, even in unfamiliar codebases.

## How pace Works

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ 1. Orient                                               │
│    - Read feature_list.json                            │
│    - Read claude-progress.txt                          │
│    - Review git history                                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Select Feature                                       │
│    - Find highest-priority failing feature              │
│    - Priority: critical → high → medium → low           │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Get Bearings                                         │
│    - Run init.sh to start dev server                   │
│    - Test basic functionality                           │
│    - Verify app isn't in broken state                  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Implement                                            │
│    - Work on single feature incrementally               │
│    - Test thoroughly (e.g., with browser automation)    │
│    - Verify feature works end-to-end                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Clean State                                          │
│    - Update feature_list.json (mark as passing)        │
│    - Write git commit with descriptive message          │
│    - Update claude-progress.txt                         │
│    - Document learnings for next session                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Repeat                                               │
│    - Continue until stopping condition                  │
│    - All features pass / max sessions / max failures    │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Incremental Progress Over One-Shot**: Agents work on one feature at a time rather than attempting to implement entire applications in a single session. This prevents context exhaustion and incomplete features.

**Clean State Requirement**: Every session ends with code that could merge to main - no major bugs, orderly documentation, and easy for the next session to continue.

**Structured Handoffs**: Git history, progress files, and feature lists provide clear context for each new session, eliminating the need for agents to guess what happened.

**End-to-End Testing**: Agents verify features work as a user would experience them (e.g., using browser automation), not just that code compiles.

**Feature List as Contract**: A comprehensive, immutable list of requirements prevents agents from prematurely declaring projects complete or removing features to "fix" bugs.

## Multi-SDK Architecture

pace supports multiple agent SDKs for flexibility:

### Claude Agent SDK (Default)

Direct integration with Anthropic's Claude through the Agent SDK:
- Full tool visibility (see every tool call, input, and output)
- Rich session management with conversation history
- Permission control for file edits and command execution
- Built-in cost tracking and usage reporting
- Automatic `CLAUDE.md` project context loading

### OpenCode SDK

Alternative integration for OpenCode-powered sessions:
- Local or remote server connectivity
- Event streaming for real-time updates
- Multiple AI provider support
- Flexible backend configuration

This architecture allows developers to choose the right SDK for their needs while maintaining consistent orchestration logic.

## Benefits

### For Teams

- **Faster Onboarding**: New team members can be productive immediately due to accumulated knowledge in prompts and documentation
- **Knowledge Preservation**: Learnings don't depend on individual memory or tribal knowledge
- **Consistent Quality**: Automated checks and documented patterns maintain standards
- **Reduced Repetition**: Agents stop making the same mistakes through codified learnings

### For Projects

- **Accelerating Velocity**: Each feature genuinely makes the next faster to build
- **Sustainable Complexity**: Technical debt decreases rather than accumulates
- **Living Documentation**: Instructions stay current because they're used daily
- **Reliable Progress**: Structured artifacts enable consistent progress across long timeframes

## References

This project builds on research and practices from:

1. **Anthropic Engineering**: "Effective harnesses for long-running agents" (November 2025)
   - Multi-context window workflows
   - Initializer/maintainer dual agent architecture
   - Feature lists as immutable contracts
   - Clean state requirements and git-based handoffs
   - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

2. **Compounding Engineering Pattern**: From Awesome Agentic Patterns
   - Knowledge codification practices
   - Self-teaching codebase philosophy
   - Diminishing vs. compounding returns in software engineering
   - https://agentic-patterns.com/patterns/compounding-engineering-pattern/

3. **Every.to Podcast**: "How to Use Claude Code Like the People Who Built It"
   - Dan Shipper's explanation of compounding engineering
   - Practical implementation at Every
   - Real-world examples of accelerating productivity

## Future Directions

pace is designed to be extensible and evolve with the field:

- **Multi-Agent Architectures**: Specialized agents for testing, QA, code cleanup
- **Domain Generalization**: Applying these patterns beyond web development to scientific research, financial modeling, etc.
- **Enhanced Memory Systems**: More sophisticated context management and knowledge retrieval
- **Collaborative Workflows**: Better human-agent collaboration patterns for long-running projects

The core insight remains: by combining persistent session management with compounding knowledge accumulation, AI agents can tackle increasingly complex projects that span far beyond a single context window.
