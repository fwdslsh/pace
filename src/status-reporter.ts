/**
 * status-reporter.ts - Display project status and progress
 */
/* eslint-disable no-console */

import { exec } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

import { FeatureManager } from './feature-manager';
import {
  loadConfig,
  getCostSettings,
  getBudgetSettings,
  getTokenDisplaySettings,
} from './opencode/pace-config';

import type {
  Feature,
  Priority,
  StatusReportOptions,
  TokenUsage,
  TokenUsageByModel,
  TokenBudget,
  BudgetStatus,
  TokenEfficiencyMetrics,
} from './types';
import { calculateCost, formatCost, isCostCalculationSupported } from './cost-calculator';
import { ModelTokenTracker } from './model-token-tracker';
import { calculateTokenEfficiencyMetrics, formatEfficiencyDisplay } from './token-efficiency';
import { ProgressParser, type ParsedSession } from './progress-parser';
import {
  isAccessibleMode,
  makeAccessible,
  getTokenPrefix,
  getTokenUsageHeader,
  formatTokenUsageForAccessibility,
  getAccessibleBudgetMessage,
  getAccessiblePriorityIcon,
} from './accessibility';
import {
  formatTokenUsageWithIndicators,
  calculateAverageTokens,
  calculateTokenSeverity,
  getTokenWarningSymbol,
  compareTokenUsage,
  formatTokenComparison,
} from './token-visualization';

const execAsync = promisify(exec);

// Use dynamic priority icons that respect accessibility settings
const getPriorityIcon = (priority: Priority): string => {
  return getAccessiblePriorityIcon(priority);
};

/**
 * Status reporter for displaying project progress
 */
export class StatusReporter {
  private featureManager: FeatureManager;
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.featureManager = new FeatureManager(projectDir);
  }

  /**
   * Get cost configuration settings
   */
  private async getCostSettings() {
    try {
      const config = await loadConfig(this.projectDir);
      return getCostSettings(config);
    } catch {
      // Return default settings if config can't be loaded
      return {
        enabled: true,
        currency: 'USD',
        precision: 4,
      };
    }
  }

  /**
   * Get budget configuration settings
   */
  private async getBudgetSettings() {
    try {
      const config = await loadConfig(this.projectDir);
      return getBudgetSettings(config);
    } catch {
      // Return default settings if config can't be loaded
      return {
        enabled: false,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      };
    }
  }

  /**
   * Get token display threshold settings
   */
  private async getTokenDisplaySettings() {
    try {
      const config = await loadConfig(this.projectDir);
      return getTokenDisplaySettings(config);
    } catch {
      // Return default settings if config can't be loaded
      return {
        enabled: true,
        useAverageBasedThresholds: true,
        averageMultiplierWarning: 1.5,
        averageMultiplierCritical: 2.0,
      };
    }
  }

  /**
   * Calculate budget status based on current usage and budget settings
   */
  private calculateBudgetStatus(currentUsage: number, budget: TokenBudget): BudgetStatus {
    if (!budget.enabled || !budget.maxTokens) {
      return {
        enabled: false,
      };
    }

    const percentageUsed = currentUsage / budget.maxTokens;
    const warningThreshold = budget.warningThreshold || 0.8;
    const criticalThreshold = budget.criticalThreshold || 0.95;

    let level: 'none' | 'warning' | 'critical' | 'exceeded';
    let message: string;

    if (percentageUsed >= 1) {
      level = 'exceeded';
      message = getAccessibleBudgetMessage(
        percentageUsed,
        currentUsage,
        budget.maxTokens,
        'exceeded',
      );
    } else if (percentageUsed >= criticalThreshold) {
      level = 'critical';
      message = getAccessibleBudgetMessage(
        percentageUsed,
        currentUsage,
        budget.maxTokens,
        'critical',
      );
    } else if (percentageUsed >= warningThreshold) {
      level = 'warning';
      message = getAccessibleBudgetMessage(
        percentageUsed,
        currentUsage,
        budget.maxTokens,
        'warning',
      );
    } else {
      level = 'none';
      message = getAccessibleBudgetMessage(percentageUsed, currentUsage, budget.maxTokens, 'none');
    }

    return {
      enabled: true,
      currentUsage,
      maxTokens: budget.maxTokens,
      percentageUsed,
      level,
      message,
    };
  }

  /**
   * Get git log
   */
  private async getGitLog(count: number = 10): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git log --oneline -${count}`, {
        cwd: this.projectDir,
        timeout: 5000,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Load progress file
   */
  private async loadProgressFile(): Promise<string | null> {
    try {
      return await readFile(join(this.projectDir, 'progress.txt'), 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Get last session lines from progress file
   */
  private getLastSessionLines(progressContent: string): string[] | null {
    const lines = progressContent.split('\n');
    const lastSessionStart = lines.lastIndexOf('### Session');

    if (lastSessionStart === -1) {
      return null;
    }

    return lines.slice(lastSessionStart, lastSessionStart + 30);
  }

  private async getSessionsAboveTokenThreshold(minTokens: number): Promise<ParsedSession[]> {
    const progressData = await ProgressParser.parse(this.projectDir);
    return progressData.sessions.filter((session) => session.tokens.total >= minTokens);
  }

  /**
   * Get status data as object (for testing)
   */
  async getStatusData(options: StatusReportOptions = {}): Promise<any> {
    const [passing, total] = await this.featureManager.getProgress();
    const percentage = total > 0 ? (passing / total) * 100 : 0;

    const data = await this.featureManager.load();
    const projectName = data.metadata?.project_name;

    const allFeatures = await this.featureManager.load();
    const failingFeatures = allFeatures.features
      .filter((feature) => !feature.passes)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    const nextFeatures = options.showNextFeatures !== undefined 
      ? failingFeatures.slice(0, options.showNextFeatures).map((feature) => ({
          id: feature.id,
          description: feature.description,
          priority: feature.priority,
          category: feature.category,
        }))
      : failingFeatures.map((feature) => ({
          id: feature.id,
          description: feature.description,
          priority: feature.priority,
          category: feature.category,
        }));

    const output: any = {
      projectName,
      progress: {
        passing,
        failing: total - passing,
        total,
        percentage,
      },
      nextFeatures,
      workingDirectory: this.projectDir,
    };

    if (data.metadata?.token_usage) {
      output.projectTokenUsage = data.metadata.token_usage;
    }

    if (options.verbose) {
      const stats = await this.featureManager.getStats();

      const byCategory: Record<string, { passing: number; failing: number; total: number }> = {};
      for (const [category, counts] of Object.entries(stats.byCategory)) {
        byCategory[category] = {
          passing: counts.passing,
          failing: counts.failing,
          total: counts.passing + counts.failing,
        };
      }
      output.byCategory = byCategory;

      const byPriority: Record<string, { passing: number; failing: number; total: number }> = {};
      for (const [priority, counts] of Object.entries(stats.byPriority)) {
        byPriority[priority] = {
          passing: counts.passing,
          failing: counts.failing,
          total: counts.passing + counts.failing,
        };
      }
      output.byPriority = byPriority;
    }

    const progressContent = await this.loadProgressFile();
    if (progressContent) {
      const progressData = await ProgressParser.parse(this.projectDir);
      if (progressData.lastSession) {
        output.lastSession = progressData.lastSession.date || progressData.lastSession.featureId;
        if (progressData.lastSession.tokens) {
          output.lastSessionTokens = progressData.lastSession.tokens;
        }
      }
      if (progressData.totals.tokens) {
        output.totalTokens = progressData.totals.tokens;
      }
    }

    if (options.showGitLog) {
      const gitLog = await this.getGitLog();
      if (gitLog) {
        output.gitLog = gitLog.split('\n').filter((line) => line.trim());
      }
    }

    return output;
  }

  async printStatus(options: StatusReportOptions = {}): Promise<void> {
    if (options.json) {
      await this.printStatusJSON(options);
      return;
    }

    console.log('📊 PACE PROJECT STATUS');
    console.log('='.repeat(50));

    // Get current feature status
    const [passing, total] = await this.featureManager.getProgress();
    const percentage = total > 0 ? ((passing / total) * 100).toFixed(1) : '0.0';

    console.log(`Progress: ${passing}/${total} features passing (${percentage}%)`);

    const data = await this.featureManager.load();
    if (data.metadata?.token_usage) {
      const tokenPrefix = getTokenPrefix();
      console.log(
        `${tokenPrefix} Total Project Tokens: ${data.metadata.token_usage.total.toLocaleString()} (${data.metadata.token_usage.input.toLocaleString()} in, ${data.metadata.token_usage.output.toLocaleString()} out)`,
      );
    }

    console.log();

    if (options.verbose) {
      await this.printVerboseBreakdown();
    }

    if (options.showNextFeatures) {
      const next = await this.featureManager.getNextFeature();
      if (next) {
        console.log('🎯 Next Recommended Feature:');
        console.log(`   ${getPriorityIcon(next.priority)} ${next.id}: ${next.description}`);
        console.log(`   Category: ${next.category} | Priority: ${next.priority}`);
        console.log();
      } else {
        console.log('🎉 All features completed!');
        console.log();
      }
    }

    // Show git log if requested
    if (options.showGitLog) {
      const gitLog = await this.getGitLog();
      if (gitLog) {
        console.log('📝 Recent Git History:');
        console.log(
          gitLog
            .split('\n')
            .map((line) => `   ${line}`)
            .join('\n'),
        );
        console.log();
      } else {
        console.log('⚠️  Git repository not found or no commits yet\n');
      }
    }

    if (options.minTokens !== undefined && options.minTokens > 0) {
      const highTokenSessions = await this.getSessionsAboveTokenThreshold(options.minTokens);
      if (highTokenSessions.length > 0) {
        const tokenPrefix = getTokenPrefix();
        console.log(
          `${tokenPrefix} High Token Sessions (>= ${options.minTokens.toLocaleString()} tokens):`,
        );

        const featureTokens = new Map<string, number>();
        for (const session of highTokenSessions) {
          const current = featureTokens.get(session.featureId) || 0;
          featureTokens.set(session.featureId, current + session.tokens.total);
        }

        const sortedFeatures = Array.from(featureTokens.entries()).sort((a, b) => b[1] - a[1]);

        console.log(
          `   Found ${highTokenSessions.length} sessions across ${sortedFeatures.length} features:`,
        );

        for (const [featureId, totalTokens] of sortedFeatures) {
          const featureSessions = highTokenSessions.filter((s) => s.featureId === featureId);
          console.log(
            `   ${featureId}: ${totalTokens.toLocaleString()} tokens (${featureSessions.length} session${featureSessions.length > 1 ? 's' : ''})`,
          );
        }
        console.log();
      } else {
        console.log(`⚠️  No sessions found with >= ${options.minTokens.toLocaleString()} tokens\n`);
      }
    }

    // Progress file summary using extracted helper
    const progressContent = await this.loadProgressFile();
    if (progressContent) {
      const lines = this.getLastSessionLines(progressContent);
      if (lines) {
        console.log('📝 Last Session Summary:');
        for (const line of lines) {
          if (line.trim()) {
            console.log(`   ${line}`);
          }
        }
        console.log();
      }

      // Use unified parser
      const progressData = await ProgressParser.parse(this.projectDir);
      const tokenUsage = {
        lastSession: progressData.lastSession?.tokens,
        total: progressData.totals.tokens,
        tokenUsageByModel:
          progressData.totals.byModel.size > 1
            ? {
                byModel: Array.from(progressData.totals.byModel.entries()).map(
                  ([model, tokens]) => ({
                    model,
                    ...tokens,
                  }),
                ),
                total: progressData.totals.tokens,
              }
            : undefined,
      };
      const costSettings = await this.getCostSettings();
      const tokenDisplaySettings = await this.getTokenDisplaySettings();

      if (tokenUsage) {
        const tokenPrefix = getTokenPrefix();
        console.log(isAccessibleMode() ? 'Token Usage:' : '💎 Token Usage:');

        const averageTokens =
          tokenUsage.lastSession !== undefined
            ? tokenUsage.lastSession.total
            : (tokenUsage.total?.total ?? 0);

        if (tokenUsage.lastSession !== undefined) {
          const formattedLastSession = formatTokenUsageWithIndicators(
            tokenUsage.lastSession,
            tokenDisplaySettings,
            averageTokens,
          );
          console.log(`   Last session: ${formattedLastSession}`);

          // F038: Show comparison with previous session
          const sessions = progressData.sessions;
          if (sessions.length >= 2) {
            const previousSession = sessions[sessions.length - 2];
            const comparison = compareTokenUsage(
              tokenUsage.lastSession.total,
              previousSession.tokens.total,
            );
            const comparisonText = formatTokenComparison(comparison);
            console.log(`   ${comparisonText}`);
          }
        }
        if (tokenUsage.total !== undefined) {
          console.log(
            `   Total all sessions: ${tokenUsage.total.total.toLocaleString()} tokens (${tokenUsage.total.input.toLocaleString()} in, ${tokenUsage.total.output.toLocaleString()} out)`,
          );

          const budgetSettings = await this.getBudgetSettings();
          if (budgetSettings.enabled) {
            const budgetStatus = this.calculateBudgetStatus(tokenUsage.total.total, budgetSettings);
            if (budgetStatus.message) {
              console.log(`   ${budgetStatus.message}`);
            }
          }
        }

        if (tokenUsage.tokenUsageByModel && tokenUsage.tokenUsageByModel.byModel.length > 1) {
          console.log('   By Model:');
          for (const modelUsage of tokenUsage.tokenUsageByModel.byModel) {
            const modelName = ModelTokenTracker.getModelTier(modelUsage.model);
            const modelTokenUsage = {
              input: modelUsage.input,
              output: modelUsage.output,
              total: modelUsage.total,
            };
            const formattedModelUsage = formatTokenUsageWithIndicators(
              modelTokenUsage,
              tokenDisplaySettings,
              averageTokens,
            );
            console.log(`     ${modelName}: ${formattedModelUsage}`);
          }
        }

        // Show cost information if enabled
        // For status command, we'll show cost using a default model if model info is not available
        if (costSettings.enabled && tokenUsage.total) {
          // Try to use a common model for estimation if model is not specified
          const defaultModel = 'anthropic/claude-3-5-sonnet';
          const modelToUse = defaultModel; // In real implementation, this could be extracted from config

          if (isCostCalculationSupported(modelToUse, costSettings.customPricing)) {
            const totalCost = calculateCost(
              tokenUsage.total,
              modelToUse,
              costSettings.customPricing,
            );
            if (totalCost) {
              const currency = costSettings.currency || '$';
              const precision = costSettings.precision || 4;
              const costPrefix = makeAccessible('💰', 'Cost');
              console.log(
                `   ${costPrefix} Estimated total cost: ${formatCost(totalCost.totalCost, precision, currency)} (using ${modelToUse} rates)`,
              );
            }
          }
        }

        if (progressContent && tokenUsage.total && tokenUsage.total.total > 0) {
          const [passingFeatures, totalFeatures] = await this.featureManager.getProgress();
          const efficiencyScore = (passingFeatures / tokenUsage.total.total) * 1000;
          console.log(
            `🎯 Token Efficiency Score: ${efficiencyScore.toFixed(3)} features per 1000 tokens`,
          );
        }

        if (options.verbose) {
          if (progressContent && tokenUsage.total && tokenUsage.total.total > 0) {
            const efficiencyMetrics = await calculateTokenEfficiencyMetrics(this.projectDir);
            if (efficiencyMetrics.totalFeatures > 0) {
              const efficiencyLines = formatEfficiencyDisplay(efficiencyMetrics);
              for (const line of efficiencyLines.slice(1)) {
                if (line.trim()) {
                  console.log(line);
                }
              }
            }
          }
        }

        console.log();
      }
    } else {
      console.log('⚠️  progress.txt not found\n');
    }

    // Working directory
    console.log(`📂 Working Directory: ${this.projectDir}`);
    console.log();

    // Quick commands
    console.log('🚀 Quick Commands:');
    console.log('   pace                        - Run orchestrator');
    console.log('   pace status                 - Show this status');
    console.log('   pace validate               - Validate feature list');
    console.log('   pace update F001 pass       - Mark feature as passing');
    console.log();
  }

  /**
   * Print status as JSON
   */
  private async printStatusJSON(options: StatusReportOptions): Promise<void> {
    const [passing, total] = await this.featureManager.getProgress();
    const percentage = total > 0 ? (passing / total) * 100 : 0;

    const data = await this.featureManager.load();
    const projectName = data.metadata?.project_name;

    const nextFeature = await this.featureManager.getNextFeature();
    const nextFeatures = nextFeature
      ? [
          {
            id: nextFeature.id,
            description: nextFeature.description,
            priority: nextFeature.priority,
            category: nextFeature.category,
          },
        ]
      : [];

    const output: any = {
      projectName,
      progress: {
        passing,
        failing: total - passing,
        total,
        percentage,
      },
      nextFeatures,
      workingDirectory: this.projectDir,
    };

    if (data.metadata?.token_usage) {
      output.projectTokenUsage = data.metadata.token_usage;
    }

    if (options.verbose) {
      const stats = await this.featureManager.getStats();

      const byCategory: Record<string, { passing: number; failing: number; total: number }> = {};
      for (const [category, counts] of Object.entries(stats.byCategory)) {
        byCategory[category] = {
          passing: counts.passing,
          failing: counts.failing,
          total: counts.passing + counts.failing,
        };
      }
      output.byCategory = byCategory;

      const byPriority: Record<string, { passing: number; failing: number; total: number }> = {};
      for (const [priority, counts] of Object.entries(stats.byPriority)) {
        byPriority[priority] = {
          passing: counts.passing,
          failing: counts.failing,
          total: counts.passing + counts.failing,
        };
      }
      output.byPriority = byPriority;
    }

    const progressContent = await this.loadProgressFile();
    if (progressContent) {
      const progressData = await ProgressParser.parse(this.projectDir);
      if (progressData.lastSession) {
        output.lastSession = progressData.lastSession.featureId;
        if (progressData.lastSession.tokens) {
          output.lastSessionTokens = progressData.lastSession.tokens;
        }
      }
      if (progressData.totals.tokens) {
        output.totalTokens = progressData.totals.tokens;
      }
      if (progressData.totals.byModel.size > 1) {
        output.tokenUsageByModel = {
          byModel: Array.from(progressData.totals.byModel.entries()).map(([model, tokens]) => ({
            model,
            ...tokens,
          })),
          total: progressData.totals.tokens,
        };
      }
    }

    if (options.showGitLog) {
      const gitLog = await this.getGitLog();
      if (gitLog) {
        output.gitLog = gitLog.split('\n').filter((line) => line.trim());
      }
    }

    if (options.minTokens !== undefined && options.minTokens > 0) {
      const highTokenSessions = await this.getSessionsAboveTokenThreshold(options.minTokens);
      const featureTokens = new Map<string, { totalTokens: number; sessionCount: number }>();

      for (const session of highTokenSessions) {
        const current = featureTokens.get(session.featureId) || { totalTokens: 0, sessionCount: 0 };
        featureTokens.set(session.featureId, {
          totalTokens: current.totalTokens + session.tokens.total,
          sessionCount: current.sessionCount + 1,
        });
      }

      const sortedFeatures = Array.from(featureTokens.entries())
        .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
        .map(([featureId, data]) => ({
          featureId,
          totalTokens: data.totalTokens,
          sessionCount: data.sessionCount,
        }));

      output.highTokenSessions = {
        threshold: options.minTokens,
        totalSessions: highTokenSessions.length,
        featureCount: sortedFeatures.length,
        features: sortedFeatures,
      };
    }

    console.log(JSON.stringify(output, null, 2));
  }

  /**
   * Print verbose breakdown by category and priority
   */
  private async printVerboseBreakdown(): Promise<void> {
    const stats = await this.featureManager.getStats();

    console.log('📁 Progress by Category:');
    const categories = Object.keys(stats.byCategory).sort();
    if (categories.length > 0) {
      for (const category of categories) {
        const { passing, failing } = stats.byCategory[category];
        const total = passing + failing;
        const percentage = total > 0 ? ((passing / total) * 100).toFixed(1) : '0.0';
        console.log(
          `   ${category.padEnd(20)} ${passing}/${total} (${percentage}%) - ${passing} pass, ${failing} fail`,
        );
      }
    } else {
      console.log('   (No categories)');
    }
    console.log();

    console.log('⚡ Progress by Priority:');
    const priorities: Priority[] = ['critical', 'high', 'medium', 'low'];
    for (const priority of priorities) {
      const { passing, failing } = stats.byPriority[priority];
      const total = passing + failing;
      if (total > 0) {
        const percentage = ((passing / total) * 100).toFixed(1);
        console.log(
          `   ${getPriorityIcon(priority)} ${priority.padEnd(10)} ${passing}/${total} (${percentage}%) - ${passing} pass, ${failing} fail`,
        );
      }
    }
    console.log();
  }

  private formatNumberWithSuffix(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }

  async printCompactStatus(): Promise<void> {
    const [passing, total] = await this.featureManager.getProgress();
    const pct = total > 0 ? ((passing / total) * 100).toFixed(1) : '0.0';

    const data = await this.featureManager.load();
    let tokenSummary = '';

    if (data.metadata?.token_usage) {
      const totalTokens = data.metadata.token_usage.total;
      const formattedTokens = this.formatNumberWithSuffix(totalTokens);
      tokenSummary = ` 💎 ${formattedTokens} tokens`;
    }

    console.log(`📊 ${passing}/${total} features passing (${pct}%)${tokenSummary}`);
  }

  /**
   * Print only next recommended feature to implement
   */
  async printNextFeature(): Promise<void> {
    const next = await this.featureManager.getNextFeature();
    if (next) {
      console.log(`🎯 Next: ${getPriorityIcon(next.priority)} ${next.id} - ${next.description}`);
    } else {
      console.log('🎉 All features completed!');
    }
  }

  /**
   * Print validation results
   */
  async printValidation(result: { valid: boolean; errors: any[]; stats: any }): Promise<void> {
    if (result.valid) {
      console.log('✅ Feature list is valid');
    } else {
      console.log('❌ Feature list has validation errors:');
      result.errors.forEach((error: any) => {
        console.log(`   • ${error.message}`);
      });
    }
    console.log();
  }
}
