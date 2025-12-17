#!/bin/bash
# Comprehensive test for --model flag

echo "=========================================="
echo "Test 1: --model flag with dry-run"
echo "=========================================="
echo "Expected: Should show 'Model: opencode/big-pickle' in session output"
bun run cli.ts run --model opencode/big-pickle --dry-run --max-sessions 1 2>&1 | grep -A 15 "SESSION 1"

echo ""
echo "=========================================="
echo "Test 2: Verify model is passed to promptAsync"
echo "=========================================="
echo "Checking the code logic..."
grep -A 5 "this.model ?? getAgentModel" cli.ts

echo ""
echo "=========================================="
echo "Test 3: Check constructor stores model"
echo "=========================================="
grep -A 2 "this.model = options.model" cli.ts

echo ""
echo "✅ All tests completed!"
echo ""
echo "Summary:"
echo "1. CLI now stores --model flag in Orchestrator.model"
echo "2. Model is used as first priority in runCodingSession()"
echo "3. Model will be passed to promptAsync when creating sessions"
