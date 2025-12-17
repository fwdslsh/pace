#!/bin/bash
# Test script to verify --json flag respects archiving
set -e

echo "=== Testing F012: --json flag with archiving ==="

# Create a temp directory
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
echo "Test directory: $TEST_DIR"

# Create a simple feature_list.json for archiving
cat > feature_list.json <<'EOF'
{
  "features": [
    {
      "id": "F001",
      "description": "Test feature",
      "priority": "high",
      "category": "test",
      "steps": ["Step 1"],
      "passes": false
    }
  ],
  "metadata": {
    "project_name": "Test Project",
    "created_at": "2025-12-17",
    "total_features": 1,
    "passing": 0,
    "failing": 1,
    "last_updated": "2025-12-17T12:00:00.000Z"
  }
}
EOF

echo "✓ Created test feature_list.json"

# Create a simple progress.txt for archiving
cat > progress.txt <<'EOF'
## Test Progress
This is a test progress file.
EOF

echo "✓ Created test progress.txt"

# Test without --json flag (should show console messages)
echo ""
echo "=== Test 1: Without --json flag ==="
echo "(This test will fail with agent initialization, but we're checking archiving messages)"
"$OLDPWD/pace" init --dry-run --prompt "Test project" 2>&1 | head -20 || true

# Test with --json flag (should NOT show console archiving messages)
echo ""
echo "=== Test 2: With --json flag (dry run) ==="
OUTPUT=$("$OLDPWD/pace" init --dry-run --json --prompt "Test project" 2>&1 | grep -E '^\{' || true)
if [ -n "$OUTPUT" ]; then
  echo "JSON output received:"
  echo "$OUTPUT" | jq '.' 2>/dev/null || echo "$OUTPUT"
else
  echo "No JSON output received"
fi

# Verify archive messages are not in stdout
echo ""
echo "=== Checking for suppressed messages in JSON mode ==="
FULL_OUTPUT=$("$OLDPWD/pace" init --dry-run --json --prompt "Test project" 2>&1 || true)
if echo "$FULL_OUTPUT" | grep -q "📦 Existing project files found"; then
  echo "❌ FAILED: Archive messages were NOT suppressed in JSON mode"
  exit 1
elif echo "$FULL_OUTPUT" | grep -q "📁"; then
  echo "❌ FAILED: Archive folder emoji found in JSON mode"
  exit 1
else
  echo "✓ PASSED: Archive console messages are suppressed in JSON mode"
fi

# Clean up
cd "$OLDPWD"
rm -rf "$TEST_DIR"

echo ""
echo "=== All tests completed ==="
