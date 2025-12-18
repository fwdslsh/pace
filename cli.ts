#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * cli.ts - CLI entry point for pace (Pragmatic Agent for Compounding Engineering)
 *
 * Built on the OpenCode SDK for maximum flexibility and control.
 *
 * Commands:
 *     run         Run the orchestrator (default)
 *     init        Initialize a new pace project
 *     status      Show project status
 *     validate    Validate feature_list.json
 *     update      Update feature status
 *     help        Show help message
 *
 * Examples:
 *     pace init -p "Build a todo app with auth"
 *     pace run --max-sessions 10
 *     pace status --verbose
 *     pace validate
 *     pace update F001 pass
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

import { createOpencode, createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';

import { ArchiveManager } from './src/archive-manager';
import { FeatureManager } from './src/feature-manager';
import codingAgentMd from './src/opencode/agents/coding-agent.md' with { type: 'text' };
import paceInitMd from './src/opencode/commands/pace-init.md' with { type: 'text' };

import {
  loadConfig,
  type PaceConfig,
  getAgentModel,
  getPaceSettings,
  getCostSettings,
  getBudgetSettings,
  getTokenDisplaySettings,
} from './src/opencode/pace-config';
import { createProgressIndicator, type ProgressIndicator } from './src/progress-indicator';
import { StatusReporter } from './src/status-reporter';
import { ProgressParser } from './src/progress-parser';
import {
  type SessionSummary,
  type TokenUsage,
  type StatusOutput,
  type ValidationError,
  type FeatureListMetadata,
  type ModelTokenUsage,
  type TokenUsageByModel,
  type TokenBudget,
  type BudgetStatus,
  Feature,
  Priority,
  PACE_AGENTS,
  CostBreakdown,
  TokenUsageWithCost,
  ModelPricing,
  CostConfig,
} from './src/types';
import {
  validateFeatureList,
  formatValidationErrors,
  formatValidationStats,
  validateTokenUsage,
} from './src/validators';
import { calculateCost, formatCost, isCostCalculationSupported } from './src/cost-calculator';
import { TokenExporter } from './src/token-exporter';
import { ModelTokenTracker, createModelTokenTracker } from './src/model-token-tracker';
import { calculateTokenEfficiencyMetrics } from './src/token-efficiency';
import {
  isAccessibleMode,
  makeAccessible,
  getTokenPrefix,
  getTokenUsageHeader,
  getAccessibleBudgetMessage,
} from './src/accessibility';
import { formatTokenUsageWithIndicators, calculateAverageTokens } from './src/token-visualization';
import {
  detectRateLimitError,
  formatRateLimitError,
  logRateLimitDebug,
  type SessionError,
  type RateLimitInfo,
} from './src/rate-limit-handler';

// Helper function to get accessible token usage template
function getTokenUsageTemplate(): string {
  return isAccessibleMode() ? 'Token **Usage:**' : '💎 **Token Usage:**';
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
  suggestedWaitSeconds?: number,
): number {
  if (suggestedWaitSeconds) {
    return Math.min(suggestedWaitSeconds * 1000 * 1.1, config.maxDelayMs);
  }

  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  rateLimitInfo: RateLimitInfo,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<{ result: T; success: boolean; attempts: number; lastError?: Error }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      const result = await operation();
      return { result, success: true, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > config.maxRetries) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, config, rateLimitInfo.suggestedWaitSeconds);
      const waitSeconds = Math.ceil(delay / 1000);

      console.error(
        `\n⏳ Rate limit retry ${attempt}/${config.maxRetries}: Waiting ${waitSeconds}s...`,
      );
      await sleep(delay);
    }
  }

  return {
    result: undefined as T,
    success: false,
    attempts: config.maxRetries + 1,
    lastError,
  };
}

// Import agent prompts from markdown files

// ============================================================================
// Types
// ============================================================================

interface ParsedArgs {
  command:
    | 'run'
    | 'init'
    | 'status'
    | 'validate'
    | 'update'
    | 'archives'
    | 'restore'
    | 'clean-archives'
    | 'export'
    | 'tokens'
    | 'help';
  options: {
    projectDir: string;
    port?: number;
    url?: string; // URL to connect to existing OpenCode server
    model?: string;
    maxSessions?: number;
    maxFailures?: number;
    delay?: number;
    untilComplete?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
    json?: boolean;
    compact?: boolean;
    help?: boolean;
    // Init-specific
    prompt?: string;
    file?: string;
    force?: boolean;
    archiveOnly?: boolean;
    // Update-specific
    featureId?: string;
    passStatus?: boolean;
    manualTokens?: string; // Format: "input:output" or "input,output"
    // Restore-specific
    timestamp?: string;
    // Clean-archives-specific
    olderThan?: number;
    keepLast?: number;
    // Archives-specific
    validate?: boolean;
    // Export-specific
    exportTokens?: string;
    // Tokens-specific
    fromDate?: string;
    toDate?: string;
    feature?: string;
    // F054: Filter sessions by minimum token usage
    minTokens?: number;
  };
}

/**
 * Metrics collected for each individual coding session
 *
 * Tracks performance and usage data for a single session execution,
 * including timing information, success status, and optional token usage
 * when supported by the OpenCode SDK version.
 *
 * @interface SessionMetrics
 * @property {string} sessionId - Unique identifier for the session
 * @property {string} featureId - ID of the feature being worked on
 * @property {number} startTime - Session start timestamp (Unix epoch in ms)
 * @property {number} [endTime] - Session end timestamp (Unix epoch in ms)
 * @property {boolean} success - Whether the session completed successfully
 * @property {number} toolCalls - Number of tool calls made during the session
 * @property {number} textParts - Number of text parts processed during the session
 * @property {TokenUsage} [tokenUsage] - Token usage data if tracking is supported
 *
 * @example
 * ```typescript
 * const metrics: SessionMetrics = {
 *   sessionId: "sess_12345",
 *   featureId: "F001",
 *   startTime: 1703123456789,
 *   endTime: 1703123567890,
 *   success: true,
 *   toolCalls: 15,
 *   textParts: 8,
 *   tokenUsage: { input: 1500, output: 750, total: 2250 }
 * };
 * ```
 */
export interface SessionMetrics {
  sessionId: string;
  featureId: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  toolCalls: number;
  textParts: number;
  tokenUsage?: TokenUsage;
  costBreakdown?: CostBreakdown;
  model?: string;
}

interface OrchestratorState {
  sessionCount: number;
  consecutiveFailures: number;
  featuresCompleted: number;
  startTime: Date;
  metrics: SessionMetrics[];
}

/**
 * Type for accessing sessionID from various event properties.
 * Different event types have sessionID at different levels:
 * - Session events: properties.sessionID
 * - Message part events: properties.part.sessionID
 */
interface EventPropertiesWithSessionID {
  sessionID?: string;
  part?: {
    sessionID?: string;
  };
  permission?: {
    sessionID?: string;
    tool?: string;
    id?: string;
  };
}

interface PermissionEvent {
  type: string;
  properties?: EventPropertiesWithSessionID;
}

// ============================================================================
// F014 Helper Functions - SDK Token Usage Fallback
// ============================================================================

/**
 * Check if current SDK version supports token usage tracking
 */
function supportsTokenTracking(): boolean {
  try {
    // Check if we're using a recent version of @opencode-ai/sdk
    const sdkPackage = require('@opencode-ai/sdk/package.json');
    const version = sdkPackage.version;
    if (!version) return false;

    // Extract major/minor version (e.g., "1.0.152" -> [1, 0, 152])
    const versionParts = version.split('.').map((v) => parseInt(v, 10));
    if (versionParts.length < 2) return false;

    // Token tracking was properly implemented in versions 1.0.150+
    return (
      versionParts[0] > 1 ||
      (versionParts[0] === 1 && versionParts[1] >= 0 && (versionParts[2] || 0) >= 150)
    );
  } catch (error) {
    // If we can't determine version, assume it doesn't support tokens
    return false;
  }
}

/**
 * Display fallback message when SDK doesn't provide token data
 */
function showTokenFallbackMessage(isDryRun: boolean = false): void {
  if (isDryRun) return; // Don't show in dry-run mode

  const supportsTokens = supportsTokenTracking();

  if (!supportsTokens) {
    console.log('\n⚠️  Token Usage Unavailable');
    console.log("   Your OpenCode SDK version doesn't provide token usage data.");
    console.log('');
    console.log('   📋 Manual Tracking Options:');
    console.log('   • Check your provider dashboard (OpenAI, Anthropic, etc.)');
    console.log('   • Use provider API usage logs for token counts');
    console.log('   • Consider upgrading OpenCode SDK for automatic tracking');
    console.log('');
    console.log('   📖 Documentation: https://docs.opencode.ai/token-tracking');
    console.log('   🔧 Upgrade SDK: npm update @opencode-ai/sdk');
  }
}

/**
 * Check if token data was captured from SDK events
 */
function hasTokenData(sessionTokens: {
  input?: number;
  output?: number;
  reasoning?: number;
}): boolean {
  return (sessionTokens.input ?? 0) > 0 || (sessionTokens.output ?? 0) > 0;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  // Default command
  let command: ParsedArgs['command'] = 'run';

  // Check if first arg is a command
  if (args.length > 0 && !args[0].startsWith('--') && !args[0].startsWith('-')) {
    const cmd = args[0];
    if (
      cmd === 'run' ||
      cmd === 'init' ||
      cmd === 'status' ||
      cmd === 'validate' ||
      cmd === 'update' ||
      cmd === 'archives' ||
      cmd === 'restore' ||
      cmd === 'clean-archives' ||
      cmd === 'export' ||
      cmd === 'tokens' ||
      cmd === 'help'
    ) {
      command = cmd;
      args.shift();
    }
  }

  const options: ParsedArgs['options'] = {
    projectDir: '.',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-V':
        console.log('0.2.0');
        process.exit(0);
      // eslint-disable-next-line no-fallthrough
      case '--project-dir':
      case '-d':
        options.projectDir = args[++i];
        break;

      case '--port':
        options.port = parseInt(args[++i]);
        break;
      case '--url':
      case '-u':
        options.url = args[++i];
        break;
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--max-sessions':
      case '-n':
        options.maxSessions = parseInt(args[++i]);
        break;
      case '--max-failures':
      case '-f':
        options.maxFailures = parseInt(args[++i]);
        break;
      case '--delay':
        options.delay = parseInt(args[++i]);
        break;
      case '--until-complete':
        options.untilComplete = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--compact':
      case '-c':
        options.compact = true;
        break;
      case '--prompt':
      case '-p':
        options.prompt = args[++i];
        break;
      case '--file':
        options.file = args[++i];
        break;
      case '--force':
        options.force = true;
        break;
      case '--archive-only':
        options.archiveOnly = true;
        break;
      case '--older-than':
        options.olderThan = parseInt(args[++i]);
        break;
      case '--keep-last':
        options.keepLast = parseInt(args[++i]);
        break;
      case '--validate':
        options.validate = true;
        break;
      case '--export-tokens':
        options.exportTokens = args[++i];
        break;
      case '--from-date':
        options.fromDate = args[++i];
        break;
      case '--to-date':
        options.toDate = args[++i];
        break;
      case '--feature':
        options.feature = args[++i];
        break;
      case '--tokens':
        options.manualTokens = args[++i];
        break;
      case '--min-tokens':
        options.minTokens = parseInt(args[++i]);
        break;
      default:
        // For update command, parse feature ID and pass/fail
        if (command === 'update' && !arg.startsWith('-')) {
          if (!options.featureId) {
            options.featureId = arg;
          } else {
            const status = arg.toLowerCase();
            if (status !== 'pass' && status !== 'fail') {
              console.error(`Invalid status: ${arg}. Must be 'pass' or 'fail'`);
              process.exit(1);
            }
            options.passStatus = status === 'pass';
          }
        }
        // For init command, treat non-flag args as prompt
        else if (command === 'init' && !arg.startsWith('-')) {
          if (options.prompt) {
            options.prompt += ' ' + arg;
          } else {
            options.prompt = arg;
          }
        }
        // For restore command, treat non-flag args as timestamp
        else if (command === 'restore' && !arg.startsWith('-')) {
          if (!options.timestamp) {
            options.timestamp = arg;
          }
        }
    }
  }

  return { command, options };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse frontmatter from a markdown string
 */
function parseFrontmatter(markdown: string): { content: string } {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return { content: match ? match[1].trim() : markdown };
}

/**
 * Parse a model string "provider/model" into SDK format
 */
function parseModelId(modelId: string): { providerID: string; modelID: string } | undefined {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex === -1) return undefined;
  return {
    providerID: modelId.slice(0, slashIndex),
    modelID: modelId.slice(slashIndex + 1),
  };
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Build the coding agent prompt for a specific feature
 */
function buildCodingAgentPrompt(feature: Feature, projectContext: string): string {
  const { content: basePrompt } = parseFrontmatter(codingAgentMd);

  return `
## Current Feature Assignment

You are implementing **${feature.id}**: ${feature.description}

**Priority:** ${feature.priority}
**Category:** ${feature.category}

**Verification Steps:**
${feature.steps?.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'No specific steps defined.'}

## Project Context
${projectContext}

---

${basePrompt}`;
}

// ============================================================================
// Orchestrator
// ============================================================================

class Orchestrator {
  private projectDir: string;
  private port?: number;
  private url?: string; // URL to connect to existing OpenCode server
  private model?: string; // Model override from CLI
  private maxSessions?: number;
  private maxFailures?: number;
  private delay?: number;
  private dryRun: boolean;
  private verbose: boolean;
  private json: boolean;

  private paceConfig: PaceConfig = {};
  private featureManager: FeatureManager;
  private state: OrchestratorState;
  private opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;
  private externalClient: OpencodeClient | null = null; // Client for external server
  private activeModel: string | null = null;

  constructor(options: ParsedArgs['options']) {
    this.projectDir = resolve(options.projectDir);
    this.port = options.port;
    this.url = options.url;
    this.model = options.model; // Store CLI model override
    // Only set maxSessions if explicitly provided or untilComplete is true
    this.maxSessions = options.untilComplete
      ? undefined
      : options.maxSessions !== undefined
        ? options.maxSessions
        : undefined;
    this.maxFailures = options.maxFailures;
    this.delay = options.delay;
    this.dryRun = options.dryRun ?? false;
    this.verbose = options.verbose ?? false;
    this.json = options.json ?? false;

    this.featureManager = new FeatureManager(this.projectDir);
    this.state = {
      sessionCount: 0,
      consecutiveFailures: 0,
      featuresCompleted: 0,
      startTime: new Date(),
      metrics: [],
    };
  }

  /**
   * Get effective max sessions (CLI overrides config)
   */
  private get effectiveMaxSessions(): number | undefined {
    const paceSettings = getPaceSettings(this.paceConfig);
    return this.maxSessions ?? paceSettings.orchestrator?.maxSessions;
  }

  /**
   * Get effective max failures (CLI overrides config)
   */
  private get effectiveMaxFailures(): number {
    const paceSettings = getPaceSettings(this.paceConfig);
    return this.maxFailures ?? paceSettings.orchestrator?.maxFailures ?? 3;
  }

  /**
   * Get session delay (CLI overrides config)
   */
  private get effectiveDelay(): number {
    const paceSettings = getPaceSettings(this.paceConfig);
    if (this.delay !== undefined) return this.delay * 1000;
    return paceSettings.orchestrator?.sessionDelay ?? 5000;
  }

  private get effectiveSessionTimeout(): number {
    const paceSettings = getPaceSettings(this.paceConfig);
    return paceSettings.orchestrator?.sessionTimeout ?? 1800000;
  }

  /**
   * Get cost configuration settings
   */
  private get costSettings() {
    return getCostSettings(this.paceConfig);
  }

  /**
   * Get token display threshold settings
   */
  private get tokenDisplaySettings() {
    return getTokenDisplaySettings(this.paceConfig);
  }

  /**
   * Get budget configuration settings
   */
  private get budgetSettings() {
    return getBudgetSettings(this.paceConfig);
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
      message = `🚨 Budget exceeded: ${(percentageUsed * 100).toFixed(1)}% of token budget used (${currentUsage.toLocaleString()}/${budget.maxTokens.toLocaleString()})`;
    } else if (percentageUsed >= criticalThreshold) {
      level = 'critical';
      message = `⚠️  Critical: ${(percentageUsed * 100).toFixed(1)}% of token budget used (${currentUsage.toLocaleString()}/${budget.maxTokens.toLocaleString()})`;
    } else if (percentageUsed >= warningThreshold) {
      level = 'warning';
      message = `⚡ Warning: ${(percentageUsed * 100).toFixed(1)}% of token budget used (${currentUsage.toLocaleString()}/${budget.maxTokens.toLocaleString()})`;
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
   * Log a message (respects verbose and json settings)
   */
  private log(message: string, force = false): void {
    if (!this.json && (this.verbose || force)) {
      console.log(message);
    }
  }

  /**
   * Get the OpenCode client (either from embedded server or external connection)
   */
  private get client(): OpencodeClient {
    if (this.externalClient) return this.externalClient;
    if (this.opencode) return this.opencode.client;
    throw new Error('OpenCode not initialized. Call initialize() first.');
  }

  /**
   * Check if we're connected to an external server
   */
  private get isExternalServer(): boolean {
    return this.externalClient !== null;
  }

  /**
   * Initialize the OpenCode server or connect to existing one
   */
  private async initialize(): Promise<void> {
    this.log('Loading pace configuration...');
    this.paceConfig = await loadConfig(this.projectDir);

    if (this.url) {
      // Connect to existing OpenCode server
      this.log(`Connecting to existing OpenCode server at ${this.url}...`);
      this.externalClient = createOpencodeClient({
        baseUrl: this.url,
      });
      this.log(`Connected to OpenCode server: ${this.url}`);
    } else {
      // Start embedded OpenCode server
      this.log('Initializing OpenCode server...');

      // OpenCode reads its config from .opencode/opencode.jsonc automatically
      this.opencode = await createOpencode({
        port: this.port ?? 0,
      });

      this.log(`OpenCode server started: ${this.opencode.server.url}`);
    }

    // Fetch the active model from OpenCode config
    try {
      const configResult = await this.client.config.get();
      if (configResult.data?.model) {
        this.activeModel = configResult.data.model;
      }
    } catch {
      // Config fetch failed, model will remain unknown
    }
  }

  /**
   * Shut down the OpenCode server (only if we started it)
   */
  private async shutdown(): Promise<void> {
    // Only shut down if we started an embedded server (not external)
    if (!this.isExternalServer && this.opencode?.server?.close) {
      this.log('Shutting down OpenCode server...');
      this.opencode.server.close();
    }
  }

  /**
   * Load project context for agent prompts
   */
  private async loadProjectContext(): Promise<string> {
    const parts: string[] = [];

    // Try to load progress file
    try {
      const progressPath = join(this.projectDir, 'progress.txt');
      const progress = await readFile(progressPath, 'utf-8');
      const lastSession = progress.split('### Session').slice(-1)[0];
      parts.push(`## Recent Progress\n${lastSession?.slice(0, 1000) || 'No previous sessions'}`);
    } catch {
      parts.push('## Recent Progress\nNo previous sessions found.');
    }

    // Load feature stats
    const [passing, total] = await this.featureManager.getProgress();
    parts.push(
      `\n## Feature Status\n- Passing: ${passing}/${total}\n- Remaining: ${total - passing}`,
    );

    return parts.join('\n');
  }

  /**
   * Write session progress to progress.txt with token usage
   */
  private async writeProgressEntry(
    feature: Feature,
    sessionMetrics: SessionMetrics,
    success: boolean,
  ): Promise<void> {
    const progressPath = join(this.projectDir, 'progress.txt');

    // Get current session number
    let sessionNumber = 1;
    try {
      const existingProgress = await readFile(progressPath, 'utf-8');
      const sessionMatches = existingProgress.match(/### Session \d+/g);
      if (sessionMatches) {
        sessionNumber = sessionMatches.length + 1;
      }
    } catch {
      // File doesn't exist, start with session 1
    }

    const currentDate = new Date().toISOString().split('T')[0];

    // Build progress entry following the template format
    const progressEntry = `

---

### Session ${sessionNumber} - ${feature.id}

**Date:** ${currentDate}
**Agent Type:** Coding

**Feature Worked On:**

- ${feature.id}: ${feature.description}

**Actions Taken:**

- Implemented ${feature.id} according to verification steps
- ${success ? 'Successfully completed and tested feature' : 'Feature implementation incomplete'}
- Token usage tracked during session execution

**Test Results:**

- ${success ? 'All verification steps completed successfully' : 'Feature did not pass all verification steps'}
- End-to-end testing performed
- Token usage captured from OpenCode SDK events

${getTokenUsageTemplate()}

- Input tokens: ${sessionMetrics.tokenUsage?.input?.toLocaleString() || '0'}
- Output tokens: ${sessionMetrics.tokenUsage?.output?.toLocaleString() || '0'}
- Total tokens: ${sessionMetrics.tokenUsage?.total?.toLocaleString() || '0'}
${sessionMetrics.model ? `- Model: ${sessionMetrics.model}` : ''}
${
  sessionMetrics.tokenUsage &&
  this.costSettings.enabled &&
  this.activeModel &&
  isCostCalculationSupported(this.activeModel, this.costSettings.customPricing)
    ? `
💰 **Estimated Cost:**

${(() => {
  const sessionCost = calculateCost(
    sessionMetrics.tokenUsage!,
    this.activeModel!,
    this.costSettings.customPricing,
  );
  if (sessionCost) {
    const currency = this.costSettings.currency || '$';
    const precision = this.costSettings.precision || 4;
    return `- Total cost: ${formatCost(sessionCost.totalCost, precision, currency)}
- Input cost: ${formatCost(sessionCost.inputCost, precision, currency)}
- Output cost: ${formatCost(sessionCost.outputCost, precision, currency)}`;
  }
  return '- Cost calculation not available for this model';
})()}`
    : ''
}

**Current Status:**

- Features passing: [Updated by orchestrator]
- Known issues: ${success ? 'None' : 'Feature implementation needs more work'}

**Next Steps:**

- Recommended next feature: [Determined by orchestrator]
- ${success ? 'Ready to proceed with next critical feature' : 'Continue work on current feature or select alternative'}

---

`;

    // Append to progress file
    try {
      await writeFile(progressPath, progressEntry, { flag: 'a' });
      // Invalidate ProgressParser cache after writing
      ProgressParser.invalidate(this.projectDir);
    } catch (error) {
      console.error('Failed to write progress entry:', error);
    }
  }

  /**
   * Run a coding session for a specific feature
   */
  private async runCodingSession(feature: Feature): Promise<boolean> {
    if (!this.opencode && !this.externalClient) {
      throw new Error('OpenCode not initialized');
    }

    const client = this.client;
    const startTime = Date.now();

    // Get agent-specific model if configured (CLI --model overrides everything)
    const agentModelId = this.model ?? getAgentModel(this.paceConfig, PACE_AGENTS.CODING);
    const agentModel = agentModelId ? parseModelId(agentModelId) : undefined;
    const displayModel = agentModelId ?? this.activeModel;

    if (!this.json) {
      console.log('\n' + '='.repeat(60));
      console.log(`SESSION ${this.state.sessionCount + 1}: Feature ${feature.id}`);
      console.log('='.repeat(60));
      console.log(`Description: ${feature.description.slice(0, 60)}...`);
      console.log(`Priority: ${feature.priority}`);
      console.log(`Category: ${feature.category}`);
      if (displayModel) {
        console.log(`Model: ${displayModel}`);
      }
    }

    if (this.dryRun) {
      if (!this.json) {
        console.log('\n[DRY RUN] Would create coding session here');
      }
      return true;
    }

    // Create a new session for this feature
    const sessionResult = await client.session.create({
      body: {
        title: `Feature: ${feature.id} - ${feature.description.slice(0, 40)}`,
      },
    });

    if (sessionResult.error) {
      console.error(`Failed to create session: ${JSON.stringify(sessionResult.error)}`);
      return false;
    }

    const session = sessionResult.data;
    this.log(`\nSession created: ${session.id}`);

    // Subscribe to events BEFORE sending prompt to avoid missing events
    const events = await client.event.subscribe();

    // Get project context
    const projectContext = await this.loadProjectContext();

    // Build and send the coding agent prompt
    const prompt = buildCodingAgentPrompt(feature, projectContext);

    this.log('\nSending prompt to agent...');
    // Use promptAsync to enable event streaming
    const promptResult = await client.session.promptAsync({
      path: { id: session.id },
      body: {
        parts: [{ type: 'text', text: prompt }],
        ...(agentModel && { model: agentModel }),
      },
    });

    if (promptResult.error) {
      console.error(`Failed to send prompt: ${JSON.stringify(promptResult.error)}`);
      return false;
    }

    if (!this.json) {
      console.log('\nAgent working...');
    }
    let success = false;
    let toolCalls = 0;
    let textParts = 0;
    let lastTextLength = 0;
    let tokenUsage: TokenUsage | undefined;
    const sessionTokens = { input: 0, output: 0, reasoning: 0 };

    let progressIndicator: ProgressIndicator | null = null;
    if (!this.json && !this.verbose) {
      progressIndicator = createProgressIndicator({
        trackWidth: 20,
        showEmojis: true,
        showElapsed: true,
        showCount: true,
        countLabel: 'tool calls',
        showTokens: true,
      });
    }

    let lastLoggedTokens = { input: 0, output: 0, reasoning: 0, timestamp: 0 };
    let lastLoggedTools = new Map<string, number>();

    const timeoutMs = this.effectiveSessionTimeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const elapsed = Math.floor(timeoutMs / 60000);
        reject(new Error(`Session timeout after ${elapsed} minutes with no completion event`));
      }, timeoutMs);
    });

    let sessionCompleted = false;
    let retryCount = 0;
    const maxRetries = 3;

    try {
      await Promise.race([
        timeoutPromise,
        (async () => {
          for await (const event of events.stream) {
            // Session-level events have session ID in properties.sessionID
            if (event.type === 'session.idle') {
              const idleSessionId = event.properties?.sessionID;
              if (idleSessionId === session.id) {
                this.log('\nSession completed.');
                success = true;
                break;
              }
              continue;
            }

            if (event.type === 'session.error') {
              const errorSessionId = event.properties?.sessionID;
              if (errorSessionId === session.id) {
                const errorData = event.properties?.error as SessionError | undefined;
                const rateLimitInfo = detectRateLimitError(errorData || {});

                if (rateLimitInfo.isRateLimit) {
                  const currentTokenUsage =
                    sessionTokens.input > 0 || sessionTokens.output > 0
                      ? {
                          input: sessionTokens.input,
                          output: sessionTokens.output,
                          reasoning: sessionTokens.reasoning,
                        }
                      : undefined;

                  const errorMessage = formatRateLimitError(
                    rateLimitInfo,
                    currentTokenUsage,
                    tokenUsage,
                  );
                  console.error('\n' + errorMessage);

                  const modelString = agentModel
                    ? `${agentModel.providerID}/${agentModel.modelID}`
                    : (displayModel ?? undefined);
                  logRateLimitDebug(rateLimitInfo, currentTokenUsage, session.id, modelString);

                  if (retryCount >= maxRetries) {
                    console.error(`\n❌ Max retries (${maxRetries}) exceeded. Giving up.`);
                    success = false;
                    break;
                  }

                  retryCount++;
                  const retryDelay = rateLimitInfo.suggestedWaitSeconds || 60;
                  console.error(
                    `\n⏳ Rate limit retry ${retryCount}/${maxRetries}: Waiting ${retryDelay}s before retrying...`,
                  );

                  await sleep(retryDelay * 1000);

                  continue;
                } else {
                  console.error('\nSession encountered an error');
                  if (errorData?.message) {
                    console.error(`Error: ${errorData.message}`);
                  }
                }

                success = false;
                break;
              }
              continue;
            }

            // Handle permission requests - auto-approve all tools
            const permEvent = event as PermissionEvent;
            if (permEvent.type === 'permission.ask') {
              const permission = permEvent.properties?.permission;
              if (permission?.sessionID === session.id) {
                if (this.verbose) {
                  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
                  console.log(`[${timestamp}] 🔓 Permission requested for: ${permission.tool}`);
                  console.log(`  Auto-approving...`);
                }
                // Auto-approve the permission using /allow command
                try {
                  await client.session.command({
                    path: { id: session.id },
                    body: {
                      command: '/allow',
                      arguments: permission.id,
                    },
                  });
                } catch (error) {
                  console.error(`Failed to approve permission: ${error}`);
                }
              }
              continue;
            }

            // Track token usage from message.updated events (AssistantMessage contains token data)
            //
            // OpenCode SDK emits message.updated events when AI responses complete.
            // Token data is available in event.properties.info.tokens with structure:
            // { input: number, output: number, reasoning?: number }
            //
            // SDK Version Compatibility:
            // - >= 1.2.0: Full token support including reasoning
            // - 1.1.x: Basic input/output tokens only
            // - < 1.1.0: No token support
            if (event.type === 'message.updated' && event.properties?.info) {
              const messageInfo = event.properties.info as {
                tokens?: { input?: number; output?: number; reasoning?: number };
              };
              if (messageInfo.tokens) {
                const messageTokens = messageInfo.tokens || {};
                const input = messageTokens.input ?? 0;
                const output = messageTokens.output ?? 0;
                const reasoning = messageTokens.reasoning ?? 0;

                sessionTokens.input += input;
                sessionTokens.output += output;
                sessionTokens.reasoning += reasoning;

                if (this.verbose) {
                  const now = Date.now();
                  const isZeroTokenEvent = input === 0 && output === 0 && reasoning === 0;
                  const isDuplicateOfLast =
                    input === lastLoggedTokens.input &&
                    output === lastLoggedTokens.output &&
                    reasoning === lastLoggedTokens.reasoning &&
                    now - lastLoggedTokens.timestamp < 100;

                  if (!isZeroTokenEvent && !isDuplicateOfLast) {
                    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
                    const total = input + output + reasoning;
                    const runningTotal =
                      sessionTokens.input + sessionTokens.output + sessionTokens.reasoning;

                    console.log(
                      `[${timestamp}] 💰 +${input.toLocaleString()} in, +${output.toLocaleString()} out${reasoning ? `, +${reasoning.toLocaleString()} reasoning` : ''} (${runningTotal.toLocaleString()} total)`,
                    );

                    lastLoggedTokens = { input, output, reasoning, timestamp: now };
                  }
                }
              }
            }

            // Track token usage from step-finish events (StepFinishPart contains token data)
            //
            // OpenCode SDK emits message.part.updated events with type 'step-finish'
            // during multi-step reasoning processes. Token data structure matches
            // message.updated events but represents individual step usage.
            //
            // Event structure:
            // { type: 'message.part.updated', properties: {
            //   part: { type: 'step-finish', tokens: { input, output, reasoning } }
            // }}
            if (
              event.type === 'message.part.updated' &&
              event.properties?.part?.type === 'step-finish'
            ) {
              const stepPart = event.properties.part as {
                tokens?: { input?: number; output?: number; reasoning?: number };
              };
              if (stepPart.tokens) {
                const stepTokens = stepPart.tokens || {};
                const input = stepTokens.input ?? 0;
                const output = stepTokens.output ?? 0;
                const reasoning = stepTokens.reasoning ?? 0;

                sessionTokens.input += input;
                sessionTokens.output += output;
                sessionTokens.reasoning += reasoning;

                if (this.verbose) {
                  const now = Date.now();
                  const isZeroTokenEvent = input === 0 && output === 0 && reasoning === 0;
                  const isDuplicateOfLast =
                    input === lastLoggedTokens.input &&
                    output === lastLoggedTokens.output &&
                    reasoning === lastLoggedTokens.reasoning &&
                    now - lastLoggedTokens.timestamp < 100;

                  if (!isZeroTokenEvent && !isDuplicateOfLast) {
                    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
                    const runningTotal =
                      sessionTokens.input + sessionTokens.output + sessionTokens.reasoning;

                    console.log(
                      `[${timestamp}] 🧠 Step: +${input.toLocaleString()} in, +${output.toLocaleString()} out${reasoning ? `, +${reasoning.toLocaleString()} reasoning` : ''} (${runningTotal.toLocaleString()} total)`,
                    );

                    lastLoggedTokens = { input, output, reasoning, timestamp: now };
                  }
                }
              }
            }

            // Message-level events have session ID in part.sessionID
            const props = event.properties as EventPropertiesWithSessionID;
            const eventSessionId = props?.sessionID || props?.part?.sessionID;

            if (eventSessionId !== session.id) continue;

            // Handle message events
            if (event.type === 'message.part.updated') {
              const part = event.properties?.part;
              if (part?.type === 'tool') {
                if (part.state?.status === 'running') {
                  toolCalls++;
                  // Update progress indicator with token usage
                  if (progressIndicator) {
                    const currentTokenUsage = {
                      input: sessionTokens.input,
                      output: sessionTokens.output,
                      total: sessionTokens.input + sessionTokens.output + sessionTokens.reasoning,
                      reasoning: sessionTokens.reasoning,
                    };
                    progressIndicator.update({
                      action: part.tool || '',
                      count: toolCalls,
                      tokens: currentTokenUsage,
                    });
                  }

                  if (this.verbose) {
                    const toolName = part.tool || 'unknown';
                    const now = Date.now();
                    const toolKey = `${toolName}-running`;
                    const lastToolTime = lastLoggedTools.get(toolKey) || 0;

                    if (now - lastToolTime > 100) {
                      lastLoggedTools.set(toolKey, now);
                      const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
                      console.log(`\n[${timestamp}] 🔧 Tool: ${toolName}`);

                      if (part.state.input && Object.keys(part.state.input).length > 0) {
                        const inputStr = JSON.stringify(part.state.input, null, 2);
                        const lines = inputStr.split('\n');
                        if (lines.length > 10) {
                          console.log(
                            `  Input: ${lines.slice(0, 10).join('\n  ')}\n  ... (${lines.length - 10} more lines)`,
                          );
                        } else {
                          console.log(`  Input: ${inputStr}`);
                        }
                      }
                    }
                  } else {
                    this.log(`  Tool: ${part.tool}...`);
                  }
                } else if (part.state?.status === 'completed') {
                  if (this.verbose) {
                    const toolName = part.tool || 'unknown';
                    const now = Date.now();
                    const toolKey = `${toolName}-completed`;
                    const lastToolTime = lastLoggedTools.get(toolKey) || 0;

                    if (now - lastToolTime > 100) {
                      lastLoggedTools.set(toolKey, now);
                      const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
                      const title = part.state.title || 'completed';
                      const duration = part.state.time
                        ? ((part.state.time.end - part.state.time.start) / 1000).toFixed(2)
                        : '?';
                      console.log(`[${timestamp}] ✓ Tool: ${toolName} - ${title} (${duration}s)`);

                      if (part.state.output) {
                        const outputStr = part.state.output;
                        const lines = outputStr.split('\n');
                        if (lines.length > 20) {
                          console.log(
                            `  Output (${lines.length} lines):\n  ${lines.slice(0, 20).join('\n  ')}\n  ... (${lines.length - 20} more lines)`,
                          );
                        } else if (lines.length > 1) {
                          console.log(`  Output:\n  ${lines.join('\n  ')}`);
                        } else if (outputStr.length > 200) {
                          console.log(
                            `  Output: ${outputStr.slice(0, 200)}... (${outputStr.length} chars)`,
                          );
                        } else {
                          console.log(`  Output: ${outputStr}`);
                        }
                      }
                    }
                  } else {
                    this.log(`  Tool: ${part.tool} - ${part.state.title || 'done'}`);
                  }
                } else if (part.state?.status === 'error') {
                  const toolName = part.tool || 'unknown';
                  if (this.verbose) {
                    const now = Date.now();
                    const toolKey = `${toolName}-error`;
                    const lastToolTime = lastLoggedTools.get(toolKey) || 0;

                    if (now - lastToolTime > 100) {
                      lastLoggedTools.set(toolKey, now);
                      const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
                      console.error(`[${timestamp}] ✗ Tool: ${toolName} - ERROR`);
                      if (part.state.error) {
                        console.error(`  Error: ${part.state.error}`);
                      }
                    }
                  } else {
                    console.error(`  Tool: ${toolName} - ERROR`);
                  }
                }
              } else if (part?.type === 'text') {
                textParts++;
                const text = part.text || '';

                if (this.verbose && text.length > lastTextLength) {
                  const newContent = text.slice(lastTextLength);
                  lastTextLength = text.length;

                  if (newContent.trim().length > 0) {
                    process.stdout.write(newContent);
                  }
                } else if (!this.verbose && text.length > 0 && textParts % 5 === 0) {
                  this.log(`  [Text output ${textParts}...]`);
                }
              }
            }
          }
          sessionCompleted = true;
        })(),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Session timeout')) {
        console.error(`\n⏱️  ${error.message}`);
        console.error(`   Last activity: ${toolCalls} tool calls, ${textParts} text parts`);
        if (this.verbose) {
          console.error(`   Session ID: ${session.id}`);
          console.error(`   Model: ${displayModel || 'unknown'}`);
        }
        success = false;
      } else {
        console.error(`Event stream error: ${error}`);
        success = false;
      }
    } finally {
      if (progressIndicator) {
        progressIndicator.stop();
      }
    }

    const duration = Date.now() - startTime;

    // Calculate token usage from collected session data
    if (sessionTokens.input > 0 || sessionTokens.output > 0) {
      const rawTokenUsage = {
        input: sessionTokens.input,
        output: sessionTokens.output,
        total: sessionTokens.input + sessionTokens.output,
        model: this.activeModel || undefined,
      };

      // F034: Validate token usage data integrity
      const validation = validateTokenUsage(rawTokenUsage, `session-${Date.now()}`);
      tokenUsage = validation.correctedTokens || rawTokenUsage;
    }

    // F014: Add fallback for SDK versions without token usage
    if (!hasTokenData(sessionTokens)) {
      showTokenFallbackMessage(this.dryRun);
    }

    // Check if the feature was actually marked as passing
    const featureCompleted = await this.featureManager.wasFeatureCompleted(feature.id);

    // Create session metrics for progress writing
    const sessionMetrics: SessionMetrics = {
      sessionId: session.id,
      featureId: feature.id,
      startTime,
      endTime: Date.now(),
      success: success && featureCompleted,
      toolCalls,
      textParts,
      tokenUsage,
      model: this.activeModel || undefined,
    };

    // Add cost breakdown if available
    if (
      tokenUsage &&
      this.activeModel &&
      this.costSettings.enabled &&
      isCostCalculationSupported(this.activeModel, this.costSettings.customPricing)
    ) {
      sessionMetrics.costBreakdown =
        calculateCost(tokenUsage, this.activeModel, this.costSettings.customPricing) || undefined;
    }

    // Record metrics
    this.state.metrics.push(sessionMetrics);

    // Write progress entry with token usage (F004)
    await this.writeProgressEntry(feature, sessionMetrics, success && featureCompleted);

    if (!this.json) {
      console.log('\n' + '-'.repeat(60));
      console.log('Session Summary:');
      console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`  Tool calls: ${toolCalls}`);
      if (tokenUsage !== undefined) {
        const averageTokens = calculateAverageTokens(
          this.state.metrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!),
        );
        const formattedTokens = formatTokenUsageWithIndicators(
          tokenUsage,
          this.tokenDisplaySettings,
          averageTokens,
        );
        console.log(`  Tokens: ${formattedTokens}`);
      }
      console.log(`  Feature completed: ${featureCompleted ? 'Yes' : 'No'}`);
      console.log('-'.repeat(60));
    }

    return success && featureCompleted;
  }

  /**
   * Generate final summary report
   *
   * Creates a comprehensive summary of the orchestration session including
   * progress metrics, timing information, and token usage data when available.
   *
   * Token usage is calculated by aggregating data from all individual sessions
   * that have tokenUsage information. The function only includes tokenUsage
   * in the result when at least one session has token data, avoiding undefined
   * token tracking for SDK versions that don't support it.
   *
   * @returns Promise resolving to SessionSummary with optional tokenUsage data
   *
   * @example
   * ```typescript
   * const summary = await orchestrator.generateSummary();
   * // Returns SessionSummary with aggregated token usage from all sessions:
   * // {
   * //   sessionsRun: 3,
   * //   featuresCompleted: 2,
   * //   tokenUsage: {
   * //     sessions: [...],
   * //     total: { input: 3000, output: 1500, total: 4500 }
   * //   }
   * // }
   * ```
   */
  private async generateSummary(): Promise<SessionSummary> {
    const [passing, total] = await this.featureManager.getProgress();
    const elapsed = Date.now() - this.state.startTime.getTime();
    const isComplete = await this.featureManager.isComplete();

    // Calculate total token usage and model breakdown
    const totalTokenUsage = {
      input: 0,
      output: 0,
      total: 0,
    };
    const sessionTokens = this.state.metrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);

    // F024: Track tokens by model tier
    const modelTracker = createModelTokenTracker();

    for (const sessionMetric of this.state.metrics) {
      if (sessionMetric.tokenUsage && sessionMetric.model) {
        const tokenWithModel: TokenUsage = {
          ...sessionMetric.tokenUsage,
          model: sessionMetric.model,
        };
        modelTracker.addTokenUsage(sessionMetric.model, sessionMetric.tokenUsage);
      }
    }

    for (const tokens of sessionTokens) {
      totalTokenUsage.input += tokens.input;
      totalTokenUsage.output += tokens.output;
      totalTokenUsage.total += tokens.total;
    }

    // F034: Validate total token usage data integrity
    const totalValidation = validateTokenUsage(totalTokenUsage, 'summary-total');
    if (totalValidation.correctedTokens) {
      Object.assign(totalTokenUsage, totalValidation.correctedTokens);
    }

    if (sessionTokens.length > 0 && totalTokenUsage.total > 0) {
      try {
        const featureData = await this.featureManager.load();
        await this.featureManager.save(featureData, true, totalTokenUsage);
      } catch (error) {
        console.error('Warning: Failed to save token usage to feature_list.json:', error);
      }
    }

    // Get model breakdown if multiple models were used
    const tokenUsageByModel =
      modelTracker.getModelCount() > 1 ? modelTracker.getSummary() : undefined;

    const summary: SessionSummary = {
      sessionsRun: this.state.sessionCount,
      featuresCompleted: this.state.featuresCompleted,
      finalProgress: `${passing}/${total}`,
      completionPercentage: total > 0 ? (passing / total) * 100 : 0,
      elapsedTime: formatDuration(elapsed),
      isComplete,
      tokenUsage:
        sessionTokens.length > 0
          ? {
              sessions: sessionTokens,
              total: totalTokenUsage,
            }
          : undefined,
    };

    // Add model breakdown if available
    if (tokenUsageByModel) {
      (summary as any).tokenUsageByModel = tokenUsageByModel;
    }

    if (this.json) {
      const output = {
        ...summary,
        progress: { passing, total },
        tokenTrackingSupported: supportsTokenTracking(),
        dryRun: this.dryRun,
      };

      // Add cost information to JSON output if available
      if (
        summary.tokenUsage &&
        this.activeModel &&
        this.costSettings.enabled &&
        isCostCalculationSupported(this.activeModel, this.costSettings.customPricing)
      ) {
        const totalCost = calculateCost(
          summary.tokenUsage.total,
          this.activeModel,
          this.costSettings.customPricing,
        );
        if (totalCost) {
          (output as any).costBreakdown = totalCost;
          (output as any).currency = this.costSettings.currency || '$';
          (output as any).model = this.activeModel;
        }
      }

      console.log(JSON.stringify(output));
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(' ORCHESTRATION SUMMARY');
      console.log('='.repeat(60));
      console.log(`Sessions run: ${summary.sessionsRun}`);
      console.log(`Features completed: ${summary.featuresCompleted}`);
      console.log(
        `Final progress: ${summary.finalProgress} (${summary.completionPercentage.toFixed(1)}%)`,
      );
      console.log(`Total time: ${summary.elapsedTime}`);
      console.log(`Complete: ${summary.isComplete ? 'Yes' : 'No'}`);

      // Show token usage summary
      if (summary.tokenUsage !== undefined && summary.tokenUsage.total !== undefined) {
        console.log(`\n${getTokenPrefix()} Usage:`);
        console.log(
          `  Total: ${summary.tokenUsage.total.total.toLocaleString()} tokens (${summary.tokenUsage.total.input.toLocaleString()} in, ${summary.tokenUsage.total.output.toLocaleString()} out)`,
        );
        if (summary.sessionsRun > 0) {
          const avgTokens = Math.round(summary.tokenUsage.total.total / summary.sessionsRun);
          console.log(`  Average per session: ${avgTokens.toLocaleString()} tokens`);
        }

        // F026: Add budget warnings if enabled
        const budgetConfig = this.budgetSettings;
        if (budgetConfig.enabled) {
          const budgetStatus = this.calculateBudgetStatus(
            summary.tokenUsage.total.total,
            budgetConfig,
          );
          if (budgetStatus.message) {
            console.log(`  ${budgetStatus.message}`);
          }
        }

        // F024: Show per-model token breakdown if multiple models were used
        const tokenUsageByModel = (summary as any).tokenUsageByModel as TokenUsageByModel;
        if (tokenUsageByModel && tokenUsageByModel.byModel.length > 1) {
          console.log('\n  By Model:');
          for (const modelUsage of tokenUsageByModel.byModel) {
            const modelName = ModelTokenTracker.getModelTier(modelUsage.model);
            console.log(
              `    ${modelName}: ${modelUsage.total.toLocaleString()} tokens (${modelUsage.input.toLocaleString()} in, ${modelUsage.output.toLocaleString()} out)`,
            );
          }
        }

        // Show cost calculation if enabled and model is known
        const costConfig = this.costSettings;
        if (
          costConfig.enabled &&
          this.activeModel &&
          isCostCalculationSupported(this.activeModel, costConfig.customPricing)
        ) {
          const totalCost = calculateCost(
            summary.tokenUsage.total,
            this.activeModel,
            costConfig.customPricing,
          );
          if (totalCost) {
            const currency = costConfig.currency || '$';
            const precision = costConfig.precision || 4;
            console.log(
              `  💰 Estimated Cost: ${formatCost(totalCost.totalCost, precision, currency)}`,
            );

            if (summary.sessionsRun > 0) {
              const avgCost = totalCost.totalCost / summary.sessionsRun;
              console.log(
                `  💰 Average Cost per Session: ${formatCost(avgCost, precision, currency)}`,
              );
            }

            // Show cost breakdown
            console.log(`    Input cost: ${formatCost(totalCost.inputCost, precision, currency)}`);
            console.log(
              `    Output cost: ${formatCost(totalCost.outputCost, precision, currency)}`,
            );
          }
        }

        // F027: Show token efficiency metrics if we have progress data and features
        try {
          const efficiencyMetrics = await calculateTokenEfficiencyMetrics(this.projectDir);

          if (efficiencyMetrics.totalFeatures > 0 && efficiencyMetrics.totalTokens > 0) {
            console.log('\n📊 Token Efficiency:');
            console.log(
              `  Average tokens per feature: ${efficiencyMetrics.averageTokensPerFeature.toLocaleString()}`,
            );
            console.log(
              `  Average tokens per session: ${efficiencyMetrics.averageTokensPerSession.toLocaleString()}`,
            );

            // Show most efficient feature if available
            if (efficiencyMetrics.mostEfficient.length > 0) {
              const mostEfficient = efficiencyMetrics.mostEfficient[0];
              console.log(
                `  Most efficient: ${mostEfficient.featureId} (${mostEfficient.tokenUsage.toLocaleString()} tokens)`,
              );
            }

            // Show least efficient feature if available
            if (efficiencyMetrics.leastEfficient.length > 0) {
              const leastEfficient = efficiencyMetrics.leastEfficient[0];
              console.log(
                `  Least efficient: ${leastEfficient.featureId} (${leastEfficient.tokenUsage.toLocaleString()} tokens)`,
              );
            }

            // Show top optimization opportunity
            if (efficiencyMetrics.optimizationOpportunities.length > 0) {
              console.log(`  💡 Tip: ${efficiencyMetrics.optimizationOpportunities[0]}`);
            }
          }
        } catch {
          // Silently ignore if progress.txt not available or readable
        }
      }

      if (this.state.metrics.length > 0 && this.verbose) {
        console.log('\nSession Details:');
        for (const m of this.state.metrics) {
          const duration = m.endTime ? (m.endTime - m.startTime) / 1000 : 0;
          const status = m.success ? '✓' : '✗';
          console.log(
            `  ${status} ${m.featureId}: ${duration.toFixed(1)}s, ${m.toolCalls} tool calls`,
          );

          // Show detailed token usage in verbose mode
          if (m.tokenUsage) {
            const inputTokens = (m.tokenUsage.input || 0).toLocaleString();
            const outputTokens = (m.tokenUsage.output || 0).toLocaleString();
            const totalTokens = (m.tokenUsage.total || 0).toLocaleString();
            const modelInfo = m.model ? ` (${ModelTokenTracker.getModelTier(m.model)})` : '';
            console.log(
              `    💰 Tokens: ${inputTokens} in, ${outputTokens} out, ${totalTokens} total${modelInfo}`,
            );

            // Show cost per session if enabled and model is known
            const costConfig = this.costSettings;
            if (
              costConfig.enabled &&
              this.activeModel &&
              isCostCalculationSupported(this.activeModel, costConfig.customPricing)
            ) {
              const sessionCost = calculateCost(
                m.tokenUsage,
                this.activeModel,
                costConfig.customPricing,
              );
              if (sessionCost) {
                const currency = costConfig.currency || '$';
                const precision = costConfig.precision || 4;
                console.log(
                  `      Cost: ${formatCost(sessionCost.totalCost, precision, currency)}`,
                );
              }
            }
          } else {
            console.log(`    💰 Tokens: No token data available`);
          }
        }
      }

      console.log('='.repeat(60) + '\n');
    }

    return summary;
  }

  /**
   * Main orchestration loop
   */
  async run(): Promise<SessionSummary> {
    // Load config first for display
    this.paceConfig = await loadConfig(this.projectDir);

    if (!this.json) {
      console.log('\n' + '='.repeat(60));
      console.log(' PACE ORCHESTRATOR');
      console.log('='.repeat(60));
      console.log(`\nProject: ${this.projectDir}`);
      console.log(`Max sessions: ${this.effectiveMaxSessions || 'unlimited'}`);
      console.log(`Max consecutive failures: ${this.effectiveMaxFailures}`);
      console.log(`Delay between sessions: ${this.effectiveDelay / 1000}s`);
    }

    // Check initial state before initializing server
    const [initialPassing, total] = await this.featureManager.getProgress();
    if (!this.json) {
      console.log(`Starting progress: ${initialPassing}/${total} features`);
    }

    if (total === 0) {
      if (!this.json) {
        console.log('\nNo features found in feature_list.json');
        console.log('Run "pace init" first to set up the project.');
      }
      return this.generateSummary();
    }

    if (await this.featureManager.isComplete()) {
      if (!this.json) {
        console.log('\nAll features already passing!');
      }
      return this.generateSummary();
    }

    if (this.dryRun) {
      if (!this.json) {
        console.log('\n[DRY RUN] Would initialize OpenCode server and run sessions');
      }
      // Simulate running sessions for dry-run
      while (true) {
        if (this.effectiveMaxSessions && this.state.sessionCount >= this.effectiveMaxSessions) {
          if (!this.json) {
            console.log(`\nReached maximum sessions (${this.effectiveMaxSessions})`);
          }
          break;
        }

        const nextFeature = await this.featureManager.getNextFeature();
        if (!nextFeature) break;

        this.state.sessionCount++;
        if (!this.json) {
          // Get agent-specific model if configured (CLI --model overrides everything)
          const agentModelId = this.model ?? getAgentModel(this.paceConfig, PACE_AGENTS.CODING);
          const displayModel = agentModelId ?? this.activeModel;

          console.log('\n' + '='.repeat(60));
          console.log(`SESSION ${this.state.sessionCount}: Feature ${nextFeature.id}`);
          console.log('='.repeat(60));
          console.log(`Description: ${nextFeature.description.slice(0, 60)}...`);
          if (displayModel) {
            console.log(`Model: ${displayModel}`);
          }
          console.log('\n[DRY RUN] Would create coding session here');
        }
      }
      return this.generateSummary();
    }

    // Initialize only when we actually need to run sessions
    await this.initialize();

    if (!this.json && this.activeModel) {
      console.log(`Model: ${this.activeModel}`);
    }

    try {
      // Main loop
      while (true) {
        // Check stopping conditions
        if (this.effectiveMaxSessions && this.state.sessionCount >= this.effectiveMaxSessions) {
          if (!this.json) {
            console.log(`\nReached maximum sessions (${this.effectiveMaxSessions})`);
          }
          break;
        }

        if (this.state.consecutiveFailures >= this.effectiveMaxFailures) {
          if (!this.json) {
            console.log(`\nReached maximum consecutive failures (${this.effectiveMaxFailures})`);
          }
          break;
        }

        if (await this.featureManager.isComplete()) {
          if (!this.json) {
            console.log('\nAll features passing! Project complete!');
          }
          break;
        }

        // Get next feature
        const nextFeature = await this.featureManager.getNextFeature();
        if (!nextFeature) {
          if (!this.json) {
            console.log('\nNo more features to implement');
          }
          break;
        }

        // Run coding session
        this.state.sessionCount++;
        const passingBefore = (await this.featureManager.getProgress())[0];

        const success = await this.runCodingSession(nextFeature);

        // Check if progress was made
        const passingAfter = (await this.featureManager.getProgress())[0];
        const featuresAdded = passingAfter - passingBefore;

        if (success && featuresAdded > 0) {
          this.state.featuresCompleted += featuresAdded;
          this.state.consecutiveFailures = 0;
          if (!this.json) {
            console.log(`\nFeature ${nextFeature.id} completed successfully`);
          }
        } else if (success) {
          this.state.consecutiveFailures++;
          if (!this.json) {
            console.log(
              `\nSession completed but feature not marked as passing (${this.state.consecutiveFailures} consecutive)`,
            );
          }
        } else {
          this.state.consecutiveFailures++;
          if (!this.json) {
            console.log(`\nSession failed (${this.state.consecutiveFailures} consecutive)`);
          }
        }

        // Delay before next session
        if (
          !(await this.featureManager.isComplete()) &&
          (!this.effectiveMaxSessions || this.state.sessionCount < this.effectiveMaxSessions)
        ) {
          const delaySeconds = this.effectiveDelay / 1000;
          if (!this.json) {
            console.log(`\nWaiting ${delaySeconds}s before next session...`);
          }
          await new Promise((resolve) => setTimeout(resolve, this.effectiveDelay));
        }
      }
    } finally {
      await this.shutdown();
    }
    return await this.generateSummary();
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleRun(options: ParsedArgs['options']): Promise<void> {
  const orchestrator = new Orchestrator(options);

  try {
    const summary = await orchestrator.run();
    process.exit(summary.isComplete ? 0 : 1);
  } catch (error) {
    if (error instanceof Error && error.message === 'SIGINT') {
      console.log('\n\nOrchestration interrupted by user');
      process.exit(130);
    }
    throw error;
  }
}

/**
 * Check if feature_list.json exists in the given directory
 *
 * @param projectDir - The project directory path
 * @returns true if feature_list.json exists, false if not found (ENOENT)
 * @throws Error if a non-ENOENT error occurs (e.g., permission denied)
 */
async function checkFeatureListExists(projectDir: string): Promise<boolean> {
  const featureListPath = join(projectDir, 'feature_list.json');

  try {
    await stat(featureListPath);
    return true;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      return false;
    }
    // Re-throw non-ENOENT errors (permission issues, etc.)
    throw error;
  }
}

/**
 * Reads the metadata.last_updated timestamp from feature_list.json
 *
 * @param projectDir - The project directory path
 * @returns The last_updated timestamp string, or undefined if not present or file doesn't exist
 * @throws Error if JSON is malformed or file read fails (non-ENOENT errors)
 */
async function readLastUpdated(projectDir: string): Promise<string | undefined> {
  const featureListPath = join(projectDir, 'feature_list.json');

  try {
    const content = await readFile(featureListPath, 'utf-8');
    const data = JSON.parse(content);

    // Check if metadata and last_updated exist
    if (data?.metadata?.last_updated) {
      return data.metadata.last_updated;
    }

    return undefined;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      // File doesn't exist - return undefined
      return undefined;
    }
    // Re-throw JSON parsing errors or other read errors
    throw error;
  }
}

async function handleInit(options: ParsedArgs['options']): Promise<void> {
  const projectDir = resolve(options.projectDir);

  // Handle --archive-only flag: archive without initialization
  if (options.archiveOnly) {
    // Load pace config to get archive directory setting
    const paceConfig = await loadConfig(projectDir);
    const paceSettings = getPaceSettings(paceConfig);

    // Perform archiving only
    const archiveManager = new ArchiveManager();
    const archiveResult = await archiveManager.archive({
      projectDir,
      archiveDir: paceSettings.archiveDir,
      dryRun: options.dryRun,
      silent: options.json,
      verbose: options.verbose,
      createArchiveMetadata: paceSettings.createArchiveMetadata ?? true,
      reason: options.archiveOnly ? 'pace init --archive-only' : 'pace init --archive-only',
    });

    if (options.json) {
      console.log(
        JSON.stringify({
          archive: {
            archived: archiveResult.archived,
            archivePath: archiveResult.archivePath,
            archivedFiles: archiveResult.archivedFiles,
          },
          dryRun: options.dryRun,
        }),
      );
    } else {
      if (archiveResult.archived) {
        console.log(`\nArchived existing files to: ${archiveResult.archivePath}`);
        console.log(`Files archived: ${archiveResult.archivedFiles.join(', ')}`);
      } else {
        console.log('\nNo files to archive');
      }
    }

    process.exit(archiveResult.archived ? 0 : 0);
  }

  // Get the project description from prompt or file
  let projectDescription: string | undefined;

  if (options.file) {
    const filePath = resolve(options.file);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        console.error(`Error: '${options.file}' is not a file`);
        process.exit(1);
      }
      projectDescription = await readFile(filePath, 'utf-8');
      if (!options.json) {
        console.log(`Reading project description from: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error reading file '${options.file}': ${error}`);
      process.exit(1);
    }
  } else if (options.prompt) {
    projectDescription = options.prompt;
  }

  if (!projectDescription) {
    console.error('Error: Project description required');
    console.error('');
    console.error('Usage:');
    console.error('  pace init --prompt "Build a todo app with authentication"');
    console.error('  pace init -p "Build a REST API for inventory management"');
    console.error('  pace init --file requirements.txt');
    console.error('  pace init "Build a chat application with real-time messaging"');
    console.error('');
    console.error('The initializer agent will create:');
    console.error('  - feature_list.json with 50-200+ features');
    console.error('  - init.sh development environment script');
    console.error('  - progress.txt progress log');
    console.error('  - Git repository with initial commit');
    process.exit(1);
  }

  // Load pace config to get archive directory setting
  const paceConfig = await loadConfig(projectDir);
  const paceSettings = getPaceSettings(paceConfig);

  // Check if feature_list.json already exists and handle based on --force flag
  let archived = false;
  let archivePath: string | null = null;
  let archivedFiles: string[] = [];

  if (!options.force) {
    // Normal archiving behavior
    const archiveManager = new ArchiveManager();
    const archiveResult = await archiveManager.archive({
      projectDir,
      archiveDir: paceSettings.archiveDir,
      dryRun: options.dryRun,
      silent: options.json,
      verbose: options.verbose,
      createArchiveMetadata: paceSettings.createArchiveMetadata ?? true,
      reason: options.force ? 'pace init --force' : 'pace init',
    });
    archived = archiveResult.archived;
    archivePath = archiveResult.archivePath;
    archivedFiles = archiveResult.archivedFiles;

    // Provide feedback when no files need archiving
    if (!archived && !options.dryRun && !options.json) {
      console.log('No existing files to archive');
    }
  } else {
    // --force flag: skip archiving and warn about overwriting
    const featureListExists = await checkFeatureListExists(projectDir);
    if (featureListExists && !options.dryRun && !options.json) {
      console.log('\n⚠️  Warning: --force flag specified');
      console.log('   Existing files will be overwritten without archiving');
    }
  }

  if (options.dryRun) {
    // Get agent-specific model if configured (CLI --model overrides everything)
    const agentModelId = options.model ?? getAgentModel(paceConfig, PACE_AGENTS.INITIALIZER);

    if (options.json) {
      console.log(
        JSON.stringify({
          dryRun: true,
          projectDir,
          promptLength: projectDescription.length,
          promptPreview:
            projectDescription.slice(0, 200) + (projectDescription.length > 200 ? '...' : ''),
          message: 'Would initialize pace project with given description',
          model: agentModelId,
          archive: {
            archived,
            archivePath,
            archivedFiles,
          },
          tokenTrackingSupported: supportsTokenTracking(),
        }),
      );
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(' PACE INIT (DRY RUN)');
      console.log('='.repeat(60));
      console.log(`\nProject directory: ${projectDir}`);
      if (agentModelId) {
        console.log(`Model: ${agentModelId}`);
      }
      console.log(`\nProject description:`);
      console.log('-'.repeat(40));
      console.log(
        projectDescription.slice(0, 500) + (projectDescription.length > 500 ? '\n...' : ''),
      );
      console.log('-'.repeat(40));
      console.log('\n[DRY RUN] Would initialize pace project with the initializer agent');
      console.log('\nExpected outputs:');
      console.log('  - feature_list.json (50-200+ features)');
      console.log('  - init.sh (development environment script)');
      console.log('  - progress.txt (progress log)');
      console.log('  - Git repository with initial commit');
    }
    process.exit(0);
  }

  if (!options.json) {
    console.log('\n' + '='.repeat(60));
    console.log(' PACE INIT');
    console.log('='.repeat(60));
    console.log(`\nProject directory: ${projectDir}`);
    console.log(`\nProject description:`);
    console.log('-'.repeat(40));
    console.log(
      projectDescription.slice(0, 300) + (projectDescription.length > 300 ? '\n...' : ''),
    );
    console.log('-'.repeat(40));
    if (options.url) {
      console.log(`\nConnecting to OpenCode server at ${options.url}...`);
    } else {
      console.log('\nInitializing OpenCode server...');
    }
  }

  // Initialize OpenCode (embedded server or external connection)
  let opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;
  let externalClient: OpencodeClient | null = null;
  const isExternalServer = !!options.url;

  try {
    let client: OpencodeClient;

    if (options.url) {
      // Connect to existing OpenCode server
      externalClient = createOpencodeClient({
        baseUrl: options.url,
      });
      client = externalClient;
      if (!options.json) {
        console.log(`Connected to OpenCode server: ${options.url}`);
      }
    } else {
      // Start embedded OpenCode server
      console.log('Starting embedded OpenCode server...');
      opencode = await createOpencode({
        config: paceConfig,
        port: 0,
      });
      client = opencode.client;
      if (!options.json) {
        console.log(`OpenCode server started: ${opencode.server.url}`);
      }
    }

    // Get agent-specific model if configured (CLI --model overrides everything)
    const agentModelId = options.model ?? getAgentModel(paceConfig, PACE_AGENTS.INITIALIZER);
    const agentModel = agentModelId ? parseModelId(agentModelId) : undefined;

    if (!options.json) {
      if (agentModelId) {
        console.log(`Model: ${agentModelId}`);
      }
      console.log('\nRunning initializer agent...\n');
    }

    // Create a session for initialization
    const sessionResult = await client.session.create({
      body: {
        title: `Pace Init: ${projectDescription.slice(0, 40)}...`,
      },
    });

    if (sessionResult.error) {
      throw new Error(`Failed to create session: ${JSON.stringify(sessionResult.error)}`);
    }

    const session = sessionResult.data;

    // Subscribe to events BEFORE sending prompt to avoid missing events
    const events = await client.event.subscribe();

    // Use the /pace-init slash command to invoke the initializer agent

    const fullPrompt = `${paceInitMd}\n${projectDescription}`;

    // Send the prompt (use promptAsync for event streaming)
    const promptResult = await client.session.promptAsync({
      path: { id: session.id },
      body: {
        parts: [{ type: 'text', text: fullPrompt }],
        ...(agentModel && { model: agentModel }),
        agent: 'pace-initializer',
      },
    });

    if (promptResult.error) {
      throw new Error(`Failed to send prompt: ${JSON.stringify(promptResult.error)}`);
    }

    // Wait for completion
    let success = false;
    let toolCalls = 0;
    let textParts = 0;
    let lastTextLength = 0;
    let tokenUsage: TokenUsage | undefined;
    const sessionTokens = { input: 0, output: 0, reasoning: 0 };
    const startTime = Date.now();

    // Progress indicator for non-verbose mode
    let progressIndicator: ProgressIndicator | null = null;
    if (!this.json && !this.verbose) {
      progressIndicator = createProgressIndicator({
        trackWidth: 20,
        showEmojis: true,
        showElapsed: true,
        showCount: true,
        countLabel: 'tool calls',
        showTokens: true,
      });
    }

    for await (const event of events.stream) {
      // Session-level events have session ID in properties.sessionID
      if (event.type === 'session.idle') {
        const idleSessionId = event.properties?.sessionID;
        if (idleSessionId === session.id) {
          success = true;
          break;
        }
        continue;
      }

      if (event.type === 'session.error') {
        const errorSessionId = event.properties?.sessionID;
        if (errorSessionId === session.id) {
          success = false;
          break;
        }
        continue;
      }

      // Handle permission requests - auto-approve all tools
      const permEvent = event as PermissionEvent;
      if (permEvent.type === 'permission.ask') {
        const permission = permEvent.properties?.permission;
        if (permission?.sessionID === session.id) {
          // Auto-approve the permission using /allow command
          try {
            await client.session.command({
              path: { id: session.id },
              body: {
                command: '/allow',
                arguments: permission.id,
              },
            });
          } catch (error) {
            console.error(`Failed to approve permission: ${error}`);
          }
        }
        continue;
      }

      // Track token usage from message.updated events (AssistantMessage contains token data)
      //
      // OpenCode SDK integration for token extraction:
      // Event type: 'message.updated' - emitted when AI response completes
      // Token location: event.properties.info.tokens
      // Structure: { input: number, output: number, reasoning?: number }
      // SDK compatibility: Requires @opencode-ai/sdk >= 1.1.0 for basic tokens
      if (event.type === 'message.updated' && event.properties?.info) {
        const messageInfo = event.properties.info as {
          tokens?: { input?: number; output?: number; reasoning?: number };
        };
        if (messageInfo.tokens) {
          const messageTokens = messageInfo.tokens || {};
          sessionTokens.input += messageTokens.input ?? 0;
          sessionTokens.output += messageTokens.output ?? 0;
          sessionTokens.reasoning += messageTokens.reasoning ?? 0;
        }
      }

      // Track token usage from step-finish events (StepFinishPart contains token data)
      //
      // OpenCode SDK integration for step-level token extraction:
      // Event type: 'message.part.updated' with part.type === 'step-finish'
      // Token location: event.properties.part.tokens
      // Use case: Multi-step reasoning processes, complex operations
      // Structure: { input: number, output: number, reasoning?: number }
      if (event.type === 'message.part.updated' && event.properties?.part?.type === 'step-finish') {
        const stepPart = event.properties.part as {
          tokens?: { input?: number; output?: number; reasoning?: number };
        };
        if (stepPart.tokens) {
          const stepTokens = stepPart.tokens || {};
          sessionTokens.input += stepTokens.input ?? 0;
          sessionTokens.output += stepTokens.output ?? 0;
          sessionTokens.reasoning += stepTokens.reasoning ?? 0;
        }
      }

      // Message-level events have session ID in part.sessionID
      const props = event.properties as EventPropertiesWithSessionID;
      const eventSessionId = props?.sessionID || props?.part?.sessionID;

      if (eventSessionId !== session.id) continue;

      // Handle message events
      if (event.type === 'message.part.updated') {
        const part = event.properties?.part;
        if (part?.type === 'tool') {
          if (part.state?.status === 'running') {
            toolCalls++;
            // Update progress indicator with token usage
            if (progressIndicator) {
              const currentTokenUsage = {
                input: sessionTokens.input,
                output: sessionTokens.output,
                total: sessionTokens.input + sessionTokens.output + sessionTokens.reasoning,
                reasoning: sessionTokens.reasoning,
              };
              progressIndicator.update({
                action: part.tool || '',
                count: toolCalls,
                tokens: currentTokenUsage,
              });
            }
          } else if (part.state?.status === 'completed') {
            // Tool completed - no verbose logging
          } else if (part.state?.status === 'error') {
            if (!options.json) {
              const toolName = part.tool || 'unknown';
              console.error(`  Tool: ${toolName} - ERROR`);
            }
          }
        } else if (part?.type === 'text') {
          textParts++;
          // Text streaming - no verbose logging to avoid duplication
        }
      }
    }

    // Clean up progress indicator
    if (progressIndicator) {
      progressIndicator.stop();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Calculate token usage from collected session data
    if (sessionTokens.input > 0 || sessionTokens.output > 0) {
      tokenUsage = {
        input: sessionTokens.input,
        output: sessionTokens.output,
        total: sessionTokens.input + sessionTokens.output,
      };
    }

    // F014: Add fallback for SDK versions without token usage (init command)
    if (!hasTokenData(sessionTokens)) {
      showTokenFallbackMessage(options.dryRun);
    }

    // Check if feature_list.json was created
    let featureCount = 0;
    try {
      const manager = new FeatureManager(projectDir);
      const data = await manager.load();
      featureCount = data.features.length;
    } catch {
      // File not created or invalid
    }

    // Check if other files exist
    const filesCreated: string[] = [];
    for (const file of ['feature_list.json', 'init.sh', 'progress.txt']) {
      try {
        await stat(join(projectDir, file));
        filesCreated.push(file);
      } catch {
        // File doesn't exist
      }
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          success,
          projectDir,
          duration: `${duration}s`,
          toolCalls,
          textParts,
          featureCount,
          filesCreated,
          sessionId: session.id,
          tokenUsage,
          tokenTrackingSupported: supportsTokenTracking(),
          archive: {
            archived,
            archivePath,
            archivedFiles,
          },
        }),
      );
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(' INITIALIZATION COMPLETE');
      console.log('='.repeat(60));
      console.log(`\nDuration: ${duration}s`);
      console.log(`Tool calls: ${toolCalls}`);
      console.log(`Text outputs: ${textParts}`);
      if (tokenUsage !== undefined) {
        console.log(
          `Tokens used: ${tokenUsage.total.toLocaleString()} (${tokenUsage.input.toLocaleString()} in, ${tokenUsage.output.toLocaleString()} out)`,
        );

        // F026: Add budget warnings if enabled
        const budgetConfig = this.budgetSettings;
        if (budgetConfig.enabled) {
          const budgetStatus = this.calculateBudgetStatus(tokenUsage.total, budgetConfig);
          if (budgetStatus.message) {
            console.log(`  ${budgetStatus.message}`);
          }
        }
      }
      console.log(`\nFiles created:`);
      for (const file of filesCreated) {
        console.log(`  - ${file}`);
      }
      if (featureCount > 0) {
        console.log(`\nFeatures defined: ${featureCount}`);
      }

      // Show archive location if files were archived
      if (archived && archivePath) {
        console.log(`\nPrevious run archived to: ${archivePath}`);
      }
      console.log('\nNext steps:');
      console.log('  1. Review feature_list.json to verify features');
      console.log('  2. Run: pace status');
      console.log('  3. Run: pace run --max-sessions 5');
      console.log('='.repeat(60) + '\n');
    }

    // Write token usage to initial progress.txt entry (F005)
    if (success && tokenUsage) {
      const progressPath = join(projectDir, 'progress.txt');
      const currentDate = new Date().toISOString().split('T')[0];

      // Get current session number
      let sessionNumber = 1;
      try {
        const existingProgress = await readFile(progressPath, 'utf-8');
        const sessionMatches = existingProgress.match(/### Session \d+/g);
        if (sessionMatches) {
          sessionNumber = sessionMatches.length + 1;
        }
      } catch {
        // File doesn't exist, start with session 1
      }

      const initProgressEntry = `

---

### Session ${sessionNumber} - INIT

**Date:** ${currentDate}
**Agent Type:** Initializer

**Feature Worked On:**

- INIT: Initialize pace project with feature list and development environment

**Actions Taken:**

- Project initialization completed successfully
- Created feature_list.json with ${featureCount} features
- Token usage tracked during initialization session
- Development environment configured

**Test Results:**

- Initialization completed successfully
- Project files created and validated
- Token usage captured from OpenCode SDK events

${getTokenUsageTemplate()}

- Input tokens: ${tokenUsage.input?.toLocaleString() || '0'}
- Output tokens: ${tokenUsage.output?.toLocaleString() || '0'}
- Total tokens: ${tokenUsage.total?.toLocaleString() || '0'}

**Current Status:**

- Features passing: 0/${featureCount}
- Known issues: None
- Project ready for development

**Next Steps:**

- Recommended next feature: [Determined by orchestrator]
- Ready to proceed with feature implementation
- Run 'pace status' to review feature list

---

`;

      // Append to progress file
      try {
        await writeFile(progressPath, initProgressEntry, { flag: 'a' });
      } catch (error) {
        if (!options.json) {
          console.error('Failed to write init progress entry:', error);
        }
      }
    }

    // Output JSON if requested
    if (options.json) {
      console.log(
        JSON.stringify({
          success,
          featuresGenerated: featureCount,
          dryRun: options.dryRun,
          archived,
          archivePath: archivePath || undefined,
          tokenUsage,
          tokenTrackingSupported: supportsTokenTracking(),
        }),
      );
    }

    process.exit(success && featureCount > 0 ? 0 : 1);
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: String(error),
        }),
      );
    } else {
      console.error(`\nError during initialization: ${error}`);
    }
    process.exit(1);
  } finally {
    // Only shut down if we started an embedded server (not external)
    if (!isExternalServer && opencode?.server?.close) {
      await opencode.server.close();
    }
  }
}

async function handleStatus(options: ParsedArgs['options']): Promise<void> {
  const reporter = new StatusReporter(options.projectDir);

  if (options.compact) {
    await reporter.printCompactStatus();
  } else {
    await reporter.printStatus({
      verbose: options.verbose,
      showGitLog: true,
      showNextFeatures: 5,
      showProgress: true,
      json: options.json,
      minTokens: options.minTokens,
    });
  }
}

async function handleValidate(options: ParsedArgs['options']): Promise<void> {
  const manager = new FeatureManager(options.projectDir);

  try {
    const data = await manager.load();

    if (data.features.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify({
            valid: false,
            errorCount: 1,
            errors: [{ featureId: 'root', field: 'features', message: 'No features found' }],
            stats: { total: 0, passing: 0, failing: 0, byCategory: {}, byPriority: {} },
          }),
        );
      } else {
        console.log('\n' + '='.repeat(60));
        console.log(' Feature List Validation Report');
        console.log('='.repeat(60) + '\n');
        console.log('INVALID - No features found in feature_list.json\n');
      }
      process.exit(1);
    }

    let progressData;
    try {
      progressData = await ProgressParser.parse(options.projectDir);
    } catch (error) {
      progressData = undefined;
    }

    const result = validateFeatureList(data, {
      includeTokenUsage: true,
      progressData,
    });

    if (options.json) {
      console.log(
        JSON.stringify({
          valid: result.valid,
          errorCount: result.errors.length,
          errors: result.errors,
          stats: result.stats,
        }),
      );
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(' Feature List Validation Report');
      console.log('='.repeat(60) + '\n');
      console.log(formatValidationErrors(result.errors));
      console.log();
      console.log(formatValidationStats(result.stats));
      console.log();
    }

    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          valid: false,
          errorCount: 1,
          errors: [{ featureId: 'root', field: 'load', message: String(error) }],
          stats: { total: 0, passing: 0, failing: 0, byCategory: {}, byPriority: {} },
        }),
      );
    } else {
      console.error(`Error loading feature list: ${error}\n`);
    }
    process.exit(1);
  }
}

async function handleUpdate(options: ParsedArgs['options']): Promise<void> {
  if (!options.featureId) {
    console.error('Error: Feature ID required');
    console.error('Usage: pace update <feature-id> <pass|fail>');
    process.exit(1);
  }

  if (options.passStatus === undefined) {
    console.error('Error: Status required (pass or fail)');
    console.error('Usage: pace update <feature-id> <pass|fail>');
    process.exit(1);
  }

  const manager = new FeatureManager(options.projectDir);

  try {
    const feature = await manager.findFeature(options.featureId);

    if (!feature) {
      console.error(`\nError: Feature '${options.featureId}' not found`);
      console.error('\nAvailable features:');
      const data = await manager.load();
      for (const f of data.features.slice(0, 10)) {
        const status = f.passes ? '✓' : '✗';
        console.error(`  ${status} ${f.id}: ${f.description.slice(0, 50)}`);
      }
      if (data.features.length > 10) {
        console.error(`  ... and ${data.features.length - 10} more`);
      }
      process.exit(1);
    }

    const oldStatus: 'passing' | 'failing' = feature.passes ? 'passing' : 'failing';
    const newStatus: 'passing' | 'failing' = options.passStatus ? 'passing' : 'failing';

    if (feature.passes === options.passStatus) {
      if (options.json) {
        const [passing, total] = await manager.getProgress();
        console.log(
          JSON.stringify({
            success: true,
            featureId: options.featureId,
            oldStatus,
            newStatus,
            description: feature.description,
            category: feature.category,
            progress: {
              passing,
              total,
              percentage: total > 0 ? (passing / total) * 100 : 0,
            },
            message: 'No change needed - already at target status',
          }),
        );
      } else {
        console.log(`\nFeature '${options.featureId}' is already marked as ${oldStatus}`);
      }
      process.exit(0);
    }

    const success = await manager.updateFeatureStatus(options.featureId, options.passStatus);

    if (success) {
      const [passing, total] = await manager.getProgress();

      if (options.manualTokens) {
        const tokenParts = options.manualTokens.split(/[,:]/);
        if (tokenParts.length === 2) {
          const inputTokens = parseInt(tokenParts[0]);
          const outputTokens = parseInt(tokenParts[1]);

          if (!isNaN(inputTokens) && !isNaN(outputTokens)) {
            const progressPath = join(options.projectDir, 'progress.txt');
            let sessionNumber = 1;
            try {
              const existingProgress = await readFile(progressPath, 'utf-8');
              const sessionMatches = existingProgress.match(/### Session \d+/g);
              if (sessionMatches) {
                sessionNumber = sessionMatches.length + 1;
              }
            } catch {
              sessionNumber = 1;
            }

            const currentDate = new Date().toISOString().split('T')[0];
            const totalTokens = inputTokens + outputTokens;

            const progressEntry = `

---

### Session ${sessionNumber} - ${options.featureId}

**Date:** ${currentDate}
**Agent Type:** Manual

**Feature Worked On:**

- ${options.featureId}: ${feature.description}

${getTokenUsageTemplate()}

- Input tokens: ${inputTokens.toLocaleString()}
- Output tokens: ${outputTokens.toLocaleString()}
- Total tokens: ${totalTokens.toLocaleString()}

---

`;

            try {
              await writeFile(progressPath, progressEntry, { flag: 'a' });
              ProgressParser.invalidate(options.projectDir);
            } catch (error) {
              console.error('Failed to write progress entry:', error);
            }
          }
        }
      }

      if (options.json) {
        console.log(
          JSON.stringify({
            success: true,
            featureId: options.featureId,
            oldStatus,
            newStatus,
            description: feature.description,
            category: feature.category,
            progress: {
              passing,
              total,
              percentage: total > 0 ? (passing / total) * 100 : 0,
            },
          }),
        );
      } else {
        console.log(`\nFeature: ${options.featureId}`);
        console.log(`Description: ${feature.description}`);
        console.log(`Category: ${feature.category}`);
        console.log(`Change: ${oldStatus} -> ${newStatus}`);
        console.log(`\nUpdated feature '${options.featureId}' to ${newStatus}`);
        console.log(`Backup saved to feature_list.json.bak`);
        console.log(`\nCurrent progress: ${passing}/${total} features passing`);
      }
    } else {
      if (options.json) {
        console.log(
          JSON.stringify({
            success: false,
            featureId: options.featureId,
            error: 'Failed to update feature',
          }),
        );
      } else {
        console.error(`\nFailed to update feature '${options.featureId}'`);
      }
      process.exit(1);
    }
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          featureId: options.featureId || 'unknown',
          error: String(error),
        }),
      );
    } else {
      console.error(`\nError updating feature: ${error}`);
    }
    process.exit(1);
  }
}

async function handleArchives(options: ParsedArgs['options']): Promise<void> {
  const projectDir = resolve(options.projectDir);

  // Load pace config to get archive directory setting
  const paceConfig = await loadConfig(projectDir);
  const paceSettings = getPaceSettings(paceConfig);

  const archiveManager = new ArchiveManager();

  try {
    // If validation is requested, validate all archives first
    if (options.validate) {
      const validationResults = await archiveManager.validateAllArchives({
        projectDir,
        archiveDir: paceSettings.archiveDir,
        verbose: options.verbose,
      });

      if (options.json) {
        // JSON output for validation
        console.log(
          JSON.stringify({
            validation: true,
            archives: validationResults.map((result) => ({
              name: result.archiveName,
              status: result.status,
              issues: result.issues,
              presentFiles: result.presentFiles,
              missingFiles: result.missingFiles,
              unexpectedFiles: result.unexpectedFiles,
              metadataValid: result.metadataValid,
              featureListValid: result.featureListValid,
              hasCoreFiles: result.hasCoreFiles,
            })),
            summary: {
              total: validationResults.length,
              valid: validationResults.filter((r) => r.status === 'valid').length,
              warning: validationResults.filter((r) => r.status === 'warning').length,
              invalid: validationResults.filter((r) => r.status === 'invalid').length,
            },
          }),
        );
      } else {
        // Human-readable validation output
        console.log('\n' + '='.repeat(60));
        console.log(' ARCHIVE VALIDATION RESULTS');
        console.log('='.repeat(60));

        const valid = validationResults.filter((r) => r.status === 'valid').length;
        const warning = validationResults.filter((r) => r.status === 'warning').length;
        const invalid = validationResults.filter((r) => r.status === 'invalid').length;

        console.log(
          `\nValidation Summary: ${valid} valid, ${warning} warnings, ${invalid} invalid\n`,
        );

        for (const result of validationResults) {
          const statusIcon =
            result.status === 'valid' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
          console.log(`${statusIcon} ${result.archiveName} (${result.status.toUpperCase()})`);

          if (result.issues.length > 0) {
            for (const issue of result.issues) {
              console.log(`    • ${issue}`);
            }
          }

          if (options.verbose) {
            if (result.presentFiles.length > 0) {
              console.log(`    Files: ${result.presentFiles.join(', ')}`);
            }
            if (result.missingFiles.length > 0) {
              console.log(`    Missing: ${result.missingFiles.join(', ')}`);
            }
            if (result.unexpectedFiles.length > 0) {
              console.log(`    Unexpected: ${result.unexpectedFiles.join(', ')}`);
            }
          }
          console.log('');
        }

        console.log('='.repeat(60));
      }
      return;
    }

    const archives = await archiveManager.listArchives(projectDir, paceSettings.archiveDir);

    if (options.json) {
      // JSON output format
      console.log(
        JSON.stringify({
          archives: archives.map((archive) => ({
            name: archive.name,
            timestamp: archive.timestamp,
            reason: archive.metadata?.reason,
            files: archive.metadata?.files,
            path: archive.path,
          })),
          count: archives.length,
        }),
      );
    } else {
      // Human-readable output format
      if (archives.length === 0) {
        console.log('\nNo archives found.');
        console.log('Archives are created when you reinitialize a pace project.');
        console.log('Use "pace init" with an existing project to create archives.');
        return;
      }

      console.log('\n' + '='.repeat(60));
      console.log(' PROJECT ARCHIVES');
      console.log('='.repeat(60));
      console.log(`\nFound ${archives.length} archive${archives.length === 1 ? '' : 's'}:\n`);

      for (const archive of archives) {
        let date: Date;

        // Try to parse timestamp, fall back to parsing directory name
        try {
          date = new Date(archive.timestamp);
          if (isNaN(date.getTime())) {
            // If timestamp is not valid, try to parse directory name
            // Convert "YYYY-MM-DD_HH-MM-SS" to a valid date format
            const match = archive.name.match(
              /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?$/,
            );
            if (match) {
              const [, year, month, day, hour, minute, second] = match;
              date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
            } else {
              date = new Date();
            }
          }

          // If still invalid, use current time
          if (isNaN(date.getTime())) {
            date = new Date();
          }
        } catch {
          date = new Date();
        }

        const formattedDate = date.toLocaleDateString();
        const formattedTime = date.toLocaleTimeString();

        console.log(`📁 ${archive.name}`);
        console.log(`   Created: ${formattedDate} ${formattedTime}`);

        if (archive.metadata?.reason) {
          console.log(`   Reason: ${archive.metadata.reason}`);
        }

        if (archive.metadata?.files && archive.metadata.files.length > 0) {
          console.log(`   Files: ${archive.metadata.files.join(', ')}`);
        }

        console.log('');
      }

      console.log('='.repeat(60));
    }
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: String(error),
        }),
      );
    } else {
      console.error(`Error listing archives: ${error}`);
    }
    process.exit(1);
  }
}

async function handleRestore(options: ParsedArgs['options']): Promise<void> {
  if (!options.timestamp) {
    console.error('Error: Archive timestamp required');
    console.error('Usage: pace restore <timestamp> [--force]');
    console.error('');
    console.error('Available archives:');

    // Show available archives
    const projectDir = resolve(options.projectDir);
    const paceConfig = await loadConfig(projectDir);
    const paceSettings = getPaceSettings(paceConfig);
    const archiveManager = new ArchiveManager();

    try {
      const archives = await archiveManager.listArchives(projectDir, paceSettings.archiveDir);

      if (archives.length === 0) {
        console.error('  No archives found.');
      } else {
        for (const archive of archives.slice(0, 10)) {
          // Show first 10
          console.error(`  • ${archive.name}`);

          if (archive.metadata?.reason) {
            console.error(`    Reason: ${archive.metadata.reason}`);
          }

          if (archive.metadata?.files && archive.metadata.files.length > 0) {
            console.error(`    Files: ${archive.metadata.files.join(', ')}`);
          }
        }

        if (archives.length > 10) {
          console.error(`  ... and ${archives.length - 10} more`);
        }
      }
    } catch (error) {
      console.error(`  Error listing archives: ${error}`);
    }

    console.error('');
    console.error('Examples:');
    console.error('  pace restore 2025-12-17_00-00-00');
    console.error('  pace restore 2025-12-17_00-00-00 --force');
    process.exit(1);
  }

  const projectDir = resolve(options.projectDir);

  // Load pace config to get archive directory setting
  const paceConfig = await loadConfig(projectDir);
  const paceSettings = getPaceSettings(paceConfig);

  const archiveManager = new ArchiveManager();

  try {
    const result = await archiveManager.restoreArchive({
      projectDir,
      timestamp: options.timestamp,
      archiveDir: paceSettings.archiveDir,
      force: options.force,
      silent: options.json,
      verbose: options.verbose,
    });

    if (options.json) {
      console.log(
        JSON.stringify({
          success: result.success,
          archivePath: result.archivePath,
          restoredFiles: result.restoredFiles,
          error: result.error,
        }),
      );
    } else {
      // Success/error messages are handled by restoreArchive method
      if (!result.success) {
        console.error(`\nError: ${result.error}`);
        process.exit(1);
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: String(error),
        }),
      );
    } else {
      console.error(`Error restoring archive: ${error}`);
    }
    process.exit(1);
  }
}

async function handleCleanArchives(options: ParsedArgs['options']): Promise<void> {
  // Validate arguments
  if (options.olderThan !== undefined && options.keepLast !== undefined) {
    console.error('Error: Cannot specify both --older-than and --keep-last options together');
    console.error('Usage: pace clean-archives [--older-than <days> | --keep-last <n>]');
    process.exit(1);
  }

  if (options.olderThan !== undefined && options.olderThan < 1) {
    console.error('Error: --older-than must be at least 1 day');
    process.exit(1);
  }

  if (options.keepLast !== undefined && options.keepLast < 1) {
    console.error('Error: --keep-last must be at least 1');
    process.exit(1);
  }

  const projectDir = resolve(options.projectDir);

  // Load pace config to get archive directory setting
  const paceConfig = await loadConfig(projectDir);
  const paceSettings = getPaceSettings(paceConfig);

  const archiveManager = new ArchiveManager();

  try {
    const result = await archiveManager.cleanArchives({
      projectDir,
      archiveDir: paceSettings.archiveDir,
      olderThan: options.olderThan,
      keepLast: options.keepLast,
      silent: options.json,
      verbose: options.verbose,
    });

    if (options.json) {
      console.log(
        JSON.stringify({
          success: result.success,
          deletedArchives: result.deletedArchives,
          deletedCount: result.deletedArchives.length,
          error: result.error,
        }),
      );
    } else {
      // Success/error messages are handled by cleanArchives method
      if (!result.success) {
        console.error(`\nError: ${result.error}`);
        process.exit(1);
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: String(error),
        }),
      );
    } else {
      console.error(`Error cleaning archives: ${error}`);
    }
    process.exit(1);
  }
}

async function handleTokensCommand(options: ParsedArgs['options']): Promise<void> {
  const projectDir = resolve(options.projectDir);
  const progressPath = join(projectDir, 'progress.txt');

  try {
    await stat(progressPath);
  } catch {
    console.error('Error: No progress file found');
    process.exit(1);
  }

  const progressContent = await readFile(progressPath, 'utf-8');
  let sessions = parseProgressFile(progressContent);

  if (sessions.length === 0) {
    console.log('No token usage data found in progress.txt');
    return;
  }

  if (options.fromDate || options.toDate) {
    sessions = filterByDateRange(sessions, options.fromDate, options.toDate);
  }

  if (options.feature) {
    sessions = filterByFeature(sessions, options.feature);
  }

  if (sessions.length === 0) {
    console.log('No sessions found matching the specified filters');
    return;
  }

  const stats = calculateStatistics(sessions);

  if (options.json) {
    const topSessions = getTopSessions(sessions, 5);
    const dailyTokens = groupByDay(sessions);

    const output = {
      statistics: {
        totalInput: stats.totalInput,
        totalOutput: stats.totalOutput,
        totalTokens: stats.totalTokens,
        averageTokens: stats.averageTokens,
        sessionCount: stats.sessionCount,
        firstSession: stats.firstSession,
        lastSession: stats.lastSession,
        totalCost: stats.totalCost,
      },
      filters: {
        fromDate: options.fromDate,
        toDate: options.toDate,
        feature: options.feature,
      },
      topSessions: topSessions.map((s) => ({
        sessionNumber: s.sessionNumber,
        featureId: s.featureId,
        date: s.date,
        totalTokens: s.tokenUsage.total,
        inputTokens: s.tokenUsage.input,
        outputTokens: s.tokenUsage.output,
      })),
      dailyBreakdown: dailyTokens.map((d) => ({
        date: d.date,
        sessions: d.sessions,
        totalTokens: d.totalTokens,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
      })),
      totalEntries: sessions.length,
    };

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  TOKEN USAGE STATISTICS');
  console.log('='.repeat(60) + '\n');

  if (options.fromDate || options.toDate || options.feature) {
    console.log('Filters:');
    if (options.fromDate) console.log(`  From Date: ${options.fromDate}`);
    if (options.toDate) console.log(`  To Date: ${options.toDate}`);
    if (options.feature) console.log(`  Feature: ${options.feature}`);
    console.log('');
  }

  console.log('Overall Statistics:');
  console.log(`  Total Input Tokens: ${stats.totalInput.toLocaleString()}`);
  console.log(`  Total Output Tokens: ${stats.totalOutput.toLocaleString()}`);
  console.log(`  Total Tokens: ${stats.totalTokens.toLocaleString()}`);
  console.log(`  Average per Session: ${stats.averageTokens.toLocaleString()}`);
  console.log(`  Sessions with Token Data: ${stats.sessionCount}`);

  if (stats.totalCost !== undefined) {
    console.log(`  Total Cost: $${stats.totalCost.toFixed(4)}`);
  }

  if (stats.firstSession && stats.lastSession) {
    console.log(`\n  First Session: ${stats.firstSession}`);
    console.log(`  Last Session: ${stats.lastSession}`);
  }

  if (options.verbose) {
    const dailyTokens = groupByDay(sessions);

    if (dailyTokens.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('  Daily Breakdown');
      console.log('-'.repeat(60) + '\n');

      for (const day of dailyTokens) {
        console.log(`Date: ${day.date}`);
        console.log(`  Sessions: ${day.sessions}`);
        console.log(`  Input: ${day.inputTokens.toLocaleString()}`);
        console.log(`  Output: ${day.outputTokens.toLocaleString()}`);
        console.log(`  Total: ${day.totalTokens.toLocaleString()}`);
        console.log('');
      }
    }

    const topSessions = getTopSessions(sessions, 5);
    if (topSessions.length > 0) {
      console.log('-'.repeat(60));
      console.log('  Top 5 Sessions by Token Usage');
      console.log('-'.repeat(60) + '\n');

      for (let i = 0; i < topSessions.length; i++) {
        const session = topSessions[i];
        console.log(`${i + 1}. Session ${session.sessionNumber} - ${session.featureId}`);
        console.log(`   Date: ${session.date}`);
        console.log(`   Total: ${session.tokenUsage.total.toLocaleString()} tokens`);
        console.log(`   Input: ${session.tokenUsage.input.toLocaleString()}`);
        console.log(`   Output: ${session.tokenUsage.output.toLocaleString()}`);
        if (session.model) {
          console.log(`   Model: ${session.model}`);
        }
        console.log('');
      }
    }
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Handle export command for token usage data
 */
async function handleExport(options: ParsedArgs['options']): Promise<void> {
  try {
    if (!options.exportTokens) {
      console.error('Error: --export-tokens flag is required with export command');
      console.error('Usage: pace export --export-tokens <filename>');
      process.exit(1);
    }

    // Determine format from file extension
    const format = options.exportTokens.endsWith('.csv') ? 'csv' : 'json';

    // Create exporter
    const exporter = new TokenExporter(options.projectDir);

    // Export tokens
    const result = await exporter.exportTokens({
      format,
      outputFile: options.exportTokens,
      includeCost: true, // Always include cost if available
      sortby: 'date',
      sortOrder: 'desc',
    });

    if (result.success) {
      console.log(`✅ Token usage exported successfully to ${result.filename}`);
      console.log(`📊 Exported ${result.entries} sessions`);
    } else {
      console.error('❌ Failed to export token usage');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error exporting tokens: ${error}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
pace - Pragmatic Agent for Compounding Engineering

Built on the OpenCode SDK for maximum flexibility and control.

USAGE:
    pace [COMMAND] [OPTIONS]

COMMANDS:
    run          Run orchestrator (default)
    init         Initialize a new pace project
    status       Show project status
    validate     Validate feature_list.json
    update       Update feature status
    archives     List archived projects
    restore      Restore archived project
    clean-archives  Delete old archives
    export       Export token usage data to CSV or JSON
    help         Show this help message

INIT OPTIONS:
    --prompt, -p TEXT            Project description prompt
    --file PATH                  Path to file containing project description
    --url, -u URL                Connect to existing OpenCode server (instead of spawning)
    --force                      Skip archiving and overwrite existing files
    --archive-only               Archive existing files without initialization
    --dry-run                    Show what would be done without executing
    --verbose, -v                Show detailed output during initialization
    --json                       Output results in JSON format

    Note: Existing feature_list.json will be archived to .fwdslsh/pace/history/ before initialization.
          Use --force to skip archiving and overwrite existing files.
          Use --archive-only to archive files without running initialization.

    You can also pass the prompt directly:
        pace init "Build a todo app with authentication"

RUN OPTIONS:
    --project-dir, -d DIR        Project directory (default: current directory)
    --url, -u URL                Connect to existing OpenCode server (instead of spawning)
    --max-sessions, -n N         Maximum number of sessions to run (default: 10)
    --max-failures, -f N         Stop after N consecutive failures (default: 3)
    --delay SECONDS              Seconds to wait between sessions (default: 5)
    --until-complete             Run until all features pass (unlimited sessions)
    --dry-run                    Show what would be done without executing
    --verbose, -v                Show detailed output
    --json                       Output results in JSON format

STATUS OPTIONS:
    --verbose, -v                Show detailed breakdown by category
    --json                       Output results in JSON format
    --compact, -c                Show one-line compact status with token summary

VALIDATE OPTIONS:
    --json                       Output results in JSON format

UPDATE OPTIONS:
    --json                       Output results in JSON format

ARCHIVES OPTIONS:
    --validate                    Validate archive structure and contents
    --json                       Output results in JSON format

RESTORE OPTIONS:
    --force                      Skip confirmation before overwriting files
    --json                       Output results in JSON format

CLEAN-ARCHIVES OPTIONS:
    --older-than <days>          Delete archives older than specified days
    --keep-last <n>              Keep the last N archives (newest)
    --json                       Output results in JSON format

EXPORT OPTIONS:
    --export-tokens <filename>    Export token usage data to CSV or JSON file
                                 Format determined by file extension (.csv or .json)

GLOBAL OPTIONS:
    --project-dir, -d DIR        Project directory (default: current directory)
    --json                       Output in JSON format

CONFIGURATION:
    Pace uses the same configuration format as OpenCode. Create a pace.json
    file with OpenCode settings plus a "pace" section for CLI-specific options:

    pace.json:
       {
         "model": "anthropic/claude-sonnet-4",
         "agent": {
           "${PACE_AGENTS.CODING}": { "model": "anthropic/claude-opus-4" },
           "${PACE_AGENTS.INITIALIZER}": { "model": "openai/gpt-4o" }
         },
         "pace": {
           "orchestrator": {
             "maxSessions": 50,
             "maxFailures": 5,
             "sessionDelay": 5000
           }
         }
       }

    The "pace" section is stripped before passing config to OpenCode.
    Available agents: ${PACE_AGENTS.CODING}, ${PACE_AGENTS.INITIALIZER}, 
    ${PACE_AGENTS.CODE_REVIEWER}, ${PACE_AGENTS.COORDINATOR}, 
    ${PACE_AGENTS.PRACTICES_REVIEWER}.

EXAMPLES:
    # Initialize a new pace project
    pace init -p "Build a todo app with user auth and categories"
    pace init --file requirements.txt
    pace init "Build a REST API for inventory management"

    # Run orchestrator with defaults
    pace
    pace run --max-sessions 10

    # Run until all features complete
    pace run --until-complete

    # Show project status
    pace status
    pace status --verbose
    pace status --json

    # Validate feature list
    pace validate
    pace validate --json

    # Update feature status
    pace update F001 pass
    pace update F002 fail --json

    # Preview without executing
    pace run --dry-run --max-sessions 5
    pace init -p "My project" --dry-run

    # Get JSON output for scripting
    pace run --json --max-sessions 5

    # List archived projects
    pace archives
    pace archives --json

    # Restore archived project
    pace restore 2025-12-17_00-00-00
    pace restore 2025-12-17_00-00-00 --force

    # Clean old archives
    pace clean-archives --older-than 30
    pace clean-archives --keep-last 5

    # Export token usage data
    pace export --export-tokens tokens.csv
    pace export --export-tokens tokens.json
    pace export --export-tokens project-tokens-2025-12.json

OPENCODE PLUGIN:
    For interactive use within OpenCode TUI, install the pace plugin:
    
    mkdir -p .opencode/plugin
    cp pace-plugin.ts .opencode/plugin/

    This adds /pace-* commands and custom agents to OpenCode.
  `);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const { command, options } = parseArgs();

  if (options.help || command === 'help') {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case 'run':
      await handleRun(options);
      break;
    case 'init':
      await handleInit(options);
      break;
    case 'status':
      await handleStatus(options);
      break;
    case 'validate':
      await handleValidate(options);
      break;
    case 'update':
      await handleUpdate(options);
      break;
    case 'archives':
      await handleArchives(options);
      break;
    case 'restore':
      await handleRestore(options);
      break;
    case 'clean-archives':
      await handleCleanArchives(options);
      break;
    case 'export':
      await handleExport(options);
      break;
    case 'tokens':
      await handleTokensCommand(options);
      break;
  }
}

// Handle SIGINT gracefully
process.on('SIGINT', () => {
  console.log('\n\nInterrupted by user');
  process.exit(130);
});

// Run if executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  });
}

// Export for testing
export {
  Orchestrator,
  parseArgs,
  parseModelId,
  checkFeatureListExists,
  readLastUpdated,
  type ParsedArgs,
};
