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

import { readFile, stat, mkdir, rename } from 'fs/promises';
import { join, resolve } from 'path';

import { createOpencode, createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';

import { FeatureManager } from './src/feature-manager';
import codingAgentMd from './src/opencode/agents/coding-agent.md' with { type: 'text' };
import paceInitMd from './src/opencode/commands/pace-init.md' with { type: 'text' };
import {
  loadConfig,
  type PaceConfig,
  getAgentModel,
  getPaceSettings,
} from './src/opencode/pace-config';
import { StatusReporter } from './src/status-reporter';
import { PACE_AGENTS, type Feature, type SessionSummary } from './src/types';
import {
  validateFeatureList,
  formatValidationErrors,
  formatValidationStats,
} from './src/validators';

// Import agent prompts from markdown files

// ============================================================================
// Types
// ============================================================================

interface ParsedArgs {
  command: 'run' | 'init' | 'status' | 'validate' | 'update' | 'help';
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
    help?: boolean;
    // Init-specific
    prompt?: string;
    file?: string;
    // Update-specific
    featureId?: string;
    passStatus?: boolean;
  };
}

interface SessionMetrics {
  sessionId: string;
  featureId: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  toolCalls: number;
  textParts: number;
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
      case '--prompt':
      case '-p':
        options.prompt = args[++i];
        break;
      case '--file':
        options.file = args[++i];
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
   * Run a coding session for a specific feature
   */
  private async runCodingSession(feature: Feature): Promise<boolean> {
    if (!this.opencode && !this.externalClient) {
      throw new Error('OpenCode not initialized');
    }

    const client = this.client;
    const startTime = Date.now();

    // Get agent-specific model if configured
    const agentModelId = getAgentModel(this.paceConfig, PACE_AGENTS.CODING);
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

    // Wait for completion
    if (!this.json) {
      console.log('\nAgent working...');
    }
    let success = false;
    let toolCalls = 0;
    let textParts = 0;

    try {
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
            console.error('\nSession encountered an error');
            success = false;
            break;
          }
          continue;
        }

        // Message-level events have session ID in part.sessionID
        const props = event.properties as EventPropertiesWithSessionID;
        const eventSessionId = props?.sessionID || props?.part?.sessionID;

        if (eventSessionId !== session.id) continue;

        // Handle message events
        if (event.type === 'message.part.updated') {
          const part = event.properties?.part;
          if (part?.type === 'tool') {
            toolCalls++;
            if (part.state?.status === 'running') {
              this.log(`  Tool: ${part.tool}...`);
            } else if (part.state?.status === 'completed') {
              this.log(`  Tool: ${part.tool} - ${part.state.title || 'done'}`);
            }
          } else if (part?.type === 'text') {
            textParts++;
            const text = part.text || '';
            if (text.length > 0 && textParts % 5 === 0) {
              this.log(`  [Text output ${textParts}...]`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Event stream error: ${error}`);
      success = false;
    }

    const duration = Date.now() - startTime;

    // Check if the feature was actually marked as passing
    const featureCompleted = await this.featureManager.wasFeatureCompleted(feature.id);

    // Record metrics
    this.state.metrics.push({
      sessionId: session.id,
      featureId: feature.id,
      startTime,
      endTime: Date.now(),
      success: success && featureCompleted,
      toolCalls,
      textParts,
    });

    // Summary
    if (!this.json) {
      console.log('\n' + '-'.repeat(60));
      console.log('Session Summary:');
      console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`  Tool calls: ${toolCalls}`);
      console.log(`  Feature completed: ${featureCompleted ? 'Yes' : 'No'}`);
      console.log('-'.repeat(60));
    }

    return success && featureCompleted;
  }

  /**
   * Generate final summary report
   */
  private async generateSummary(): Promise<SessionSummary> {
    const [passing, total] = await this.featureManager.getProgress();
    const elapsed = Date.now() - this.state.startTime.getTime();
    const isComplete = await this.featureManager.isComplete();

    const summary: SessionSummary = {
      sessionsRun: this.state.sessionCount,
      featuresCompleted: this.state.featuresCompleted,
      finalProgress: `${passing}/${total}`,
      completionPercentage: total > 0 ? (passing / total) * 100 : 0,
      elapsedTime: formatDuration(elapsed),
      isComplete,
    };

    if (this.json) {
      console.log(
        JSON.stringify({
          ...summary,
          progress: { passing, total },
        }),
      );
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

      if (this.state.metrics.length > 0 && this.verbose) {
        console.log('\nSession Details:');
        for (const m of this.state.metrics) {
          const duration = m.endTime ? (m.endTime - m.startTime) / 1000 : 0;
          const status = m.success ? '✓' : '✗';
          console.log(
            `  ${status} ${m.featureId}: ${duration.toFixed(1)}s, ${m.toolCalls} tool calls`,
          );
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
          console.log('\n' + '='.repeat(60));
          console.log(`SESSION ${this.state.sessionCount}: Feature ${nextFeature.id}`);
          console.log('='.repeat(60));
          console.log(`Description: ${nextFeature.description.slice(0, 60)}...`);
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

async function handleInit(options: ParsedArgs['options']): Promise<void> {
  const projectDir = resolve(options.projectDir);

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

  // Check if feature_list.json already exists
  const featureListPath = join(projectDir, 'feature_list.json');
  try {
    await stat(featureListPath);
    if (!options.json) {
      console.error(`\nWarning: feature_list.json already exists in ${projectDir}`);
      console.error('The initializer agent may overwrite existing files.');
      console.error('');
    }
  } catch {
    // File doesn't exist, which is expected for init
  }

  if (options.dryRun) {
    if (options.json) {
      console.log(
        JSON.stringify({
          dryRun: true,
          projectDir,
          promptLength: projectDescription.length,
          promptPreview:
            projectDescription.slice(0, 200) + (projectDescription.length > 200 ? '...' : ''),
          message: 'Would initialize pace project with the given description',
        }),
      );
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(' PACE INIT (DRY RUN)');
      console.log('='.repeat(60));
      console.log(`\nProject directory: ${projectDir}`);
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
    // Load pace config for agent model overrides
    const paceConfig = await loadConfig(projectDir);

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
      // OpenCode reads its config from .opencode/opencode.jsonc automatically
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

    // Get agent-specific model if configured
    const agentModelId = getAgentModel(paceConfig, PACE_AGENTS.INITIALIZER);
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
    
    console.log('--- Sending Prompt to Initializer Agent ---');
    console.log(fullPrompt);
    console.log('--- End of Prompt ---');

    // Send the prompt (use promptAsync for event streaming)
    const promptResult = await client.session.promptAsync({
      path: { id: session.id },
      body: {
        parts: [{ type: 'text', text: fullPrompt }],
        agent: 'pace-initializer',
        
        //...(agentModel && { model: agentModel }),
      },
    });

    if (promptResult.error) {
      throw new Error(`Failed to send prompt: ${JSON.stringify(promptResult.error)}`);
    }

    // Wait for completion
    let success = false;
    let toolCalls = 0;
    let textParts = 0;
    const startTime = Date.now();
    let currentTool = '';

    // Progress indicator for non-verbose mode - turtle walking back and forth
    const trackWidth = 20;
    let turtlePosition = 0;
    let turtleDirection = 1; // 1 = right, -1 = left
    let animationInterval: ReturnType<typeof setInterval> | null = null;
    const toolEmojis: string[] = []; // Track emojis for each tool call

    // Map tool names to emojis
    const getToolEmoji = (toolName: string): string => {
      const toolMap: Record<string, string> = {
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
      };
      // Check for partial matches
      const lowerTool = toolName.toLowerCase();
      for (const [key, emoji] of Object.entries(toolMap)) {
        if (lowerTool.includes(key)) return emoji;
      }
      return '🔧'; // Default tool emoji
    };

    if (!options.json && !options.verbose) {
      animationInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

        // Build tool emoji row (limited to track width)
        const maxEmojis = Math.floor(trackWidth / 2); // Each emoji is ~2 chars wide
        const displayEmojis = toolEmojis.slice(-maxEmojis).join('');
        const emojiRow = displayEmojis.length > 0 ? `[${displayEmojis}]` : '';

        // ASCII art turtles that face the direction they're walking
        //   ~}@}o  - tail, shell, head (going right)
        //   o{@{~  - head, shell, tail (going left)
        const turtleRight = '~}@}o';
        const turtleLeft = 'o{@{~';
        const turtle = turtleDirection > 0 ? turtleRight : turtleLeft;
        const turtleWidth = turtle.length;

        // Build the track with turtle
        const leftPad = ' '.repeat(turtlePosition);
        const rightPad = ' '.repeat(Math.max(0, trackWidth - turtleWidth - turtlePosition));
        const track = `[${leftPad}${turtle}${rightPad}]`;

        // Clear previous lines and draw new ones
        const line1 = emojiRow.padEnd(trackWidth + 2);
        const line2 = `${track} ${elapsed}s elapsed, ${toolCalls} tool calls`;

        // Move cursor up if we have emojis, then redraw
        if (toolEmojis.length > 0) {
          process.stdout.write(`\r\x1b[K${line1}\n\r\x1b[K${line2}\x1b[A\r`);
        } else {
          process.stdout.write(`\r\x1b[K${line2}`);
        }

        // Move turtle
        turtlePosition += turtleDirection;
        const maxPosition = trackWidth - turtleWidth;
        if (turtlePosition >= maxPosition) {
          turtlePosition = maxPosition;
          turtleDirection = -1;
        } else if (turtlePosition <= 0) {
          turtlePosition = 0;
          turtleDirection = 1;
        }
      }, 150);
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

      // Message-level events have session ID in part.sessionID
      const props = event.properties as EventPropertiesWithSessionID;
      const eventSessionId = props?.sessionID || props?.part?.sessionID;

      if (eventSessionId !== session.id) continue;

      // Handle message events
      if (event.type === 'message.part.updated') {
        const part = event.properties?.part;
        if (part?.type === 'tool') {
          if (part.state?.status === 'running') {
            currentTool = part.tool || '';
            toolCalls++;
            // Add emoji for this tool (non-verbose mode)
            if (!options.json && !options.verbose) {
              toolEmojis.push(getToolEmoji(currentTool));
            }
          } else if (part.state?.status === 'completed') {
            currentTool = '';
          }
          if (options.verbose && !options.json) {
            if (part.state?.status === 'running') {
              console.log(`  Tool: ${part.tool}...`);
            } else if (part.state?.status === 'completed') {
              console.log(`  Tool: ${part.tool} - done`);
            }
          }
        } else if (part?.type === 'text') {
          textParts++;
          const text = part.text || '';
          // Show text output in verbose mode
          if (options.verbose && !options.json && text.length > 0) {
            // Show first line of text (truncated if needed)
            const firstLine = text.split('\n')[0].trim();
            if (firstLine.length > 0) {
              const display = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
              console.log(`  ${display}`);
            }
          }
        }
      }
    }

    // Clean up turtle animation
    if (animationInterval) {
      clearInterval(animationInterval);
      // Clear both lines if we had emojis displayed
      if (toolEmojis.length > 0) {
        process.stdout.write('\r\x1b[K\n\r\x1b[K\x1b[A\r');
      } else {
        process.stdout.write('\r\x1b[K');
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

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
        }),
      );
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(' INITIALIZATION COMPLETE');
      console.log('='.repeat(60));
      console.log(`\nDuration: ${duration}s`);
      console.log(`Tool calls: ${toolCalls}`);
      console.log(`Text outputs: ${textParts}`);
      console.log(`\nFiles created:`);
      for (const file of filesCreated) {
        console.log(`  - ${file}`);
      }
      if (featureCount > 0) {
        console.log(`\nFeatures defined: ${featureCount}`);
      }
      console.log('\nNext steps:');
      console.log('  1. Review feature_list.json to verify features');
      console.log('  2. Run: pace status');
      console.log('  3. Run: pace run --max-sessions 5');
      console.log('='.repeat(60) + '\n');
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
  await reporter.printStatus({
    verbose: options.verbose,
    showGitLog: true,
    showNextFeatures: 5,
    showProgress: true,
    json: options.json,
  });
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

    const result = validateFeatureList(data);

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

function printHelp(): void {
  console.log(`
pace - Pragmatic Agent for Compounding Engineering

Built on the OpenCode SDK for maximum flexibility and control.

USAGE:
    pace [COMMAND] [OPTIONS]

COMMANDS:
    run          Run the orchestrator (default)
    init         Initialize a new pace project
    status       Show project status
    validate     Validate feature_list.json
    update       Update feature status
    help         Show this help message

INIT OPTIONS:
    --prompt, -p TEXT            Project description prompt
    --file PATH                  Path to file containing project description
    --url, -u URL                Connect to existing OpenCode server (instead of spawning)
    --dry-run                    Show what would be done without executing
    --verbose, -v                Show detailed output during initialization
    --json                       Output results in JSON format

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

VALIDATE OPTIONS:
    --json                       Output results in JSON format

UPDATE OPTIONS:
    --json                       Output results in JSON format

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
export { Orchestrator, parseArgs, parseModelId, type ParsedArgs };
