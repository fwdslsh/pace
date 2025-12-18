/**
 * model-token-tracker.ts - Track token usage by model tier (F024)
 *
 * Provides functionality to track and aggregate token usage across different
 * model tiers (sonnet, opus, etc.) for comprehensive token analysis.
 */

import type { TokenUsage, ModelTokenUsage, TokenUsageByModel } from './types';

/**
 * Manages token usage tracking across different model tiers
 *
 * Accumulates token usage data for individual sessions and provides
 * methods to retrieve model-specific breakdowns and aggregate totals.
 */
export class ModelTokenTracker {
  private modelTokens: Map<string, TokenUsage> = new Map();

  /**
   * Add token usage for a specific model
   *
   * @param model - Model identifier (e.g., 'anthropic/claude-3-5-sonnet')
   * @param tokens - Token usage data to add
   */
  addTokenUsage(model: string, tokens: TokenUsage): void {
    if (!model || !tokens) return;

    const existing = this.modelTokens.get(model) || { input: 0, output: 0, total: 0 };

    this.modelTokens.set(model, {
      input: existing.input + tokens.input,
      output: existing.output + tokens.output,
      total: existing.total + tokens.total,
    });
  }

  /**
   * Get token usage for a specific model
   *
   * @param model - Model identifier
   * @returns Token usage for the model, or undefined if not found
   */
  getModelUsage(model: string): ModelTokenUsage | undefined {
    const tokens = this.modelTokens.get(model);
    if (!tokens) return undefined;

    return {
      model,
      ...tokens,
    };
  }

  /**
   * Get all model token usage breakdowns
   *
   * @returns Array of model token usage data
   */
  getAllModelUsage(): ModelTokenUsage[] {
    const result: ModelTokenUsage[] = [];

    for (const [model, tokens] of this.modelTokens.entries()) {
      result.push({
        model,
        ...tokens,
      });
    }

    return result.sort((a, b) => b.total - a.total); // Sort by total usage descending
  }

  /**
   * Get aggregate total token usage across all models
   *
   * @returns Total token usage across all models
   */
  getTotalUsage(): TokenUsage {
    const total: TokenUsage = { input: 0, output: 0, total: 0 };

    for (const tokens of this.modelTokens.values()) {
      total.input += tokens.input;
      total.output += tokens.output;
      total.total += tokens.total;
    }

    return total;
  }

  /**
   * Get complete model breakdown summary
   *
   * @returns TokenUsageByModel with per-model breakdowns and totals
   */
  getSummary(): TokenUsageByModel {
    return {
      byModel: this.getAllModelUsage(),
      total: this.getTotalUsage(),
    };
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.modelTokens.clear();
  }

  /**
   * Get the number of distinct models tracked
   *
   * @returns Count of unique models
   */
  getModelCount(): number {
    return this.modelTokens.size;
  }

  /**
   * Get list of all tracked model identifiers
   *
   * @returns Array of model IDs
   */
  getTrackedModels(): string[] {
    return Array.from(this.modelTokens.keys());
  }

  /**
   * Extract model tier from model ID for categorization
   *
   * @param modelId - Full model identifier (e.g., 'anthropic/claude-3-5-sonnet')
   * @returns Model tier (e.g., 'sonnet', 'opus', 'gpt-4', etc.)
   */
  static getModelTier(modelId: string): string {
    if (!modelId) return 'unknown';

    const lowerModel = modelId.toLowerCase();

    // Anthropic models
    if (lowerModel.includes('sonnet')) return 'sonnet';
    if (lowerModel.includes('opus')) return 'opus';
    if (lowerModel.includes('haiku')) return 'haiku';

    // OpenAI models
    if (lowerModel.includes('gpt-4')) return 'gpt-4';
    if (lowerModel.includes('gpt-3.5')) return 'gpt-3.5';
    if (lowerModel.includes('o1')) return 'o1';

    // Google models
    if (lowerModel.includes('gemini')) {
      if (lowerModel.includes('pro')) return 'gemini-pro';
      if (lowerModel.includes('ultra')) return 'gemini-ultra';
      return 'gemini';
    }

    // Fallback to extracting last part after slash
    const parts = modelId.split('/');
    return parts[parts.length - 1] || 'unknown';
  }

  /**
   * Group token usage by model tier (sonnet, opus, etc.)
   *
   * @returns Record mapping tier names to aggregated token usage
   */
  getUsageByTier(): Record<string, TokenUsage> {
    const tierUsage: Record<string, TokenUsage> = {};

    for (const [modelId, tokens] of this.modelTokens.entries()) {
      const tier = ModelTokenTracker.getModelTier(modelId);

      if (!tierUsage[tier]) {
        tierUsage[tier] = { input: 0, output: 0, total: 0 };
      }

      tierUsage[tier].input += tokens.input;
      tierUsage[tier].output += tokens.output;
      tierUsage[tier].total += tokens.total;
    }

    return tierUsage;
  }
}

/**
 * Create a ModelTokenTracker instance
 *
 * @returns New ModelTokenTracker instance
 */
export function createModelTokenTracker(): ModelTokenTracker {
  return new ModelTokenTracker();
}
