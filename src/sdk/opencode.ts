/**
 * sdk/opencode.ts - Enhanced OpenCode SDK implementation
 *
 * This implementation leverages the OpenCode SDK's full capabilities:
 * - Embedded server with createOpencode()
 * - Event streaming for real-time monitoring
 * - Rich session management with metrics
 * - Support for the pace workflow patterns
 *
 * For full plugin-based workflow, see pace-plugin.ts
 */

import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk';
import type { AgentSessionParams, AgentRunResult } from '../types';
import type { AgentSessionRunner } from './base';

export interface OpencodeSDKOptions {
	baseUrl?: string;
	port?: number;
	model?: string;
	provider?: string;
	verbose?: boolean;
	useEmbeddedServer?: boolean;
}

interface SessionMetrics {
	toolCalls: number;
	textParts: number;
	errors: number;
	warnings: number;
}

/**
 * Enhanced OpenCode SDK runner with full event streaming support
 */
export class OpencodeSessionRunner implements AgentSessionRunner {
	private options: OpencodeSDKOptions;
	private embeddedServer: Awaited<ReturnType<typeof createOpencode>> | null = null;

	constructor(options?: OpencodeSDKOptions) {
		this.options = {
			baseUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:4096',
			verbose: false,
			useEmbeddedServer: false,
			...options
		};
	}

	/**
	 * Get or create a client, optionally with embedded server
	 */
	private async getClient(): Promise<ReturnType<typeof createOpencodeClient>> {
		if (this.options.useEmbeddedServer) {
			if (!this.embeddedServer) {
				this.embeddedServer = await createOpencode({
					port: this.options.port ?? 0
				});
				console.log(`Started embedded OpenCode server at ${this.embeddedServer.server.url}`);
			}
			return this.embeddedServer.client;
		}

		return createOpencodeClient({
			baseUrl: this.options.baseUrl
		});
	}

	/**
	 * Clean up embedded server if used
	 */
	async cleanup(): Promise<void> {
		if (this.embeddedServer) {
			await this.embeddedServer.server.kill();
			this.embeddedServer = null;
		}
	}

	/**
	 * Log message if verbose mode is enabled
	 */
	private log(message: string): void {
		if (this.options.verbose) {
			console.log(message);
		}
	}

	async runSession(params: AgentSessionParams): Promise<AgentRunResult> {
		console.log('\nStarting OpenCode SDK session...\n');
		console.log(`Feature: ${params.featureId || 'General'}`);
		console.log('='.repeat(60));

		const startTime = Date.now();
		const metrics: SessionMetrics = {
			toolCalls: 0,
			textParts: 0,
			errors: 0,
			warnings: 0
		};

		try {
			const client = await this.getClient();

			// Create session with feature info
			this.log('Creating session...');
			const sessionResult = await client.session.create({
				body: {
					title: params.featureId
						? `Feature: ${params.featureId}`
						: `Coding Session ${new Date().toISOString()}`
				}
			});

			if (sessionResult.error) {
				throw new Error(`Failed to create session: ${JSON.stringify(sessionResult.error)}`);
			}

			const session = sessionResult.data;
			console.log(`Session: ${session.id}`);

			// Send the prompt
			this.log('\nSending prompt...');
			const promptResult = await client.session.prompt({
				path: { id: session.id },
				body: {
					parts: [{ type: 'text', text: params.prompt }]
				}
			});

			if (promptResult.error) {
				throw new Error(`Failed to send prompt: ${JSON.stringify(promptResult.error)}`);
			}

			console.log('Agent working...\n');

			// Subscribe to events
			const events = await client.event.subscribe();
			let success = false;
			let completed = false;

			for await (const event of events.stream) {
				// Filter for this session
				const eventSessionId =
					event.properties?.sessionID ||
					event.properties?.part?.sessionID ||
					event.properties?.info?.id;

				if (eventSessionId !== session.id) continue;

				// Process events
				switch (event.type) {
					case 'message.part.updated':
						const part = event.properties?.part;
						if (part?.type === 'tool') {
							metrics.toolCalls++;
							if (part.state?.status === 'running') {
								console.log(`  🔧 ${part.tool}...`);
							} else if (part.state?.status === 'completed') {
								const title = part.state.title || 'done';
								console.log(`  ✓ ${part.tool}: ${title.slice(0, 50)}`);
							} else if (part.state?.status === 'error') {
								metrics.errors++;
								console.log(`  ✗ ${part.tool}: error`);
							}
						} else if (part?.type === 'text') {
							metrics.textParts++;
							// Show periodic progress
							if (metrics.textParts % 10 === 0) {
								this.log(`  [Text output ${metrics.textParts}...]`);
							}
						}
						break;

					case 'session.idle':
						completed = true;
						success = true;
						console.log('\n✅ Session completed successfully');
						break;

					case 'session.error':
						completed = true;
						success = false;
						metrics.errors++;
						console.log('\n❌ Session encountered an error');
						break;

					case 'todo.updated':
						const todo = event.properties?.info;
						if (todo) {
							this.log(`  📋 Todo: ${todo.content} (${todo.status})`);
						}
						break;
				}

				if (completed) break;
			}

			const duration = Date.now() - startTime;

			// Get final session messages for response extraction
			let response: string | undefined;
			try {
				const messages = await client.session.messages({
					path: { id: session.id }
				});

				if (messages.data) {
					// Get last assistant message
					const lastAssistant = messages.data
						.filter((m) => m.info?.role === 'assistant')
						.pop();

					if (lastAssistant?.parts) {
						response = lastAssistant.parts
							.filter((p) => p.type === 'text')
							.map((p) => (p as any).text)
							.join('\n');
					}
				}
			} catch {
				this.log('Could not fetch final messages');
			}

			// Summary
			console.log('\n' + '='.repeat(60));
			console.log('Session Summary');
			console.log('='.repeat(60));
			console.log(`Status: ${success ? 'success' : 'failed'}`);
			console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
			console.log(`Tool calls: ${metrics.toolCalls}`);
			console.log(`Text outputs: ${metrics.textParts}`);
			if (metrics.errors > 0) {
				console.log(`Errors: ${metrics.errors}`);
			}
			console.log('='.repeat(60));

			return {
				success,
				duration,
				turns: metrics.toolCalls + metrics.textParts
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			console.error(`\n❌ Error during OpenCode session: ${error}`);
			return { success: false, duration };
		}
	}
}

/**
 * Create an OpenCode runner with embedded server
 * Best for standalone/automation use cases
 */
export function createEmbeddedRunner(options?: Partial<OpencodeSDKOptions>): OpencodeSessionRunner {
	return new OpencodeSessionRunner({
		useEmbeddedServer: true,
		verbose: true,
		...options
	});
}

/**
 * Create an OpenCode runner connecting to existing server
 * Best for integration with running OpenCode instance
 */
export function createClientRunner(baseUrl?: string): OpencodeSessionRunner {
	return new OpencodeSessionRunner({
		baseUrl: baseUrl || process.env.OPENCODE_SERVER_URL || 'http://localhost:4096',
		useEmbeddedServer: false
	});
}
