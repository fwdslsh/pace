/**
 * token-visualization.ts - Visual indicators for token usage thresholds
 */

import { isAccessibleMode } from './accessibility';
import type {
  TokenUsage,
  TokenDisplayThresholds,
  TokenSeverity,
  TokenColors,
  ColorScheme,
  TokenThresholds,
} from './types';

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  ORANGE: '\x1b[38;5;208m',
  RED: '\x1b[31m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_RED: '\x1b[91m',
  BOLD: '\x1b[1m',
};

/**
 * Color scheme definitions for different visualization contexts
 */
const COLOR_SCHEMES: Record<ColorScheme, TokenColors> = {
  default: {
    excellent: COLORS.BRIGHT_GREEN,
    good: COLORS.GREEN,
    normal: COLORS.YELLOW,
    warning: COLORS.ORANGE,
    high: COLORS.RED,
    critical: COLORS.BRIGHT_RED,
  },
  budget: {
    excellent: COLORS.BRIGHT_GREEN,
    good: COLORS.GREEN,
    normal: COLORS.YELLOW,
    warning: COLORS.ORANGE,
    high: COLORS.RED,
    critical: COLORS.BRIGHT_RED,
  },
  efficiency: {
    excellent: COLORS.BRIGHT_GREEN,
    good: COLORS.GREEN,
    normal: COLORS.YELLOW,
    warning: COLORS.ORANGE,
    high: COLORS.RED,
    critical: COLORS.BRIGHT_RED,
  },
  accessibility: {
    // No colors, just text for accessibility mode
  },
  custom: {
    // Will be populated by user configuration
  },
};

/**
 * Calculate token severity based on usage and thresholds
 */
export function calculateTokenSeverity(
  tokenUsage: number,
  thresholds: TokenDisplayThresholds,
  averageTokens?: number,
): TokenSeverity {
  if (!thresholds.enabled) {
    return 'normal';
  }

  let thresholdValues: TokenThresholds;

  if (thresholds.useAverageBasedThresholds && averageTokens !== undefined && averageTokens > 0) {
    thresholdValues = {
      excellent: averageTokens * (thresholds.averageMultiplierExcellent ?? 0.75),
      good: averageTokens * (thresholds.averageMultiplierGood ?? 1.0),
      normal: averageTokens * 1.25,
      warning: averageTokens * (thresholds.averageMultiplierWarning ?? 1.5),
      high: averageTokens * (thresholds.averageMultiplierHigh ?? 1.75),
      critical: averageTokens * (thresholds.averageMultiplierCritical ?? 2.0),
    };
  } else if (thresholds.thresholds) {
    thresholdValues = thresholds.thresholds;
  } else {
    // Legacy support for backward compatibility
    const warningThreshold = thresholds.warningThreshold ?? Infinity;
    const criticalThreshold = thresholds.criticalThreshold ?? Infinity;

    if (tokenUsage >= criticalThreshold) {
      return 'critical';
    } else if (tokenUsage >= warningThreshold) {
      return 'warning';
    }
    return 'normal';
  }

  // Check thresholds in order of severity
  if (tokenUsage >= thresholdValues.critical!) {
    return 'critical';
  } else if (tokenUsage >= thresholdValues.high!) {
    return 'high';
  } else if (tokenUsage >= thresholdValues.warning!) {
    return 'warning';
  } else if (tokenUsage >= thresholdValues.normal!) {
    return 'normal';
  } else if (tokenUsage >= thresholdValues.good!) {
    return 'good';
  }
  return 'excellent';
}

/**
 * Get warning symbol for token severity
 */
export function getTokenWarningSymbol(severity: TokenSeverity): string {
  if (isAccessibleMode()) {
    switch (severity) {
      case 'critical':
        return '[CRITICAL]';
      case 'high':
        return '[HIGH]';
      case 'warning':
        return '[WARNING]';
      case 'normal':
        return '[NORMAL]';
      case 'good':
        return '[GOOD]';
      case 'excellent':
        return '[EXCELLENT]';
      default:
        return '';
    }
  } else {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'high':
        return '🔥';
      case 'warning':
        return '⚠️';
      case 'normal':
        return '📊';
      case 'good':
        return '✅';
      case 'excellent':
        return '🌟';
      default:
        return '';
    }
  }
}

/**
 * Get color for severity based on color scheme
 */
function getColorForSeverity(
  severity: TokenSeverity,
  colorScheme: ColorScheme,
  customColors?: TokenColors,
): string | undefined {
  if (colorScheme === 'custom' && customColors) {
    return customColors[severity];
  }

  return COLOR_SCHEMES[colorScheme]?.[severity];
}

/**
 * Apply color coding to token count string based on severity
 */
export function colorizeTokenCount(
  tokenCount: number,
  severity: TokenSeverity,
  colorScheme: ColorScheme = 'default',
  customColors?: TokenColors,
): string {
  const formattedCount = tokenCount.toLocaleString();

  if (isAccessibleMode() || colorScheme === 'accessibility') {
    return formattedCount;
  }

  const color = getColorForSeverity(severity, colorScheme, customColors);
  if (!color) {
    return formattedCount;
  }

  return `${color}${COLORS.BOLD}${formattedCount}${COLORS.RESET}`;
}

/**
 * Format token usage with visual indicators
 */
export function formatTokenUsageWithIndicators(
  tokenUsage: TokenUsage,
  thresholds: TokenDisplayThresholds,
  averageTokens?: number,
): string {
  const severity = calculateTokenSeverity(tokenUsage.total, thresholds, averageTokens);
  const warningSymbol = getTokenWarningSymbol(severity);
  const colorScheme = thresholds.colorScheme ?? 'default';
  const customColors = thresholds.customColors;

  // Apply color to all token values based on severity (F058)
  const totalFormatted = thresholds.enabled
    ? colorizeTokenCount(tokenUsage.total, severity, colorScheme, customColors)
    : tokenUsage.total.toLocaleString();

  const inputFormatted = thresholds.enabled
    ? colorizeTokenCount(tokenUsage.input, severity, colorScheme, customColors)
    : tokenUsage.input.toLocaleString();

  const outputFormatted = thresholds.enabled
    ? colorizeTokenCount(tokenUsage.output, severity, colorScheme, customColors)
    : tokenUsage.output.toLocaleString();

  const prefix = warningSymbol ? `${warningSymbol} ` : '';
  return `${prefix}${totalFormatted} tokens (${inputFormatted} in, ${outputFormatted} out)`;
}

/**
 * Calculate average token usage from session array
 */
export function calculateAverageTokens(sessions: TokenUsage[]): number {
  if (sessions.length === 0) {
    return 0;
  }

  const total = sessions.reduce((sum, session) => sum + session.total, 0);
  return Math.round(total / sessions.length);
}

/**
 * Calculate token change between two sessions
 */
export interface TokenComparison {
  delta: number;
  percentageChange: number;
  isSignificant: boolean;
  trend: 'up' | 'down' | 'same';
}

/**
 * Compare token usage between current and previous session
 */
export function compareTokenUsage(
  currentTokens: number,
  previousTokens: number,
  significanceThreshold: number = 0.25, // 25% change is significant
): TokenComparison {
  const delta = currentTokens - previousTokens;
  const percentageChange = previousTokens > 0 ? (delta / previousTokens) * 100 : 0;
  const isSignificant = Math.abs(percentageChange) >= significanceThreshold * 100;

  let trend: 'up' | 'down' | 'same';
  if (delta > 0) {
    trend = 'up';
  } else if (delta < 0) {
    trend = 'down';
  } else {
    trend = 'same';
  }

  return {
    delta,
    percentageChange,
    isSignificant,
    trend,
  };
}

/**
 * Format token comparison for display
 */
export function formatTokenComparison(comparison: TokenComparison): string {
  const { delta, percentageChange, isSignificant, trend } = comparison;

  // Format delta with sign
  const deltaSign = delta > 0 ? '+' : '';
  const deltaFormatted = `${deltaSign}${delta.toLocaleString()}`;

  // Format percentage with sign and one decimal place
  const percentageSign = percentageChange > 0 ? '+' : '';
  const percentageFormatted = `${percentageSign}${percentageChange.toFixed(1)}%`;

  // Get trend indicator
  let trendIndicator = '';
  if (!isAccessibleMode()) {
    if (trend === 'up') {
      trendIndicator = '📈';
    } else if (trend === 'down') {
      trendIndicator = '📉';
    } else {
      trendIndicator = '➡️';
    }
  } else {
    if (trend === 'up') {
      trendIndicator = '[INCREASE]';
    } else if (trend === 'down') {
      trendIndicator = '[DECREASE]';
    } else {
      trendIndicator = '[SAME]';
    }
  }

  // Apply highlighting for significant changes
  let displayText = `${deltaFormatted} (${percentageFormatted})`;
  if (isSignificant && !isAccessibleMode()) {
    if (trend === 'up') {
      displayText = `${COLORS.RED}${COLORS.BOLD}${displayText}${COLORS.RESET}`;
    } else if (trend === 'down') {
      displayText = `${COLORS.GREEN}${COLORS.BOLD}${displayText}${COLORS.RESET}`;
    }
  }

  return `${trendIndicator} ${displayText} from previous session`;
}
