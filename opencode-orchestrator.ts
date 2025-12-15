#!/usr/bin/env bun
/**
 * opencode-orchestrator.ts - OpenCode-Native Workflow Orchestrator
 *
 * This orchestrator leverages the OpenCode SDK's full capabilities to implement
 * the multi-session AI agent workflow described in docs/workflow.md.
 *
 * Architecture:
 * - Uses createOpencode() to spawn an embedded server
 * - Creates a parent session that manages the workflow
 * - Spawns child sessions for feature implementation
 * - Uses event streaming for real-time monitoring
 * - Configurable via pace.json
 *
 * Usage:
 *     bun run opencode-orchestrator.ts [options]
 *
 * Options:
 *     --project-dir, -d DIR     Project directory (default: current directory)
 *     --max-sessions N          Maximum child sessions to run (default: from config)
 *     --max-failures N          Stop after N consecutive failures (default: from config)
 *     --port N                  Port for OpenCode server (default: 0 for random)
 *     --verbose                 Show detailed output
 *     --dry-run                 Preview without executing
 */

import { createOpencode } from '@opencode-ai/sdk';
import { FeatureManager } from './src/feature-manager';
import type { Feature } from './src/types';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig, type PaceConfig, DEFAULT_CONFIG } from './src/opencode/pace-config';

// Import agent prompts from markdown files
import codingAgentMd from './src/opencode/agents/coding-agent.md' with { type: 'text' };

// ============================================================================
// Types
// ============================================================================

interface OrchestratorCliConfig {
	projectDir: string;
	port?: number;
	maxSessions?: number;
	maxFailures?: number;
	verbose: boolean;
	dryRun: boolean;
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

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Parse frontmatter from a markdown string
 */
function parseFrontmatter(markdown: string): { content: string } {
	const match = markdown.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return { content: match ? match[1].trim() : markdown };
}

/**
 * Build the coding agent prompt for a specific feature
 */
function buildCodingAgentPrompt(feature: Feature, projectContext: string): string {
	// Get the base prompt from the markdown file
	const { content: basePrompt } = parseFrontmatter(codingAgentMd);
	
	// Build feature-specific context
	const featureContext = `
## Current Feature Assignment

You are implementing **${feature.id}**: ${feature.description}

**Priority:** ${feature.priority}
**Category:** ${feature.category}

**Verification Steps:**
${feature.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Project Context
${projectContext}

---

${basePrompt}`;

	return featureContext;
}

// ============================================================================
// OpenCode Orchestrator
// ============================================================================

class OpencodeOrchestrator {
	private cliConfig: OrchestratorCliConfig;
	private paceConfig: PaceConfig;
	private featureManager: FeatureManager;
	private state: OrchestratorState;
	private opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;

	constructor(cliConfig: OrchestratorCliConfig) {
		this.cliConfig = cliConfig;
		this.paceConfig = DEFAULT_CONFIG; // Will be loaded async
		this.featureManager = new FeatureManager(cliConfig.projectDir);
		this.state = {
			sessionCount: 0,
			consecutiveFailures: 0,
			featuresCompleted: 0,
			startTime: new Date(),
			metrics: []
		};
	}

	/**
	 * Get effective max sessions (CLI overrides config)
	 */
	private get maxSessions(): number | undefined {
		return this.cliConfig.maxSessions ?? this.paceConfig.orchestrator?.maxSessions;
	}

	/**
	 * Get effective max failures (CLI overrides config)
	 */
	private get maxFailures(): number {
		return this.cliConfig.maxFailures ?? this.paceConfig.orchestrator?.maxFailures ?? 3;
	}

	/**
	 * Get session delay from config
	 */
	private get sessionDelay(): number {
		return this.paceConfig.orchestrator?.sessionDelay ?? 3000;
	}

	/**
	 * Initialize the OpenCode server and load configuration
	 */
	async initialize(): Promise<void> {
		this.log('Loading pace configuration...');
		this.paceConfig = await loadConfig(this.cliConfig.projectDir);
		
		this.log('Initializing OpenCode orchestrator...');

		this.opencode = await createOpencode({
			cwd: this.cliConfig.projectDir,
			port: this.cliConfig.port ?? 0
		});

		this.log(`OpenCode server started on port ${this.opencode.server.url}`);
	}

	/**
	 * Shut down the OpenCode server
	 */
	async shutdown(): Promise<void> {
		if (this.opencode?.server?.kill) {
			this.log('Shutting down OpenCode server...');
			await this.opencode.server.kill();
		}
	}

	/**
	 * Log a message (respects verbose setting)
	 */
	private log(message: string, force = false): void {
		if (this.cliConfig.verbose || force) {
			console.log(message);
		}
	}

	/**
	 * Load project context for agent prompts
	 */
	private async loadProjectContext(): Promise<string> {
		const parts: string[] = [];

		// Try to load progress file
		try {
			const progressPath = join(this.cliConfig.projectDir, 'claude-progress.txt');
			const progress = await readFile(progressPath, 'utf-8');
			const lastSession = progress.split('### Session').slice(-1)[0];
			parts.push(`## Recent Progress\n${lastSession?.slice(0, 1000) || 'No previous sessions'}`);
		} catch {
			parts.push('## Recent Progress\nNo previous sessions found.');
		}

		// Load feature stats
		const [passing, total] = await this.featureManager.getProgress();
		parts.push(`\n## Feature Status\n- Passing: ${passing}/${total}\n- Remaining: ${total - passing}`);

		return parts.join('\n');
	}

	/**
	 * Run a coding session for a specific feature
	 */
	private async runCodingSession(feature: Feature): Promise<boolean> {
		if (!this.opencode) {
			throw new Error('OpenCode not initialized');
		}

		const client = this.opencode.client;
		const startTime = Date.now();

		console.log('\n' + '='.repeat(60));
		console.log(`SESSION ${this.state.sessionCount + 1}: Feature ${feature.id}`);
		console.log('='.repeat(60));
		console.log(`Description: ${feature.description.slice(0, 60)}...`);
		console.log(`Priority: ${feature.priority}`);
		console.log(`Category: ${feature.category}`);

		if (this.cliConfig.dryRun) {
			console.log('\n[DRY RUN] Would create coding session here');
			return true;
		}

		// Create a new session for this feature
		const sessionResult = await client.session.create({
			body: {
				title: `Feature: ${feature.id} - ${feature.description.slice(0, 40)}`
			}
		});

		if (sessionResult.error) {
			console.error(`Failed to create session: ${JSON.stringify(sessionResult.error)}`);
			return false;
		}

		const session = sessionResult.data;
		this.log(`\nSession created: ${session.id}`);

		// Get project context
		const projectContext = await this.loadProjectContext();

		// Build and send the coding agent prompt
		const prompt = buildCodingAgentPrompt(feature, projectContext);

		this.log('\nSending prompt to agent...');
		const promptResult = await client.session.prompt({
			path: { id: session.id },
			body: {
				parts: [{ type: 'text', text: prompt }]
			}
		});

		if (promptResult.error) {
			console.error(`Failed to send prompt: ${JSON.stringify(promptResult.error)}`);
			return false;
		}

		// Subscribe to events and wait for completion
		console.log('\nAgent working...');
		const events = await client.event.subscribe();
		let success = false;
		let toolCalls = 0;
		let textParts = 0;

		try {
			for await (const event of events.stream) {
				// Filter for this session's events
				const eventSessionId =
					event.properties?.sessionID ||
					event.properties?.part?.sessionID ||
					event.properties?.info?.id;

				if (eventSessionId !== session.id) continue;

				// Handle different event types
				switch (event.type) {
					case 'message.part.updated':
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
							// Show abbreviated text progress
							const text = part.text || '';
							if (text.length > 0 && textParts % 5 === 0) {
								this.log(`  [Text output ${textParts}...]`);
							}
						}
						break;

					case 'session.idle':
						this.log('\nSession completed.');
						success = true;
						break;

					case 'session.error':
						console.error('\nSession encountered an error');
						success = false;
						break;
				}

				if (event.type === 'session.idle' || event.type === 'session.error') {
					break;
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
			textParts
		});

		// Summary
		console.log('\n' + '-'.repeat(60));
		console.log('Session Summary:');
		console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
		console.log(`  Tool calls: ${toolCalls}`);
		console.log(`  Feature completed: ${featureCompleted ? 'Yes' : 'No'}`);
		console.log('-'.repeat(60));

		return success && featureCompleted;
	}

	/**
	 * Format duration for display
	 */
	private formatDuration(ms: number): string {
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
	 * Generate final summary report
	 */
	private async generateSummary(): Promise<void> {
		const [passing, total] = await this.featureManager.getProgress();
		const elapsed = Date.now() - this.state.startTime.getTime();
		const isComplete = await this.featureManager.isComplete();

		console.log('\n' + '='.repeat(60));
		console.log(' ORCHESTRATION SUMMARY');
		console.log('='.repeat(60));
		console.log(`Sessions run: ${this.state.sessionCount}`);
		console.log(`Features completed: ${this.state.featuresCompleted}`);
		console.log(`Final progress: ${passing}/${total} (${total > 0 ? ((passing / total) * 100).toFixed(1) : 0}%)`);
		console.log(`Total time: ${this.formatDuration(elapsed)}`);
		console.log(`Complete: ${isComplete ? 'Yes' : 'No'}`);

		if (this.state.metrics.length > 0) {
			console.log('\nSession Details:');
			for (const m of this.state.metrics) {
				const duration = m.endTime ? (m.endTime - m.startTime) / 1000 : 0;
				const status = m.success ? '' : '';
				console.log(`  ${status} ${m.featureId}: ${duration.toFixed(1)}s, ${m.toolCalls} tool calls`);
			}
		}

		console.log('='.repeat(60) + '\n');
	}

	/**
	 * Main orchestration loop
	 */
	async run(): Promise<void> {
		// Load config first for display
		this.paceConfig = await loadConfig(this.cliConfig.projectDir);

		console.log('\n' + '='.repeat(60));
		console.log(' OPENCODE WORKFLOW ORCHESTRATOR');
		console.log('='.repeat(60));
		console.log(`\nProject: ${this.cliConfig.projectDir}`);
		console.log(`Max sessions: ${this.maxSessions || 'unlimited'}`);
		console.log(`Max consecutive failures: ${this.maxFailures}`);
		console.log(`Delay between sessions: ${this.sessionDelay / 1000}s`);

		// Check initial state before initializing server
		const [initialPassing, total] = await this.featureManager.getProgress();
		console.log(`Starting progress: ${initialPassing}/${total} features`);

		if (total === 0) {
			console.log('\nNo features found in feature_list.json');
			console.log('Run the initializer agent first to set up the project.');
			await this.generateSummary();
			return;
		}

		if (await this.featureManager.isComplete()) {
			console.log('\nAll features already passing!');
			await this.generateSummary();
			return;
		}

		if (this.cliConfig.dryRun) {
			console.log('\n[DRY RUN] Would initialize OpenCode server and run sessions');
			await this.generateSummary();
			return;
		}

		// Initialize only when we actually need to run sessions
		await this.initialize();

		try {
			// Main loop
			while (true) {
				// Check stopping conditions
				if (this.maxSessions && this.state.sessionCount >= this.maxSessions) {
					console.log(`\nReached maximum sessions (${this.maxSessions})`);
					break;
				}

				if (this.state.consecutiveFailures >= this.maxFailures) {
					console.log(`\nReached maximum consecutive failures (${this.maxFailures})`);
					break;
				}

				if (await this.featureManager.isComplete()) {
					console.log('\nAll features passing! Project complete!');
					break;
				}

				// Get next feature
				const nextFeature = await this.featureManager.getNextFeature();
				if (!nextFeature) {
					console.log('\nNo more features to implement');
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
					console.log(`\nFeature ${nextFeature.id} completed successfully`);
				} else if (success) {
					this.state.consecutiveFailures++;
					console.log(
						`\nSession completed but feature not marked as passing (${this.state.consecutiveFailures} consecutive)`
					);
				} else {
					this.state.consecutiveFailures++;
					console.log(`\nSession failed (${this.state.consecutiveFailures} consecutive)`);
				}

				// Delay before next session (using config value)
				if (
					!(await this.featureManager.isComplete()) &&
					(!this.maxSessions || this.state.sessionCount < this.maxSessions)
				) {
					const delaySeconds = this.sessionDelay / 1000;
					console.log(`\nWaiting ${delaySeconds}s before next session...`);
					await new Promise((resolve) => setTimeout(resolve, this.sessionDelay));
				}
			}
		} finally {
			await this.generateSummary();
			await this.shutdown();
		}
	}
}

// ============================================================================
// CLI
// ============================================================================

interface ParsedArgs {
	projectDir: string;
	port?: number;
	maxSessions?: number;
	maxFailures?: number;
	verbose: boolean;
	dryRun: boolean;
	help: boolean;
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);

	const parsed: ParsedArgs = {
		projectDir: process.cwd(),
		verbose: false,
		dryRun: false,
		help: false
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		switch (arg) {
			case '--help':
			case '-h':
				parsed.help = true;
				break;
			case '--project-dir':
			case '-d':
				parsed.projectDir = args[++i];
				break;
			case '--port':
				parsed.port = parseInt(args[++i]);
				break;
			case '--max-sessions':
			case '-n':
				parsed.maxSessions = parseInt(args[++i]);
				break;
			case '--max-failures':
			case '-f':
				parsed.maxFailures = parseInt(args[++i]);
				break;
			case '--verbose':
			case '-v':
				parsed.verbose = true;
				break;
			case '--dry-run':
				parsed.dryRun = true;
				break;
		}
	}

	return parsed;
}

function printHelp(): void {
	console.log(`
OpenCode Workflow Orchestrator
==============================

A workflow orchestrator that leverages OpenCode's full SDK capabilities
to implement the multi-session AI agent workflow.

USAGE:
    bun run opencode-orchestrator.ts [OPTIONS]

OPTIONS:
    --project-dir, -d DIR    Project directory (default: current directory)
    --port N                 Port for OpenCode server (default: random)
    --max-sessions, -n N     Maximum sessions to run (default: from pace.json or unlimited)
    --max-failures, -f N     Stop after N consecutive failures (default: from pace.json or 3)
    --verbose, -v            Show detailed output
    --dry-run                Preview without executing
    --help, -h               Show this help

CONFIGURATION:
    The orchestrator reads settings from pace.json (or pace.config.json, .pace.json):
    
    {
      "defaultModel": "anthropic/claude-sonnet-4-20250514",
      "orchestrator": {
        "maxSessions": 50,
        "maxFailures": 3,
        "sessionDelay": 3000
      }
    }

    CLI arguments override config file settings.

REQUIREMENTS:
    - OpenCode must be installed (bunx opencode or installed globally)
    - Project must have feature_list.json with defined features
    - AI provider must be configured (ANTHROPIC_API_KEY, etc.)

EXAMPLES:
    # Run with defaults
    bun run opencode-orchestrator.ts

    # Run with session limit
    bun run opencode-orchestrator.ts --max-sessions 10

    # Run in specific project directory
    bun run opencode-orchestrator.ts -d /path/to/project

    # Verbose output
    bun run opencode-orchestrator.ts -v

    # Preview what would happen
    bun run opencode-orchestrator.ts --dry-run

WORKFLOW:
    1. Reads feature_list.json to get pending features
    2. Creates OpenCode sessions for each feature (priority order)
    3. Monitors session progress via event streaming
    4. Tracks feature completion and consecutive failures
    5. Continues until all features pass or stopping condition met

For more details, see docs/workflow.md
`);
}

async function main(): Promise<void> {
	const args = parseArgs();

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	const orchestrator = new OpencodeOrchestrator({
		projectDir: args.projectDir,
		port: args.port,
		maxSessions: args.maxSessions,
		maxFailures: args.maxFailures,
		verbose: args.verbose,
		dryRun: args.dryRun
	});

	try {
		await orchestrator.run();
	} catch (error) {
		console.error(`\nFatal error: ${error}`);
		process.exit(1);
	}
}

// Handle SIGINT
process.on('SIGINT', () => {
	console.log('\n\nInterrupted by user');
	process.exit(130);
});

// Run
if (import.meta.main) {
	main();
}

// Export for testing
export { OpencodeOrchestrator, type OrchestratorCliConfig };
