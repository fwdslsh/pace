---
description: Capture learnings, patterns, and update project practices documentation
agent: pace-practices-reviewer
---

# /pace-compound

Apply compounding engineering practices - review code for patterns, capture learnings, and update documentation.

## Usage

```
/pace-compound
```

## What This Command Does

1. **Reviews Patterns** - Identifies patterns used in recent changes
2. **Checks Practices** - Compares against documented practices
3. **Captures Learnings** - Documents new insights
4. **Updates Documentation** - Adds to practices files
5. **Commits Knowledge** - Saves learnings to git

## Compounding Engineering

This command implements the core idea of compounding engineering:

```
Review -> Identify Pattern -> Document -> Future Reviews Improve
   ^                                            |
   +--------------------------------------------+
```

Every session should:

1. **Apply** existing practices (proving their value)
2. **Discover** new practices (expanding knowledge)
3. **Refine** existing practices (improving accuracy)

## Actions Performed

1. Review what patterns emerged during the last feature implementation
2. Check if any code can be extracted to shared utilities
3. Update CLAUDE.md with new patterns discovered
4. Consider if any validation could be automated
5. Document testing approaches that were effective
6. Update init.sh if new dependencies were added
7. Commit knowledge updates with message "docs: capture learnings"

## Output

Updates to:

- `.claude/practices/index.md` - Main practices index
- `.claude/practices/patterns/` - Pattern documentation
- `.claude/practices/lessons/` - Dated lesson entries
- `CLAUDE.md` - Project guidance for Claude

## When to Use

- After completing a feature
- After discovering a new pattern
- After encountering and solving a tricky problem
- Periodically during long development sessions
