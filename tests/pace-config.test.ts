/**
 * Tests for the pace configuration system
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  getAgentModel,
  getCommandAgent,
  getCommandModel,
  isAgentEnabled,
  isCommandEnabled,
  DEFAULT_CONFIG,
  type PaceConfig,
} from '../src/opencode/pace-config';

describe('pace-config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-config-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have a default model', () => {
      expect(DEFAULT_CONFIG.defaultModel).toBe('anthropic/claude-sonnet-4-20250514');
    });

    it('should have all agents enabled by default', () => {
      expect(DEFAULT_CONFIG.agents?.['pace-coding']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.agents?.['pace-coordinator']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.agents?.['pace-initializer']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.agents?.['pace-code-reviewer']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.agents?.['pace-practices-reviewer']?.enabled).toBe(true);
    });

    it('should have all commands enabled by default', () => {
      expect(DEFAULT_CONFIG.commands?.['pace-init']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-next']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-continue']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-coordinate']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-review']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-compound']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-status']?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.commands?.['pace-complete']?.enabled).toBe(true);
    });

    it('should have sensible orchestrator defaults', () => {
      expect(DEFAULT_CONFIG.orchestrator?.maxSessions).toBeUndefined(); // unlimited
      expect(DEFAULT_CONFIG.orchestrator?.maxFailures).toBe(3);
      expect(DEFAULT_CONFIG.orchestrator?.sessionDelay).toBe(3000);
      expect(DEFAULT_CONFIG.orchestrator?.autoContinue).toBe(true);
    });

    it('should have permission defaults', () => {
      expect(DEFAULT_CONFIG.permissions?.autoAllowEdit).toBe(true);
      expect(DEFAULT_CONFIG.permissions?.autoAllowSafeBash).toBe(true);
      expect(DEFAULT_CONFIG.permissions?.allowedBashPatterns).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.permissions?.allowedBashPatterns?.length).toBeGreaterThan(0);
    });
  });

  describe('loadConfig', () => {
    it('should return DEFAULT_CONFIG when no config file exists', async () => {
      const config = await loadConfig(tempDir);
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should load config from pace.json', async () => {
      const customConfig = {
        defaultModel: 'openai/gpt-4o',
        orchestrator: {
          maxSessions: 10,
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.defaultModel).toBe('openai/gpt-4o');
      expect(config.orchestrator?.maxSessions).toBe(10);
      // Other values should be from defaults
      expect(config.orchestrator?.maxFailures).toBe(3);
    });

    it('should load config from pace.config.json', async () => {
      const customConfig = {
        defaultModel: 'anthropic/claude-opus-4-20250514',
      };
      await writeFile(join(tempDir, 'pace.config.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.defaultModel).toBe('anthropic/claude-opus-4-20250514');
    });

    it('should load config from .pace.json', async () => {
      const customConfig = {
        defaultModel: 'local/llama-3',
      };
      await writeFile(join(tempDir, '.pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.defaultModel).toBe('local/llama-3');
    });

    it('should prefer pace.json over pace.config.json', async () => {
      await writeFile(
        join(tempDir, 'pace.json'),
        JSON.stringify({ defaultModel: 'model-from-pace-json' }),
      );
      await writeFile(
        join(tempDir, 'pace.config.json'),
        JSON.stringify({ defaultModel: 'model-from-pace-config-json' }),
      );

      const config = await loadConfig(tempDir);
      expect(config.defaultModel).toBe('model-from-pace-json');
    });

    it('should merge agent configurations', async () => {
      const customConfig = {
        agents: {
          'pace-coding': {
            model: 'anthropic/claude-opus-4-20250514',
            additionalInstructions: 'Be extra careful',
          },
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.agents?.['pace-coding']?.model).toBe('anthropic/claude-opus-4-20250514');
      expect(config.agents?.['pace-coding']?.additionalInstructions).toBe('Be extra careful');
      // Other agents should still exist from defaults
      expect(config.agents?.['pace-coordinator']?.enabled).toBe(true);
    });

    it('should allow disabling agents', async () => {
      const customConfig = {
        agents: {
          'pace-practices-reviewer': { enabled: false },
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.agents?.['pace-practices-reviewer']?.enabled).toBe(false);
    });

    it('should handle invalid JSON gracefully', async () => {
      await writeFile(join(tempDir, 'pace.json'), 'not valid json {{{');

      const config = await loadConfig(tempDir);
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('getAgentModel', () => {
    it('should return agent-specific model if set', () => {
      const config: PaceConfig = {
        defaultModel: 'default-model',
        agents: {
          'pace-coding': { model: 'specific-model' },
        },
      };
      expect(getAgentModel(config, 'pace-coding')).toBe('specific-model');
    });

    it('should return default model if agent model not set', () => {
      const config: PaceConfig = {
        defaultModel: 'default-model',
        agents: {},
      };
      expect(getAgentModel(config, 'pace-coding')).toBe('default-model');
    });

    it('should return DEFAULT_CONFIG model if nothing set', () => {
      const config: PaceConfig = {};
      expect(getAgentModel(config, 'pace-coding')).toBe(DEFAULT_CONFIG.defaultModel);
    });
  });

  describe('getCommandAgent', () => {
    it('should return command-specific agent if set', () => {
      const config: PaceConfig = {
        commands: {
          'pace-next': { agent: 'custom-agent' },
        },
      };
      expect(getCommandAgent(config, 'pace-next')).toBe('custom-agent');
    });

    it('should return undefined if no agent override set', () => {
      const config: PaceConfig = {
        commands: {},
      };
      expect(getCommandAgent(config, 'pace-next')).toBeUndefined();
    });
  });

  describe('getCommandModel', () => {
    it('should return command-specific model if set', () => {
      const config: PaceConfig = {
        commands: {
          'pace-review': { model: 'review-model' },
        },
      };
      expect(getCommandModel(config, 'pace-review')).toBe('review-model');
    });

    it('should return undefined if no model override set', () => {
      const config: PaceConfig = {
        commands: {},
      };
      expect(getCommandModel(config, 'pace-review')).toBeUndefined();
    });
  });

  describe('isAgentEnabled', () => {
    it('should return true if agent enabled is true', () => {
      const config: PaceConfig = {
        agents: {
          'pace-coding': { enabled: true },
        },
      };
      expect(isAgentEnabled(config, 'pace-coding')).toBe(true);
    });

    it('should return false if agent enabled is false', () => {
      const config: PaceConfig = {
        agents: {
          'pace-coding': { enabled: false },
        },
      };
      expect(isAgentEnabled(config, 'pace-coding')).toBe(false);
    });

    it('should return true if agent not in config (default enabled)', () => {
      const config: PaceConfig = {
        agents: {},
      };
      expect(isAgentEnabled(config, 'pace-coding')).toBe(true);
    });

    it('should return true if enabled is undefined', () => {
      const config: PaceConfig = {
        agents: {
          'pace-coding': { model: 'some-model' }, // no enabled field
        },
      };
      expect(isAgentEnabled(config, 'pace-coding')).toBe(true);
    });
  });

  describe('isCommandEnabled', () => {
    it('should return true if command enabled is true', () => {
      const config: PaceConfig = {
        commands: {
          'pace-init': { enabled: true },
        },
      };
      expect(isCommandEnabled(config, 'pace-init')).toBe(true);
    });

    it('should return false if command enabled is false', () => {
      const config: PaceConfig = {
        commands: {
          'pace-init': { enabled: false },
        },
      };
      expect(isCommandEnabled(config, 'pace-init')).toBe(false);
    });

    it('should return true if command not in config (default enabled)', () => {
      const config: PaceConfig = {
        commands: {},
      };
      expect(isCommandEnabled(config, 'pace-init')).toBe(true);
    });
  });

  describe('full config example', () => {
    it('should properly merge a comprehensive config', async () => {
      const customConfig = {
        defaultModel: 'anthropic/claude-opus-4-20250514',
        agents: {
          'pace-coding': {
            model: 'anthropic/claude-sonnet-4-20250514',
          },
          'pace-code-reviewer': {
            model: 'anthropic/claude-opus-4-20250514',
          },
          'pace-practices-reviewer': {
            enabled: false,
          },
        },
        commands: {
          'pace-review': {
            agent: 'pace-code-reviewer',
          },
        },
        orchestrator: {
          maxSessions: 50,
          maxFailures: 5,
          sessionDelay: 5000,
        },
        permissions: {
          autoAllowEdit: true,
          autoAllowSafeBash: false,
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig, null, 2));

      const config = await loadConfig(tempDir);

      // Check all values were merged correctly
      expect(config.defaultModel).toBe('anthropic/claude-opus-4-20250514');
      expect(getAgentModel(config, 'pace-coding')).toBe('anthropic/claude-sonnet-4-20250514');
      expect(getAgentModel(config, 'pace-code-reviewer')).toBe('anthropic/claude-opus-4-20250514');
      expect(isAgentEnabled(config, 'pace-practices-reviewer')).toBe(false);
      expect(getCommandAgent(config, 'pace-review')).toBe('pace-code-reviewer');
      expect(config.orchestrator?.maxSessions).toBe(50);
      expect(config.orchestrator?.maxFailures).toBe(5);
      expect(config.orchestrator?.sessionDelay).toBe(5000);
      expect(config.permissions?.autoAllowEdit).toBe(true);
      expect(config.permissions?.autoAllowSafeBash).toBe(false);
    });
  });
});
