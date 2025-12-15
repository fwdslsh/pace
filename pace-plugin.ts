/**
 * pace-plugin.ts - OpenCode Plugin for Pace Workflow
 *
 * A comprehensive plugin that implements the pace (Pragmatic Agent for Compounding
 * Engineering) workflow in OpenCode using:
 *
 * - Custom agents loaded from markdown files
 * - Custom commands loaded from markdown files
 * - Tools for feature management and child session orchestration
 * - Event hooks for progress tracking
 * - Permission automation for development workflow
 * - Configurable model assignments
 *
 * Installation:
 *   Copy to .opencode/plugin/pace-plugin.ts in your project
 *   Or add to global: ~/.config/opencode/plugin/pace-plugin.ts
 */

import type { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

// Import shared code from src/
import { FeatureManager } from './src/feature-manager';
import type { Feature, FeatureList } from './src/types';
import {
	loadConfig,
	getAgentModel,
	getCommandAgent,
	isAgentEnabled,
	isCommandEnabled,
	type PaceConfig
} from './src/opencode/pace-config';

// Import agent prompts from markdown files
import codingAgentMd from './src/opencode/agents/coding-agent.md' with { type: 'text' };
import coordinatorAgentMd from './src/opencode/agents/coordinator-agent.md' with { type: 'text' };
import initializerAgentMd from './src/opencode/agents/initializer-agent.md' with { type: 'text' };
import codeReviewerMd from './src/opencode/agents/code-reviewer.md' with { type: 'text' };
import practicesReviewerMd from './src/opencode/agents/practices-reviewer.md' with { type: 'text' };

// Import command templates from markdown files
import paceInitMd from './src/opencode/commands/pace-init.md' with { type: 'text' };
import paceNextMd from './src/opencode/commands/pace-next.md' with { type: 'text' };
import paceContinueMd from './src/opencode/commands/pace-continue.md' with { type: 'text' };
import paceCoordinateMd from './src/opencode/commands/pace-coordinate.md' with { type: 'text' };
import paceReviewMd from './src/opencode/commands/pace-review.md' with { type: 'text' };
import paceCompoundMd from './src/opencode/commands/pace-compound.md' with { type: 'text' };
import paceStatusMd from './src/opencode/commands/pace-status.md' with { type: 'text' };
import paceCompleteMd from './src/opencode/commands/pace-complete.md' with { type: 'text' };

// ============================================================================
// Types
// ============================================================================

interface AgentFrontmatter {
	description?: string;
	mode?: 'primary' | 'subagent' | 'all';
	model?: string;
	tools?: Record<string, boolean>;
	permission?: Record<string, string>;
}

interface CommandFrontmatter {
	description?: string;
	agent?: string;
	model?: string;
	subtask?: boolean;
}

interface ChildSessionState {
	sessionId: string;
	featureId: string;
	startTime: number;
	toolCalls: number;
	status: 'running' | 'completed' | 'failed';
}

// ============================================================================
// Markdown Parsing
// ============================================================================

function parseFrontmatter<T>(markdown: string): { frontmatter: T; content: string } {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {} as T, content: markdown };
	}

	const [, frontmatterStr, content] = match;
	const frontmatter: Record<string, unknown> = {};

	// Simple YAML-like parsing for frontmatter
	const lines = frontmatterStr.split('\n');
	for (const line of lines) {
		const colonIndex = line.indexOf(':');
		if (colonIndex > 0) {
			const key = line.slice(0, colonIndex).trim();
			let value = line.slice(colonIndex + 1).trim();

			// Handle quoted strings
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			// Handle booleans
			if (value === 'true') {
				frontmatter[key] = true;
			} else if (value === 'false') {
				frontmatter[key] = false;
			} else {
				frontmatter[key] = value;
			}
		}
	}

	return { frontmatter: frontmatter as T, content: content.trim() };
}

// ============================================================================
// Plugin Definition
// ============================================================================

export const PacePlugin: Plugin = async (ctx) => {
	const { client, directory } = ctx;
	const featureManager = new FeatureManager(directory);
	const config = await loadConfig(directory);

	// Track child sessions for orchestration
	const childSessions = new Map<string, ChildSessionState>();

	// Parse agent markdown files
	const codingAgent = parseFrontmatter<AgentFrontmatter>(codingAgentMd);
	const coordinatorAgent = parseFrontmatter<AgentFrontmatter>(coordinatorAgentMd);
	const initializerAgent = parseFrontmatter<AgentFrontmatter>(initializerAgentMd);
	const codeReviewer = parseFrontmatter<AgentFrontmatter>(codeReviewerMd);
	const practicesReviewer = parseFrontmatter<AgentFrontmatter>(practicesReviewerMd);

	// Parse command markdown files
	const paceInit = parseFrontmatter<CommandFrontmatter>(paceInitMd);
	const paceNext = parseFrontmatter<CommandFrontmatter>(paceNextMd);
	const paceContinue = parseFrontmatter<CommandFrontmatter>(paceContinueMd);
	const paceCoordinate = parseFrontmatter<CommandFrontmatter>(paceCoordinateMd);
	const paceReview = parseFrontmatter<CommandFrontmatter>(paceReviewMd);
	const paceCompound = parseFrontmatter<CommandFrontmatter>(paceCompoundMd);
	const paceStatus = parseFrontmatter<CommandFrontmatter>(paceStatusMd);
	const paceComplete = parseFrontmatter<CommandFrontmatter>(paceCompleteMd);

	return {
		// ========================================================================
		// Configuration Hook - Add custom agents and commands
		// ========================================================================
		config: async (opencodeConfig) => {
			if (!opencodeConfig.agent) opencodeConfig.agent = {};
			if (!opencodeConfig.command) opencodeConfig.command = {};

			// Register Coding Agent
			if (isAgentEnabled(config, 'pace-coding')) {
				opencodeConfig.agent['pace-coding'] = {
					name: 'pace-coding',
					description: codingAgent.frontmatter.description || 'Implements features following pace workflow',
					model: getAgentModel(config, 'pace-coding'),
					prompt: codingAgent.content,
					mode: (codingAgent.frontmatter.mode as 'subagent') || 'subagent',
					tools: codingAgent.frontmatter.tools
				};
			}

			// Register Coordinator Agent
			if (isAgentEnabled(config, 'pace-coordinator')) {
				opencodeConfig.agent['pace-coordinator'] = {
					name: 'pace-coordinator',
					description:
						coordinatorAgent.frontmatter.description || 'Orchestrates multiple coding sessions',
					model: getAgentModel(config, 'pace-coordinator'),
					prompt: coordinatorAgent.content,
					mode: (coordinatorAgent.frontmatter.mode as 'subagent') || 'subagent'
				};
			}

			// Register Initializer Agent
			if (isAgentEnabled(config, 'pace-initializer')) {
				opencodeConfig.agent['pace-initializer'] = {
					name: 'pace-initializer',
					description:
						initializerAgent.frontmatter.description ||
						'Sets up pace project structure',
					model: getAgentModel(config, 'pace-initializer'),
					prompt: initializerAgent.content,
					mode: (initializerAgent.frontmatter.mode as 'subagent') || 'subagent'
				};
			}

			// Register Code Reviewer Agent
			if (isAgentEnabled(config, 'pace-code-reviewer')) {
				opencodeConfig.agent['pace-code-reviewer'] = {
					name: 'pace-code-reviewer',
					description: codeReviewer.frontmatter.description || 'Reviews code for quality',
					model: getAgentModel(config, 'pace-code-reviewer'),
					prompt: codeReviewer.content,
					mode: (codeReviewer.frontmatter.mode as 'subagent') || 'subagent',
					tools: codeReviewer.frontmatter.tools
				};
			}

			// Register Practices Reviewer Agent
			if (isAgentEnabled(config, 'pace-practices-reviewer')) {
				opencodeConfig.agent['pace-practices-reviewer'] = {
					name: 'pace-practices-reviewer',
					description:
						practicesReviewer.frontmatter.description || 'Reviews code and captures patterns',
					model: getAgentModel(config, 'pace-practices-reviewer'),
					prompt: practicesReviewer.content,
					mode: (practicesReviewer.frontmatter.mode as 'subagent') || 'subagent',
					tools: practicesReviewer.frontmatter.tools
				};
			}

			// Register Commands
			if (isCommandEnabled(config, 'pace-init')) {
				opencodeConfig.command['pace-init'] = {
					template: paceInit.content,
					description: paceInit.frontmatter.description || 'Initialize a pace project',
					agent: getCommandAgent(config, 'pace-init') || paceInit.frontmatter.agent || 'pace-initializer',
					subtask: paceInit.frontmatter.subtask
				};
			}

			if (isCommandEnabled(config, 'pace-next')) {
				opencodeConfig.command['pace-next'] = {
					template: paceNext.content,
					description: paceNext.frontmatter.description || 'Implement next feature',
					agent: getCommandAgent(config, 'pace-next') || paceNext.frontmatter.agent || 'pace-coding',
					subtask: paceNext.frontmatter.subtask
				};
			}

			if (isCommandEnabled(config, 'pace-continue')) {
				opencodeConfig.command['pace-continue'] = {
					template: paceContinue.content,
					description: paceContinue.frontmatter.description || 'Continue work on project',
					agent: getCommandAgent(config, 'pace-continue') || paceContinue.frontmatter.agent || 'pace-coding',
					subtask: paceContinue.frontmatter.subtask
				};
			}

			if (isCommandEnabled(config, 'pace-coordinate')) {
				opencodeConfig.command['pace-coordinate'] = {
					template: paceCoordinate.content,
					description: paceCoordinate.frontmatter.description || 'Run continuous sessions',
					agent: getCommandAgent(config, 'pace-coordinate') || paceCoordinate.frontmatter.agent || 'pace-coordinator',
					subtask: paceCoordinate.frontmatter.subtask
				};
			}

			if (isCommandEnabled(config, 'pace-review')) {
				opencodeConfig.command['pace-review'] = {
					template: paceReview.content,
					description: paceReview.frontmatter.description || 'Review code changes',
					agent: getCommandAgent(config, 'pace-review') || paceReview.frontmatter.agent || 'pace-code-reviewer',
					subtask: paceReview.frontmatter.subtask
				};
			}

			if (isCommandEnabled(config, 'pace-compound')) {
				opencodeConfig.command['pace-compound'] = {
					template: paceCompound.content,
					description: paceCompound.frontmatter.description || 'Capture learnings',
					agent: getCommandAgent(config, 'pace-compound') || paceCompound.frontmatter.agent || 'pace-practices-reviewer',
					subtask: paceCompound.frontmatter.subtask
				};
			}

			if (isCommandEnabled(config, 'pace-status')) {
				opencodeConfig.command['pace-status'] = {
					template: paceStatus.content,
					description: paceStatus.frontmatter.description || 'Show project status'
				};
			}

			if (isCommandEnabled(config, 'pace-complete')) {
				opencodeConfig.command['pace-complete'] = {
					template: paceComplete.content,
					description: paceComplete.frontmatter.description || 'Mark feature complete'
				};
			}

			// Configure permissions
			if (config.permissions?.autoAllowEdit || config.permissions?.autoAllowSafeBash) {
				if (!opencodeConfig.permission) opencodeConfig.permission = {};

				if (config.permissions.autoAllowEdit) {
					opencodeConfig.permission.edit = 'allow' as const;
				}

				if (config.permissions.autoAllowSafeBash && config.permissions.allowedBashPatterns) {
					opencodeConfig.permission.bash = {
						'*': 'ask' as const
					};
					for (const pattern of config.permissions.allowedBashPatterns) {
						(opencodeConfig.permission.bash as Record<string, string>)[pattern] = 'allow';
					}
				}
			}
		},

		// ========================================================================
		// Custom Tools for Workflow Management
		// ========================================================================
		tool: {
			pace_get_status: tool({
				description:
					'Get the current status of the pace workflow including feature progress, passing/failing counts, and next recommended feature.',
				args: {},
				async execute() {
					const [passing, total] = await featureManager.getProgress();
					const next = await featureManager.getNextFeature();
					const stats = await featureManager.getStats();
					const data = await featureManager.load();

					// Convert byCategory stats to simpler format
					const byCategory: Record<string, { passing: number; total: number }> = {};
					for (const [cat, catStats] of Object.entries(stats.byCategory)) {
						byCategory[cat] = {
							passing: catStats.passing,
							total: catStats.passing + catStats.failing
						};
					}

					const percentage = total > 0 ? (passing / total) * 100 : 0;

					return JSON.stringify(
						{
							progress: {
								passing,
								total,
								percentage: percentage.toFixed(1) + '%',
								remaining: total - passing
							},
							nextFeature: next
								? {
										id: next.id,
										description: next.description,
										priority: next.priority,
										category: next.category,
										steps: next.steps
									}
								: null,
							byCategory,
							projectName: data.metadata?.project_name || 'Unknown'
						},
						null,
						2
					);
				}
			}),

			pace_get_next_feature: tool({
				description:
					'Get the next highest-priority failing feature to work on. Returns the feature details including ID, description, steps, and priority.',
				args: {},
				async execute() {
					const next = await featureManager.getNextFeature();

					if (!next) {
						return 'All features are passing! Project complete.';
					}

					return JSON.stringify(
						{
							id: next.id,
							description: next.description,
							priority: next.priority,
							category: next.category,
							steps: next.steps,
							tags: next.tags || []
						},
						null,
						2
					);
				}
			}),

			pace_get_feature: tool({
				description: 'Get detailed information about a specific feature by ID.',
				args: {
					feature_id: tool.schema.string().describe('The feature ID (e.g., F001)')
				},
				async execute(args) {
					const feature = await featureManager.findFeature(args.feature_id);

					if (!feature) {
						const data = await featureManager.load();
						return `Feature '${args.feature_id}' not found. Available features: ${data.features.map((f) => f.id).join(', ')}`;
					}

					return JSON.stringify(
						{
							id: feature.id,
							description: feature.description,
							priority: feature.priority,
							category: feature.category,
							steps: feature.steps,
							passes: feature.passes,
							tags: feature.tags || []
						},
						null,
						2
					);
				}
			}),

			pace_update_feature: tool({
				description:
					'Update a feature status to passing or failing. Only use this after thoroughly testing the feature end-to-end.',
				args: {
					feature_id: tool.schema.string().describe('The feature ID (e.g., F001)'),
					passes: tool.schema
						.boolean()
						.describe('Whether the feature is now passing (true) or failing (false)')
				},
				async execute(args) {
					const feature = await featureManager.findFeature(args.feature_id);

					if (!feature) {
						return `Error: Feature '${args.feature_id}' not found.`;
					}

					const oldStatus = feature.passes ? 'passing' : 'failing';
					const newStatus = args.passes ? 'passing' : 'failing';

					if (feature.passes === args.passes) {
						return `Feature '${args.feature_id}' is already ${oldStatus}. No change made.`;
					}

					const success = await featureManager.updateFeatureStatus(args.feature_id, args.passes);

					if (success) {
						const [passing, total] = await featureManager.getProgress();
						const percentage = total > 0 ? (passing / total) * 100 : 0;
						return `Successfully updated feature '${args.feature_id}' from ${oldStatus} to ${newStatus}.

Current progress: ${passing}/${total} features passing (${percentage.toFixed(1)}%)
Backup saved to feature_list.json.bak`;
					} else {
						return `Failed to update feature '${args.feature_id}'.`;
					}
				}
			}),

			pace_list_failing: tool({
				description: 'List all features that are currently failing, sorted by priority.',
				args: {
					limit: tool.schema.number().optional().describe('Maximum number of features to return (default: 10)')
				},
				async execute(args) {
					const allFailing = await featureManager.getFailingFeatures();
					const limited = allFailing.slice(0, args.limit || 10);

					if (limited.length === 0) {
						return 'All features are passing!';
					}

					return JSON.stringify(
						{
							count: limited.length,
							totalFailing: allFailing.length,
							features: limited.map((f) => ({
								id: f.id,
								description: f.description.slice(0, 60) + (f.description.length > 60 ? '...' : ''),
								priority: f.priority,
								category: f.category
							}))
						},
						null,
						2
					);
				}
			}),

			pace_spawn_session: tool({
				description:
					'Spawn a child session to implement a specific feature. The child session will use the coding agent and return when complete.',
				args: {
					feature_id: tool.schema.string().describe('The feature ID to implement (e.g., F001)'),
					wait_for_completion: tool.schema
						.boolean()
						.optional()
						.describe('Whether to wait for the session to complete (default: true)')
				},
				async execute(args, context) {
					const feature = await featureManager.findFeature(args.feature_id);

					if (!feature) {
						return `Error: Feature '${args.feature_id}' not found.`;
					}

					if (feature.passes) {
						return `Feature '${args.feature_id}' is already passing. No session needed.`;
					}

					// Create a child session for this feature
					const sessionResult = await client.session.create({
						body: {
							title: `Pace: ${feature.id} - ${feature.description.slice(0, 40)}`,
							parentID: context.sessionID
						}
					});

					if (sessionResult.error) {
						return `Failed to create child session: ${JSON.stringify(sessionResult.error)}`;
					}

					const session = sessionResult.data;
					const state: ChildSessionState = {
						sessionId: session.id,
						featureId: args.feature_id,
						startTime: Date.now(),
						toolCalls: 0,
						status: 'running'
					};
					childSessions.set(session.id, state);

					// Build the prompt for the coding agent
					const [passing, total] = await featureManager.getProgress();
					const prompt = `Implement feature ${feature.id}: ${feature.description}

Feature Details:
- ID: ${feature.id}
- Category: ${feature.category}
- Priority: ${feature.priority}
- Steps to verify:
${feature.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

Current Progress: ${passing}/${total} features passing

Follow the coding agent workflow exactly:
1. Orient (pwd, read progress file, git log, feature list)
2. Start environment (./init.sh)
3. Sanity test existing functionality
4. Implement this feature completely
5. Test end-to-end as a user would
6. Update feature_list.json (only the passes field)
7. Commit changes
8. Update progress file

Begin now.`;

					// Send the prompt to the child session
					const promptResult = await client.session.prompt({
						path: { id: session.id },
						body: {
							parts: [{ type: 'text', text: prompt }],
							agent: 'pace-coding'
						}
					});

					if (promptResult.error) {
						childSessions.delete(session.id);
						return `Failed to start child session: ${JSON.stringify(promptResult.error)}`;
					}

					if (args.wait_for_completion === false) {
						return `Child session started for feature ${args.feature_id}. Session ID: ${session.id}`;
					}

					// Wait for completion by subscribing to events
					const events = await client.event.subscribe();
					let completed = false;
					let success = false;

					try {
						for await (const event of events.stream) {
							const eventSessionId =
								event.properties?.sessionID ||
								event.properties?.part?.sessionID ||
								event.properties?.info?.id;

							if (eventSessionId !== session.id) continue;

							if (event.type === 'message.part.updated') {
								const part = event.properties?.part;
								if (part?.type === 'tool') {
									state.toolCalls++;
								}
							} else if (event.type === 'session.idle') {
								completed = true;
								state.status = 'completed';
								success = true;
								break;
							} else if (event.type === 'session.error') {
								completed = true;
								state.status = 'failed';
								success = false;
								break;
							}
						}
					} catch (error) {
						state.status = 'failed';
					}

					const duration = ((Date.now() - state.startTime) / 1000).toFixed(1);

					// Check if feature was actually marked as passing
					const updatedData = await featureManager.load();
					const updatedFeature = updatedData.features.find((f) => f.id === args.feature_id);
					const featureNowPassing = updatedFeature?.passes === true;

					childSessions.delete(session.id);

					return JSON.stringify(
						{
							sessionId: session.id,
							featureId: args.feature_id,
							status: state.status,
							duration: `${duration}s`,
							toolCalls: state.toolCalls,
							featureNowPassing,
							message: featureNowPassing
								? `Feature ${args.feature_id} successfully implemented and marked as passing.`
								: success
									? `Session completed but feature not marked as passing. Manual verification may be needed.`
									: `Session failed. Check logs for details.`
						},
						null,
						2
					);
				}
			}),

			pace_orchestrate: tool({
				description:
					'Run the full pace orchestration loop, spawning child sessions for each failing feature until complete or a stopping condition is met.',
				args: {
					max_sessions: tool.schema
						.number()
						.optional()
						.describe('Maximum number of sessions to run (default: unlimited)'),
					max_failures: tool.schema
						.number()
						.optional()
						.describe('Stop after N consecutive failures (default: 3)')
				},
				async execute(args, context) {
					const maxSessions = args.max_sessions ?? config.orchestrator?.maxSessions;
					const maxFailures = args.max_failures ?? config.orchestrator?.maxFailures ?? 3;
					const sessionDelay = config.orchestrator?.sessionDelay ?? 3000;

					let sessionCount = 0;
					let consecutiveFailures = 0;
					let featuresCompleted = 0;
					const startTime = Date.now();
					const results: Array<{ featureId: string; success: boolean; duration: string }> = [];

					const [initialPassing, initialTotal] = await featureManager.getProgress();

					// Main orchestration loop
					while (true) {
						// Check stopping conditions
						if (maxSessions && sessionCount >= maxSessions) {
							break;
						}

						if (consecutiveFailures >= maxFailures) {
							break;
						}

						const [passing, total] = await featureManager.getProgress();
						if (passing === total && total > 0) {
							break;
						}

						const nextFeature = await featureManager.getNextFeature();
						if (!nextFeature) {
							break;
						}

						sessionCount++;
						const sessionStart = Date.now();

						// Create and run child session
						const sessionResult = await client.session.create({
							body: {
								title: `Pace: ${nextFeature.id} - ${nextFeature.description.slice(0, 40)}`,
								parentID: context.sessionID
							}
						});

						if (sessionResult.error) {
							consecutiveFailures++;
							results.push({
								featureId: nextFeature.id,
								success: false,
								duration: '0s'
							});
							continue;
						}

						const session = sessionResult.data;

						// Build prompt
						const prompt = `Implement feature ${nextFeature.id}: ${nextFeature.description}

Feature Details:
- ID: ${nextFeature.id}
- Category: ${nextFeature.category}
- Priority: ${nextFeature.priority}
- Steps: ${nextFeature.steps.join(', ')}

Follow the coding agent workflow. Begin now.`;

						await client.session.prompt({
							path: { id: session.id },
							body: {
								parts: [{ type: 'text', text: prompt }],
								agent: 'pace-coding'
							}
						});

						// Wait for completion
						const events = await client.event.subscribe();
						let completed = false;

						try {
							for await (const event of events.stream) {
								const eventSessionId =
									event.properties?.sessionID ||
									event.properties?.part?.sessionID ||
									event.properties?.info?.id;

								if (eventSessionId !== session.id) continue;

								if (event.type === 'session.idle' || event.type === 'session.error') {
									completed = true;
									break;
								}
							}
						} catch {
							completed = true;
						}

						const sessionDuration = ((Date.now() - sessionStart) / 1000).toFixed(1);

						// Check if feature was marked as passing
						const updatedData = await featureManager.load();
						const feature = updatedData.features.find((f) => f.id === nextFeature.id);
						const success = feature?.passes === true;

						results.push({
							featureId: nextFeature.id,
							success,
							duration: `${sessionDuration}s`
						});

						if (success) {
							featuresCompleted++;
							consecutiveFailures = 0;
						} else {
							consecutiveFailures++;
						}

						// Delay before next session
						if (sessionDelay > 0) {
							await new Promise((resolve) => setTimeout(resolve, sessionDelay));
						}
					}

					const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
					const [finalPassing, finalTotal] = await featureManager.getProgress();

					return JSON.stringify(
						{
							summary: {
								sessionsRun: sessionCount,
								featuresCompleted,
								initialProgress: `${initialPassing}/${initialTotal}`,
								finalProgress: `${finalPassing}/${finalTotal}`,
								duration: `${totalDuration}s`,
								complete: finalPassing === finalTotal
							},
							sessions: results
						},
						null,
						2
					);
				}
			})
		},

		// ========================================================================
		// Event Hook - Track session progress
		// ========================================================================
		event: async ({ event }) => {
			// Track tool usage per child session
			if (event.type === 'message.part.updated') {
				const part = event.properties?.part;
				if (part?.type === 'tool' && part.sessionID) {
					const state = childSessions.get(part.sessionID);
					if (state) {
						state.toolCalls++;
					}
				}
			}

			// Log child session completion
			if (event.type === 'session.idle') {
				const sessionId = event.properties?.id;
				if (sessionId && childSessions.has(sessionId)) {
					const state = childSessions.get(sessionId)!;
					const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
					console.log(
						`[pace] Child session for ${state.featureId} completed in ${elapsed}s (${state.toolCalls} tool calls)`
					);
				}
			}
		},

		// ========================================================================
		// Permission Hook - Auto-allow safe operations
		// ========================================================================
		'permission.ask': async (input, output) => {
			if (!config.permissions) return;

			// Auto-allow reading most files (except secrets)
			if (config.permissions.autoAllowEdit && input.type === 'read') {
				const path = input.metadata?.filePath || '';
				if (!path.includes('.env') && !path.includes('secret') && !path.includes('credential')) {
					output.status = 'allow';
				}
			}

			// Auto-allow configured bash patterns
			if (config.permissions.autoAllowSafeBash && input.type === 'bash') {
				const cmd = input.metadata?.command || '';

				for (const pattern of config.permissions.allowedBashPatterns || []) {
					// Simple glob matching
					const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
					if (regex.test(cmd)) {
						output.status = 'allow';
						break;
					}
				}
			}
		}
	};
};

// Default export for plugin loading
export default PacePlugin;
