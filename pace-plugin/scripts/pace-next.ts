#!/usr/bin/env bun
/**
 * pace-next.ts - Get the next feature to implement
 *
 * Usage:
 *   bun pace-next.ts              # Human-readable output
 *   bun pace-next.ts --json       # JSON output with full details
 *   bun pace-next.ts --id         # Just the feature ID
 */

import {
  loadFeatureList,
  getProgress,
  getPriorityIcon,
} from "./pace-lib";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const idOnly = args.includes("--id");

try {
  const data = loadFeatureList();
  const progress = getProgress(data);

  if (progress.isComplete) {
    if (jsonOutput) {
      console.log(
        JSON.stringify({ complete: true, feature: null, message: "All features complete" })
      );
    } else if (idOnly) {
      console.log("");
    } else {
      console.log("ALL FEATURES COMPLETE! 🎉");
    }
    process.exit(0);
  }

  const next = progress.nextFeature!;

  if (idOnly) {
    console.log(next.id);
  } else if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          complete: false,
          feature: {
            id: next.id,
            description: next.description,
            priority: next.priority,
            category: next.category,
            steps: next.steps,
          },
          progress: {
            passing: progress.passing,
            failing: progress.failing,
            total: progress.total,
            percentage: progress.percentage,
          },
          remainingCount: progress.remainingFeatures.length,
        },
        null,
        2
      )
    );
  } else {
    const icon = getPriorityIcon(next.priority);

    console.log(`Next Feature: ${icon} [${next.id}]`);
    console.log(`Priority: ${next.priority}`);
    console.log(`Category: ${next.category}`);
    console.log(`Description: ${next.description}`);
    console.log();

    if (next.steps && next.steps.length > 0) {
      console.log("Verification Steps:");
      next.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`);
      });
      console.log();
    }

    console.log(
      `Progress: ${progress.passing}/${progress.total} (${progress.remainingFeatures.length} remaining)`
    );
  }

  process.exit(0);
} catch (error) {
  if (jsonOutput) {
    console.log(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    );
  } else {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}
