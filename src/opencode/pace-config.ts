/**
 * pace-config.ts - Configuration schema for pace workflow
 *
 * This module defines the configuration options for pace agents and commands,
 * allowing users to customize model assignments and behavior.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
// ============================================================================
// Types
// ============================================================================

/**
 * Model identifier in the format "provider/model"
 * Examples: "anthropic/claude-sonnet-4-20250514", "openai/gpt-4o"
 */
export type ModelID = string;

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Model to use for this agent (overrides default) */
  model?: ModelID;
  /** Whether this agent is enabled */
  enabled?: boolean;
  /** Additional prompt instructions to append */
  additionalInstructions?: string;
}

/**
 * Command configuration
 */
export interface CommandConfig {
  /** Agent to use for this command (overrides default from command definition) */
  agent?: string;
  /** Model to use for this command (overrides agent default) */
  model?: ModelID;
  /** Whether this command is enabled */
  enabled?: boolean;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Maximum number of child sessions to spawn */
  maxSessions?: number;
  /** Maximum consecutive failures before stopping */
  maxFailures?: number;
  /** Delay between sessions in milliseconds */
  sessionDelay?: number;
  /** Whether to continue automatically after each feature */
  autoContinue?: boolean;
}

/**
 * Main pace configuration
 */
export interface PaceConfig {
  /** Default model for all agents (can be overridden per-agent) */
  defaultModel?: ModelID;

  /** Agent-specific configurations */
  agents?: {
    'pace-coding'?: AgentConfig;
    'pace-coordinator'?: AgentConfig;
    'pace-initializer'?: AgentConfig;
    'pace-code-reviewer'?: AgentConfig;
    'pace-practices-reviewer'?: AgentConfig;
    [key: string]: AgentConfig | undefined;
  };

  /** Command-specific configurations */
  commands?: {
    'pace-init'?: CommandConfig;
    'pace-next'?: CommandConfig;
    'pace-continue'?: CommandConfig;
    'pace-coordinate'?: CommandConfig;
    'pace-review'?: CommandConfig;
    'pace-compound'?: CommandConfig;
    'pace-status'?: CommandConfig;
    'pace-complete'?: CommandConfig;
    [key: string]: CommandConfig | undefined;
  };

  /** Orchestrator settings */
  orchestrator?: OrchestratorConfig;

  /** Permission settings */
  permissions?: {
    /** Auto-allow file edits */
    autoAllowEdit?: boolean;
    /** Auto-allow safe bash commands */
    autoAllowSafeBash?: boolean;
    /** Patterns for allowed bash commands */
    allowedBashPatterns?: string[];
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: PaceConfig = {
  defaultModel: 'anthropic/claude-sonnet-4-20250514',

  agents: {
    'pace-coding': { enabled: true },
    'pace-coordinator': { enabled: true },
    'pace-initializer': { enabled: true },
    'pace-code-reviewer': { enabled: true },
    'pace-practices-reviewer': { enabled: true },
  },

  commands: {
    'pace-init': { enabled: true },
    'pace-next': { enabled: true },
    'pace-continue': { enabled: true },
    'pace-coordinate': { enabled: true },
    'pace-review': { enabled: true },
    'pace-compound': { enabled: true },
    'pace-status': { enabled: true },
    'pace-complete': { enabled: true },
  },

  orchestrator: {
    maxSessions: undefined, // unlimited
    maxFailures: 3,
    sessionDelay: 3000,
    autoContinue: true,
  },

  permissions: {
    autoAllowEdit: true,
    autoAllowSafeBash: true,
    allowedBashPatterns: [
      'git *',
      'npm *',
      'bun *',
      'pnpm *',
      'yarn *',
      'cat *',
      'ls *',
      'pwd',
      './init.sh',
    ],
  },
};

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load pace configuration from a file
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
      const userConfig = JSON.parse(content) as Partial<PaceConfig>;
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    } catch {
      // File doesn't exist or isn't valid JSON, continue to next
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(base: PaceConfig, override: Partial<PaceConfig>): PaceConfig {
  return {
    defaultModel: override.defaultModel ?? base.defaultModel,
    agents: { ...base.agents, ...override.agents },
    commands: { ...base.commands, ...override.commands },
    orchestrator: { ...base.orchestrator, ...override.orchestrator },
    permissions: { ...base.permissions, ...override.permissions },
  };
}

/**
 * Get model for a specific agent
 */
export function getAgentModel(config: PaceConfig, agentName: string): ModelID {
  return config.agents?.[agentName]?.model ?? config.defaultModel ?? DEFAULT_CONFIG.defaultModel!;
}

/**
 * Get agent for a specific command
 */
export function getCommandAgent(config: PaceConfig, commandName: string): string | undefined {
  return config.commands?.[commandName]?.agent;
}

/**
 * Get model for a specific command
 */
export function getCommandModel(config: PaceConfig, commandName: string): ModelID | undefined {
  return config.commands?.[commandName]?.model;
}

/**
 * Check if an agent is enabled
 */
export function isAgentEnabled(config: PaceConfig, agentName: string): boolean {
  return config.agents?.[agentName]?.enabled !== false;
}

/**
 * Check if a command is enabled
 */
export function isCommandEnabled(config: PaceConfig, commandName: string): boolean {
  return config.commands?.[commandName]?.enabled !== false;
}
