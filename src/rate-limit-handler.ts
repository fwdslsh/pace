/**
 * rate-limit-handler.ts - Handle model provider rate limit errors (F057)
 *
 * Provides functionality to detect rate limit errors from model providers,
 * display token usage information, and suggest appropriate waiting periods.
 */

import type { TokenUsage } from './types';

/**
 * Error structure from session.error events
 */
export interface SessionError {
  message?: string;
  code?: string;
  type?: string;
  status?: number;
  [key: string]: unknown;
}

/**
 * Rate limit detection result
 */
export interface RateLimitInfo {
  isRateLimit: boolean;
  provider?: string;
  message?: string;
  suggestedWaitSeconds?: number;
  retryAfter?: number;
}

/**
 * Detect if an error is a rate limit error related to tokens
 *
 * Checks error messages and codes from various providers:
 * - Anthropic: 429 status, "rate_limit_error"
 * - OpenAI: 429 status, "rate_limit_exceeded"
 * - Google: 429 status, "RESOURCE_EXHAUSTED"
 *
 * @param error - Error object from session.error event
 * @returns Rate limit detection information
 */
export function detectRateLimitError(error: SessionError): RateLimitInfo {
  if (!error) {
    return { isRateLimit: false };
  }

  const errorMessage = (error.message || '').toLowerCase();
  const errorCode = (error.code || '').toLowerCase();
  const errorType = (error.type || '').toLowerCase();
  const status = error.status;

  // Check for HTTP 429 status code (standard rate limit)
  const has429Status = status === 429;

  // Check for rate limit in error message
  const hasRateLimitMessage =
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    errorMessage.includes('quota exceeded') ||
    errorMessage.includes('rate_limit') ||
    errorMessage.includes('resource_exhausted');

  // Check for rate limit in error code
  const hasRateLimitCode =
    errorCode.includes('rate_limit') ||
    errorCode === 'resource_exhausted' ||
    errorCode === 'quota_exceeded' ||
    errorCode === '429';

  // Check for rate limit in error type
  const hasRateLimitType = errorType === 'rate_limit_error' || errorType === 'rate_limit';

  const isRateLimit = has429Status || hasRateLimitMessage || hasRateLimitCode || hasRateLimitType;

  if (!isRateLimit) {
    return { isRateLimit: false };
  }

  // Detect provider from error message
  let provider = 'unknown';
  if (errorMessage.includes('anthropic') || errorCode.includes('anthropic')) {
    provider = 'Anthropic';
  } else if (
    errorMessage.includes('openai') ||
    errorCode.includes('openai') ||
    errorMessage.includes('gpt')
  ) {
    provider = 'OpenAI';
  } else if (
    errorMessage.includes('google') ||
    errorMessage.includes('gemini') ||
    errorCode === 'resource_exhausted'
  ) {
    provider = 'Google';
  }

  // Try to extract retry-after time from error (if provided)
  let retryAfter: number | undefined;
  const retryMatch = errorMessage.match(/retry.*?(\d+)\s*(second|minute|hour)/i);
  if (retryMatch) {
    const value = parseInt(retryMatch[1], 10);
    const unit = retryMatch[2].toLowerCase();
    if (unit.startsWith('minute')) {
      retryAfter = value * 60;
    } else if (unit.startsWith('hour')) {
      retryAfter = value * 3600;
    } else {
      retryAfter = value;
    }
  }

  // Suggest waiting period based on provider defaults
  let suggestedWaitSeconds = retryAfter || 60; // Default to 60 seconds

  // Anthropic typically has 60s rate limit windows
  if (provider === 'Anthropic') {
    suggestedWaitSeconds = retryAfter || 60;
  }
  // OpenAI varies by tier, default to 60s
  else if (provider === 'OpenAI') {
    suggestedWaitSeconds = retryAfter || 60;
  }
  // Google Gemini often uses longer windows
  else if (provider === 'Google') {
    suggestedWaitSeconds = retryAfter || 120;
  }

  return {
    isRateLimit: true,
    provider,
    message: error.message,
    suggestedWaitSeconds,
    retryAfter,
  };
}

/**
 * Format a rate limit error message with token usage information
 *
 * @param rateLimitInfo - Rate limit detection information
 * @param currentTokens - Current session token usage
 * @param totalTokens - Total token usage across all sessions (optional)
 * @returns Formatted error message
 */
export function formatRateLimitError(
  rateLimitInfo: RateLimitInfo,
  currentTokens?: { input: number; output: number; reasoning?: number },
  totalTokens?: TokenUsage,
): string {
  const lines: string[] = [];

  lines.push('🚦 Rate Limit Detected');
  lines.push('');

  if (rateLimitInfo.provider && rateLimitInfo.provider !== 'unknown') {
    lines.push(`Provider: ${rateLimitInfo.provider}`);
  }

  if (rateLimitInfo.message) {
    lines.push(`Error: ${rateLimitInfo.message}`);
  }

  lines.push('');
  lines.push('💎 Token Usage at Rate Limit:');

  if (currentTokens && (currentTokens.input > 0 || currentTokens.output > 0)) {
    const sessionTotal =
      currentTokens.input + currentTokens.output + (currentTokens.reasoning || 0);
    lines.push(
      `  Current Session: ${currentTokens.input.toLocaleString()} input, ${currentTokens.output.toLocaleString()} output${currentTokens.reasoning ? `, ${currentTokens.reasoning.toLocaleString()} reasoning` : ''} (${sessionTotal.toLocaleString()} total)`,
    );
  }

  if (totalTokens) {
    lines.push(
      `  All Sessions: ${totalTokens.input.toLocaleString()} input, ${totalTokens.output.toLocaleString()} output (${totalTokens.total.toLocaleString()} total)`,
    );
  }

  lines.push('');

  if (rateLimitInfo.suggestedWaitSeconds) {
    const minutes = Math.floor(rateLimitInfo.suggestedWaitSeconds / 60);
    const seconds = rateLimitInfo.suggestedWaitSeconds % 60;
    let waitTime = '';
    if (minutes > 0) {
      waitTime = `${minutes} minute${minutes > 1 ? 's' : ''}`;
      if (seconds > 0) {
        waitTime += ` ${seconds} second${seconds > 1 ? 's' : ''}`;
      }
    } else {
      waitTime = `${seconds} second${seconds > 1 ? 's' : ''}`;
    }

    lines.push(`⏱️  Suggested wait time: ${waitTime}`);

    if (rateLimitInfo.retryAfter) {
      lines.push(`   (Based on provider retry-after header)`);
    } else {
      lines.push(`   (Based on ${rateLimitInfo.provider || 'provider'} typical rate limit window)`);
    }
  }

  lines.push('');
  lines.push(
    '💡 Tip: Consider reducing session complexity or using a lower-tier model to reduce token consumption.',
  );

  return lines.join('\n');
}

/**
 * Log rate limit error details for debugging
 *
 * @param rateLimitInfo - Rate limit detection information
 * @param currentTokens - Current session token usage
 * @param sessionId - Session identifier
 * @param model - Model being used
 */
export function logRateLimitDebug(
  rateLimitInfo: RateLimitInfo,
  currentTokens?: { input: number; output: number; reasoning?: number },
  sessionId?: string,
  model?: string,
): void {
  const timestamp = new Date().toISOString();
  console.error(`\n[${timestamp}] RATE LIMIT ERROR DEBUG:`);
  console.error(`  Session ID: ${sessionId || 'unknown'}`);
  console.error(`  Model: ${model || 'unknown'}`);
  console.error(`  Provider: ${rateLimitInfo.provider || 'unknown'}`);

  if (currentTokens) {
    const total = currentTokens.input + currentTokens.output + (currentTokens.reasoning || 0);
    console.error(
      `  Session Tokens: ${total.toLocaleString()} (${currentTokens.input.toLocaleString()} in, ${currentTokens.output.toLocaleString()} out${currentTokens.reasoning ? `, ${currentTokens.reasoning.toLocaleString()} reasoning` : ''})`,
    );
  }

  if (rateLimitInfo.message) {
    console.error(`  Error Message: ${rateLimitInfo.message}`);
  }

  if (rateLimitInfo.suggestedWaitSeconds) {
    console.error(`  Suggested Wait: ${rateLimitInfo.suggestedWaitSeconds}s`);
  }

  console.error('');
}
