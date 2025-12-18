# Token Usage Examples

This page provides comprehensive examples of token usage output across different commands and formats in Pace.

## Console Output Examples

### Session Summary with Token Usage

When a coding session completes, the session summary includes detailed token information:

```
------------------------------------------------------------
Session Summary:
  Duration: 45.3s
  Tool calls: 23
  Feature completed: Yes
  💎 Token Usage:
    Input: 1,234
    Output: 5,678
    Total: 6,912
------------------------------------------------------------
```

### Orchestration Summary with Token Usage

At the end of an orchestration run, the summary includes cumulative token statistics:

```
============================================================
 ORCHESTRATION SUMMARY
============================================================
Sessions run: 5
Features completed: 4
Final progress: 12/15 (80.0%)
Total time: 5m 23s
💎 Token Usage:
  Total Input: 12,345
  Total Output: 45,678
  Total Combined: 58,023
  Average per Session: 11,605
Complete: No
============================================================
```

### Status Command Token Output

The status command shows both the last session and cumulative token usage:

```bash
$ pace status
Progress: 12/15 features passing (80.0%)
💎 Token Usage:
  Last Session: 2,345 input, 8,901 output (11,246 total)
  All Sessions: 45,678 input, 123,456 output (169,134 total)
```

#### Verbose Status Output

With verbose mode, you get more detailed token information:

```bash
$ pace status --verbose
Progress: 12/15 features passing (80.0%)

Last Session:
  Feature: F035 - Test token tracking with verbose and non-verbose modes
  Tokens: 2,345 input, 8,901 output (11,246 total)

Cumulative Totals:
  Total Input: 45,678
  Total Output: 123,456
  Total Combined: 169,134
  Average per Session: 13,602

Session History (Last 3):
  Session 12: 2,345 input, 8,901 output (11,246 total)
  Session 11: 1,876 input, 6,543 output (8,419 total)
  Session 10: 2,001 input, 7,234 output (9,235 total)
```

## progress.txt Token Data Format

The progress.txt file stores token usage data for each session with structured formatting:

```
---

### Session 12 - F035

**Date:** 2025-12-18
**Agent Type:** Coding

**Feature Worked On:**

- F035: Test token tracking with verbose and non-verbose modes

**Actions Taken:**

- Created comprehensive test-f035.ts with 6 verification tests covering all F035 requirements
- Verified tokens appear in verbose output with per-session details
- Ensured consistent data across all modes using shared SessionSummary object

**Test Results:**

- All 6 F035 verification tests passed successfully (100% pass rate)
- ✅ Tokens appear in verbose output with per-session details
- ✅ Tokens appear in non-verbose summary with totals and averages

**Token Usage:**

- Input tokens: 2,270,250
- Output tokens: 53,913
- Total tokens: 2,324,163

**Current Status:**

- Features passing: 26/60
- F035 implementation complete and verified

---
```

### Multi-Session progress.txt Example

Over multiple sessions, the progress.txt accumulates token data:

```
---

### Session 10 - F034

**Token Usage:**

- Input tokens: 45,678
- Output tokens: 123,456
- Total tokens: 169,134

---

### Session 11 - F028

**Token Usage:**

- Input tokens: 12,345
- Output tokens: 67,890
- Total tokens: 80,235

---

### Session 12 - F035

**Token Usage:**

- Input tokens: 2,270,250
- Output tokens: 53,913
- Total tokens: 2,324,163
```

## JSON Output Examples

### Status Command JSON with Tokens

```bash
$ pace status --json
```

```json
{
  "progress": {
    "passing": 12,
    "failing": 3,
    "total": 15,
    "percentage": 80.0
  },
  "projectName": "Pace Token Usage Tracking",
  "nextFeatures": [
    {
      "id": "F043",
      "description": "Add examples of token usage output to documentation",
      "priority": "medium",
      "category": "documentation"
    }
  ],
  "workingDirectory": "/home/founder3/code/github/fwdslsh/pace",
  "lastSessionTokens": {
    "input": 2345,
    "output": 8901,
    "total": 11246
  },
  "totalTokens": {
    "input": 45678,
    "output": 123456,
    "total": 169134
  },
  "tokenTrackingSupported": true
}
```

### Run Command JSON with Tokens

```bash
$ pace run --max-sessions 3 --json
```

```json
{
  "sessionsRun": 3,
  "featuresCompleted": 2,
  "finalProgress": "14/15",
  "completionPercentage": 93.3,
  "elapsedTime": "8m 45s",
  "isComplete": false,
  "progress": {
    "passing": 14,
    "total": 15
  },
  "tokenUsage": {
    "lastSession": {
      "input": 2345,
      "output": 8901,
      "total": 11246
    },
    "total": {
      "input": 45678,
      "output": 123456,
      "total": 169134
    },
    "sessions": [
      {
        "sessionId": 1,
        "featureId": "F010",
        "input": 1234,
        "output": 5678,
        "total": 6912
      },
      {
        "sessionId": 2,
        "featureId": "F022",
        "input": 2345,
        "output": 8901,
        "total": 11246
      },
      {
        "sessionId": 3,
        "featureId": "F043",
        "input": 876,
        "output": 3421,
        "total": 4297
      }
    ],
    "averagePerSession": {
      "input": 1322,
      "output": 6000,
      "total": 7322
    }
  },
  "tokenTrackingSupported": true,
  "dryRun": false
}
```

### Init Command JSON with Token Tracking Support

```bash
$ pace init -p "Build a todo app" --dry-run --json
```

```json
{
  "success": true,
  "dryRun": true,
  "projectInitialized": false,
  "featuresGenerated": 45,
  "featureCategories": {
    "core": 8,
    "ui": 12,
    "api": 10,
    "testing": 8,
    "documentation": 7
  },
  "tokenTrackingSupported": true,
  "files": ["feature_list.json", "progress.txt", "init.sh"]
}
```

## Different Output Modes

### Non-Verbose Mode (Default)

Shows concise token information:

```
Session Summary:
  Duration: 32.1s
  Tool calls: 18
  Feature completed: Yes
  💎 Token Usage:
    Total: 6,912 (1,234 input + 5,678 output)
```

### Verbose Mode

Shows detailed token breakdown:

```
Session Summary:
  Duration: 32.1s
  Tool calls: 18
  Feature completed: Yes
  💎 Token Usage:
    Input Tokens: 1,234
    Output Tokens: 5,678
    Total Tokens: 6,912

  Token Breakdown:
    - Prompt processing: 1,234 tokens
    - Response generation: 5,678 tokens
    - Average per tool call: 384 tokens

  Session Context:
    - Feature: F043 - Add examples of token usage output to documentation
    - Agent: Coding Agent
    - Model: claude-sonnet-4-20250514
```

## Token Data Edge Cases

### Zero Token Session

```
Session Summary:
  Duration: 2.1s
  Tool calls: 0
  Feature completed: No
  💎 Token Usage:
    Input: 0
    Output: 0
    Total: 0
```

### Missing Token Data (Graceful Handling)

```
Session Summary:
  Duration: 28.7s
  Tool calls: 15
  Feature completed: Yes
  💎 Token Usage:
    Token tracking unavailable - SDK version may not support token monitoring
```

### Large Token Numbers

```
Session Summary:
  Duration: 125.3s
  Tool calls: 47
  Feature completed: Yes
  💎 Token Usage:
    Input: 1,234,567
    Output: 3,456,789
    Total: 4,691,356
```

## Screenshots of Token Display

While we can't show actual screenshots in this documentation, here's what the token display looks like in different terminal contexts:

### Terminal Output

- Token usage appears with 💎 emoji prefix for visual identification
- Numbers are formatted with thousands separators for readability
- Consistent formatting across all output types

### JSON Parsing in Scripts

```bash
# Extract total tokens from status command
TOTAL_TOKENS=$(pace status --json | jq '.totalTokens.total')
echo "Project has used ${TOTAL_TOKENS} tokens"
```

## Integration Examples

### CI/CD Pipeline with Token Monitoring

```bash
#!/bin/bash
# Run pace with token tracking
pace run --max-sessions 10 --json > results.json

# Extract token usage
INPUT_TOKENS=$(jq '.tokenUsage.total.input' results.json)
OUTPUT_TOKENS=$(jq '.tokenUsage.total.output' results.json)
TOTAL_TOKENS=$(jq '.tokenUsage.total.total' results.json)

echo "Token Usage Summary:"
echo "  Input: ${INPUT_TOKENS}"
echo "  Output: ${OUTPUT_TOKENS}"
echo "  Total: ${TOTAL_TOKENS}"

# Fail if token usage exceeds threshold
if [ "$TOTAL_TOKENS" -gt 100000 ]; then
  echo "Warning: High token usage detected"
  exit 1
fi
```

### Project Cost Tracking

```bash
# Track daily token usage
DATE=$(date +%Y-%m-%d)
TOKENS=$(pace status --json | jq '.totalTokens.total')
echo "${DATE},${TOKENS}" >> token_usage.csv

# Generate cost report (assuming $0.001 per 1K tokens)
COST=$(echo "scale=2; $TOKENS * 0.001 / 1000" | bc -l)
echo "Estimated cost for ${DATE}: \$${COST}"
```

## Error Handling Examples

### SDK Without Token Support

```
Session Summary:
  Duration: 45.3s
  Tool calls: 23
  Feature completed: Yes
  💎 Token Usage:
    ⚠️  Token tracking not available - OpenCode SDK v1.0.152+ required
    Consider upgrading SDK or track tokens manually via provider dashboard
```

### Corrupted Token Data Recovery

```
$ pace status
Progress: 12/15 features passing (80.0%)
💎 Token Usage:
  ⚠️  Some token data corrupted in progress.txt
  Last Session: 2,345 input, 8,901 output (11,246 total)
  All Sessions: 45,678 input, ~120,000 output (~165,000 total)
  Run 'pace validate' to check data integrity
```

This documentation provides comprehensive examples of token usage output across all Pace commands and formats, helping users understand what to expect and how to integrate token tracking into their workflows.
