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

import type { ServerOptions } from '@opencode-ai/sdk';

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
}

/**
 * Pace-specific settings (stored under `pace` key in config)
 */
export interface PaceSettings {
  /** Orchestrator settings for the CLI */
  orchestrator?: PaceOrchestratorConfig;
}

/**
 * Extended config: OpenCode config + pace section
 */
export interface PaceConfig extends OpencodeConfig {
  pace?: PaceSettings;
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
};

/**
 * Default agent configurations for pace workflow
 * Note: Prompts are loaded from markdown files at runtime by the plugin
 */
const DEFAULT_AGENTS: NonNullable<OpencodeConfig['agent']> = {
  'pace-coding': {
    name: 'pace-coding',
    description:
      'Implements a single feature following the pace workflow. Use when implementing a specific feature from the feature list.',
    mode: 'subagent',
  },
  'pace-initializer': {
    name: 'pace-initializer',
    description:
      'Sets up a new pace project with feature list, progress tracking, and development scripts.',
    mode: 'subagent',
  },
  'pace-coordinator': {
    name: 'pace-coordinator',
    description: 'Orchestrates multiple coding sessions to implement features continuously.',
    mode: 'subagent',
  },
  'pace-code-reviewer': {
    name: 'pace-code-reviewer',
    description: 'Reviews code changes for quality, best practices, and potential issues.',
    mode: 'subagent',
  },
  'pace-practices-reviewer': {
    name: 'pace-practices-reviewer',
    description: 'Reviews code and captures patterns to improve future sessions.',
    mode: 'subagent',
  },
};

/**
 * Default command configurations for pace workflow
 * Note: Templates are loaded from markdown files at runtime by the plugin
 */
const DEFAULT_COMMANDS: NonNullable<OpencodeConfig['command']> = {
  'pace-init': {
    description: 'Initialize a new pace project with feature list and development scripts',
    agent: 'pace-initializer',
  },
  'pace-next': {
    description: 'Implement the next highest-priority failing feature',
    agent: 'pace-coding',
  },
  'pace-continue': {
    description: 'Continue work on the current project',
    agent: 'pace-coding',
  },
  'pace-coordinate': {
    description: 'Run continuous coding sessions until complete',
    agent: 'pace-coordinator',
  },
  'pace-review': {
    description: 'Review recent code changes',
    agent: 'pace-code-reviewer',
  },
  'pace-compound': {
    description: 'Capture learnings and patterns from recent work',
    agent: 'pace-practices-reviewer',
  },
  'pace-status': {
    description: 'Show project status and progress',
  },
  'pace-complete': {
    description: 'Mark a feature as complete after verification',
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
 * Get Pace-specific settings
 */
export function getPaceSettings(config: PaceConfig): PaceSettings {
  return {
    ...DEFAULT_PACE_SETTINGS,
    ...config.pace,
    orchestrator: {
      ...DEFAULT_PACE_SETTINGS.orchestrator,
      ...config.pace?.orchestrator,
    },
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
 * Get the agent configured for a command
 */
export function getCommandAgent(config: PaceConfig, commandName: string): string | undefined {
  return config.command?.[commandName]?.agent;
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
