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

const DEFAULT_PACE_SETTINGS: PaceSettings = {
  orchestrator: {
    maxSessions: undefined,
    maxFailures: 3,
    sessionDelay: 3000,
  },
};

// ============================================================================
// Loading
// ============================================================================

/**
 * Load pace config from pace.json
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
      return JSON.parse(content) as PaceConfig;
    } catch {
      // File doesn't exist or isn't valid JSON, continue
    }
  }

  return { pace: DEFAULT_PACE_SETTINGS };
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
