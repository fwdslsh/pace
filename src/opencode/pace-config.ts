/**
 * pace-config.ts - Configuration for Pace CLI
 *
 * Pace uses the same configuration schema as OpenCode, extended with a `pace`
 * section for CLI-specific settings. The `pace` section is stripped before
 * passing config to OpenCode.
 *
 * Config file: pace.json (same format as opencode.jsonc + pace section)
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

// Import agent markdown files
import codeReviewerMd from './agents/code-reviewer.md' with { type: 'text' };
import codingAgentMd from './agents/coding-agent.md' with { type: 'text' };
import coordinatorAgentMd from './agents/coordinator-agent.md' with { type: 'text' };
import initializerAgentMd from './agents/initializer-agent.md' with { type: 'text' };
import practicesReviewerMd from './agents/practices-reviewer.md' with { type: 'text' };
// Import command markdown files
import paceCompleteMd from './commands/pace-complete.md' with { type: 'text' };
import paceCompoundMd from './commands/pace-compound.md' with { type: 'text' };
import paceContinueMd from './commands/pace-continue.md' with { type: 'text' };
import paceCoordinateMd from './commands/pace-coordinate.md' with { type: 'text' };
import paceInitMd from './commands/pace-init.md' with { type: 'text' };
import paceNextMd from './commands/pace-next.md' with { type: 'text' };
import paceReviewMd from './commands/pace-review.md' with { type: 'text' };
import paceStatusMd from './commands/pace-status.md' with { type: 'text' };

import type { ServerOptions } from '@opencode-ai/sdk';
import type {
  CostConfig,
  TokenBudget,
  TokenDisplayThresholds,
  TokenTrackingConfig,
} from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * OpenCode's Config type, extracted from ServerOptions
 */
export type OpencodeConfig = NonNullable<ServerOptions['config']>;

/**
 * Pace-specific orchestrator settings
 */
export interface PaceOrchestratorConfig {
  /** Maximum number of sessions to run */
  maxSessions?: number;
  /** Maximum consecutive failures before stopping */
  maxFailures?: number;
  /** Delay between sessions in milliseconds */
  sessionDelay?: number;
  /** Session timeout in milliseconds (default: 1800000 = 30 minutes) */
  sessionTimeout?: number;
}

/**
 * Pace-specific settings (stored under `pace` key in config)
 */
export interface PaceSettings {
  /** Orchestrator settings for CLI */
  orchestrator?: PaceOrchestratorConfig;
  /**
   * Custom archive directory path for storing archived project files
   *
   * When running `pace init` in a directory with existing project files,
   * pace archives the old files to preserve previous work. This setting
   * controls where those archives are stored.
   *
   * @default '.fwdslsh/pace/history'
   * @example
   * ```json
   * {
   *   "pace": {
   *     "archiveDir": ".archives"
   *   }
   * }
   * ```
   */
  archiveDir?: string;
  /**
   * Whether to create archive metadata files (.archive-info.json)
   *
   * When enabled, pace creates a metadata file in each archive directory
   * containing information about archived files, original metadata,
   * archive timestamp, and reason for archiving.
   *
   * @default true
   * @example
   * ```json
   * {
   *   "pace": {
   *     "createArchiveMetadata": false
   *   }
   * }
   * ```
   */
  createArchiveMetadata?: boolean;
  /**
   * Consolidated token tracking configuration (F037)
   *
   * Centralized configuration for all token-related features including
   * display settings, budget limits, and cost calculation. This provides
   * a single place to configure token tracking behavior.
   *
   * @default { enabled: true, display: {...}, budget: {...}, costs: {...} }
   * @example
   * ```json
   * {
   *   "pace": {
   *     "tokenTracking": {
   *       "enabled": true,
   *       "display": {
   *         "enabled": true,
   *         "useAverageBasedThresholds": true
   *       },
   *       "budget": {
   *         "enabled": true,
   *         "maxTokens": 100000
   *       },
   *       "costs": {
   *         "enabled": true,
   *         "currency": "USD"
   *       }
   *     }
   *   }
   * }
   * ```
   */
  tokenTracking?: TokenTrackingConfig;
  /**
   * Cost calculation settings for token usage
   *
   * When enabled, pace will calculate and display cost estimates
   * based on token usage and model pricing. Custom pricing
   * can be configured to override default rates.
   *
   * @default { enabled: true, currency: 'USD', precision: 4 }
   * @deprecated Use tokenTracking.costs instead (backward compatibility maintained)
   * @example
   * ```json
   * {
   *   "pace": {
   *     "costs": {
   *       "enabled": true,
   *       "customPricing": {
   *         "custom/model": { "inputPrice": 2.5, "outputPrice": 12.0, "provider": "custom" }
   *       },
   *       "currency": "USD",
   *       "precision": 4
   *     }
   *   }
   * }
   * ```
   */
  costs?: CostConfig;
  /**
   * Token budget settings for managing token consumption
   *
   * When enabled, pace will track token usage against configured budgets
   * and display warnings when approaching or exceeding limits. This helps
   * manage costs and prevent unexpected token consumption.
   *
   * @default { enabled: false, warningThreshold: 0.8, criticalThreshold: 0.95 }
   * @deprecated Use tokenTracking.budget instead (backward compatibility maintained)
   * @example
   * ```json
   * {
   *   "pace": {
   *     "budget": {
   *       "enabled": true,
   *       "maxTokens": 100000,
   *       "warningThreshold": 0.8,
   *       "criticalThreshold": 0.95
   *     }
   *   }
   * }
   * ```
   */
  budget?: TokenBudget;
  /**
   * Token display threshold settings for visual indicators
   *
   * When enabled, pace will show color coding and warning symbols for
   * token usage that exceeds configured thresholds. Helps identify
   * expensive sessions at a glance.
   *
   * @default { enabled: true, useAverageBasedThresholds: true, averageMultiplierWarning: 1.5, averageMultiplierCritical: 2.0 }
   * @deprecated Use tokenTracking.display instead (backward compatibility maintained)
   * @example
   * ```json
   * {
   *   "pace": {
   *     "tokenDisplay": {
   *       "enabled": true,
   *       "useAverageBasedThresholds": true,
   *       "averageMultiplierWarning": 1.5,
   *       "averageMultiplierCritical": 2.0
   *     }
   *   }
   * }
   * ```
   */
  tokenDisplay?: TokenDisplayThresholds;
}

/**
 * Extended config: OpenCode config + pace section
 */
export interface PaceConfig extends OpencodeConfig {
  pace?: PaceSettings;
}

/**
 * Agent frontmatter structure
 */
interface AgentFrontmatter {
  description?: string;
  mode?: 'primary' | 'subagent' | 'all';
  model?: string;
  tools?: Record<string, boolean>;
}

/**
 * Command frontmatter structure
 */
interface CommandFrontmatter {
  description?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter<T>(markdown: string): { frontmatter: T; content: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as T, content: markdown };
  }

  const [, frontmatterStr, content] = match;
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML-like parsing for frontmatter
  const lines = frontmatterStr.split('\n');
  let currentKey = '';
  let inNestedObject = false;
  let nestedObject: Record<string, unknown> = {};

  for (const line of lines) {
    // Check for nested object start (e.g., "tools:")
    if (line.match(/^(\w+):$/)) {
      if (inNestedObject && currentKey) {
        frontmatter[currentKey] = nestedObject;
      }
      currentKey = line.slice(0, -1).trim();
      inNestedObject = true;
      nestedObject = {};
      continue;
    }

    // Check for nested key-value (indented)
    if (inNestedObject && line.match(/^\s+\w+:/)) {
      const colonIndex = line.indexOf(':');
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      if (value === 'true') value = true;
      else if (value === 'false') value = false;

      nestedObject[key] = value;
      continue;
    }

    // Regular key-value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      if (inNestedObject && currentKey) {
        frontmatter[currentKey] = nestedObject;
        inNestedObject = false;
        nestedObject = {};
      }

      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      // Handle quoted strings
      if (
        (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) ||
        (typeof value === 'string' && value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Handle booleans
      if (value === 'true') value = true;
      else if (value === 'false') value = false;

      frontmatter[key] = value;
    }
  }

  // Don't forget the last nested object
  if (inNestedObject && currentKey) {
    frontmatter[currentKey] = nestedObject;
  }

  return { frontmatter: frontmatter as T, content: content.trim() };
}

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default pace-specific settings
 */
const DEFAULT_PACE_SETTINGS: PaceSettings = {
  orchestrator: {
    maxSessions: undefined,
    maxFailures: 3,
    sessionDelay: 3000,
  },
  createArchiveMetadata: true,
  tokenTracking: {
    enabled: true,
    display: {
      enabled: true,
      useAverageBasedThresholds: true,
      averageMultiplierWarning: 1.5,
      averageMultiplierCritical: 2.0,
    },
    budget: {
      enabled: false,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
    },
    costs: {
      enabled: true,
      currency: 'USD',
      precision: 4,
    },
  },
  costs: {
    enabled: true,
    currency: 'USD',
    precision: 4,
  },
  budget: {
    enabled: false,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  tokenDisplay: {
    enabled: true,
    useAverageBasedThresholds: true,
    averageMultiplierWarning: 1.5,
    averageMultiplierCritical: 2.0,
  },
};

// Parse agent markdown files
const codingAgent = parseFrontmatter<AgentFrontmatter>(codingAgentMd);
const initializerAgent = parseFrontmatter<AgentFrontmatter>(initializerAgentMd);
const coordinatorAgent = parseFrontmatter<AgentFrontmatter>(coordinatorAgentMd);
const codeReviewer = parseFrontmatter<AgentFrontmatter>(codeReviewerMd);
const practicesReviewer = parseFrontmatter<AgentFrontmatter>(practicesReviewerMd);

// Parse command markdown files
const paceInit = parseFrontmatter<CommandFrontmatter>(paceInitMd);
const paceNext = parseFrontmatter<CommandFrontmatter>(paceNextMd);
const paceContinue = parseFrontmatter<CommandFrontmatter>(paceContinueMd);
const paceCoordinate = parseFrontmatter<CommandFrontmatter>(paceCoordinateMd);
const paceReview = parseFrontmatter<CommandFrontmatter>(paceReviewMd);
const paceCompound = parseFrontmatter<CommandFrontmatter>(paceCompoundMd);
const paceStatus = parseFrontmatter<CommandFrontmatter>(paceStatusMd);
const paceComplete = parseFrontmatter<CommandFrontmatter>(paceCompleteMd);

/**
 * Default agent configurations for pace workflow
 * Prompts and settings are loaded from markdown files
 */
const DEFAULT_AGENTS: NonNullable<OpencodeConfig['agent']> = {
  'pace-coding': {
    name: 'pace-coding',
    description:
      codingAgent.frontmatter.description || 'Implements features following pace workflow',
    mode: codingAgent.frontmatter.mode || 'subagent',
    prompt: codingAgent.content,
    tools: codingAgent.frontmatter.tools,
  },
  'pace-initializer': {
    name: 'pace-initializer',
    description: initializerAgent.frontmatter.description || 'Sets up pace project structure',
    mode: initializerAgent.frontmatter.mode || 'subagent',
    prompt: initializerAgent.content,
    tools: initializerAgent.frontmatter.tools,
  },
  'pace-coordinator': {
    name: 'pace-coordinator',
    description:
      coordinatorAgent.frontmatter.description || 'Orchestrates multiple coding sessions',
    mode: coordinatorAgent.frontmatter.mode || 'subagent',
    prompt: coordinatorAgent.content,
    tools: coordinatorAgent.frontmatter.tools,
  },
  'pace-code-reviewer': {
    name: 'pace-code-reviewer',
    description: codeReviewer.frontmatter.description || 'Reviews code for quality',
    mode: codeReviewer.frontmatter.mode || 'subagent',
    prompt: codeReviewer.content,
    tools: codeReviewer.frontmatter.tools,
  },
  'pace-practices-reviewer': {
    name: 'pace-practices-reviewer',
    description: practicesReviewer.frontmatter.description || 'Reviews code and captures patterns',
    mode: practicesReviewer.frontmatter.mode || 'subagent',
    prompt: practicesReviewer.content,
    tools: practicesReviewer.frontmatter.tools,
  },
};

/**
 * Default command configurations for pace workflow
 * Templates are loaded from markdown files
 */
const DEFAULT_COMMANDS: NonNullable<OpencodeConfig['command']> = {
  'pace-init': {
    description: paceInit.frontmatter.description || 'Initialize a new pace project',
    agent: paceInit.frontmatter.agent || 'pace-initializer',
    template: paceInit.content,
    subtask: paceInit.frontmatter.subtask,
  },
  'pace-next': {
    description: paceNext.frontmatter.description || 'Implement next feature',
    agent: paceNext.frontmatter.agent || 'pace-coding',
    template: paceNext.content,
    subtask: paceNext.frontmatter.subtask,
  },
  'pace-continue': {
    description: paceContinue.frontmatter.description || 'Continue work on project',
    agent: paceContinue.frontmatter.agent || 'pace-coding',
    template: paceContinue.content,
    subtask: paceContinue.frontmatter.subtask,
  },
  'pace-coordinate': {
    description: paceCoordinate.frontmatter.description || 'Run continuous sessions',
    agent: paceCoordinate.frontmatter.agent || 'pace-coordinator',
    template: paceCoordinate.content,
    subtask: paceCoordinate.frontmatter.subtask,
  },
  'pace-review': {
    description: paceReview.frontmatter.description || 'Review code changes',
    agent: paceReview.frontmatter.agent || 'pace-code-reviewer',
    template: paceReview.content,
    subtask: paceReview.frontmatter.subtask,
  },
  'pace-compound': {
    description: paceCompound.frontmatter.description || 'Capture learnings',
    agent: paceCompound.frontmatter.agent || 'pace-practices-reviewer',
    template: paceCompound.content,
    subtask: paceCompound.frontmatter.subtask,
  },
  'pace-status': {
    description: paceStatus.frontmatter.description || 'Show project status',
    template: paceStatus.content,
  },
  'pace-complete': {
    description: paceComplete.frontmatter.description || 'Mark feature complete',
    template: paceComplete.content,
  },
};

/**
 * Default pace configuration including opencode settings
 */
const DEFAULT_PACE_CONFIG: PaceConfig = {
  agent: DEFAULT_AGENTS,
  command: DEFAULT_COMMANDS,
  pace: DEFAULT_PACE_SETTINGS,
};

// ============================================================================
// Loading
// ============================================================================

/**
 * Deep merge two objects, with source overwriting target
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Load pace config from pace.json
 * Merges with default config to ensure all agents and commands are registered
 */
export async function loadConfig(directory: string): Promise<PaceConfig> {
  const configPaths = [
    join(directory, 'pace.json'),
    join(directory, 'pace.config.json'),
    join(directory, '.pace.json'),
  ];

  for (const configPath of configPaths) {
    try {
      const content = await readFile(configPath, 'utf-8');
      const userConfig = JSON.parse(content) as PaceConfig;
      // Merge user config with defaults (user config takes precedence)
      return deepMerge(DEFAULT_PACE_CONFIG, userConfig);
    } catch {
      // File doesn't exist or isn't valid JSON, continue
    }
  }

  return { ...DEFAULT_PACE_CONFIG };
}

/**
 * Get OpenCode config (strips `pace` section)
 */
export function getOpencodeConfig(config: PaceConfig): OpencodeConfig {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pace: _, ...opencodeConfig } = config;
  return opencodeConfig;
}

/**
 * Get Pace-specific settings with backward compatibility
 *
 * Merges tokenTracking configuration with legacy costs/budget/tokenDisplay fields.
 * Priority: tokenTracking.* > pace.costs/budget/tokenDisplay > defaults
 */
export function getPaceSettings(config: PaceConfig): PaceSettings {
  const defaults = DEFAULT_PACE_SETTINGS;
  const userPace = config.pace || {};

  const tokenTracking: TokenTrackingConfig = {
    enabled: userPace.tokenTracking?.enabled ?? defaults.tokenTracking?.enabled ?? true,
    display: {
      ...defaults.tokenTracking?.display,
      ...userPace.tokenDisplay,
      ...userPace.tokenTracking?.display,
    },
    budget: {
      ...defaults.tokenTracking?.budget,
      ...userPace.budget,
      ...userPace.tokenTracking?.budget,
    },
    costs: {
      enabled: true,
      currency: 'USD',
      precision: 4,
      ...defaults.tokenTracking?.costs,
      ...userPace.costs,
      ...userPace.tokenTracking?.costs,
    },
  };

  return {
    ...defaults,
    ...userPace,
    orchestrator: {
      ...defaults.orchestrator,
      ...userPace.orchestrator,
    },
    tokenTracking,
    costs: tokenTracking.costs,
    budget: tokenTracking.budget,
    tokenDisplay: tokenTracking.display,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get model for a specific agent (falls back to global model)
 */
export function getAgentModel(config: PaceConfig, agentName: string): string | undefined {
  return config.agent?.[agentName]?.model ?? config.model;
}

/**
 * Get agent configured for a command
 */
export function getCommandAgent(config: PaceConfig, commandName: string): string | undefined {
  return config.command?.[commandName]?.agent;
}

/**
 * Get cost configuration settings
 */
export function getCostSettings(config: PaceConfig): CostConfig {
  const defaultCostConfig = {
    enabled: true,
    currency: 'USD',
    precision: 4,
  };

  return {
    ...defaultCostConfig,
    ...config.pace?.costs,
  };
}

/**
 * Get token budget configuration settings
 */
export function getBudgetSettings(config: PaceConfig): TokenBudget {
  const defaultBudgetConfig = {
    enabled: false,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  };

  return {
    ...defaultBudgetConfig,
    ...config.pace?.budget,
  };
}

/**
 * Get token display threshold settings
 */
export function getTokenDisplaySettings(config: PaceConfig): TokenDisplayThresholds {
  const defaultTokenDisplayConfig = {
    enabled: true,
    useAverageBasedThresholds: true,
    averageMultiplierWarning: 1.5,
    averageMultiplierCritical: 2.0,
  };

  return {
    ...defaultTokenDisplayConfig,
    ...config.pace?.tokenDisplay,
  };
}

/**
 * Check if an agent is enabled (agents are enabled by default)
 * Note: OpenCode doesn't have a native "enabled" field for agents,
 * so this always returns true unless explicitly disabled in config
 */
export function isAgentEnabled(_config: PaceConfig, _agentName: string): boolean {
  // All agents are enabled by default in the new config model
  // Users can remove agents from config if they don't want them
  return true;
}

/**
 * Check if a command is enabled (commands are enabled by default)
 */
export function isCommandEnabled(_config: PaceConfig, _commandName: string): boolean {
  // All commands are enabled by default
  return true;
}
