/**
 * sdk/opencode.ts - OpenCode SDK implementation
 */

import { createOpencodeClient } from '@opencode-ai/sdk';
import type { AgentSessionRunner, AgentSessionParams, AgentRunResult } from '../types';

export interface OpencodeSDKOptions {
	baseUrl?: string;
	model?: string;
	provider?: string;
}

/**
 * OpenCode SDK runner
 */
export class OpencodeSessionRunner implements AgentSessionRunner {
	private options: OpencodeSDKOptions;

	constructor(options?: OpencodeSDKOptions) {
		this.options = {
			baseUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:4096',
			...options
		};
	}

	async runSession(params: AgentSessionParams): Promise<AgentRunResult> {
		console.log('\nStarting OpenCode SDK session...\n');
		console.log(`Invoking OpenCode SDK for feature ${params.featureId}\n`);
		console.log('-'.repeat(60));
		console.log(params.prompt);
		console.log('-'.repeat(60) + '\n');

		const startTime = Date.now();

		try {
			const client = createOpencodeClient({
				baseUrl: this.options.baseUrl
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

			const duration = Date.now() - startTime;

			console.log('\n' + '='.repeat(60));
			console.log('🎯 Session Result');
			console.log('='.repeat(60));
			console.log(`Status: ${success ? 'success' : 'failed'}`);
			console.log(`Completed: ${completed}`);
			console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
			console.log('='.repeat(60));

			return { success, duration };
		} catch (error) {
			console.error(`\n❌ Error during OpenCode session: ${error}`);
			return { success: false, duration: Date.now() - startTime };
		}
	}
}
