/**
 * token-efficiency.ts - Calculate and analyze token efficiency metrics
 */

import type { FeatureEfficiency, TokenEfficiencyMetrics } from './types';
import { ProgressParser } from './progress-parser';

/**
 * Extract feature efficiency data from progress.txt content
 *
 * @deprecated Use extractFeatureEfficiencyFromProject() instead
 *
 * Parses session data to map token usage to specific features,
 * enabling efficiency analysis across the project.
 *
 * @param progressContent - Raw content from progress.txt file
 * @returns Array of feature efficiency data
 *
 * @example
 * ```typescript
 * const progressContent = await readFile('progress.txt', 'utf-8');
 * const featureData = extractFeatureEfficiencyData(progressContent);
 * // Returns: [{ featureId: 'F021', featureDescription: '...', tokenUsage: 1500, ... }]
 * ```
 */
export function extractFeatureEfficiencyData(progressContent: string): FeatureEfficiency[] {
  const featureEfficiencyMap = new Map<
    string,
    {
      description: string;
      tokenUsage: number;
      sessionCount: number;
    }
  >();

  // Split progress content into sessions
  const sessions = progressContent.split('\n---\n');

  for (const session of sessions) {
    if (!session.includes('### Session') || !session.includes('Feature Worked On:')) {
      continue;
    }

    // Extract feature ID and description
    const featureMatch = session.match(/- (F\d+):\s*(.+)/);
    if (!featureMatch) {
      continue;
    }

    const featureId = featureMatch[1];
    let featureDescription = featureMatch[2].trim();

    // Handle empty description case
    if (
      !featureDescription ||
      featureDescription.startsWith('**') ||
      featureDescription.startsWith('-')
    ) {
      featureDescription = '';
    } else {
      // Truncate at next section marker or bullet to avoid capturing too much
      const cutIndex = Math.min(
        featureDescription.indexOf('\n**') !== -1 ? featureDescription.indexOf('\n**') : Infinity,
        featureDescription.indexOf('\n-') !== -1 ? featureDescription.indexOf('\n-') : Infinity,
        featureDescription.indexOf('\n\n') !== -1 ? featureDescription.indexOf('\n\n') : Infinity,
      );

      if (cutIndex !== Infinity) {
        featureDescription = featureDescription.substring(0, cutIndex).trim();
      }
    }

    // Extract token usage
    const totalTokensMatch = session.match(/Total tokens: ([\d,]+)/);
    if (!totalTokensMatch) {
      continue;
    }

    const tokenUsage = parseInt(totalTokensMatch[1].replace(/,/g, ''));
    if (isNaN(tokenUsage) || tokenUsage < 0) {
      continue;
    }

    // Aggregate data for this feature
    const existing = featureEfficiencyMap.get(featureId);
    if (existing) {
      existing.tokenUsage += tokenUsage;
      existing.sessionCount += 1;
    } else {
      featureEfficiencyMap.set(featureId, {
        description: featureDescription,
        tokenUsage,
        sessionCount: 1,
      });
    }
  }

  // Convert to FeatureEfficiency array
  const efficiencyData: FeatureEfficiency[] = [];

  for (const [featureId, data] of featureEfficiencyMap.entries()) {
    const tokensPerSession = data.tokenUsage / data.sessionCount;

    efficiencyData.push({
      featureId,
      featureDescription: data.description,
      tokenUsage: data.tokenUsage,
      sessionCount: data.sessionCount,
      tokensPerSession: Math.round(tokensPerSession),
      efficiencyScore: data.tokenUsage, // tokens per feature
    });
  }

  // Sort by efficiency score (ascending = more efficient)
  return efficiencyData.sort((a, b) => a.efficiencyScore - b.efficiencyScore);
}

/**
 * Extract feature efficiency data using ProgressParser (recommended)
 */
export async function extractFeatureEfficiencyFromProject(
  projectDir: string,
): Promise<FeatureEfficiency[]> {
  const progressData = await ProgressParser.parse(projectDir);

  const efficiencyData: FeatureEfficiency[] = [];

  for (const [featureId, data] of progressData.totals.byFeature.entries()) {
    const tokensPerSession = data.tokens / data.sessions;

    efficiencyData.push({
      featureId,
      featureDescription: '',
      tokenUsage: data.tokens,
      sessionCount: data.sessions,
      tokensPerSession: Math.round(tokensPerSession),
      efficiencyScore: data.tokens,
    });
  }

  return efficiencyData.sort((a, b) => a.efficiencyScore - b.efficiencyScore);
}

/**
 * Calculate comprehensive token efficiency metrics
 *
 * Analyzes feature efficiency data to provide insights about token consumption
 * patterns, identify optimization opportunities, and highlight efficiency outliers.
 *
 * @param projectDir - Project directory path
 * @returns Complete token efficiency analysis
 *
 * @example
 * ```typescript
 * const metrics = await calculateTokenEfficiencyMetrics('/path/to/project');
 * console.log(`Average tokens per feature: ${metrics.averageTokensPerFeature}`);
 * console.log(`Most efficient feature: ${metrics.mostEfficient[0].featureId}`);
 * ```
 */
export async function calculateTokenEfficiencyMetrics(
  projectDir: string,
): Promise<TokenEfficiencyMetrics> {
  const featureData = await extractFeatureEfficiencyFromProject(projectDir);

  if (featureData.length === 0) {
    return {
      totalFeatures: 0,
      totalTokens: 0,
      averageTokensPerFeature: 0,
      averageTokensPerSession: 0,
      mostEfficient: [],
      leastEfficient: [],
      optimizationOpportunities: [],
    };
  }

  const totalFeatures = featureData.length;
  const totalTokens = featureData.reduce((sum, feature) => sum + feature.tokenUsage, 0);
  const totalSessions = featureData.reduce((sum, feature) => sum + feature.sessionCount, 0);

  const averageTokensPerFeature = Math.round(totalTokens / totalFeatures);
  const averageTokensPerSession = Math.round(totalTokens / totalSessions);

  // Find most efficient features (bottom 25% by token usage)
  const mostEfficientCount = Math.max(1, Math.ceil(totalFeatures * 0.25));
  const mostEfficient = featureData.slice(0, mostEfficientCount);

  // Find least efficient features (top 25% by token usage)
  const leastEfficientCount = Math.max(1, Math.ceil(totalFeatures * 0.25));
  const leastEfficient = featureData.slice(-leastEfficientCount).reverse();

  // Generate optimization opportunities
  const optimizationOpportunities = generateOptimizationOpportunities(
    featureData,
    averageTokensPerFeature,
    averageTokensPerSession,
  );

  return {
    totalFeatures,
    totalTokens,
    averageTokensPerFeature,
    averageTokensPerSession,
    mostEfficient,
    leastEfficient,
    optimizationOpportunities,
  };
}

/**
 * Generate optimization suggestions based on efficiency analysis
 *
 * Analyzes token usage patterns to provide actionable recommendations
 * for improving development efficiency and reducing token consumption.
 *
 * @param featureData - Array of feature efficiency data
 * @param averageTokensPerFeature - Project average tokens per feature
 * @param averageTokensPerSession - Project average tokens per session
 * @returns Array of optimization suggestions
 */
function generateOptimizationOpportunities(
  featureData: FeatureEfficiency[],
  averageTokensPerFeature: number,
  averageTokensPerSession: number,
): string[] {
  const opportunities: string[] = [];

  if (featureData.length === 0) {
    return opportunities;
  }

  // Find features with significantly high token usage
  const highTokenFeatures = featureData.filter(
    (feature) => feature.tokenUsage > averageTokensPerFeature * 1.5,
  );

  if (highTokenFeatures.length > 0) {
    opportunities.push(
      `Consider breaking down high-token features into smaller sub-features (${highTokenFeatures.map((f) => f.featureId).join(', ')})`,
    );
  }

  // Find features with many sessions
  const multiSessionFeatures = featureData.filter((feature) => feature.sessionCount > 1);

  if (multiSessionFeatures.length > 0) {
    const avgTokensPerMultiSession =
      multiSessionFeatures.reduce((sum, feature) => sum + feature.tokensPerSession, 0) /
      multiSessionFeatures.length;

    if (avgTokensPerMultiSession > averageTokensPerSession * 1.2) {
      opportunities.push(
        'Review prompt engineering for multi-session features to reduce per-session token consumption',
      );
    }
  }

  // Check for features with very high per-session token usage
  const highPerSessionFeatures = featureData.filter(
    (feature) => feature.tokensPerSession > averageTokensPerSession * 2,
  );

  if (highPerSessionFeatures.length > 0) {
    opportunities.push(
      `Investigate alternative approaches for ${highPerSessionFeatures.map((f) => f.featureId).join(', ')} - high per-session token usage detected`,
    );
  }

  // General optimization suggestions
  if (averageTokensPerFeature > 5000) {
    opportunities.push(
      'Project average tokens per feature is high - consider implementing feature templates or code generation tools',
    );
  }

  if (averageTokensPerSession > 3000) {
    opportunities.push(
      'Consider using more focused prompts and smaller context windows to reduce per-session token usage',
    );
  }

  // Feature-specific suggestions
  const leastEfficient = featureData.slice(-3).reverse();
  for (const feature of leastEfficient) {
    if (feature.tokenUsage > averageTokensPerFeature * 2) {
      opportunities.push(
        `Analyze ${feature.featureId} workflow - uses ${(feature.tokenUsage / averageTokensPerFeature).toFixed(1)}x more tokens than average`,
      );
    }
  }

  return opportunities.slice(0, 5); // Limit to top 5 suggestions
}

/**
 * Format token efficiency metrics for display
 *
 * Creates human-readable output of efficiency analysis suitable for
 * console display or inclusion in reports.
 *
 * @param metrics - Token efficiency metrics to format
 * @returns Formatted string array for display
 *
 * @example
 * ```typescript
 * const metrics = calculateTokenEfficiencyMetrics(progressContent);
 * const formatted = formatEfficiencyDisplay(metrics);
 * formatted.forEach(line => console.log(line));
 * ```
 */
export function formatEfficiencyDisplay(metrics: TokenEfficiencyMetrics): string[] {
  const lines: string[] = [];

  if (metrics.totalFeatures === 0) {
    lines.push('📊 No token efficiency data available');
    return lines;
  }

  lines.push('📊 Token Efficiency Metrics:');
  lines.push('');

  // Summary metrics
  lines.push(`   Features analyzed: ${metrics.totalFeatures}`);
  lines.push(`   Average tokens per feature: ${metrics.averageTokensPerFeature.toLocaleString()}`);
  lines.push(`   Average tokens per session: ${metrics.averageTokensPerSession.toLocaleString()}`);
  lines.push('');

  // Most efficient features
  if (metrics.mostEfficient.length > 0) {
    lines.push('   🟢 Most Efficient Features:');
    for (const feature of metrics.mostEfficient.slice(0, 3)) {
      lines.push(
        `      ${feature.featureId}: ${feature.tokenUsage.toLocaleString()} tokens (${feature.sessionCount} session${feature.sessionCount !== 1 ? 's' : ''})`,
      );
    }
    lines.push('');
  }

  // Least efficient features
  if (metrics.leastEfficient.length > 0) {
    lines.push('   🟡 Least Efficient Features:');
    for (const feature of metrics.leastEfficient.slice(0, 3)) {
      lines.push(
        `      ${feature.featureId}: ${feature.tokenUsage.toLocaleString()} tokens (${feature.sessionCount} session${feature.sessionCount !== 1 ? 's' : ''})`,
      );
    }
    lines.push('');
  }

  // Optimization opportunities
  if (metrics.optimizationOpportunities.length > 0) {
    lines.push('   💡 Optimization Opportunities:');
    for (const opportunity of metrics.optimizationOpportunities) {
      lines.push(`      • ${opportunity}`);
    }
    lines.push('');
  }

  return lines;
}
