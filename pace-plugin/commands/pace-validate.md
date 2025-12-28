---
description: Validate feature_list.json structure and report issues
allowed-tools: Bash
argument-hint: [--json]
---

# PACE Validate

Validate feature list structure.

## Run Validation

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-validate.ts
```

## JSON Output

For `--json` in `$ARGUMENTS`:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/pace-validate.ts --json
```

## Report Issues

If validation fails:
1. List all errors with feature IDs
2. Suggest fixes for common issues
3. Show statistics

## Common Issues

- Missing required fields (id, category, description, priority, passes)
- Invalid priority (must be critical/high/medium/low)
- Duplicate feature IDs
- Empty descriptions
- Non-boolean passes values
