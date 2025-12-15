/**
 * orchestrator.ts - Main orchestration logic for running agent sessions
 */

import type { OrchestratorOptions, SessionSummary, SDKChoice } from './types';
import { FeatureManager } from './feature-manager';
import { ClaudeSessionRunner } from './sdk/claude';
import { OpencodeSessionRunner } from './sdk/opencode';
import type { AgentSessionRunner } from './sdk/base';

/**
 * Orchestrator for running continuous agent sessions
 */
export class Orchestrator {
	private projectDir: string;
	private homeDir?: string;
	private maxSessions?: number;
	private maxFailures: number;
	private delay: number;
	private dryRun: boolean;
	private sdk: SDKChoice;
	private json: boolean;

	private sessionCount = 0;
	private consecutiveFailures = 0;
	private featuresCompleted = 0;
	private startTime = new Date();

	private featureManager: FeatureManager;

	constructor(options: OrchestratorOptions) {
		this.projectDir = options.projectDir;
		this.homeDir = options.homeDir;
		this.maxSessions = options.maxSessions;
		this.maxFailures = options.maxFailures;
		this.delay = options.delay;
		this.dryRun = options.dryRun;
		this.sdk = options.sdk;
		this.json = options.json || false;
		this.featureManager = new FeatureManager(this.projectDir);
	}

	/**
	 * Get the appropriate session runner based on SDK choice
	 */
	private getSessionRunner(): AgentSessionRunner {
		if (this.sdk === 'opencode') {
			return new OpencodeSessionRunner();
		}
		return new ClaudeSessionRunner();
	}

	/**
	 * Build the coding agent prompt
	 */
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

	/**
	 * Format duration in human-readable form
	 */
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

	/**
	 * Run a single coding session
	 */
	private async runCodingSession(featureId?: string): Promise<boolean> {
		const runner = this.getSessionRunner();
		this.sessionCount++;

		console.log('\n' + '='.repeat(60));
		console.log(`SESSION ${this.sessionCount} (${this.sdk.toUpperCase()} SDK)`);
		console.log('='.repeat(60));

		const [passingBefore, total] = await this.featureManager.getProgress();
		const nextFeature = await this.featureManager.getNextFeature();

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
				featureId: featureId || nextFeature.id,
				homeDir: this.homeDir
			});

			const success = sessionResult.success;

			// Check if progress was made
			const [passingAfter] = await this.featureManager.getProgress();
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

	/**
	 * Generate and display final summary
	 */
	async createSummaryReport(): Promise<SessionSummary> {
		const [passing, total] = await this.featureManager.getProgress();
		const elapsed = new Date().getTime() - this.startTime.getTime();
		const isComplete = await this.featureManager.isComplete();

		const summary: SessionSummary = {
			sessionsRun: this.sessionCount,
			featuresCompleted: this.featuresCompleted,
			finalProgress: `${passing}/${total}`,
			completionPercentage: total > 0 ? (passing / total) * 100 : 0,
			elapsedTime: this.formatDuration(elapsed),
			isComplete
		};

		if (this.json) {
			console.log(
				JSON.stringify({
					sdk: this.sdk,
					...summary,
					progress: { passing, total }
				})
			);
		} else {
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
		}

		return summary;
	}

	/**
	 * Run the orchestrator
	 */
	async run(): Promise<SessionSummary> {
		console.log('\n' + '='.repeat(60));
		console.log(' LONG-RUNNING AGENT ORCHESTRATOR');
		console.log('='.repeat(60));
		console.log(`\nProject: ${this.projectDir}`);
		console.log(`SDK: ${this.sdk.toUpperCase()}`);
		console.log(`Max sessions: ${this.maxSessions || 'unlimited'}`);
		console.log(`Max consecutive failures: ${this.maxFailures}`);
		console.log(`Delay between sessions: ${this.delay}s`);

		const [initialPassing, total] = await this.featureManager.getProgress();
		console.log(`Starting progress: ${initialPassing}/${total} features`);

		if (total === 0) {
			console.log('\n⚠️  No features defined in feature_list.json');
			return this.createSummaryReport();
		}

		if (await this.featureManager.isComplete()) {
			console.log('\n✅ All features already passing!');
			return this.createSummaryReport();
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

			if (await this.featureManager.isComplete()) {
				console.log('\n🎉 All features passing! Project complete!');
				break;
			}

			// Run a coding session
			await this.runCodingSession();

			// Delay between sessions
			if (!(await this.featureManager.isComplete()) && this.sessionCount < (this.maxSessions || Infinity)) {
				console.log(`\nWaiting ${this.delay}s before next session...`);
				await new Promise((resolve) => setTimeout(resolve, this.delay * 1000));
			}
		}

		return this.createSummaryReport();
	}
}
