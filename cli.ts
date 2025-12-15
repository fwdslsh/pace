#!/usr/bin/env bun
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

import { createOpencode } from '@opencode-ai/sdk';
import { StatusReporter } from './src/status-reporter';
import { FeatureManager } from './src/feature-manager';
import { validateFeatureList, formatValidationErrors, formatValidationStats } from './src/validators';
import { loadConfig, type PaceConfig, DEFAULT_CONFIG } from './src/opencode/pace-config';
import type { Feature, SessionSummary } from './src/types';
import { readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

// Import agent prompts from markdown files
import codingAgentMd from './src/opencode/agents/coding-agent.md' with { type: 'text' };
import initializerAgentMd from './src/opencode/agents/initializer-agent.md' with { type: 'text' };

// ============================================================================
// Types
// ============================================================================

interface ParsedArgs {
	command: 'run' | 'init' | 'status' | 'validate' | 'update' | 'help';
	options: {
		projectDir: string;
		configDir?: string;
		port?: number;
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
		if (cmd === 'run' || cmd === 'init' || cmd === 'status' || cmd === 'validate' || cmd === 'update' || cmd === 'help') {
			command = cmd;
			args.shift();
		}
	}

	const options: ParsedArgs['options'] = {
		projectDir: '.'
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
				break;
			case '--project-dir':
			case '-d':
				options.projectDir = args[++i];
				break;
			case '--config-dir':
				options.configDir = args[++i];
				break;
			case '--port':
				options.port = parseInt(args[++i]);
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
	private configDir?: string;
	private port?: number;
	private model?: string;
	private maxSessions?: number;
	private maxFailures: number;
	private delay: number;
	private dryRun: boolean;
	private verbose: boolean;
	private json: boolean;

	private paceConfig: PaceConfig = DEFAULT_CONFIG;
	private featureManager: FeatureManager;
	private state: OrchestratorState;
	private opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;

	constructor(options: ParsedArgs['options']) {
		this.projectDir = resolve(options.projectDir);
		this.configDir = options.configDir;
		this.port = options.port;
		this.model = options.model;
		this.maxSessions = options.untilComplete ? undefined : (options.maxSessions ?? 10);
		this.maxFailures = options.maxFailures ?? 3;
		this.delay = options.delay ?? 5;
		this.dryRun = options.dryRun ?? false;
		this.verbose = options.verbose ?? false;
		this.json = options.json ?? false;

		this.featureManager = new FeatureManager(this.projectDir);
		this.state = {
			sessionCount: 0,
			consecutiveFailures: 0,
			featuresCompleted: 0,
			startTime: new Date(),
			metrics: []
		};
	}

	/**
	 * Get effective model (CLI overrides config)
	 */
	private get effectiveModel(): string | undefined {
		return this.model ?? this.paceConfig.defaultModel;
	}

	/**
	 * Get effective max sessions (CLI overrides config)
	 */
	private get effectiveMaxSessions(): number | undefined {
		return this.maxSessions ?? this.paceConfig.orchestrator?.maxSessions;
	}

	/**
	 * Get effective max failures (CLI overrides config)
	 */
	private get effectiveMaxFailures(): number {
		return this.maxFailures ?? this.paceConfig.orchestrator?.maxFailures ?? 3;
	}

	/**
	 * Get session delay (CLI overrides config)
	 */
	private get effectiveDelay(): number {
		if (this.delay !== undefined) return this.delay * 1000;
		return this.paceConfig.orchestrator?.sessionDelay ?? 5000;
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
	 * Initialize the OpenCode server
	 */
	private async initialize(): Promise<void> {
		this.log('Loading pace configuration...');
		this.paceConfig = await loadConfig(this.projectDir);

		this.log('Initializing OpenCode server...');

		const opencodeOptions: { cwd: string; port?: number; configDir?: string } = {
			cwd: this.projectDir,
			port: this.port ?? 0
		};

		if (this.configDir) {
			opencodeOptions.configDir = this.configDir;
		}

		this.opencode = await createOpencode(opencodeOptions);

		this.log(`OpenCode server started: ${this.opencode.server.url}`);
	}

	/**
	 * Shut down the OpenCode server
	 */
	private async shutdown(): Promise<void> {
		if (this.opencode?.server?.kill) {
			this.log('Shutting down OpenCode server...');
			await this.opencode.server.kill();
		}
	}

	/**
	 * Load project context for agent prompts
	 */
	private async loadProjectContext(): Promise<string> {
		const parts: string[] = [];

		// Try to load progress file
		try {
			const progressPath = join(this.projectDir, 'claude-progress.txt');
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

		if (!this.json) {
			console.log('\n' + '='.repeat(60));
			console.log(`SESSION ${this.state.sessionCount + 1}: Feature ${feature.id}`);
			console.log('='.repeat(60));
			console.log(`Description: ${feature.description.slice(0, 60)}...`);
			console.log(`Priority: ${feature.priority}`);
			console.log(`Category: ${feature.category}`);
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
		if (!this.json) {
			console.log('\nAgent working...');
		}
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
			isComplete
		};

		if (this.json) {
			console.log(
				JSON.stringify({
					...summary,
					progress: { passing, total }
				})
			);
		} else {
			console.log('\n' + '='.repeat(60));
			console.log(' ORCHESTRATION SUMMARY');
			console.log('='.repeat(60));
			console.log(`Sessions run: ${summary.sessionsRun}`);
			console.log(`Features completed: ${summary.featuresCompleted}`);
			console.log(
				`Final progress: ${summary.finalProgress} (${summary.completionPercentage.toFixed(1)}%)`
			);
			console.log(`Total time: ${summary.elapsedTime}`);
			console.log(`Complete: ${summary.isComplete ? 'Yes' : 'No'}`);

			if (this.state.metrics.length > 0 && this.verbose) {
				console.log('\nSession Details:');
				for (const m of this.state.metrics) {
					const duration = m.endTime ? (m.endTime - m.startTime) / 1000 : 0;
					const status = m.success ? '✓' : '✗';
					console.log(`  ${status} ${m.featureId}: ${duration.toFixed(1)}s, ${m.toolCalls} tool calls`);
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
			if (this.effectiveModel) {
				console.log(`Model: ${this.effectiveModel}`);
			}
			console.log(`Max sessions: ${this.effectiveMaxSessions || 'unlimited'}`);
			console.log(`Max consecutive failures: ${this.effectiveMaxFailures}`);
			console.log(`Delay between sessions: ${this.effectiveDelay / 1000}s`);
			if (this.configDir) {
				console.log(`Config directory: ${this.configDir}`);
			}
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
							`\nSession completed but feature not marked as passing (${this.state.consecutiveFailures} consecutive)`
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
			const summary = await this.generateSummary();
			await this.shutdown();
			return summary;
		}
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
		console.error('  - claude-progress.txt progress log');
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
					promptPreview: projectDescription.slice(0, 200) + (projectDescription.length > 200 ? '...' : ''),
					message: 'Would initialize pace project with the given description'
				})
			);
		} else {
			console.log('\n' + '='.repeat(60));
			console.log(' PACE INIT (DRY RUN)');
			console.log('='.repeat(60));
			console.log(`\nProject directory: ${projectDir}`);
			console.log(`\nProject description:`);
			console.log('-'.repeat(40));
			console.log(projectDescription.slice(0, 500) + (projectDescription.length > 500 ? '\n...' : ''));
			console.log('-'.repeat(40));
			console.log('\n[DRY RUN] Would initialize pace project with the initializer agent');
			console.log('\nExpected outputs:');
			console.log('  - feature_list.json (50-200+ features)');
			console.log('  - init.sh (development environment script)');
			console.log('  - claude-progress.txt (progress log)');
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
		console.log(projectDescription.slice(0, 300) + (projectDescription.length > 300 ? '\n...' : ''));
		console.log('-'.repeat(40));
		console.log('\nInitializing OpenCode server...');
	}

	// Initialize OpenCode
	let opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;

	try {
		const opencodeOptions: { cwd: string; port: number; configDir?: string } = {
			cwd: projectDir,
			port: 0
		};

		if (options.configDir) {
			opencodeOptions.configDir = options.configDir;
		}

		opencode = await createOpencode(opencodeOptions);

		if (!options.json) {
			console.log(`OpenCode server started: ${opencode.server.url}`);
			console.log('\nRunning initializer agent...\n');
		}

		const client = opencode.client;

		// Create a session for initialization
		const sessionResult = await client.session.create({
			body: {
				title: `Pace Init: ${projectDescription.slice(0, 40)}...`
			}
		});

		if (sessionResult.error) {
			throw new Error(`Failed to create session: ${JSON.stringify(sessionResult.error)}`);
		}

		const session = sessionResult.data;

		// Get the initializer agent prompt
		const { content: agentPrompt } = parseFrontmatter(initializerAgentMd);

		// Build the full prompt
		const fullPrompt = `${agentPrompt}

## Project to Initialize

${projectDescription}

---

Begin now by analyzing the requirements and creating all necessary files.`;

		// Send the prompt
		const promptResult = await client.session.prompt({
			path: { id: session.id },
			body: {
				parts: [{ type: 'text', text: fullPrompt }]
			}
		});

		if (promptResult.error) {
			throw new Error(`Failed to send prompt: ${JSON.stringify(promptResult.error)}`);
		}

		// Subscribe to events and wait for completion
		const events = await client.event.subscribe();
		let success = false;
		let toolCalls = 0;
		const startTime = Date.now();

		for await (const event of events.stream) {
			const eventSessionId =
				event.properties?.sessionID ||
				event.properties?.part?.sessionID ||
				event.properties?.info?.id;

			if (eventSessionId !== session.id) continue;

			// Handle different event types
			if (event.type === 'message.part.updated') {
				const part = event.properties?.part;
				if (part?.type === 'tool') {
					toolCalls++;
					if (options.verbose && !options.json) {
						if (part.state?.status === 'running') {
							console.log(`  Tool: ${part.tool}...`);
						} else if (part.state?.status === 'completed') {
							console.log(`  Tool: ${part.tool} - done`);
						}
					}
				} else if (part?.type === 'text' && options.verbose && !options.json) {
					const text = part.text || '';
					if (text.length > 0 && toolCalls % 10 === 0) {
						console.log(`  [Progress: ${toolCalls} tool calls...]`);
					}
				}
			} else if (event.type === 'session.idle') {
				success = true;
				break;
			} else if (event.type === 'session.error') {
				success = false;
				break;
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
		for (const file of ['feature_list.json', 'init.sh', 'claude-progress.txt']) {
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
					featureCount,
					filesCreated,
					sessionId: session.id
				})
			);
		} else {
			console.log('\n' + '='.repeat(60));
			console.log(' INITIALIZATION COMPLETE');
			console.log('='.repeat(60));
			console.log(`\nDuration: ${duration}s`);
			console.log(`Tool calls: ${toolCalls}`);
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
					error: String(error)
				})
			);
		} else {
			console.error(`\nError during initialization: ${error}`);
		}
		process.exit(1);
	} finally {
		if (opencode?.server?.kill) {
			await opencode.server.kill();
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
		json: options.json
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
						stats: { total: 0, passing: 0, failing: 0, byCategory: {}, byPriority: {} }
					})
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
					stats: result.stats
				})
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
					stats: { total: 0, passing: 0, failing: 0, byCategory: {}, byPriority: {} }
				})
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
							percentage: total > 0 ? (passing / total) * 100 : 0
						},
						message: 'No change needed - already at target status'
					})
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
							percentage: total > 0 ? (passing / total) * 100 : 0
						}
					})
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
						error: 'Failed to update feature'
					})
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
					error: String(error)
				})
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
    --dry-run                    Show what would be done without executing
    --verbose, -v                Show detailed output during initialization
    --json                       Output results in JSON format

    You can also pass the prompt directly:
        pace init "Build a todo app with authentication"

RUN OPTIONS:
    --project-dir, -d DIR        Project directory (default: current directory)
    --config-dir DIR             OpenCode config directory for custom agents/plugins
    --model, -m MODEL            Model to use for sessions (e.g., anthropic/claude-sonnet-4-20250514)
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
    --config-dir DIR             OpenCode config directory (~/.config/opencode)
    --json                       Output in JSON format

CONFIGURATION:
    Create a pace.json file in your project for custom settings:

    {
      "defaultModel": "anthropic/claude-sonnet-4-20250514",
      "orchestrator": {
        "maxSessions": 50,
        "maxFailures": 5,
        "sessionDelay": 5000
      }
    }

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

    # Use a specific model
    pace run --model anthropic/claude-sonnet-4-20250514
    pace run -m openai/gpt-4o

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

    # Use custom config directory
    pace run --config-dir /path/to/opencode-config

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
export { Orchestrator, parseArgs, type ParsedArgs };
