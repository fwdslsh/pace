#!/usr/bin/env bun
/**
 * pace-validate.ts - Validate feature_list.json structure
 *
 * Usage:
 *   bun pace-validate.ts              # Human-readable output
 *   bun pace-validate.ts --json       # JSON output
 */

import { loadFeatureList, validateFeatureList } from "./pace-lib";

const jsonOutput = process.argv.includes("--json");

try {
  const data = loadFeatureList();
  const result = validateFeatureList(data);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("=".repeat(60));
    console.log(" PACE Feature List Validation");
    console.log("=".repeat(60));
    console.log();

    if (result.valid) {
      console.log("✅ VALIDATION PASSED");
    } else {
      console.log("❌ VALIDATION FAILED");
    }

    if (result.errors.length > 0) {
      console.log();
      console.log(`Errors (${result.errors.length}):`);
      result.errors.forEach((e) => {
        console.log(`  • [${e.featureId}] ${e.field}: ${e.message}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log();
      console.log(`Warnings (${result.warnings.length}):`);
      result.warnings.forEach((w) => {
        console.log(`  ⚠ [${w.featureId}] ${w.field}: ${w.message}`);
      });
    }

    console.log();
    console.log("-".repeat(60));
    console.log("Statistics:");
    console.log(`  Total features: ${result.stats.total}`);
    console.log(`  Passing: ${result.stats.passing}`);
    console.log(`  Failing: ${result.stats.failing}`);

    console.log();
    console.log("By Category:");
    Object.entries(result.stats.byCategory)
      .sort()
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });

    console.log();
    console.log("By Priority:");
    (["critical", "high", "medium", "low"] as const).forEach((pri) => {
      if (result.stats.byPriority[pri] > 0) {
        console.log(`  ${pri}: ${result.stats.byPriority[pri]}`);
      }
    });

    console.log();
    console.log("=".repeat(60));
  }

  process.exit(result.valid ? 0 : 1);
} catch (error) {
  if (jsonOutput) {
    console.log(
      JSON.stringify({
        valid: false,
        errors: [{ featureId: "root", field: "file", message: String(error) }],
        warnings: [],
        stats: { total: 0, passing: 0, failing: 0, byCategory: {}, byPriority: {} },
      })
    );
  } else {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}
