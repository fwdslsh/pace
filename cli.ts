#!/usr/bin/env bun
/**
 * cli.ts - CLI entry point for the long-running agent orchestrator
 *
 * Commands:
 *     run         Run the orchestrator (default)
 *     status      Show project status
 *     validate    Validate feature_list.json
 *     update      Update feature status
 *
 * Run Options:
 *     --max-sessions N         Maximum sessions to run (default: 10)
 *     --max-failures N         Stop after N consecutive failures (default: 3)
 *     --delay SECONDS          Delay between sessions (default: 5)
 *     --sdk <claude|opencode>  Select agent SDK (default: claude)
 *     --until-complete         Run until all features pass
 *     --dry-run                Show what would be done without executing
 *
 * Examples:
 *     bun run cli.ts
 *     bun run cli.ts status
 *     bun run cli.ts status --verbose
 *     bun run cli.ts validate
 *     bun run cli.ts update F001 pass
 *     bun run cli.ts run --max-sessions 10
 *     bun run cli.ts run --sdk opencode --until-complete
 */

import { Orchestrator } from './src/orchestrator';
import { StatusReporter } from './src/status-reporter';
import { FeatureManager } from './src/feature-manager';
import { validateFeatureList, formatValidationErrors, formatValidationStats } from './src/validators';
import type { OrchestratorOptions, SDKChoice } from './src/types';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface ParsedArgs {
	command: 'run' | 'status' | 'validate' | 'update' | 'help';
	options: Partial<OrchestratorOptions> & {
		help?: boolean;
		verbose?: boolean;
		untilComplete?: boolean;
		featureId?: string;
		passStatus?: boolean;
	};
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);

	// Default command
	let command: ParsedArgs['command'] = 'run';

	// Check if first arg is a command
	if (args.length > 0 && !args[0].startsWith('--')) {
		const cmd = args[0];
		if (cmd === 'run' || cmd === 'status' || cmd === 'validate' || cmd === 'update' || cmd === 'help') {
			command = cmd;
			args.shift(); // Remove command from args
		}
	}

	const options: ParsedArgs['options'] = {
		projectDir: '.',
		maxFailures: 3,
		delay: 5,
		dryRun: false,
		sdk: 'claude' as SDKChoice,
		verbose: false
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
				console.log('0.1.0');
				process.exit(0);
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
			case '--verbose':
			case '-v':
				options.verbose = true;
				break;
			case '--json':
				options.json = true;
				break;
			case '--home-dir':
				options.homeDir = args[++i];
				break;
			default:
				// For update command, parse feature ID and pass/fail
				if (command === 'update' && !arg.startsWith('--')) {
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
		}
	}

	// Default to 10 sessions if not specified for run command
	if (command === 'run' && options.maxSessions === undefined && !options.untilComplete) {
		options.maxSessions = 10;
	}

	return { command, options };
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleRun(options: ParsedArgs['options']) {
	const orchestratorOptions: OrchestratorOptions = {
		projectDir: options.projectDir || '.',
		homeDir: options.homeDir,
		maxSessions: options.maxSessions,
		maxFailures: options.maxFailures || 3,
		delay: options.delay || 5,
		dryRun: options.dryRun || false,
		sdk: options.sdk || 'claude',
		json: options.json
	};

	const orchestrator = new Orchestrator(orchestratorOptions);

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

async function handleStatus(options: ParsedArgs['options']) {
	const reporter = new StatusReporter(options.projectDir || '.');
	await reporter.printStatus({
		verbose: options.verbose,
		showGitLog: true,
		showNextFeatures: 5,
		showProgress: true,
		json: options.json
	});
}

async function handleValidate(options: ParsedArgs['options']) {
	const manager = new FeatureManager(options.projectDir || '.');

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
				console.log('❌ INVALID - No features found in feature_list.json\n');
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
			console.error(`❌ Error loading feature list: ${error}\n`);
		}
		process.exit(1);
	}
}

async function handleUpdate(options: ParsedArgs['options']) {
	if (!options.featureId) {
		console.error('Error: Feature ID required');
		console.error('Usage: bun run cli.ts update <feature-id> <pass|fail>');
		process.exit(1);
	}

	if (options.passStatus === undefined) {
		console.error('Error: Status required (pass or fail)');
		console.error('Usage: bun run cli.ts update <feature-id> <pass|fail>');
		process.exit(1);
	}

	const manager = new FeatureManager(options.projectDir || '.');

	try {
		const feature = await manager.findFeature(options.featureId);

		if (!feature) {
			console.error(`\nError: Feature '${options.featureId}' not found`);
			console.error('\nAvailable features:');
			const data = await manager.load();
			for (const f of data.features.slice(0, 10)) {
				const status = f.passes ? '✅' : '❌';
				console.error(`  ${status} ${f.id}: ${f.description.slice(0, 50)}`);
			}
			if (data.features.length > 10) {
				console.error(`  ... and ${data.features.length - 10} more`);
			}
			process.exit(1);
		}

		// Check if this is actually a change
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

		// Update the feature
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
				console.log(`Change: ${oldStatus} → ${newStatus}`);
				console.log(`\n✅ Updated feature '${options.featureId}' to ${newStatus}`);
				console.log(`   Backup saved to feature_list.json.bak`);
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
				console.error(`\n❌ Failed to update feature '${options.featureId}'`);
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
			console.error(`\n❌ Error updating feature: ${error}`);
		}
		process.exit(1);
	}
}

function printHelp() {
	console.log(`
orchestrator - Long-Running Agent Orchestrator

USAGE:
    bun run cli.ts [COMMAND] [OPTIONS]

COMMANDS:
    run          Run the orchestrator (default)
    status       Show project status
    validate     Validate feature_list.json
    update       Update feature status
    help         Show this help message

RUN OPTIONS:
    --project-dir, -d DIR        Project directory (default: current directory)
    --home-dir DIR               Override SDK home directory (~/.claude or ~/.config/opencode)
    --max-sessions, -n N         Maximum number of sessions to run (default: 10)
    --max-failures, -f N         Stop after N consecutive failures (default: 3)
    --delay SECONDS              Seconds to wait between sessions (default: 5)
    --sdk <claude|opencode>      Select agent SDK (default: claude)
    --until-complete             Run until all features pass (implies unlimited sessions)
    --dry-run                    Show what would be done without executing
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
    --json                       Output in JSON format (applies to all commands)

ENVIRONMENT VARIABLES:
    ANTHROPIC_API_KEY            Required for Claude SDK
    OPENCODE_SERVER_URL          OpenCode server URL (default: http://localhost:4096)

EXAMPLES:
    # Run orchestrator with defaults
    bun run cli.ts
    bun run cli.ts run --max-sessions 10
    
    # Run with OpenCode SDK
    bun run cli.ts run --sdk opencode --until-complete
    
    # Show project status
    bun run cli.ts status
    bun run cli.ts status --verbose
    bun run cli.ts status --json
    
    # Validate feature list
    bun run cli.ts validate
    bun run cli.ts validate --json
    
    # Update feature status
    bun run cli.ts update F001 pass
    bun run cli.ts update F002 fail --json
    
    # Preview without executing
    bun run cli.ts run --dry-run --max-sessions 5
    
    # Override SDK home directory
    bun run cli.ts run --home-dir /custom/path/.claude
    
    # Get JSON output for scripting
    bun run cli.ts run --json --max-sessions 5
  `);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
	const { command, options } = parseArgs();

	if (options.help || command === 'help') {
		printHelp();
		process.exit(0);
	}

	switch (command) {
		case 'run':
			await handleRun(options);
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
