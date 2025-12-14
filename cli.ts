#!/usr/bin/env bun
/**
 * orchestrator.ts - Continuous execution orchestrator for long-running agent harness
 *
 * Runs the coding agent in a loop, automatically continuing to the next feature
 * after each successful completion. Supports multiple agent SDKs.
 *
 * Usage:
 *     bun run cli.ts [options]
 *
 * Options:
 *     --max-sessions N         Maximum sessions to run (default: 10)
 *     --max-failures N         Stop after N consecutive failures (default: 3)
 *     --delay SECONDS          Delay between sessions (default: 5)
 *     --sdk <claude|opencode>  Select agent SDK (default: claude)
 *     --until-complete         Run until all features pass
 *     --dry-run                Show what would be done without executing
 *
 * Examples:
 *     bun run cli.ts --max-sessions 10
 *     bun run cli.ts --sdk opencode --until-complete
 *     bun run cli.ts --max-sessions 50 --max-failures 5
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionMode, SDKResultMessage, SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { createOpencodeClient } from '@opencode-ai/sdk';
import type { Client as OpencodeClient } from '@opencode-ai/sdk';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

interface Feature {
	id: string;
	description: string;
	priority?: 'critical' | 'high' | 'medium' | 'low';
	passes?: boolean;
	tags?: string[];
}

interface FeatureList {
	features: Feature[];
	metadata?: Record<string, any>;
}

type SDKChoice = 'claude' | 'opencode';

interface AgentSessionParams {
	prompt: string;
	projectDir: string;
	featureId?: string;
}

interface AgentRunResult {
	success: boolean;
}

interface AgentSessionRunner {
	runSession(params: AgentSessionParams): Promise<AgentRunResult>;
}

interface OrchestratorOptions {
	projectDir: string;
	maxSessions?: number;
	maxFailures: number;
	delay: number;
	dryRun: boolean;
	sdk: SDKChoice;
}

interface SessionSummary {
	sessionsRun: number;
	featuresCompleted: number;
	finalProgress: string;
	completionPercentage: number;
	elapsedTime: string;
	isComplete: boolean;
}

// ============================================================================
// SDK Implementations
// ============================================================================

/**
 * Claude Agent SDK implementation
 */
class ClaudeSessionRunner implements AgentSessionRunner {
	constructor(private defaultOptions: any) {}

	async runSession(params: AgentSessionParams): Promise<AgentRunResult> {
		console.log('\nStarting Claude Agent SDK session...\n');
		console.log(`Invoking Claude Agent SDK for feature ${params.featureId}\n`);
		console.log('-'.repeat(60));
		console.log(params.prompt);
		console.log('-'.repeat(60) + '\n');

		try {
			const agentQuery = query({
				prompt: params.prompt,
				options: {
					...this.defaultOptions,
					cwd: params.projectDir
				}
			});

			console.log('\n🤖 Claude Agent Output:\n');

			let resultMessage: SDKResultMessage | null = null;

			for await (const message of agentQuery) {
				switch (message.type) {
					case 'system':
						if (message.subtype === 'init') {
							console.log(`\n📋 Session initialized:`);
							console.log(`  - Model: ${message.model}`);
							console.log(`  - CWD: ${message.cwd}`);
							console.log(`  - Tools: ${message.tools.join(', ')}`);
							console.log(`  - Permission mode: ${message.permissionMode}\n`);
						} else if (message.subtype === 'compact_boundary') {
							console.log(
								`\n🗜️  Context compacted (tokens: ${message.compact_metadata.pre_tokens})\n`
							);
						}
						break;

					case 'assistant':
						console.log(`\n💬 Assistant (turn):`);
						for (const block of message.message.content) {
							if (block.type === 'text') {
								console.log(block.text);
							} else if (block.type === 'tool_use') {
								console.log(`\n🔧 Tool: ${block.name}`);
								console.log(`   Input: ${JSON.stringify(block.input, null, 2)}`);
							}
						}
						break;

					case 'user':
						for (const block of message.message.content) {
							if (block.type === 'tool_result') {
								const content =
									typeof block.content === 'string'
										? block.content
										: JSON.stringify(block.content);
								const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
								console.log(`\n✅ Tool result (${block.tool_use_id}): ${preview}`);
							}
						}
						break;

					case 'result':
						resultMessage = message;
						console.log('\n\n' + '='.repeat(60));
						console.log('🎯 Session Result');
						console.log('='.repeat(60));
						console.log(`Status: ${message.subtype}`);
						console.log(`Turns: ${message.num_turns}`);
						console.log(`Duration: ${(message.duration_ms / 1000).toFixed(2)}s`);
						console.log(`API Time: ${(message.duration_api_ms / 1000).toFixed(2)}s`);
						console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`);
						console.log(
							`Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`
						);
						if (message.usage.cache_read_input_tokens) {
							console.log(
								`Cache: ${message.usage.cache_read_input_tokens} read / ${message.usage.cache_creation_input_tokens || 0} created`
							);
						}
						if (message.subtype === 'success') {
							console.log(`\nResult: ${message.result}`);
						}
						console.log('='.repeat(60));
						break;
				}
			}

			return { success: resultMessage?.subtype === 'success' };
		} catch (error) {
			console.error(`\n❌ Error during agent session: ${error}`);
			return { success: false };
		}
	}
}

/**
 * OpenCode SDK implementation
 */
class OpencodeSessionRunner implements AgentSessionRunner {
	async runSession(params: AgentSessionParams): Promise<AgentRunResult> {
		console.log('\nStarting OpenCode SDK session...\n');
		console.log(`Invoking OpenCode SDK for feature ${params.featureId}\n`);
		console.log('-'.repeat(60));
		console.log(params.prompt);
		console.log('-'.repeat(60) + '\n');

		try {
			const client = createOpencodeClient({
				baseUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:4096'
			});

			console.log('\n🤖 OpenCode Agent Output:\n');

			// Create session
			console.log('📋 Creating session...');
			const sessionResponse = await client.session.create({
				body: {
					title: `Feature: ${params.featureId}`,
					cwd: params.projectDir
				}
			});

			if (sessionResponse.error) {
				throw new Error(`Failed to create session: ${JSON.stringify(sessionResponse.error)}`);
			}

			const session = sessionResponse.data;
			console.log(`✅ Session created: ${session.id}\n`);

			// Send prompt
			console.log('💬 Sending prompt...');
			const promptResponse = await client.session.prompt({
				path: { id: session.id },
				body: {
					parts: [{ type: 'text', text: params.prompt }]
				}
			});

			if (promptResponse.error) {
				throw new Error(`Failed to send prompt: ${JSON.stringify(promptResponse.error)}`);
			}

			console.log('✅ Prompt sent, agent is working...\n');

			// Subscribe to events
			const events = await client.event.subscribe();
			let completed = false;
			let success = false;

			console.log('📡 Streaming events:\n');

			for await (const event of events.data.stream) {
				// Filter events for our session
				const eventSessionId =
					event.properties?.sessionID ||
					event.properties?.part?.sessionID ||
					event.properties?.info?.sessionID;

				if (eventSessionId !== session.id) continue;

				console.log(`📨 Event: ${event.type}`);

				if (event.type === 'session.idle' || event.type === 'session.completed') {
					completed = true;
					success = true;
					console.log('\n✅ Session completed successfully');
					break;
				}

				if (event.type === 'session.error') {
					completed = true;
					success = false;
					console.log('\n❌ Session encountered an error');
					break;
				}
			}

			console.log('\n' + '='.repeat(60));
			console.log('🎯 Session Result');
			console.log('='.repeat(60));
			console.log(`Status: ${success ? 'success' : 'failed'}`);
			console.log(`Completed: ${completed}`);
			console.log('='.repeat(60));

			return { success };
		} catch (error) {
			console.error(`\n❌ Error during OpenCode session: ${error}`);
			return { success: false };
		}
	}
}

// ============================================================================
// Orchestrator
// ============================================================================

class Orchestrator {
	private projectDir: string;
	private maxSessions?: number;
	private maxFailures: number;
	private delay: number;
	private dryRun: boolean;
	private sdk: SDKChoice;

	private sessionCount = 0;
	private consecutiveFailures = 0;
	private featuresCompleted = 0;
	private startTime = new Date();

	private defaultOptions = {
		systemPrompt: {
			type: 'preset',
			preset: 'claude_code'
		},
		stderr: (s: string) => console.error(`[Agent STDERR] ${s}`),
		model: 'claude-opus-4-5-20251101',
		settingSources: ['user', 'project'] as SettingSource[],
		permissionMode: 'bypassPermissions' as PermissionMode,
		includePartialMessages: false
	};

	constructor(options: OrchestratorOptions) {
		this.projectDir = options.projectDir;
		this.maxSessions = options.maxSessions;
		this.maxFailures = options.maxFailures;
		this.delay = options.delay;
		this.dryRun = options.dryRun;
		this.sdk = options.sdk;
	}

	private getSessionRunner(): AgentSessionRunner {
		if (this.sdk === 'opencode') {
			return new OpencodeSessionRunner();
		}
		return new ClaudeSessionRunner(this.defaultOptions);
	}

	private async loadFeatureStatus(): Promise<FeatureList> {
		const featureFile = join(this.projectDir, 'feature_list.json');
		try {
			const content = await readFile(featureFile, 'utf-8');
			return JSON.parse(content);
		} catch (e) {
			console.error(`Error loading feature list: ${e}`);
			return { features: [], metadata: {} };
		}
	}

	private async getProgress(): Promise<[number, number]> {
		const data = await this.loadFeatureStatus();
		const passing = data.features.filter((f) => f.passes === true).length;
		return [passing, data.features.length];
	}

	private async isComplete(): Promise<boolean> {
		const [passing, total] = await this.getProgress();
		return total > 0 && passing === total;
	}

	private async getNextFeature(): Promise<Feature | null> {
		const data = await this.loadFeatureStatus();
		const priorityOrder: Record<string, number> = {
			critical: 0,
			high: 1,
			medium: 2,
			low: 3
		};

		const failing = data.features.filter((f) => !f.passes);
		failing.sort((a, b) => {
			const aPriority = priorityOrder[a.priority || 'low'] ?? 4;
			const bPriority = priorityOrder[b.priority || 'low'] ?? 4;
			return aPriority - bPriority;
		});

		return failing[0] || null;
	}

	private buildCodingPrompt(featureId?: string): string {
		let prompt = `You are the Coding Agent for this long-running project. Follow the coding agent workflow EXACTLY:

1. ORIENT: Run pwd, read claude-progress.txt, check git log, review feature_list.json
2. START ENVIRONMENT: Run ./init.sh
3. SANITY TEST: Verify basic functionality works
4. SELECT FEATURE: Work on exactly ONE feature`;

		if (featureId) {
			prompt += ` - specifically ${featureId}`;
		} else {
			prompt += ` - choose highest priority failing feature`;
		}

		prompt += `
5. IMPLEMENT: Write the code for this feature
6. TEST END-TO-END: Verify the feature works as a user would use it
7. UPDATE STATUS: Change ONLY the 'passes' field to true in feature_list.json
8. COMMIT: Git commit with descriptive message
9. UPDATE PROGRESS: Add session entry to claude-progress.txt

CRITICAL RULES:
- Work on exactly ONE feature
- Test end-to-end before marking complete
- Run the /review and /compound commands from the practices skill before updating the 'passes' field
- Only change the 'passes' field in feature_list.json
- Commit all changes
- Update progress file

Begin now by orienting yourself with the project state.`;

		return prompt;
	}

	private async runCodingSession(featureId?: string): Promise<boolean> {
		const runner = this.getSessionRunner();
		this.sessionCount++;

		console.log('\n' + '='.repeat(60));
		console.log(`SESSION ${this.sessionCount} (${this.sdk.toUpperCase()} SDK)`);
		console.log('='.repeat(60));

		const [passingBefore, total] = await this.getProgress();
		const nextFeature = await this.getNextFeature();

		if (!nextFeature) {
			console.log('No more features to implement!');
			return true;
		}

		const elapsed = new Date().getTime() - this.startTime.getTime();
		const elapsedStr = this.formatDuration(elapsed);

		console.log(`Progress: ${passingBefore}/${total} features passing`);
		console.log(`Next feature: ${nextFeature.id} - ${nextFeature.description.slice(0, 50)}`);
		console.log(`Time elapsed: ${elapsedStr}`);

		if (this.dryRun) {
			console.log('[DRY RUN] Would invoke coding agent here');
			return true;
		}

		const prompt = this.buildCodingPrompt(featureId || nextFeature.id);

		try {
			const sessionResult = await runner.runSession({
				prompt,
				projectDir: this.projectDir,
				featureId: featureId || nextFeature.id
			});

			const success = sessionResult.success;

			// Check if progress was made
			const [passingAfter] = await this.getProgress();
			const featuresAdded = passingAfter - passingBefore;

			if (success && featuresAdded > 0) {
				this.featuresCompleted += featuresAdded;
				this.consecutiveFailures = 0;
				console.log(`\n✅ Session completed successfully: ${featuresAdded} feature(s) now passing`);
				return true;
			} else if (success) {
				this.consecutiveFailures++;
				console.log(
					`\n⚠️ Session completed but no features marked as passing (${this.consecutiveFailures} consecutive)`
				);
				return false;
			} else {
				this.consecutiveFailures++;
				console.log(`\n❌ Session failed (${this.consecutiveFailures} consecutive)`);
				return false;
			}
		} catch (error) {
			console.error(`\n❌ Error running session: ${error}`);
			this.consecutiveFailures++;
			return false;
		}
	}

	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	}

	private async summary(): Promise<SessionSummary> {
		const [passing, total] = await this.getProgress();
		const elapsed = new Date().getTime() - this.startTime.getTime();
		const isComplete = await this.isComplete();

		const summary: SessionSummary = {
			sessionsRun: this.sessionCount,
			featuresCompleted: this.featuresCompleted,
			finalProgress: `${passing}/${total}`,
			completionPercentage: total > 0 ? (passing / total) * 100 : 0,
			elapsedTime: this.formatDuration(elapsed),
			isComplete
		};

		console.log('\n' + '='.repeat(60));
		console.log(' ORCHESTRATION SUMMARY');
		console.log('='.repeat(60));
		console.log(`SDK Used: ${this.sdk.toUpperCase()}`);
		console.log(`Sessions run: ${summary.sessionsRun}`);
		console.log(`Features completed: ${summary.featuresCompleted}`);
		console.log(
			`Final progress: ${summary.finalProgress} (${summary.completionPercentage.toFixed(1)}%)`
		);
		console.log(`Total time: ${summary.elapsedTime}`);
		console.log(`Complete: ${summary.isComplete ? 'Yes ✅' : 'No'}`);
		console.log('='.repeat(60) + '\n');

		return summary;
	}

	async run(): Promise<SessionSummary> {
		console.log('\n' + '='.repeat(60));
		console.log(' LONG-RUNNING AGENT ORCHESTRATOR');
		console.log('='.repeat(60));
		console.log(`\nProject: ${this.projectDir}`);
		console.log(`SDK: ${this.sdk.toUpperCase()}`);
		console.log(`Max sessions: ${this.maxSessions || 'unlimited'}`);
		console.log(`Max consecutive failures: ${this.maxFailures}`);
		console.log(`Delay between sessions: ${this.delay}s`);

		const [initialPassing, total] = await this.getProgress();
		console.log(`Starting progress: ${initialPassing}/${total} features`);

		if (await this.isComplete()) {
			console.log('\n✅ All features already passing!');
			return this.summary();
		}

		while (true) {
			// Check stopping conditions
			if (this.maxSessions && this.sessionCount >= this.maxSessions) {
				console.log(`\n🛑 Reached maximum sessions (${this.maxSessions})`);
				break;
			}

			if (this.consecutiveFailures >= this.maxFailures) {
				console.log(`\n🛑 Reached maximum consecutive failures (${this.maxFailures})`);
				break;
			}

			if (await this.isComplete()) {
				console.log('\n🎉 All features passing! Project complete!');
				break;
			}

			// Run a coding session
			await this.runCodingSession();

			// Delay between sessions
			if (!(await this.isComplete()) && this.sessionCount < (this.maxSessions || Infinity)) {
				console.log(`\nWaiting ${this.delay}s before next session...`);
				await new Promise((resolve) => setTimeout(resolve, this.delay * 1000));
			}
		}

		return this.summary();
	}
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): OrchestratorOptions & { help?: boolean } {
	const args = process.argv.slice(2);
	const options: any = {
		projectDir: '.',
		maxFailures: 3,
		delay: 5,
		dryRun: false,
		sdk: 'claude' as SDKChoice
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		switch (arg) {
			case '--help':
			case '-h':
				options.help = true;
				break;
			case '--project-dir':
			case '-d':
				options.projectDir = args[++i];
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
				options.maxSessions = undefined;
				options.untilComplete = true;
				break;
			case '--dry-run':
				options.dryRun = true;
				break;
			case '--sdk':
				const sdkValue = args[++i];
				if (sdkValue !== 'claude' && sdkValue !== 'opencode') {
					console.error(`Invalid SDK: ${sdkValue}. Must be 'claude' or 'opencode'`);
					process.exit(1);
				}
				options.sdk = sdkValue as SDKChoice;
				break;
		}
	}

	// Default to 10 sessions if not specified
	if (options.maxSessions === undefined && !options.untilComplete) {
		options.maxSessions = 10;
	}

	return options;
}

function printHelp() {
	console.log(`
orchestrator.ts - Orchestrate continuous coding agent sessions

Usage:
    bun run cli.ts [options]

Options:
    --project-dir, -d DIR        Project directory (default: current directory)
    --max-sessions, -n N         Maximum number of sessions to run (default: 10)
    --max-failures, -f N         Stop after N consecutive failures (default: 3)
    --delay SECONDS              Seconds to wait between sessions (default: 5)
    --sdk <claude|opencode>      Select agent SDK (default: claude)
    --until-complete             Run until all features pass (implies unlimited sessions)
    --dry-run                    Show what would be done without executing
    --help, -h                   Show this help message

Environment Variables:
    ANTHROPIC_API_KEY            Required for Claude SDK
    OPENCODE_SERVER_URL          OpenCode server URL (default: http://localhost:4096)

Examples:
    # Run with Claude SDK (default)
    bun run cli.ts --max-sessions 10
    
    # Run with OpenCode SDK
    bun run cli.ts --sdk opencode --until-complete
    
    # Run with custom failure threshold
    bun run cli.ts --max-sessions 50 --max-failures 5
    
    # Preview without executing
    bun run cli.ts --dry-run --max-sessions 5
  `);
}

// Main execution
async function main() {
	const options = parseArgs();

	if (options.help) {
		printHelp();
		process.exit(0);
	}

	if (!options.maxSessions && !options.untilComplete) {
		console.log(
			`Note: Defaulting to ${options.maxSessions || 10} sessions. Use --until-complete for unlimited.`
		);
	}

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

// Handle SIGINT gracefully
process.on('SIGINT', () => {
	console.log('\n\nOrchestration interrupted by user');
	process.exit(130);
});

// Run if executed directly
if (import.meta.main) {
	main();
}
