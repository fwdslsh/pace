#!/usr/bin/env bun
/**
 * pace-progress.ts - Check PACE feature progress
 *
 * Usage:
 *   bun pace-progress.ts              # Human-readable output
 *   bun pace-progress.ts --json       # JSON output
 *   bun pace-progress.ts --check      # Exit 2 if incomplete (for hooks)
 */

import {
  loadFeatureList,
  getProgress,
  formatProgressBar,
  getPriorityIcon,
} from "./pace-lib";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const checkMode = args.includes("--check");

try {
  const data = loadFeatureList();
  const progress = getProgress(data);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          passing: progress.passing,
          failing: progress.failing,
          total: progress.total,
          percentage: progress.percentage,
          isComplete: progress.isComplete,
          projectName: progress.projectName,
          nextFeature: progress.nextFeature
            ? {
                id: progress.nextFeature.id,
                description: progress.nextFeature.description,
                priority: progress.nextFeature.priority,
                category: progress.nextFeature.category,
              }
            : null,
        },
        null,
        2
      )
    );
  } else {
    console.log(formatProgressBar(progress.passing, progress.total));

    if (progress.isComplete) {
      console.log("ALL FEATURES COMPLETE! 🎉");
    } else if (progress.nextFeature) {
      const icon = getPriorityIcon(progress.nextFeature.priority);
      console.log(
        `Next: ${icon} [${progress.nextFeature.id}] (${progress.nextFeature.priority}) ${progress.nextFeature.description.slice(0, 60)}`
      );
    }
  }

  // In check mode, exit 2 if features remain (for SubagentStop hook)
  if (checkMode && !progress.isComplete) {
    if (progress.nextFeature) {
      console.error(
        `Continue to: ${progress.nextFeature.id} - ${progress.nextFeature.description.slice(0, 50)}`
      );
    }
    process.exit(2);
  }

  process.exit(0);
} catch (error) {
  if (jsonOutput) {
    console.log(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        exists: false,
      })
    );
  } else {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}
