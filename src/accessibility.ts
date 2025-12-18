/**
 * accessibility.ts - Utilities for accessible terminal output
 */

/**
 * Check if output should be accessible (no colors, no emojis)
 * Respects NO_COLOR environment variable and other accessibility settings
 */
export function isAccessibleMode(): boolean {
  // Check NO_COLOR environment variable (standard)
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') {
    return true;
  }

  // Check other common accessibility indicators
  const term = process.env.TERM;
  if (term === 'dumb' || term === 'unknown') {
    return true;
  }

  // Check if running in a non-interactive environment
  if (process.stdout.isTTY === false) {
    return true;
  }

  return false;
}

/**
 * Convert emoji to accessible text alternative
 */
export function makeAccessible(emojiText: string, fallback?: string): string {
  if (!isAccessibleMode()) {
    return emojiText;
  }

  // Common emoji mappings for token display
  const emojiMap: Record<string, string> = {
    '💎': fallback || 'Token',
    '💰': fallback || 'Cost',
    '📊': fallback || 'Status',
    '🎯': fallback || 'Target',
    '📝': fallback || 'Info',
    '📂': fallback || 'Directory',
    '🚀': fallback || 'Launch',
    '🔴': fallback || 'Critical',
    '🟠': fallback || 'High',
    '🟡': fallback || 'Medium',
    '🟢': fallback || 'Low',
    '⚠️': fallback || 'Warning',
    '🚨': fallback || 'Critical',
    '⚡': fallback || 'Warning',
    '✅': fallback || 'Pass',
    '❌': fallback || 'Fail',
    '🎉': fallback || 'Complete',
  };

  // Replace emojis with accessible alternatives
  let accessibleText = emojiText;
  for (const [emoji, alt] of Object.entries(emojiMap)) {
    accessibleText = accessibleText.replace(new RegExp(emoji, 'g'), alt);
  }

  return accessibleText;
}

/**
 * Get accessible token prefix
 */
export function getTokenPrefix(): string {
  return makeAccessible('💎', 'Token');
}

/**
 * Get accessible token section header
 */
export function getTokenUsageHeader(): string {
  return makeAccessible('💎 Token Usage:', 'Token Usage:');
}

/**
 * Format token usage for screen readers and plain text terminals
 */
export function formatTokenUsageForAccessibility(
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  label: string = 'Token Usage',
): string {
  const prefix = getTokenPrefix();
  const inputFormatted = inputTokens.toLocaleString();
  const outputFormatted = outputTokens.toLocaleString();
  const totalFormatted = totalTokens.toLocaleString();

  return `${prefix} ${label}:\n   Total: ${totalFormatted} tokens (${inputFormatted} input, ${outputFormatted} output)`;
}

/**
 * Check if current environment supports emoji display
 */
export function supportsEmoji(): boolean {
  if (isAccessibleMode()) {
    return false;
  }

  // Check common emoji-supporting terminals
  const term = process.env.TERM || '';
  const program = process.env.TERM_PROGRAM || '';

  const emojiSupportedTerms = [
    'xterm-256color',
    'screen-256color',
    'tmux-256color',
    'alacritty',
    'kitty',
    'wezterm',
    'iterm',
  ];

  const emojiSupportedPrograms = [
    'vscode',
    'Terminal.app',
    'iTerm.app',
    'Hyper',
    'alacritty',
    'kitty',
    'wezterm',
  ];

  const termSupported = emojiSupportedTerms.some((supported) => {
    return term === supported || term.includes(`${supported}-`);
  });

  const programSupported = emojiSupportedPrograms.some((supported) => {
    return program.includes(supported);
  });

  return termSupported || programSupported;
}

/**
 * Get appropriate budget status message for accessibility
 */
export function getAccessibleBudgetMessage(
  percentageUsed: number,
  currentUsage: number,
  maxTokens: number,
  level: 'none' | 'warning' | 'critical' | 'exceeded',
): string {
  const percentageStr = (percentageUsed * 100).toFixed(1);
  const currentStr = currentUsage.toLocaleString();
  const maxStr = maxTokens.toLocaleString();

  if (isAccessibleMode()) {
    // Plain text version with clear labels
    switch (level) {
      case 'exceeded':
        return `Budget exceeded: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
      case 'critical':
        return `Critical: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
      case 'warning':
        return `Warning: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
      default:
        return `Budget: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
    }
  } else {
    // Original version with emojis
    switch (level) {
      case 'exceeded':
        return `🚨 Budget exceeded: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
      case 'critical':
        return `⚠️  Critical: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
      case 'warning':
        return `⚡ Warning: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
      default:
        return `💎 Budget: ${percentageStr}% of token budget used (${currentStr}/${maxStr})`;
    }
  }
}

/**
 * Get accessible priority icon
 */
export function getAccessiblePriorityIcon(priority: string): string {
  if (isAccessibleMode()) {
    switch (priority) {
      case 'critical':
        return '[Critical]';
      case 'high':
        return '[High]';
      case 'medium':
        return '[Medium]';
      case 'low':
        return '[Low]';
      default:
        return `[${priority}]`;
    }
  } else {
    switch (priority) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return priority;
    }
  }
}
