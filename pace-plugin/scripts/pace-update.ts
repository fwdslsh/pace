#!/usr/bin/env bun
/**
 * pace-update.ts - Update a feature's pass/fail status
 *
 * Usage:
 *   bun pace-update.ts <feature-id> pass
 *   bun pace-update.ts <feature-id> fail
 *   bun pace-update.ts <feature-id> pass --json
 */

import { updateFeatureStatus, loadFeatureList, getProgress } from "./pace-lib";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const jsonOutput = process.argv.includes("--json");

if (args.length < 2) {
  if (!jsonOutput) {
    console.log("Usage: pace-update.ts <feature-id> <pass|fail>");
    console.log();
    console.log("Examples:");
    console.log("  bun pace-update.ts F001 pass");
    console.log("  bun pace-update.ts AUTH-003 fail");
    console.log();

    // Show available features
    try {
      const data = loadFeatureList();
      const progress = getProgress(data);

      console.log(`Available features (${progress.failing} failing, ${progress.passing} passing):`);

      const failing = progress.remainingFeatures.slice(0, 5);
      if (failing.length > 0) {
        console.log("\nFailing:");
        failing.forEach((f) => {
          console.log(`  ✗ ${f.id}: ${f.description.slice(0, 50)}`);
        });
      }

      const passing = data.features.filter((f) => f.passes).slice(0, 5);
      if (passing.length > 0) {
        console.log("\nPassing:");
        passing.forEach((f) => {
          console.log(`  ✓ ${f.id}: ${f.description.slice(0, 50)}`);
        });
      }
    } catch {
      // Ignore if can't load
    }
  }
  process.exit(1);
}

const featureId = args[0];
const statusArg = args[1].toLowerCase();

if (statusArg !== "pass" && statusArg !== "fail") {
  console.error(`Invalid status: ${args[1]}. Must be 'pass' or 'fail'`);
  process.exit(1);
}

const passes = statusArg === "pass";
const result = updateFeatureStatus(featureId, passes);

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (!result.success) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log(" PACE Feature Update");
  console.log("=".repeat(60));
  console.log();
  console.log(`Feature: ${result.featureId}`);
  if (result.description) {
    console.log(`Description: ${result.description}`);
  }
  if (result.category) {
    console.log(`Category: ${result.category}`);
  }
  console.log();
  console.log(`Status: ${result.oldStatus} → ${result.newStatus}`);
  console.log(`Changed: ${result.changed ? "Yes" : "No (already at target status)"}`);
  console.log();
  console.log(
    `Progress: ${result.progress.passing}/${result.progress.total} (${result.progress.percentage}%)`
  );
  console.log("=".repeat(60));
}

process.exit(result.success ? 0 : 1);
