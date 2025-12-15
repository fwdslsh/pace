
## JSON Output for Scripting and CI/CD

All commands support `--json` flag for machine-readable output, perfect for scripting and CI/CD integration.

### Status JSON Output

```bash
pace status --json
```

```json
{
  "progress": {
    "passing": 5,
    "failing": 3,
    "total": 8,
    "percentage": 62.5
  },
  "projectName": "My Project",
  "nextFeatures": [
    {
      "id": "F001",
      "description": "Feature description",
      "priority": "high",
      "category": "core"
    }
  ],
  "workingDirectory": "/path/to/project"
}
```

### Validation JSON Output

```bash
pace validate --json
```

```json
{
  "valid": true,
  "errorCount": 0,
  "errors": [],
  "stats": {
    "total": 8,
    "passing": 5,
    "failing": 3,
    "byCategory": {
      "core": 3,
      "ui": 2,
      "api": 3
    },
    "byPriority": {
      "critical": 1,
      "high": 3,
      "medium": 3,
      "low": 1
    }
  }
}
```

### Update JSON Output

```bash
pace update F001 pass --json
```

```json
{
  "success": true,
  "featureId": "F001",
  "oldStatus": "failing",
  "newStatus": "passing",
  "description": "Feature description",
  "category": "core",
  "progress": {
    "passing": 6,
    "total": 8,
    "percentage": 75
  }
}
```

### Run JSON Output

```bash
pace run --json --max-sessions 5
```

```json
{
  "sdk": "claude",
  "sessionsRun": 5,
  "featuresCompleted": 2,
  "finalProgress": "7/8",
  "completionPercentage": 87.5,
  "elapsedTime": "5m 32s",
  "isComplete": false,
  "progress": {
    "passing": 7,
    "total": 8
  }
}
```

### CI/CD Integration Example

```bash
#!/bin/bash
# ci-test.sh - Run orchestrator and check exit code

# Run orchestrator (using installed pace command or npx)
pace run --max-sessions 10 --json > results.json
# or with npx: npx @fwdslsh/pace run --max-sessions 10 --json > results.json
EXIT_CODE=$?

# Parse results
PASSING=$(jq '.progress.passing' results.json)
TOTAL=$(jq '.progress.total' results.json)

echo "Test Results: $PASSING/$TOTAL features passing"

# Exit with orchestrator's exit code (0 if complete, 1 if incomplete)
exit $EXIT_CODE
```
