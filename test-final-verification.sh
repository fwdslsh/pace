#!/bin/bash

echo "=============================================="
echo "VERIFICATION: --model flag fix"
echo "=============================================="
echo ""

echo "Test 1: CLI --model flag is honored (dry-run)"
echo "----------------------------------------------"
bun run cli.ts run --model opencode/big-pickle --dry-run --max-sessions 1 2>&1 | grep "Model:"
echo ""

echo "Test 2: No --model flag falls back to config"
echo "----------------------------------------------"
bun run cli.ts run --dry-run --max-sessions 1 2>&1 | grep -E "(Model:|SESSION 1)" | head -5
echo ""

echo "Test 3: Different model"
echo "----------------------------------------------"
bun run cli.ts run --model anthropic/claude-sonnet-4 --dry-run --max-sessions 1 2>&1 | grep "Model:"
echo ""

echo "=============================================="
echo "✅ Verification complete!"
echo "=============================================="
echo ""
echo "Summary of changes:"
echo "1. Added 'private model?: string' field to Orchestrator class"
echo "2. Store CLI model in constructor: this.model = options.model"
echo "3. Use CLI model as priority: this.model ?? getAgentModel(...)"
echo "4. Display model in both dry-run and normal session output"
