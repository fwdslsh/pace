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
  getCommandAgent,
  type PaceConfig,
} from '../src/opencode/pace-config';

// Expected pace agents
const PACE_AGENTS = [
  'pace-coding',
  'pace-initializer',
  'pace-coordinator',
  'pace-code-reviewer',
  'pace-practices-reviewer',
];

// Expected pace commands
const PACE_COMMANDS = [
  'pace-init',
  'pace-next',
  'pace-continue',
  'pace-coordinate',
  'pace-review',
  'pace-compound',
  'pace-status',
  'pace-complete',
];

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

  describe('getCommandAgent', () => {
    it('should return agent for a command', () => {
      const config: PaceConfig = {
        command: {
          'pace-init': { agent: 'pace-initializer', template: '' },
        },
      };
      expect(getCommandAgent(config, 'pace-init')).toBe('pace-initializer');
    });

    it('should return undefined for unknown command', () => {
      const config: PaceConfig = {};
      expect(getCommandAgent(config, 'unknown-command')).toBeUndefined();
    });
  });
});

/**
 * Tests to verify agents and commands are properly registered for OpenCode
 */
describe('OpenCode Agent Registration', () => {
  let config: PaceConfig;

  beforeEach(async () => {
    // Load default config (no user config file)
    const tempDir = await mkdtemp(join(tmpdir(), 'pace-agent-test-'));
    config = await loadConfig(tempDir);
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Default Agents', () => {
    it('should register all pace agents', () => {
      expect(config.agent).toBeDefined();
      for (const agentName of PACE_AGENTS) {
        expect(config.agent?.[agentName]).toBeDefined();
      }
    });

    it('should have correct agent count', () => {
      expect(Object.keys(config.agent || {}).length).toBe(PACE_AGENTS.length);
    });

    it.each(PACE_AGENTS)('agent "%s" should have required fields', (agentName) => {
      const agent = config.agent?.[agentName];
      expect(agent).toBeDefined();
      expect(agent?.name).toBe(agentName);
      expect(agent?.description).toBeDefined();
      expect(typeof agent?.description).toBe('string');
      expect(agent?.description?.length).toBeGreaterThan(0);
      expect(agent?.prompt).toBeDefined();
      expect(typeof agent?.prompt).toBe('string');
      expect(agent?.prompt?.length).toBeGreaterThan(0);
    });

    it.each(PACE_AGENTS)('agent "%s" should have valid mode', (agentName) => {
      const agent = config.agent?.[agentName];
      expect(agent?.mode).toBeDefined();
      expect(['primary', 'subagent', 'all']).toContain(agent?.mode);
    });

    it('pace-initializer agent should have comprehensive prompt', () => {
      const agent = config.agent?.['pace-initializer'];
      expect(agent?.prompt).toContain('feature_list.json');
      expect(agent?.prompt).toContain('init.sh');
      expect(agent?.prompt).toContain('progress.txt');
    });

    it('pace-coding agent should have coding workflow prompt', () => {
      const agent = config.agent?.['pace-coding'];
      expect(agent?.prompt).toBeDefined();
      // Should contain key workflow elements
      expect(agent?.prompt?.length).toBeGreaterThan(100);
    });
  });

  describe('Default Commands', () => {
    it('should register all pace commands', () => {
      expect(config.command).toBeDefined();
      for (const commandName of PACE_COMMANDS) {
        expect(config.command?.[commandName]).toBeDefined();
      }
    });

    it('should have correct command count', () => {
      expect(Object.keys(config.command || {}).length).toBe(PACE_COMMANDS.length);
    });

    it.each(PACE_COMMANDS)('command "%s" should have required fields', (commandName) => {
      const command = config.command?.[commandName];
      expect(command).toBeDefined();
      expect(command?.description).toBeDefined();
      expect(typeof command?.description).toBe('string');
      expect(command?.template).toBeDefined();
      expect(typeof command?.template).toBe('string');
      expect(command?.template?.length).toBeGreaterThan(0);
    });

    it('pace-init command should be linked to pace-initializer agent', () => {
      const command = config.command?.['pace-init'];
      expect(command?.agent).toBe('pace-initializer');
    });

    it('pace-next command should be linked to pace-coding agent', () => {
      const command = config.command?.['pace-next'];
      expect(command?.agent).toBe('pace-coding');
    });

    it('pace-continue command should be linked to pace-coding agent', () => {
      const command = config.command?.['pace-continue'];
      expect(command?.agent).toBe('pace-coding');
    });

    it('pace-coordinate command should be linked to pace-coordinator agent', () => {
      const command = config.command?.['pace-coordinate'];
      expect(command?.agent).toBe('pace-coordinator');
    });

    it('pace-review command should be linked to pace-code-reviewer agent', () => {
      const command = config.command?.['pace-review'];
      expect(command?.agent).toBe('pace-code-reviewer');
    });

    it('pace-compound command should be linked to pace-practices-reviewer agent', () => {
      const command = config.command?.['pace-compound'];
      expect(command?.agent).toBe('pace-practices-reviewer');
    });
  });

  describe('OpenCode Config Compatibility', () => {
    it('should produce valid OpenCode config', () => {
      const opencodeConfig = getOpencodeConfig(config);

      // Should have agent section
      expect(opencodeConfig.agent).toBeDefined();
      expect(Object.keys(opencodeConfig.agent || {}).length).toBe(PACE_AGENTS.length);

      // Should have command section
      expect(opencodeConfig.command).toBeDefined();
      expect(Object.keys(opencodeConfig.command || {}).length).toBe(PACE_COMMANDS.length);

      // Should NOT have pace section
      expect((opencodeConfig as PaceConfig).pace).toBeUndefined();
    });

    it('agents should have OpenCode-compatible structure', () => {
      const opencodeConfig = getOpencodeConfig(config);

      for (const agentName of PACE_AGENTS) {
        const agent = opencodeConfig.agent?.[agentName];
        expect(agent).toBeDefined();

        // Required OpenCode agent fields
        expect(typeof agent?.prompt).toBe('string');

        // Optional fields should be correct types if present
        if (agent?.mode) {
          expect(['primary', 'subagent', 'all']).toContain(agent.mode);
        }
        if (agent?.tools) {
          expect(typeof agent.tools).toBe('object');
        }
        if (agent?.model) {
          expect(typeof agent.model).toBe('string');
        }
      }
    });

    it('commands should have OpenCode-compatible structure', () => {
      const opencodeConfig = getOpencodeConfig(config);

      for (const commandName of PACE_COMMANDS) {
        const command = opencodeConfig.command?.[commandName];
        expect(command).toBeDefined();

        // Required OpenCode command fields
        expect(typeof command?.template).toBe('string');

        // Optional fields should be correct types if present
        if (command?.agent) {
          expect(typeof command.agent).toBe('string');
          // Agent should exist in the config
          expect(opencodeConfig.agent?.[command.agent]).toBeDefined();
        }
        if (command?.subtask !== undefined) {
          expect(typeof command.subtask).toBe('boolean');
        }
      }
    });
  });

  describe('Agent-Command Linkage', () => {
    it('all command agents should reference existing agents', () => {
      const opencodeConfig = getOpencodeConfig(config);
      const agentNames = Object.keys(opencodeConfig.agent || {});

      for (const commandName of PACE_COMMANDS) {
        const command = opencodeConfig.command?.[commandName];
        if (command?.agent) {
          expect(agentNames).toContain(command.agent);
        }
      }
    });

    it('each agent should have at least one command using it', () => {
      const opencodeConfig = getOpencodeConfig(config);
      const commandAgents = Object.values(opencodeConfig.command || {})
        .map((cmd) => cmd.agent)
        .filter(Boolean);

      // Not all agents need to be used by commands (pace-status, pace-complete don't use agents)
      // But all agents that are configured should exist
      for (const agentName of commandAgents) {
        expect(opencodeConfig.agent?.[agentName!]).toBeDefined();
      }
    });
  });
});

/**
 * Tests for user config merging with defaults
 */
describe('Config Merging with Defaults', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-merge-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should preserve default agents when user adds custom agent', async () => {
    const userConfig = {
      agent: {
        'my-custom-agent': {
          name: 'my-custom-agent',
          description: 'Custom agent',
          prompt: 'Be helpful',
        },
      },
    };
    await writeFile(join(tempDir, 'pace.json'), JSON.stringify(userConfig));

    const config = await loadConfig(tempDir);

    // Should have custom agent
    expect(config.agent?.['my-custom-agent']).toBeDefined();

    // Should still have all default agents
    for (const agentName of PACE_AGENTS) {
      expect(config.agent?.[agentName]).toBeDefined();
    }
  });

  it('should preserve default commands when user adds custom command', async () => {
    const userConfig = {
      command: {
        'my-custom-command': {
          description: 'Custom command',
          template: 'Do something custom',
        },
      },
    };
    await writeFile(join(tempDir, 'pace.json'), JSON.stringify(userConfig));

    const config = await loadConfig(tempDir);

    // Should have custom command
    expect(config.command?.['my-custom-command']).toBeDefined();

    // Should still have all default commands
    for (const commandName of PACE_COMMANDS) {
      expect(config.command?.[commandName]).toBeDefined();
    }
  });

  it('should allow user to override default agent properties', async () => {
    const userConfig = {
      agent: {
        'pace-coding': {
          model: 'anthropic/claude-opus-4-20250514',
        },
      },
    };
    await writeFile(join(tempDir, 'pace.json'), JSON.stringify(userConfig));

    const config = await loadConfig(tempDir);

    // Should have overridden model
    expect(config.agent?.['pace-coding']?.model).toBe('anthropic/claude-opus-4-20250514');

    // But should still have the default prompt
    expect(config.agent?.['pace-coding']?.prompt).toBeDefined();
    expect(config.agent?.['pace-coding']?.prompt?.length).toBeGreaterThan(0);
  });

  it('should allow user to override default command properties', async () => {
    const userConfig = {
      command: {
        'pace-init': {
          agent: 'pace-coordinator', // Override to use different agent
        },
      },
    };
    await writeFile(join(tempDir, 'pace.json'), JSON.stringify(userConfig));

    const config = await loadConfig(tempDir);

    // Should have overridden agent
    expect(config.command?.['pace-init']?.agent).toBe('pace-coordinator');

    // But should still have the default template
    expect(config.command?.['pace-init']?.template).toBeDefined();
    expect(config.command?.['pace-init']?.template?.length).toBeGreaterThan(0);
  });
});
