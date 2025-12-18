/**
 * token-overflow.ts - Handle token overflow for extremely long sessions (F045)
 *
 * Provides utilities to safely handle large token counts without integer overflow.
 * JavaScript's Number type can safely represent integers up to Number.MAX_SAFE_INTEGER
 * (2^53 - 1 = 9,007,199,254,740,991 ~= 9 quadrillion).
 *
 * For reference:
 * - 1 million tokens = 1,000,000
 * - 1 billion tokens = 1,000,000,000
 * - MAX_SAFE_INTEGER = 9,007,199,254,740,991
 *
 * In practice, hitting this limit would require an extremely long session
 * (thousands of sessions each with millions of tokens), but we protect against
 * it nonetheless for robustness.
 */

import type { TokenUsage } from './types';

/**
 * Maximum safe integer value for JavaScript numbers
 * Beyond this, integer arithmetic becomes unsafe
 */
export const MAX_SAFE_TOKEN_COUNT = Number.MAX_SAFE_INTEGER;

/**
 * Warning threshold (90% of max safe integer)
 * If tokens exceed this, we should warn the user
 */
export const TOKEN_WARNING_THRESHOLD = Math.floor(MAX_SAFE_TOKEN_COUNT * 0.9);

/**
 * Result of token overflow check
 */
export interface TokenOverflowCheck {
  /**
   * Whether the token counts are safe (within MAX_SAFE_INTEGER)
   */
  isSafe: boolean;

  /**
   * Whether the token counts are approaching the limit (>90% of max)
   */
  isNearLimit: boolean;

  /**
   * Warning message if tokens are unsafe or near limit
   */
  warning?: string;

  /**
   * Field that caused the overflow (input, output, or total)
   */
  overflowField?: 'input' | 'output' | 'total';
}

/**
 * Check if a token count is within safe integer range
 *
 * @param value - Token count to check
 * @returns true if the value is a safe integer
 *
 * @example
 * ```typescript
 * isSafeTokenCount(1_000_000); // true
 * isSafeTokenCount(Number.MAX_SAFE_INTEGER); // true
 * isSafeTokenCount(Number.MAX_SAFE_INTEGER + 1); // false
 * ```
 */
export function isSafeTokenCount(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Check if a token count is approaching the safe integer limit
 *
 * @param value - Token count to check
 * @returns true if value exceeds 90% of MAX_SAFE_INTEGER
 *
 * @example
 * ```typescript
 * isNearTokenLimit(1_000_000); // false
 * isNearTokenLimit(TOKEN_WARNING_THRESHOLD + 1); // true
 * ```
 */
export function isNearTokenLimit(value: number): boolean {
  return value > TOKEN_WARNING_THRESHOLD;
}

/**
 * Safely add two token counts, checking for overflow
 *
 * @param a - First token count
 * @param b - Second token count
 * @returns Sum of a and b, capped at MAX_SAFE_INTEGER if overflow would occur
 *
 * @example
 * ```typescript
 * safeAdd(1000, 2000); // 3000
 * safeAdd(MAX_SAFE_INTEGER, 1); // MAX_SAFE_INTEGER (capped)
 * ```
 */
export function safeAdd(a: number, b: number): number {
  const sum = a + b;

  // Check if the result is a safe integer
  if (!Number.isSafeInteger(sum)) {
    // Cap at MAX_SAFE_INTEGER
    return MAX_SAFE_TOKEN_COUNT;
  }

  return sum;
}

/**
 * Validate token usage object for overflow issues
 *
 * Checks all token fields (input, output, total) for:
 * - Integer overflow (exceeds MAX_SAFE_INTEGER)
 * - Approaching limit (>90% of MAX_SAFE_INTEGER)
 *
 * @param tokens - Token usage object to validate
 * @returns Overflow check result with warnings if applicable
 *
 * @example
 * ```typescript
 * const tokens = { input: 1_000_000, output: 2_000_000, total: 3_000_000 };
 * const check = checkTokenOverflow(tokens);
 * console.log(check.isSafe); // true
 * ```
 */
export function checkTokenOverflow(tokens: TokenUsage): TokenOverflowCheck {
  // Check input tokens
  if (!isSafeTokenCount(tokens.input)) {
    return {
      isSafe: false,
      isNearLimit: false,
      overflowField: 'input',
      warning: `Input token count (${formatLargeNumber(tokens.input)}) exceeds safe integer range (${formatLargeNumber(MAX_SAFE_TOKEN_COUNT)})`,
    };
  }

  // Check output tokens
  if (!isSafeTokenCount(tokens.output)) {
    return {
      isSafe: false,
      isNearLimit: false,
      overflowField: 'output',
      warning: `Output token count (${formatLargeNumber(tokens.output)}) exceeds safe integer range (${formatLargeNumber(MAX_SAFE_TOKEN_COUNT)})`,
    };
  }

  // Check total tokens
  if (!isSafeTokenCount(tokens.total)) {
    return {
      isSafe: false,
      isNearLimit: false,
      overflowField: 'total',
      warning: `Total token count (${formatLargeNumber(tokens.total)}) exceeds safe integer range (${formatLargeNumber(MAX_SAFE_TOKEN_COUNT)})`,
    };
  }

  // Check if approaching limit
  const maxToken = Math.max(tokens.input, tokens.output, tokens.total);
  if (isNearTokenLimit(maxToken)) {
    const percentOfMax = ((maxToken / MAX_SAFE_TOKEN_COUNT) * 100).toFixed(1);
    return {
      isSafe: true,
      isNearLimit: true,
      warning: `Token count is approaching safe integer limit (${percentOfMax}% of maximum). Current: ${formatLargeNumber(maxToken)}, Max: ${formatLargeNumber(MAX_SAFE_TOKEN_COUNT)}`,
    };
  }

  return {
    isSafe: true,
    isNearLimit: false,
  };
}

/**
 * Calculate total tokens safely from input and output
 *
 * Uses safe addition to prevent overflow when summing token counts.
 *
 * @param input - Input token count
 * @param output - Output token count
 * @param reasoning - Optional reasoning token count
 * @returns Safe total of input + output + reasoning
 *
 * @example
 * ```typescript
 * calculateSafeTotal(1000, 2000); // 3000
 * calculateSafeTotal(MAX_SAFE_INTEGER / 2, MAX_SAFE_INTEGER / 2); // MAX_SAFE_INTEGER
 * calculateSafeTotal(1000, 2000, 500); // 3500
 * ```
 */
export function calculateSafeTotal(input: number, output: number, reasoning: number = 0): number {
  let total = safeAdd(input, output);
  if (reasoning > 0) {
    total = safeAdd(total, reasoning);
  }
  return total;
}

/**
 * Format large numbers with thousands separators
 *
 * Uses toLocaleString() for proper formatting of large token counts.
 *
 * @param value - Number to format
 * @returns Formatted string with thousands separators
 *
 * @example
 * ```typescript
 * formatLargeNumber(1000); // "1,000"
 * formatLargeNumber(1_000_000); // "1,000,000"
 * formatLargeNumber(9_007_199_254_740_991); // "9,007,199,254,740,991"
 * ```
 */
export function formatLargeNumber(value: number): string {
  return value.toLocaleString();
}

/**
 * Create a safe token usage object
 *
 * Validates and creates a TokenUsage object with overflow protection.
 * If overflow is detected, caps values at MAX_SAFE_INTEGER.
 *
 * @param input - Input token count
 * @param output - Output token count
 * @param reasoning - Optional reasoning token count
 * @returns Safe TokenUsage object
 *
 * @example
 * ```typescript
 * const tokens = createSafeTokenUsage(1000, 2000);
 * // { input: 1000, output: 2000, total: 3000 }
 *
 * const large = createSafeTokenUsage(MAX_SAFE_INTEGER, 1000);
 * // { input: MAX_SAFE_INTEGER, output: 1000, total: MAX_SAFE_INTEGER }
 * ```
 */
export function createSafeTokenUsage(
  input: number,
  output: number,
  reasoning: number = 0,
): TokenUsage {
  // Cap individual values at MAX_SAFE_INTEGER
  const safeInput = isSafeTokenCount(input) ? input : MAX_SAFE_TOKEN_COUNT;
  const safeOutput = isSafeTokenCount(output) ? output : MAX_SAFE_TOKEN_COUNT;

  // Calculate total safely
  const total = calculateSafeTotal(safeInput, safeOutput, reasoning);

  return {
    input: safeInput,
    output: safeOutput,
    total,
  };
}

/**
 * Accumulate token usage across multiple sessions safely
 *
 * Aggregates token counts from multiple sessions with overflow protection.
 *
 * @param sessions - Array of token usage objects to accumulate
 * @returns Accumulated token usage with overflow protection
 *
 * @example
 * ```typescript
 * const sessions = [
 *   { input: 1000, output: 2000, total: 3000 },
 *   { input: 1500, output: 2500, total: 4000 }
 * ];
 * const total = accumulateTokenUsage(sessions);
 * // { input: 2500, output: 4500, total: 7000 }
 * ```
 */
export function accumulateTokenUsage(sessions: TokenUsage[]): TokenUsage {
  let totalInput = 0;
  let totalOutput = 0;

  for (const session of sessions) {
    totalInput = safeAdd(totalInput, session.input);
    totalOutput = safeAdd(totalOutput, session.output);
  }

  const total = calculateSafeTotal(totalInput, totalOutput);

  return {
    input: totalInput,
    output: totalOutput,
    total,
  };
}

/**
 * Validate and fix token usage object
 *
 * Ensures token usage is valid and safe. If overflow is detected,
 * caps values and logs warnings.
 *
 * @param tokens - Token usage object to validate
 * @param context - Context string for warning messages
 * @returns Validated and corrected token usage object
 *
 * @example
 * ```typescript
 * const tokens = { input: -100, output: 2000, total: 1900 };
 * const safe = validateAndFixTokenUsage(tokens, 'Session 1');
 * // { input: 0, output: 2000, total: 2000 } (negative value fixed)
 * ```
 */
export function validateAndFixTokenUsage(tokens: TokenUsage, context: string = ''): TokenUsage {
  const prefix = context ? `${context}: ` : '';

  // Fix negative values
  const input = Math.max(0, tokens.input || 0);
  const output = Math.max(0, tokens.output || 0);

  // Check for overflow
  const check = checkTokenOverflow({ input, output, total: input + output });

  if (check.warning) {
    console.warn(`⚠️  ${prefix}${check.warning}`);
  }

  // Create safe token usage
  return createSafeTokenUsage(input, output);
}
