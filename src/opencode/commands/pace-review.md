---
description: Review code changes for quality, security, and maintainability
agent: pace-code-reviewer
---

# /pace-review

Review recent code changes for quality, security, and maintainability. Use before marking a feature as complete.

## Usage

```
/pace-review
```

## What This Command Does

1. **Runs git diff** - Identifies recent changes
2. **Reviews Code** - Checks against quality standards
3. **Identifies Issues** - Categorizes by severity
4. **Provides Feedback** - Actionable recommendations

## Review Checklist

The reviewer checks for:

- **Readability**: Code is clear and easy to understand
- **Naming**: Functions and variables are well-named
- **DRY**: No duplicated code
- **Error Handling**: Proper error handling in place
- **Security**: No exposed secrets or API keys
- **Validation**: Input validation implemented
- **Testing**: Good test coverage
- **Performance**: Performance considerations addressed

## Output Format

```markdown
## Code Review Summary

**Files Reviewed:** 5
**Overall Assessment:** Ready to merge with minor fixes

### Critical Issues

None found.

### Warnings

- `src/auth.ts:45` - Password comparison uses timing-unsafe method
- `src/api.ts:123` - Missing error handling for network failures

### Suggestions

- Consider extracting `formatDate` to a utility module
- Add JSDoc comments to exported functions
```

## When to Use

- After implementing a feature, before marking as passing
- Before creating a pull request
- When refactoring existing code
- After fixing bugs
