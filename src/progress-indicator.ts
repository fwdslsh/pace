/**
 * progress-indicator.ts - Reusable progress indicator for long-running operations
 *
 * Provides a consistent turtle-walking progress indicator with emoji trail
 * for all long-running operations in the pace CLI.
 */

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  reasoning?: number;
}

// Import accessibility utilities
import { getTokenPrefix, isAccessibleMode } from './accessibility';

export interface ProgressIndicatorOptions {
  /** Width of the track (default: 20) */
  trackWidth?: number;
  /** Whether to show emoji trail (default: true) */
  showEmojis?: boolean;
  /** Whether to show elapsed time (default: true) */
  showElapsed?: boolean;
  /** Whether to show tool/action count (default: true) */
  showCount?: boolean;
  /** Label for the count (default: "actions") */
  countLabel?: string;
  /** Whether to show token usage (default: false) */
  showTokens?: boolean;
  /** Animation interval in ms (default: 150) */
  animationInterval?: number;
}

export interface ProgressUpdate {
  /** Tool or action name to add emoji for */
  action?: string;
  /** Current count of actions/tools */
  count?: number;
  /** Current token usage */
  tokens?: TokenUsage;
}

/**
 * Map tool/action names to emojis
 */
function getActionEmoji(actionName: string): string {
  const emojiMap: Record<string, string> = {
    write: '📝',
    write_file: '📝',
    read: '📖',
    read_file: '📖',
    edit: '✏️',
    bash: '🖥️',
    shell: '🖥️',
    glob: '🔍',
    grep: '🔎',
    list: '📋',
    search: '🔍',
    git: '📦',
    mkdir: '📁',
    rm: '🗑️',
    mv: '📦',
    cp: '📋',
    compile: '⚙️',
    build: '🔨',
    test: '🧪',
    deploy: '🚀',
    fetch: '🌐',
    install: '📦',
    update: '🔄',
    delete: '🗑️',
    create: '✨',
  };

  // Check for partial matches
  const lowerAction = actionName.toLowerCase();
  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (lowerAction.includes(key)) return emoji;
  }

  return '🔧'; // Default action emoji
}

/**
 * Progress indicator class for long-running operations
 */
export class ProgressIndicator {
  private options: Required<ProgressIndicatorOptions>;
  private startTime: number;
  private turtlePosition: number = 0;
  private turtleDirection: number = 1; // 1 = right, -1 = left
  private emojis: string[] = [];
  private actionCount: number = 0;
  private currentTokens: TokenUsage | null = null;
  private animationTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(options: ProgressIndicatorOptions = {}) {
    this.options = {
      trackWidth: options.trackWidth ?? 20,
      showEmojis: options.showEmojis ?? true,
      showElapsed: options.showElapsed ?? true,
      showCount: options.showCount ?? true,
      countLabel: options.countLabel ?? 'actions',
      showTokens: options.showTokens ?? false,
      animationInterval: options.animationInterval ?? 150,
    };
    this.startTime = Date.now();
  }

  /**
   * Start the progress indicator animation
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();

    this.animationTimer = setInterval(() => {
      this.render();
      this.updateTurtlePosition();
    }, this.options.animationInterval);
  }

  /**
   * Stop the progress indicator and clean up
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }

    // Clear the display
    if (this.options.showEmojis && this.emojis.length > 0) {
      // Clear both lines if we had emojis displayed
      process.stdout.write('\r\x1b[K\n\r\x1b[K\x1b[A\r');
    } else {
      // Clear single line
      process.stdout.write('\r\x1b[K');
    }
  }

  /**
   * Update progress with new action/tool
   */
  update(update: ProgressUpdate): void {
    if (update.action) {
      this.emojis.push(getActionEmoji(update.action));
    }
    if (update.count !== undefined) {
      this.actionCount = update.count;
    }
    if (update.tokens !== undefined) {
      this.currentTokens = update.tokens;
    }
  }

  /**
   * Increment the action count
   */
  increment(): void {
    this.actionCount++;
  }

  /**
   * Get the current action count
   */
  getCount(): number {
    return this.actionCount;
  }

  /**
   * Render the current progress indicator
   */
  private render(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);

    // Build emoji row if enabled
    let emojiRow = '';
    if (this.options.showEmojis && this.emojis.length > 0) {
      const maxEmojis = Math.floor(this.options.trackWidth / 2); // Each emoji is ~2 chars wide
      const displayEmojis = this.emojis.slice(-maxEmojis).join('');
      emojiRow = `[${displayEmojis}]`;
    }

    // Build turtle track
    const turtleRight = '~}@}o';
    const turtleLeft = 'o{@{~';
    const turtle = this.turtleDirection > 0 ? turtleRight : turtleLeft;
    const turtleWidth = turtle.length;

    const leftPad = ' '.repeat(this.turtlePosition);
    const rightPad = ' '.repeat(
      Math.max(0, this.options.trackWidth - turtleWidth - this.turtlePosition),
    );
    const track = `[${leftPad}${turtle}${rightPad}]`;

    // Build status line
    const statusParts: string[] = [track];

    if (this.options.showElapsed) {
      statusParts.push(`${elapsed}s elapsed`);
    }

    if (this.options.showCount && this.actionCount > 0) {
      statusParts.push(`${this.actionCount} ${this.options.countLabel}`);
    }

    if (this.options.showTokens && this.currentTokens) {
      const tokenStr = this.currentTokens.total.toLocaleString();
      const tokenPrefix = getTokenPrefix();
      statusParts.push(`${tokenPrefix} ${tokenStr} tokens`);
    }

    const statusLine = statusParts.join(', ');

    // Render - respect accessibility settings
    const shouldShowEmojis =
      this.options.showEmojis && !isAccessibleMode() && this.emojis.length > 0;
    if (shouldShowEmojis) {
      const line1 = emojiRow.padEnd(this.options.trackWidth + 2);
      const line2 = statusLine;

      // Move cursor up if we have emojis, then redraw
      process.stdout.write(`\r\x1b[K${line1}\n\r\x1b[K${line2}\x1b[A\r`);
    } else {
      process.stdout.write(`\r\x1b[K${statusLine}`);
    }
  }

  /**
   * Update turtle position for animation
   */
  private updateTurtlePosition(): void {
    const turtleWidth = 5; // Length of turtle ASCII art

    // Move turtle
    this.turtlePosition += this.turtleDirection;
    const maxPosition = this.options.trackWidth - turtleWidth;

    // Bounce at edges
    if (this.turtlePosition >= maxPosition) {
      this.turtlePosition = maxPosition;
      this.turtleDirection = -1;
    } else if (this.turtlePosition <= 0) {
      this.turtlePosition = 0;
      this.turtleDirection = 1;
    }
  }
}

/**
 * Create and start a progress indicator
 */
export function createProgressIndicator(options?: ProgressIndicatorOptions): ProgressIndicator {
  const indicator = new ProgressIndicator(options);
  indicator.start();
  return indicator;
}
