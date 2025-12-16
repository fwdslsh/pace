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
  getPaceSettings,
  getOpencodeConfig,
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

  describe('loadConfig', () => {
    it('should return empty config with pace defaults when no config file exists', async () => {
      const config = await loadConfig(tempDir);
      const paceSettings = getPaceSettings(config);
      expect(paceSettings.orchestrator?.maxFailures).toBe(3);
      expect(paceSettings.orchestrator?.sessionDelay).toBe(3000);
    });

    it('should load config from pace.json', async () => {
      const customConfig = {
        model: 'openai/gpt-4o',
        pace: {
          orchestrator: {
            maxSessions: 10,
          },
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.model).toBe('openai/gpt-4o');
      const paceSettings = getPaceSettings(config);
      expect(paceSettings.orchestrator?.maxSessions).toBe(10);
      // Defaults should be merged
      expect(paceSettings.orchestrator?.maxFailures).toBe(3);
    });

    it('should load config from pace.config.json', async () => {
      const customConfig = {
        model: 'anthropic/claude-opus-4-20250514',
      };
      await writeFile(join(tempDir, 'pace.config.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.model).toBe('anthropic/claude-opus-4-20250514');
    });

    it('should load config from .pace.json', async () => {
      const customConfig = {
        model: 'local/llama-3',
      };
      await writeFile(join(tempDir, '.pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.model).toBe('local/llama-3');
    });

    it('should prefer pace.json over pace.config.json', async () => {
      await writeFile(
        join(tempDir, 'pace.json'),
        JSON.stringify({ model: 'model-from-pace-json' }),
      );
      await writeFile(
        join(tempDir, 'pace.config.json'),
        JSON.stringify({ model: 'model-from-pace-config-json' }),
      );

      const config = await loadConfig(tempDir);
      expect(config.model).toBe('model-from-pace-json');
    });

    it('should load agent configurations', async () => {
      const customConfig = {
        agent: {
          'pace-coding': {
            model: 'anthropic/claude-opus-4-20250514',
            prompt: 'Be extra careful',
          },
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);
      expect(config.agent?.['pace-coding']?.model).toBe('anthropic/claude-opus-4-20250514');
      expect(config.agent?.['pace-coding']?.prompt).toBe('Be extra careful');
    });

    it('should handle invalid JSON gracefully', async () => {
      await writeFile(join(tempDir, 'pace.json'), 'not valid json {{{');

      const config = await loadConfig(tempDir);
      // Should return default empty config with pace settings
      const paceSettings = getPaceSettings(config);
      expect(paceSettings.orchestrator?.maxFailures).toBe(3);
    });
  });

  describe('getAgentModel', () => {
    it('should return agent-specific model if set', () => {
      const config: PaceConfig = {
        model: 'default-model',
        agent: {
          'pace-coding': { model: 'specific-model' },
        },
      };
      expect(getAgentModel(config, 'pace-coding')).toBe('specific-model');
    });

    it('should return global model if agent model not set', () => {
      const config: PaceConfig = {
        model: 'default-model',
        agent: {},
      };
      expect(getAgentModel(config, 'pace-coding')).toBe('default-model');
    });

    it('should return undefined if nothing set', () => {
      const config: PaceConfig = {};
      expect(getAgentModel(config, 'pace-coding')).toBeUndefined();
    });
  });

  describe('getOpencodeConfig', () => {
    it('should strip pace section from config', () => {
      const config: PaceConfig = {
        model: 'anthropic/claude-sonnet-4',
        agent: {
          'pace-coding': { model: 'anthropic/claude-opus-4' },
        },
        pace: {
          orchestrator: {
            maxSessions: 50,
          },
        },
      };

      const opencodeConfig = getOpencodeConfig(config);
      expect(opencodeConfig.model).toBe('anthropic/claude-sonnet-4');
      expect(opencodeConfig.agent?.['pace-coding']?.model).toBe('anthropic/claude-opus-4');
      expect((opencodeConfig as PaceConfig).pace).toBeUndefined();
    });
  });

  describe('getPaceSettings', () => {
    it('should return pace settings with defaults', () => {
      const config: PaceConfig = {
        pace: {
          orchestrator: {
            maxSessions: 100,
          },
        },
      };

      const paceSettings = getPaceSettings(config);
      expect(paceSettings.orchestrator?.maxSessions).toBe(100);
      expect(paceSettings.orchestrator?.maxFailures).toBe(3); // default
      expect(paceSettings.orchestrator?.sessionDelay).toBe(3000); // default
    });

    it('should return defaults when no pace section', () => {
      const config: PaceConfig = {};
      const paceSettings = getPaceSettings(config);
      expect(paceSettings.orchestrator?.maxFailures).toBe(3);
      expect(paceSettings.orchestrator?.sessionDelay).toBe(3000);
    });
  });

  describe('full config example', () => {
    it('should properly load a comprehensive config', async () => {
      const customConfig = {
        model: 'anthropic/claude-opus-4-20250514',
        agent: {
          'pace-coding': {
            model: 'anthropic/claude-sonnet-4-20250514',
          },
          'pace-code-reviewer': {
            model: 'anthropic/claude-opus-4-20250514',
          },
        },
        command: {
          'pace-review': {
            agent: 'pace-code-reviewer',
          },
        },
        permission: {
          edit: 'allow',
          bash: 'ask',
        },
        pace: {
          orchestrator: {
            maxSessions: 50,
            maxFailures: 5,
            sessionDelay: 5000,
          },
        },
      };
      await writeFile(join(tempDir, 'pace.json'), JSON.stringify(customConfig, null, 2));

      const config = await loadConfig(tempDir);

      // Check OpenCode config values
      expect(config.model).toBe('anthropic/claude-opus-4-20250514');
      expect(getAgentModel(config, 'pace-coding')).toBe('anthropic/claude-sonnet-4-20250514');
      expect(getAgentModel(config, 'pace-code-reviewer')).toBe('anthropic/claude-opus-4-20250514');
      expect(config.command?.['pace-review']?.agent).toBe('pace-code-reviewer');
      expect(config.permission?.edit).toBe('allow');

      // Check Pace-specific settings
      const paceSettings = getPaceSettings(config);
      expect(paceSettings.orchestrator?.maxSessions).toBe(50);
      expect(paceSettings.orchestrator?.maxFailures).toBe(5);
      expect(paceSettings.orchestrator?.sessionDelay).toBe(5000);

      // Check getOpencodeConfig strips pace section
      const opencodeConfig = getOpencodeConfig(config);
      expect((opencodeConfig as PaceConfig).pace).toBeUndefined();
      expect(opencodeConfig.model).toBe('anthropic/claude-opus-4-20250514');
    });
  });
});
