# Agent Development Guide

## Commands

```bash
bun test                           # Run all tests
bun test tests/cli.test.ts         # Run single test file
bun test --watch                   # Watch mode
bun run lint                       # ESLint check
bun run format                     # Format with Prettier
bun run build                      # Build binary
```

## Code Style

- **Imports**: Group and alphabetize (builtin → external → internal). Always use `import type` for types.
- **Formatting**: Prettier with 100 char width, single quotes, semicolons, 2-space indent
- **Types**: Explicit types required. NEVER use `any` - use `unknown` and narrow with type guards
- **Naming**: camelCase for variables/functions, PascalCase for types/classes, UPPER_CASE for constants
- **Errors**: Throw with context: `throw new Error(\`Feature not found: \${id}\\nRun 'pace init'\`)`
- **Async**: Always use `async/await`, never callbacks. Add timeouts with `Promise.race()` for long ops

## Architecture (from LESSONS_LEARNED.md)

- **Modular**: Keep modules single-purpose (feature-manager.ts, validators.ts, etc.)
- **Event Deduplication**: SDK events duplicate - use 100ms time window deduplication
- **Caching**: 5s TTL with explicit invalidation on writes (`cache.delete()` in save methods)
- **Context**: Profile token usage - provide summary tools not raw file access
- **Testing**: 50/50 unit/integration split. Test unhappy paths explicitly
- **Error Messages**: Actionable (what went wrong + how to fix it)

## File Structure

```
src/
├── feature-manager.ts     # Feature CRUD operations
├── validators.ts          # Validation logic
├── status-reporter.ts     # Status display
├── progress-parser.ts     # Unified progress parsing (single source of truth)
└── opencode/              # OpenCode SDK integration
```

## Critical Rules

1. NEVER modify feature descriptions in feature_list.json - ONLY change `passes` field
2. Invalidate caches after writes: `FeatureManager.cache.delete(filePath)`
3. Use defensive SDK integration: `event.properties?.info?.tokens ?? 0` (formats change)
4. Filter zero-value events: `if (input === 0 && output === 0) return`
5. One parser per data source (no duplicates) - see progress-parser.ts
6. Pre-commit hook runs lint + tests - make them pass before committing
