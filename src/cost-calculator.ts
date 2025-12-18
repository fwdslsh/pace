/**
 * cost-calculator.ts - Token usage cost calculation utilities
 *
 * Provides functionality to calculate costs based on token usage and model pricing.
 * Includes default pricing data for common providers and support for custom pricing.
 */

import type { TokenUsage, CostBreakdown, ModelPricing, CostConfig } from './types';

// ============================================================================
// Default Model Pricing Data
// ============================================================================

/**
 * Default pricing data for common model providers
 * Prices are in USD per 1,000 tokens
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude models
  'anthropic/claude-3-5-sonnet': {
    inputPrice: 3.0,
    outputPrice: 15.0,
    provider: 'anthropic',
  },
  'anthropic/claude-3-5-haiku': {
    inputPrice: 0.8,
    outputPrice: 4.0,
    provider: 'anthropic',
  },
  'anthropic/claude-3-opus': {
    inputPrice: 15.0,
    outputPrice: 75.0,
    provider: 'anthropic',
  },
  'anthropic/claude-3-sonnet': {
    inputPrice: 3.0,
    outputPrice: 15.0,
    provider: 'anthropic',
  },
  'anthropic/claude-3-haiku': {
    inputPrice: 0.25,
    outputPrice: 1.25,
    provider: 'anthropic',
  },

  // OpenAI GPT models
  'openai/gpt-4o': {
    inputPrice: 2.5,
    outputPrice: 10.0,
    provider: 'openai',
  },
  'openai/gpt-4o-mini': {
    inputPrice: 0.15,
    outputPrice: 0.6,
    provider: 'openai',
  },
  'openai/gpt-4-turbo': {
    inputPrice: 10.0,
    outputPrice: 30.0,
    provider: 'openai',
  },
  'openai/gpt-4': {
    inputPrice: 30.0,
    outputPrice: 60.0,
    provider: 'openai',
  },
  'openai/gpt-3.5-turbo': {
    inputPrice: 0.5,
    outputPrice: 1.5,
    provider: 'openai',
  },

  // Google Gemini models
  'google/gemini-1.5-pro': {
    inputPrice: 1.25,
    outputPrice: 5.0,
    provider: 'google',
  },
  'google/gemini-1.5-flash': {
    inputPrice: 0.075,
    outputPrice: 0.3,
    provider: 'google',
  },
  'google/gemini-pro': {
    inputPrice: 0.5,
    outputPrice: 1.5,
    provider: 'google',
  },
};

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Parse model identifier to extract provider and base model name
 *
 * @param modelId - Full model identifier (e.g., 'anthropic/claude-3-5-sonnet')
 * @returns Object with provider and base model name
 */
function parseModelId(modelId: string): { provider: string; baseModel: string } {
  if (!modelId || typeof modelId !== 'string') {
    return { provider: 'unknown', baseModel: modelId || '' };
  }

  const parts = modelId.split('/');
  if (parts.length >= 2) {
    return {
      provider: parts[0],
      baseModel: parts.slice(1).join('/'),
    };
  }

  // If no provider prefix, try to infer from model name
  if (modelId.includes('claude')) {
    return { provider: 'anthropic', baseModel: modelId };
  }
  if (modelId.includes('gpt')) {
    return { provider: 'openai', baseModel: modelId };
  }
  if (modelId.includes('gemini')) {
    return { provider: 'google', baseModel: modelId };
  }

  return { provider: 'unknown', baseModel: modelId };
}

/**
 * Find pricing for a given model, with fallback to similar models
 *
 * @param modelId - Model identifier
 * @param customPricing - Optional custom pricing overrides
 * @returns Model pricing information or null if not found
 */
function findModelPricing(
  modelId: string,
  customPricing?: Record<string, ModelPricing>,
): ModelPricing | null {
  // Check custom pricing first
  if (customPricing?.[modelId]) {
    return customPricing[modelId];
  }

  // Check default pricing
  if (DEFAULT_MODEL_PRICING[modelId]) {
    return DEFAULT_MODEL_PRICING[modelId];
  }

  // Try to find pricing for base models without provider prefix
  const { provider, baseModel } = parseModelId(modelId);

  // Check for base model in custom pricing
  if (customPricing?.[baseModel]) {
    return customPricing[baseModel];
  }

  // Check for base model in default pricing
  if (DEFAULT_MODEL_PRICING[baseModel]) {
    return DEFAULT_MODEL_PRICING[baseModel];
  }

  // Try to find similar models by pattern matching
  for (const [key, pricing] of Object.entries(DEFAULT_MODEL_PRICING)) {
    const { provider: keyProvider, baseModel: keyBaseModel } = parseModelId(key);

    // Same provider and similar model name
    if (keyProvider === provider && keyBaseModel.includes(baseModel.split('-')[0])) {
      return pricing;
    }
  }

  return null;
}

/**
 * Calculate cost breakdown for token usage
 *
 * @param tokens - Token usage data
 * @param modelId - Model identifier
 * @param customPricing - Optional custom pricing overrides
 * @returns Cost breakdown or null if pricing not available
 */
export function calculateCost(
  tokens: TokenUsage,
  modelId: string,
  customPricing?: Record<string, ModelPricing>,
): CostBreakdown | null {
  const pricing = findModelPricing(modelId, customPricing);

  if (!pricing) {
    return null;
  }

  const inputCost = (tokens.input / 1000) * pricing.inputPrice;
  const outputCost = (tokens.output / 1000) * pricing.outputPrice;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
  };
}

/**
 * Format cost for display with appropriate precision and currency
 *
 * @param cost - Cost amount in USD
 * @param precision - Number of decimal places (default: 4)
 * @param currency - Currency symbol (default: '$')
 * @returns Formatted cost string
 */
export function formatCost(cost: number, precision: number = 4, currency: string = '$'): string {
  return `${currency}${cost.toFixed(precision)}`;
}

/**
 * Get default cost configuration
 *
 * @returns Default cost configuration
 */
export function getDefaultCostConfig(): CostConfig {
  return {
    enabled: true,
    currency: 'USD',
    precision: 4,
  };
}

/**
 * Check if cost calculation is supported for a given model
 *
 * @param modelId - Model identifier
 * @param customPricing - Optional custom pricing overrides
 * @returns True if pricing is available for the model
 */
export function isCostCalculationSupported(
  modelId: string,
  customPricing?: Record<string, ModelPricing>,
): boolean {
  return findModelPricing(modelId, customPricing) !== null;
}

/**
 * Get all supported models and their pricing
 *
 * @param customPricing - Optional custom pricing overrides
 * @returns Record of model IDs to their pricing information
 */
export function getSupportedModels(
  customPricing?: Record<string, ModelPricing>,
): Record<string, ModelPricing> {
  const allPricing = { ...DEFAULT_MODEL_PRICING };

  if (customPricing) {
    Object.assign(allPricing, customPricing);
  }

  return allPricing;
}

/**
 * Estimate cost for a feature based on typical token usage
 *
 * @param modelId - Model identifier
 * @param complexity - Feature complexity: 'simple', 'medium', or 'complex'
 * @param customPricing - Optional custom pricing overrides
 * @returns Estimated cost or null if pricing not available
 */
export function estimateFeatureCost(
  modelId: string,
  complexity: 'simple' | 'medium' | 'complex',
  customPricing?: Record<string, ModelPricing>,
): CostBreakdown | null {
  const pricing = findModelPricing(modelId, customPricing);

  if (!pricing) {
    return null;
  }

  // Typical token usage estimates per feature complexity
  const tokenEstimates = {
    simple: { input: 2000, output: 1000 },
    medium: { input: 5000, output: 2500 },
    complex: { input: 10000, output: 5000 },
  };

  const tokens = tokenEstimates[complexity];

  const inputCost = (tokens.input / 1000) * pricing.inputPrice;
  const outputCost = (tokens.output / 1000) * pricing.outputPrice;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
  };
}
