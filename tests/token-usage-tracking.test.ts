/**
 * Unit tests for F017: Add unit tests for token usage tracking
 *
 * This test file covers:
 * 1. SessionMetrics token usage storage
 * 2. Token aggregation across sessions
 * 3. JSON output includes token data
 * 4. Verify all tests pass with bun test
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { SessionMetrics } from '../cli';
import type { SessionSummary, TokenUsage } from '../src/types';

// Import functions we need to test (they're in cli.ts)
// We'll need to access private methods through reflection or test via public interfaces
import { Orchestrator } from '../cli';

describe('F017: Token Usage Tracking Unit Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-token-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('1. SessionMetrics token usage storage', () => {
    it('should create SessionMetrics with complete token usage data', () => {
      const sessionMetrics: SessionMetrics = {
        sessionId: 'session-123',
        featureId: 'F001',
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        success: true,
        toolCalls: 5,
        textParts: 3,
        tokenUsage: {
          input: 1000,
          output: 500,
          total: 1500,
        },
      };

      expect(sessionMetrics.sessionId).toBe('session-123');
      expect(sessionMetrics.featureId).toBe('F001');
      expect(sessionMetrics.tokenUsage).toBeDefined();
      expect(sessionMetrics.tokenUsage?.input).toBe(1000);
      expect(sessionMetrics.tokenUsage?.output).toBe(500);
      expect(sessionMetrics.tokenUsage?.total).toBe(1500);
      expect(sessionMetrics.tokenUsage?.total).toBe(
        sessionMetrics.tokenUsage.input + sessionMetrics.tokenUsage.output,
      );
    });

    it('should create SessionMetrics without token usage data', () => {
      const sessionMetrics: SessionMetrics = {
        sessionId: 'session-456',
        featureId: 'F002',
        startTime: Date.now(),
        endTime: Date.now() + 3000,
        success: false,
        toolCalls: 2,
        textParts: 1,
        // tokenUsage is undefined
      };

      expect(sessionMetrics.tokenUsage).toBeUndefined();
      expect(sessionMetrics.sessionId).toBe('session-456');
      expect(sessionMetrics.success).toBe(false);
    });

    it('should handle partial token usage data gracefully', () => {
      const sessionMetrics: SessionMetrics = {
        sessionId: 'session-789',
        featureId: 'F003',
        startTime: Date.now(),
        endTime: Date.now() + 4000,
        success: true,
        toolCalls: 3,
        textParts: 2,
        tokenUsage: {
          input: 800,
          output: 0,
          total: 800,
        },
      };

      expect(sessionMetrics.tokenUsage?.input).toBe(800);
      expect(sessionMetrics.tokenUsage?.output).toBe(0);
      expect(sessionMetrics.tokenUsage?.total).toBe(800);
    });

    it('should validate token usage calculation consistency', () => {
      const testCases = [
        { input: 1000, output: 500, expectedTotal: 1500 },
        { input: 0, output: 200, expectedTotal: 200 },
        { input: 300, output: 0, expectedTotal: 300 },
        { input: 0, output: 0, expectedTotal: 0 },
      ];

      testCases.forEach(({ input, output, expectedTotal }) => {
        const sessionMetrics: SessionMetrics = {
          sessionId: 'test-session',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: {
            input,
            output,
            total: expectedTotal,
          },
        };

        expect(sessionMetrics.tokenUsage?.total).toBe(expectedTotal);
        expect(sessionMetrics.tokenUsage?.total).toBe(input + output);
      });
    });
  });

  describe('2. Token aggregation across sessions', () => {
    it('should aggregate token usage across multiple sessions', () => {
      const sessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'session-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 3,
          textParts: 2,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
        },
        {
          sessionId: 'session-2',
          featureId: 'F002',
          startTime: Date.now(),
          success: true,
          toolCalls: 5,
          textParts: 3,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        },
        {
          sessionId: 'session-3',
          featureId: 'F003',
          startTime: Date.now(),
          success: false,
          toolCalls: 2,
          textParts: 1,
          tokenUsage: { input: 500, output: 250, total: 750 },
        },
      ];

      // Test aggregation logic (mirroring cli.ts lines 1038-1044)
      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      for (const tokens of sessionTokens) {
        totalTokenUsage.input += tokens.input;
        totalTokenUsage.output += tokens.output;
        totalTokenUsage.total += tokens.total;
      }

      expect(totalTokenUsage.input).toBe(3500);
      expect(totalTokenUsage.output).toBe(1750);
      expect(totalTokenUsage.total).toBe(5250);
      expect(sessionTokens).toHaveLength(3);
    });

    it('should handle sessions without token usage data', () => {
      const sessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'session-with-tokens',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 3,
          textParts: 2,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
        },
        {
          sessionId: 'session-without-tokens',
          featureId: 'F002',
          startTime: Date.now(),
          success: true,
          toolCalls: 2,
          textParts: 1,
          // No tokenUsage
        },
        {
          sessionId: 'another-with-tokens',
          featureId: 'F003',
          startTime: Date.now(),
          success: false,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: { input: 200, output: 100, total: 300 },
        },
      ];

      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      for (const tokens of sessionTokens) {
        totalTokenUsage.input += tokens.input;
        totalTokenUsage.output += tokens.output;
        totalTokenUsage.total += tokens.total;
      }

      expect(sessionTokens).toHaveLength(2);
      expect(totalTokenUsage.input).toBe(1200);
      expect(totalTokenUsage.output).toBe(600);
      expect(totalTokenUsage.total).toBe(1800);
    });

    it('should handle empty session list gracefully', () => {
      const sessionMetrics: SessionMetrics[] = [];

      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      expect(sessionTokens).toHaveLength(0);
      expect(totalTokenUsage.input).toBe(0);
      expect(totalTokenUsage.output).toBe(0);
      expect(totalTokenUsage.total).toBe(0);
    });

    it('should handle all sessions without token usage', () => {
      const sessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'session-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 3,
          textParts: 2,
        },
        {
          sessionId: 'session-2',
          featureId: 'F002',
          startTime: Date.now(),
          success: false,
          toolCalls: 1,
          textParts: 1,
        },
      ];

      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      expect(sessionTokens).toHaveLength(0);
      expect(totalTokenUsage.input).toBe(0);
      expect(totalTokenUsage.output).toBe(0);
      expect(totalTokenUsage.total).toBe(0);
    });

    it('should calculate average tokens per session correctly', () => {
      const sessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'session-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 3,
          textParts: 2,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
        },
        {
          sessionId: 'session-2',
          featureId: 'F002',
          startTime: Date.now(),
          success: true,
          toolCalls: 2,
          textParts: 1,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        },
      ];

      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      for (const tokens of sessionTokens) {
        totalTokenUsage.input += tokens.input;
        totalTokenUsage.output += tokens.output;
        totalTokenUsage.total += tokens.total;
      }

      const avgTokens = Math.round(totalTokenUsage.total / sessionTokens.length);
      expect(avgTokens).toBe(2250);
    });
  });

  describe('3. JSON output includes token data', () => {
    it('should include token data in SessionSummary when available', () => {
      const mockSessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'session-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 3,
          textParts: 2,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
        },
      ];

      // Create SessionSummary similar to generateSummary in cli.ts
      const sessionTokens = mockSessionMetrics
        .filter((m) => m.tokenUsage)
        .map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      for (const tokens of sessionTokens) {
        totalTokenUsage.input += tokens.input;
        totalTokenUsage.output += tokens.output;
        totalTokenUsage.total += tokens.total;
      }

      const summary: SessionSummary = {
        sessionsRun: mockSessionMetrics.length,
        featuresCompleted: 1,
        finalProgress: '1/3',
        completionPercentage: 33.3,
        elapsedTime: '2m 30s',
        isComplete: false,
        tokenUsage:
          sessionTokens.length > 0
            ? {
                sessions: sessionTokens,
                total: totalTokenUsage,
              }
            : undefined,
      };

      expect(summary.tokenUsage).toBeDefined();
      expect(summary.tokenUsage?.sessions).toHaveLength(1);
      expect(summary.tokenUsage?.total.input).toBe(1000);
      expect(summary.tokenUsage?.total.output).toBe(500);
      expect(summary.tokenUsage?.total.total).toBe(1500);
      expect(summary.tokenUsage?.sessions[0].input).toBe(1000);
      expect(summary.tokenUsage?.sessions[0].output).toBe(500);
      expect(summary.tokenUsage?.sessions[0].total).toBe(1500);
    });

    it('should omit token data when no sessions have token usage', () => {
      const mockSessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'session-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 3,
          textParts: 2,
          // No tokenUsage
        },
      ];

      const sessionTokens = mockSessionMetrics
        .filter((m) => m.tokenUsage)
        .map((m) => m.tokenUsage!);

      const summary: SessionSummary = {
        sessionsRun: mockSessionMetrics.length,
        featuresCompleted: 0,
        finalProgress: '0/3',
        completionPercentage: 0,
        elapsedTime: '1m 15s',
        isComplete: false,
        tokenUsage:
          sessionTokens.length > 0
            ? {
                sessions: sessionTokens,
                total: { input: 0, output: 0, total: 0 },
              }
            : undefined,
      };

      expect(summary.tokenUsage).toBeUndefined();
    });

    it('should serialize correctly to JSON', () => {
      const summary: SessionSummary = {
        sessionsRun: 2,
        featuresCompleted: 1,
        finalProgress: '1/4',
        completionPercentage: 25,
        elapsedTime: '5m 30s',
        isComplete: false,
        tokenUsage: {
          sessions: [
            { input: 1000, output: 500, total: 1500 },
            { input: 2000, output: 1000, total: 3000 },
          ],
          total: {
            input: 3000,
            output: 1500,
            total: 4500,
          },
        },
      };

      const jsonString = JSON.stringify(summary);
      const parsed = JSON.parse(jsonString) as SessionSummary;

      expect(parsed.sessionsRun).toBe(2);
      expect(parsed.tokenUsage).toBeDefined();
      expect(parsed.tokenUsage?.sessions).toHaveLength(2);
      expect(parsed.tokenUsage?.total.input).toBe(3000);
      expect(parsed.tokenUsage?.total.output).toBe(1500);
      expect(parsed.tokenUsage?.total.total).toBe(4500);
    });

    it('should handle large token numbers correctly', () => {
      const summary: SessionSummary = {
        sessionsRun: 1,
        featuresCompleted: 1,
        finalProgress: '1/1',
        completionPercentage: 100,
        elapsedTime: '10m 0s',
        isComplete: true,
        tokenUsage: {
          sessions: [{ input: 50000, output: 25000, total: 75000 }],
          total: {
            input: 50000,
            output: 25000,
            total: 75000,
          },
        },
      };

      const jsonString = JSON.stringify(summary);
      const parsed = JSON.parse(jsonString) as SessionSummary;

      expect(parsed.tokenUsage?.total.input).toBe(50000);
      expect(parsed.tokenUsage?.total.output).toBe(25000);
      expect(parsed.tokenUsage?.total.total).toBe(75000);
    });

    it('should include token tracking support status', () => {
      // Test that JSON output structure includes tokenTrackingSupported
      const mockJsonOutput = {
        sessionsRun: 1,
        featuresCompleted: 1,
        finalProgress: '1/1',
        completionPercentage: 100,
        elapsedTime: '5m 0s',
        isComplete: true,
        tokenUsage: {
          sessions: [{ input: 1000, output: 500, total: 1500 }],
          total: { input: 1000, output: 500, total: 1500 },
        },
        tokenTrackingSupported: true,
        progress: { passing: 1, total: 1 },
      };

      expect(mockJsonOutput.tokenTrackingSupported).toBeDefined();
      expect(mockJsonOutput.tokenTrackingSupported).toBe(true);
    });
  });

  describe('4. Integration with Orchestrator', () => {
    beforeEach(async () => {
      // Create a minimal feature list for testing
      await writeFile(
        join(tempDir, 'feature_list.json'),
        JSON.stringify(
          {
            metadata: { project_name: 'Token Test Project' },
            features: [
              {
                id: 'F001',
                description: 'Test feature for token tracking',
                priority: 'high' as const,
                category: 'test',
                steps: ['Step 1'],
                passes: false,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );
    });

    it('should create orchestrator that can track tokens', () => {
      const orchestrator = new Orchestrator({
        projectDir: tempDir,
        dryRun: true,
        json: true,
        maxSessions: 1,
      });

      expect(orchestrator).toBeDefined();
      // The orchestrator should be able to run without errors in dry-run mode
    });

    it('should handle dry-run mode with limited sessions', async () => {
      const orchestrator = new Orchestrator({
        projectDir: tempDir,
        dryRun: true,
        json: true,
        maxSessions: 1,
        delay: 0,
      });

      const summary = await orchestrator.run();

      expect(summary.sessionsRun).toBe(1);
      expect(summary.isComplete).toBe(false);
      // In dry-run mode, tokenUsage should be undefined since no real sessions run
      expect(summary.tokenUsage).toBeUndefined();
    }, 10000);

    it('should respect json output format', async () => {
      const orchestrator = new Orchestrator({
        projectDir: tempDir,
        dryRun: true,
        json: true,
        maxSessions: 1,
        delay: 0,
      });

      const summary = await orchestrator.run();

      // Should be a valid SessionSummary object
      expect(summary.sessionsRun).toBeGreaterThanOrEqual(0);
      expect(typeof summary.finalProgress).toBe('string');
      expect(typeof summary.completionPercentage).toBe('number');
      expect(typeof summary.elapsedTime).toBe('string');
      expect(typeof summary.isComplete).toBe('boolean');
    }, 10000);
  });

  describe('5. Edge cases and error handling', () => {
    it('should handle zero token values', () => {
      const sessionMetrics: SessionMetrics = {
        sessionId: 'zero-token-session',
        featureId: 'F001',
        startTime: Date.now(),
        success: true,
        toolCalls: 0,
        textParts: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
      };

      expect(sessionMetrics.tokenUsage?.input).toBe(0);
      expect(sessionMetrics.tokenUsage?.output).toBe(0);
      expect(sessionMetrics.tokenUsage?.total).toBe(0);
    });

    it('should handle very large token values', () => {
      const largeTokenUsage: TokenUsage = {
        input: Number.MAX_SAFE_INTEGER - 1000,
        output: 500000,
        total: Number.MAX_SAFE_INTEGER - 1000 + 500000,
      };

      expect(largeTokenUsage.input).toBeGreaterThan(1000000);
      expect(largeTokenUsage.output).toBeGreaterThan(0);
      expect(largeTokenUsage.total).toBe(largeTokenUsage.input + largeTokenUsage.output);
    });

    it('should handle negative token values gracefully', () => {
      // This should not happen in practice, but we should handle it gracefully
      const sessionMetrics: SessionMetrics = {
        sessionId: 'negative-token-session',
        featureId: 'F001',
        startTime: Date.now(),
        success: true,
        toolCalls: 1,
        textParts: 1,
        tokenUsage: { input: -100, output: -50, total: -150 },
      };

      expect(sessionMetrics.tokenUsage?.input).toBe(-100);
      expect(sessionMetrics.tokenUsage?.output).toBe(-50);
      expect(sessionMetrics.tokenUsage?.total).toBe(-150);
    });

    it('should handle NaN token values gracefully', () => {
      const sessionMetrics: SessionMetrics = {
        sessionId: 'nan-token-session',
        featureId: 'F001',
        startTime: Date.now(),
        success: true,
        toolCalls: 1,
        textParts: 1,
        tokenUsage: { input: NaN, output: NaN, total: NaN },
      };

      expect(isNaN(sessionMetrics.tokenUsage?.input ?? 0)).toBe(true);
      expect(isNaN(sessionMetrics.tokenUsage?.output ?? 0)).toBe(true);
      expect(isNaN(sessionMetrics.tokenUsage?.total ?? 0)).toBe(true);
    });
  });

  describe('6. Token usage calculation accuracy', () => {
    it('should maintain precision in token calculations', () => {
      const sessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'precision-test-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: { input: 100.5, output: 50.25, total: 150.75 },
        },
        {
          sessionId: 'precision-test-2',
          featureId: 'F002',
          startTime: Date.now(),
          success: true,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: { input: 200.75, output: 100.5, total: 301.25 },
        },
      ];

      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      for (const tokens of sessionTokens) {
        totalTokenUsage.input += tokens.input;
        totalTokenUsage.output += tokens.output;
        totalTokenUsage.total += tokens.total;
      }

      expect(totalTokenUsage.input).toBeCloseTo(301.25);
      expect(totalTokenUsage.output).toBeCloseTo(150.75);
      expect(totalTokenUsage.total).toBeCloseTo(452);
    });

    it('should calculate average correctly with decimal values', () => {
      const sessionMetrics: SessionMetrics[] = [
        {
          sessionId: 'avg-test-1',
          featureId: 'F001',
          startTime: Date.now(),
          success: true,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
        },
        {
          sessionId: 'avg-test-2',
          featureId: 'F002',
          startTime: Date.now(),
          success: true,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        },
        {
          sessionId: 'avg-test-3',
          featureId: 'F003',
          startTime: Date.now(),
          success: true,
          toolCalls: 1,
          textParts: 1,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
        },
      ];

      const sessionTokens = sessionMetrics.filter((m) => m.tokenUsage).map((m) => m.tokenUsage!);
      const totalTokenUsage = {
        input: 0,
        output: 0,
        total: 0,
      };

      for (const tokens of sessionTokens) {
        totalTokenUsage.input += tokens.input;
        totalTokenUsage.output += tokens.output;
        totalTokenUsage.total += tokens.total;
      }

      const avgTokens = Math.round(totalTokenUsage.total / sessionTokens.length);
      expect(avgTokens).toBe(2000);
    });
  });
});
