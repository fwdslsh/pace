/**
 * sdk/claude.ts - Claude Agent SDK implementation
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionMode, SDKResultMessage, SettingSource } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSessionRunner, AgentSessionParams, AgentRunResult } from '../types';

export interface ClaudeSDKOptions {
	model?: string;
	permissionMode?: PermissionMode;
	settingSources?: SettingSource[];
	includePartialMessages?: boolean;
	stderr?: (s: string) => void;
	systemPrompt?: {
		type: string;
		preset: string;
	};
}

/**
 * Claude Agent SDK runner
 */
export class ClaudeSessionRunner implements AgentSessionRunner {
	private defaultOptions: ClaudeSDKOptions;

	constructor(options?: ClaudeSDKOptions) {
		this.defaultOptions = {
			systemPrompt: {
				type: 'preset',
				preset: 'claude_code'
			},
			stderr: (s: string) => console.error(`[Agent STDERR] ${s}`),
			model: 'claude-opus-4-5-20251101',
			settingSources: ['user', 'project'] as SettingSource[],
			permissionMode: 'bypassPermissions' as PermissionMode,
			includePartialMessages: false,
			...options
		};
	}

	async runSession(params: AgentSessionParams): Promise<AgentRunResult> {
		console.log('\nStarting Claude Agent SDK session...\n');
		console.log(`Invoking Claude Agent SDK for feature ${params.featureId}\n`);
		console.log('-'.repeat(60));
		console.log(params.prompt);
		console.log('-'.repeat(60) + '\n');

		try {
			// Build query options with optional homeDir override
			const queryOptions: any = {
				...this.defaultOptions,
				cwd: params.projectDir
			};

			// If homeDir is specified, set it for Claude Agent SDK
			// This allows overriding ~/.claude directory
			if (params.homeDir) {
				queryOptions.homeDir = params.homeDir;
			}

			const agentQuery = query({
				prompt: params.prompt,
				options: queryOptions
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

			return {
				success: resultMessage?.subtype === 'success',
				duration: resultMessage?.duration_ms,
				turns: resultMessage?.num_turns,
				cost: resultMessage?.total_cost_usd
			};
		} catch (error) {
			console.error(`\n❌ Error during agent session: ${error}`);
			return { success: false };
		}
	}
}
