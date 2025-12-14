/**
 * sdk/base.ts - Base interface for agent SDK implementations
 */

import type { AgentSessionParams, AgentRunResult } from '../types';

/**
 * Base interface that all SDK runners must implement
 */
export interface AgentSessionRunner {
	/**
	 * Run an agent session with the given parameters
	 * @param params Session parameters including prompt and project directory
	 * @returns Result indicating success/failure and optional metadata
	 */
	runSession(params: AgentSessionParams): Promise<AgentRunResult>;
}
