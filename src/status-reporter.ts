/**
 * status-reporter.ts - Display project status and progress
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Feature, Priority, StatusReportOptions } from './types';
import { FeatureManager } from './feature-manager';

const execAsync = promisify(exec);

const PRIORITY_ICONS: Record<Priority, string> = {
	critical: '🔴',
	high: '🟠',
	medium: '🟡',
	low: '🟢'
};

/**
 * Status reporter for displaying project progress
 */
export class StatusReporter {
	private featureManager: FeatureManager;

	constructor(private projectDir: string) {
		this.featureManager = new FeatureManager(projectDir);
	}

	/**
	 * Get git log
	 */
	private async getGitLog(count: number = 10): Promise<string | null> {
		try {
			const { stdout } = await execAsync(`git log --oneline -${count}`, {
				cwd: this.projectDir,
				timeout: 5000
			});
			return stdout.trim();
		} catch (e) {
			return null;
		}
	}

	/**
	 * Load progress file
	 */
	private async loadProgressFile(): Promise<string | null> {
		try {
			const content = await readFile(join(this.projectDir, 'progress.txt'), 'utf-8');
			return content;
		} catch (e) {
			return null;
		}
	}

	/**
	 * Print a progress bar
	 */
	private printProgressBar(passing: number, total: number, width: number = 40): string {
		if (total === 0) {
			return '';
		}

		const pct = passing / total;
		const filled = Math.floor(width * pct);
		const empty = width - filled;

		const bar = '█'.repeat(filled) + '░'.repeat(empty);
		return `  [${bar}] ${passing}/${total} (${(pct * 100).toFixed(1)}%)`;
	}

	/**
	 * Get next features to work on
	 */
	private async getNextFeatures(limit: number = 5): Promise<Feature[]> {
		const failing = await this.featureManager.getFailingFeatures();
		return failing.slice(0, limit);
	}

	/**
	 * Get status data for JSON output
	 */
	async getStatusData(options: StatusReportOptions = {}): Promise<import('./types').StatusOutput> {
		const { verbose = false, showGitLog = true, showNextFeatures = 5 } = options;

		const data = await this.featureManager.load();
		const stats = await this.featureManager.getStats();
		const meta = data.metadata || {};

		// Get next features
		const nextFeaturesList = await this.getNextFeatures(showNextFeatures);
		const nextFeatures = nextFeaturesList.map((f) => ({
			id: f.id,
			description: f.description,
			priority: f.priority,
			category: f.category
		}));

		// Build category breakdown
		let byCategory: Record<string, { passing: number; failing: number; total: number }> | undefined;
		if (verbose) {
			const categoriesData = await this.featureManager.getFeaturesByCategory();
			byCategory = {};
			for (const [cat, features] of Object.entries(categoriesData)) {
				const passing = features.filter((f) => f.passes).length;
				const failing = features.length - passing;
				byCategory[cat] = { passing, failing, total: features.length };
			}
		}

		// Get git log
		let gitLog: string[] | undefined;
		if (showGitLog) {
			const log = await this.getGitLog(5);
			gitLog = log ? log.split('\n') : undefined;
		}

		// Get last session
		let lastSession: string | undefined;
		const progressContent = await this.loadProgressFile();
		if (progressContent) {
			const sessions = progressContent.split('### Session ');
			if (sessions.length > 1) {
				const session = sessions[sessions.length - 1];
				lastSession = session.split('\n').slice(0, 10).join('\n');
			}
		}

		return {
			progress: {
				passing: stats.passing,
				failing: stats.failing,
				total: stats.total,
				percentage: stats.total > 0 ? (stats.passing / stats.total) * 100 : 0
			},
			projectName: meta.project_name,
			nextFeatures,
			byCategory,
			gitLog,
			lastSession,
			workingDirectory: this.projectDir
		};
	}

	/**
	 * Print comprehensive status report
	 */
	async printStatus(options: StatusReportOptions = {}): Promise<void> {
		const {
			verbose = false,
			showGitLog = true,
			showNextFeatures = 5,
			showProgress = true,
			json = false
		} = options;

		// JSON output
		if (json) {
			const statusData = await this.getStatusData({ verbose, showGitLog, showNextFeatures });
			console.log(JSON.stringify(statusData, null, 2));
			return;
		}

		console.log('\n' + '='.repeat(60));
		console.log(' Long-Running Agent Harness - Project Status');
		console.log('='.repeat(60) + '\n');

		// Feature progress
		const data = await this.featureManager.load();

		if (data.features.length === 0) {
			console.log('⚠️  feature_list.json not found or empty');
			console.log('   Run the initializer agent first to set up the project.\n');
			return;
		}

		const stats = await this.featureManager.getStats();
		const meta = data.metadata || {};

		if (showProgress) {
			console.log('📊 Feature Progress');
			console.log(`   Project: ${meta.project_name || 'Unknown'}`);
			console.log(this.printProgressBar(stats.passing, stats.total));
			console.log(`   ✅ Passing: ${stats.passing}`);
			console.log(`   ❌ Failing: ${stats.failing}`);
			console.log();
		}

		// Next features
		if (showNextFeatures > 0) {
			const nextFeatures = await this.getNextFeatures(showNextFeatures);
			if (nextFeatures.length > 0) {
				console.log('📋 Next Features to Implement:');
				for (let i = 0; i < nextFeatures.length; i++) {
					const f = nextFeatures[i];
					const pri = f.priority;
					const icon = PRIORITY_ICONS[pri] || '⚪';
					const desc = f.description.slice(0, 50);
					console.log(`   ${i + 1}. ${icon} [${f.id}] ${desc}`);
				}
				console.log();
			}
		}

		// Category breakdown
		if (verbose) {
			const byCategory = await this.featureManager.getFeaturesByCategory();
			if (Object.keys(byCategory).length > 0) {
				console.log('📁 Progress by Category:');
				for (const [cat, features] of Object.entries(byCategory).sort()) {
					const passing = features.filter((f) => f.passes).length;
					const total = features.length;
					const pct = total > 0 ? (passing / total) * 100 : 0;
					console.log(`   ${cat}: ${passing}/${total} (${pct.toFixed(0)}%)`);
				}
				console.log();
			}
		}

		// Git history
		if (showGitLog) {
			const gitLog = await this.getGitLog(5);
			if (gitLog) {
				console.log('📜 Recent Git History:');
				for (const line of gitLog.split('\n')) {
					console.log(`   ${line}`);
				}
				console.log();
			} else {
				console.log('⚠️  Git repository not found or no commits yet\n');
			}
		}

		// Progress file summary
		const progressContent = await this.loadProgressFile();
		if (progressContent) {
			const sessions = progressContent.split('### Session ');
			if (sessions.length > 1) {
				const lastSession = sessions[sessions.length - 1];
				const lines = lastSession.split('\n').slice(0, 10);

				console.log('📝 Last Session Summary:');
				for (const line of lines) {
					if (line.trim()) {
						console.log(`   ${line}`);
					}
				}
				console.log();
			}
		} else {
			console.log('⚠️  progress.txt not found\n');
		}

		// Working directory
		console.log(`📂 Working Directory: ${this.projectDir}`);
		console.log();

		// Quick commands
		console.log('🚀 Quick Commands:');
		console.log('   pace                        - Run orchestrator');
		console.log('   pace status                 - Show this status');
		console.log('   pace validate               - Validate feature list');
		console.log('   pace update F001 pass       - Mark feature as passing');
		console.log();
	}

	/**
	 * Print a compact one-line status
	 */
	async printCompactStatus(): Promise<void> {
		const [passing, total] = await this.featureManager.getProgress();
		const pct = total > 0 ? ((passing / total) * 100).toFixed(1) : '0.0';
		console.log(`📊 ${passing}/${total} features passing (${pct}%)`);
	}

	/**
	 * Print only the next feature
	 */
	async printNextFeature(): Promise<void> {
		const next = await this.featureManager.getNextFeature();
		if (next) {
			const icon = PRIORITY_ICONS[next.priority] || '⚪';
			console.log(`📋 Next: ${icon} [${next.id}] ${next.description}`);
		} else {
			console.log('✅ No failing features - project complete!');
		}
	}
}
