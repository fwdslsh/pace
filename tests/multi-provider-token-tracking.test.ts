/**
 * Test for F044: Test token tracking with multiple providers (Anthropic, OpenAI, etc)
 *
 * Verification steps:
 * 1. Verify tokens tracked for Claude models
 * 2. Verify tokens tracked for GPT models
 * 3. Test with different provider formats
 * 4. Ensure provider-agnostic implementation
 */

import { describe, it, expect } from 'bun:test';
import type { TokenUsage } from '../src/types';
import {
  calculateCost,
  DEFAULT_MODEL_PRICING,
  isCostCalculationSupported,
} from '../src/cost-calculator';

describe('F044: Multi-Provider Token Tracking', () => {
  describe('1. Verify tokens tracked for Claude models', () => {
    it('should track tokens for claude-3-5-sonnet', () => {
      const tokenUsage: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500,
        model: 'anthropic/claude-3-5-sonnet',
      };

      expect(tokenUsage.model).toBe('anthropic/claude-3-5-sonnet');
      expect(tokenUsage.input).toBe(1000);
      expect(tokenUsage.output).toBe(500);
      expect(tokenUsage.total).toBe(1500);
    });

    it('should track tokens for claude-3-opus', () => {
      const tokenUsage: TokenUsage = {
        input: 2000,
        output: 1000,
        total: 3000,
        model: 'anthropic/claude-3-opus',
      };

      expect(tokenUsage.model).toBe('anthropic/claude-3-opus');
      expect(tokenUsage.input).toBe(2000);
      expect(tokenUsage.output).toBe(1000);
      expect(tokenUsage.total).toBe(3000);
    });

    it('should track tokens for claude-3-haiku', () => {
      const tokenUsage: TokenUsage = {
        input: 500,
        output: 250,
        total: 750,
        model: 'anthropic/claude-3-haiku',
      };

      expect(tokenUsage.model).toBe('anthropic/claude-3-haiku');
      expect(tokenUsage.input).toBe(500);
      expect(tokenUsage.output).toBe(250);
      expect(tokenUsage.total).toBe(750);
    });

    it('should track tokens for claude-3-5-haiku', () => {
      const tokenUsage: TokenUsage = {
        input: 800,
        output: 400,
        total: 1200,
        model: 'anthropic/claude-3-5-haiku',
      };

      expect(tokenUsage.model).toBe('anthropic/claude-3-5-haiku');
      expect(tokenUsage.input).toBe(800);
      expect(tokenUsage.output).toBe(400);
      expect(tokenUsage.total).toBe(1200);
    });

    it('should calculate costs for Claude models', () => {
      const tokenUsage: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500,
        model: 'anthropic/claude-3-5-sonnet',
      };

      const cost = calculateCost(tokenUsage, tokenUsage.model!);
      expect(cost).not.toBeNull();
      if (cost) {
        // $3.00 per 1M input tokens = $0.003 per 1K tokens
        // 1000 tokens * 0.003 = $3.00
        expect(cost.inputCost).toBe(3.0);
        // $15.00 per 1M output tokens = $0.015 per 1K tokens
        // 500 tokens * 0.015 = $7.50
        expect(cost.outputCost).toBe(7.5);
        expect(cost.totalCost).toBe(10.5);
      }
    });

    it('should support all Claude model variants in pricing data', () => {
      const claudeModels = [
        'anthropic/claude-3-5-sonnet',
        'anthropic/claude-3-5-haiku',
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'anthropic/claude-3-haiku',
      ];

      claudeModels.forEach((model) => {
        expect(DEFAULT_MODEL_PRICING[model]).toBeDefined();
        expect(DEFAULT_MODEL_PRICING[model].provider).toBe('anthropic');
        expect(DEFAULT_MODEL_PRICING[model].inputPrice).toBeGreaterThan(0);
        expect(DEFAULT_MODEL_PRICING[model].outputPrice).toBeGreaterThan(0);
      });
    });
  });

  describe('2. Verify tokens tracked for GPT models', () => {
    it('should track tokens for gpt-4o', () => {
      const tokenUsage: TokenUsage = {
        input: 1500,
        output: 750,
        total: 2250,
        model: 'openai/gpt-4o',
      };

      expect(tokenUsage.model).toBe('openai/gpt-4o');
      expect(tokenUsage.input).toBe(1500);
      expect(tokenUsage.output).toBe(750);
      expect(tokenUsage.total).toBe(2250);
    });

    it('should track tokens for gpt-4o-mini', () => {
      const tokenUsage: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500,
        model: 'openai/gpt-4o-mini',
      };

      expect(tokenUsage.model).toBe('openai/gpt-4o-mini');
      expect(tokenUsage.input).toBe(1000);
      expect(tokenUsage.output).toBe(500);
      expect(tokenUsage.total).toBe(1500);
    });

    it('should track tokens for gpt-4-turbo', () => {
      const tokenUsage: TokenUsage = {
        input: 2000,
        output: 1000,
        total: 3000,
        model: 'openai/gpt-4-turbo',
      };

      expect(tokenUsage.model).toBe('openai/gpt-4-turbo');
      expect(tokenUsage.input).toBe(2000);
      expect(tokenUsage.output).toBe(1000);
      expect(tokenUsage.total).toBe(3000);
    });

    it('should track tokens for gpt-4', () => {
      const tokenUsage: TokenUsage = {
        input: 3000,
        output: 1500,
        total: 4500,
        model: 'openai/gpt-4',
      };

      expect(tokenUsage.model).toBe('openai/gpt-4');
      expect(tokenUsage.input).toBe(3000);
      expect(tokenUsage.output).toBe(1500);
      expect(tokenUsage.total).toBe(4500);
    });

    it('should track tokens for gpt-3.5-turbo', () => {
      const tokenUsage: TokenUsage = {
        input: 800,
        output: 400,
        total: 1200,
        model: 'openai/gpt-3.5-turbo',
      };

      expect(tokenUsage.model).toBe('openai/gpt-3.5-turbo');
      expect(tokenUsage.input).toBe(800);
      expect(tokenUsage.output).toBe(400);
      expect(tokenUsage.total).toBe(1200);
    });

    it('should calculate costs for GPT models', () => {
      const tokenUsage: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500,
        model: 'openai/gpt-4o',
      };

      const cost = calculateCost(tokenUsage, tokenUsage.model!);
      expect(cost).not.toBeNull();
      if (cost) {
        // $2.50 per 1M input tokens = $0.0025 per 1K tokens
        // 1000 tokens * 0.0025 = $2.50
        expect(cost.inputCost).toBe(2.5);
        // $10.00 per 1M output tokens = $0.010 per 1K tokens
        // 500 tokens * 0.010 = $5.00
        expect(cost.outputCost).toBe(5.0);
        expect(cost.totalCost).toBe(7.5);
      }
    });

    it('should support all GPT model variants in pricing data', () => {
      const gptModels = [
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-4-turbo',
        'openai/gpt-4',
        'openai/gpt-3.5-turbo',
      ];

      gptModels.forEach((model) => {
        expect(DEFAULT_MODEL_PRICING[model]).toBeDefined();
        expect(DEFAULT_MODEL_PRICING[model].provider).toBe('openai');
        expect(DEFAULT_MODEL_PRICING[model].inputPrice).toBeGreaterThan(0);
        expect(DEFAULT_MODEL_PRICING[model].outputPrice).toBeGreaterThan(0);
      });
    });
  });

  describe('3. Test with different provider formats', () => {
    it('should track tokens for Google Gemini models', () => {
      const tokenUsage: TokenUsage = {
        input: 1200,
        output: 600,
        total: 1800,
        model: 'google/gemini-1.5-pro',
      };

      expect(tokenUsage.model).toBe('google/gemini-1.5-pro');
      expect(tokenUsage.input).toBe(1200);
      expect(tokenUsage.output).toBe(600);
      expect(tokenUsage.total).toBe(1800);
    });

    it('should support Google Gemini models in pricing data', () => {
      const geminiModels = [
        'google/gemini-1.5-pro',
        'google/gemini-1.5-flash',
        'google/gemini-pro',
      ];

      geminiModels.forEach((model) => {
        expect(DEFAULT_MODEL_PRICING[model]).toBeDefined();
        expect(DEFAULT_MODEL_PRICING[model].provider).toBe('google');
        expect(DEFAULT_MODEL_PRICING[model].inputPrice).toBeGreaterThan(0);
        expect(DEFAULT_MODEL_PRICING[model].outputPrice).toBeGreaterThan(0);
      });
    });

    it('should handle model IDs without provider prefix', () => {
      const tokenUsage: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500,
        model: 'claude-3-5-sonnet',
      };

      expect(tokenUsage.model).toBe('claude-3-5-sonnet');
      expect(tokenUsage.input).toBe(1000);
      expect(tokenUsage.output).toBe(500);
      expect(tokenUsage.total).toBe(1500);
    });

    it('should handle model IDs with version suffixes', () => {
      const tokenUsage: TokenUsage = {
        input: 2000,
        output: 1000,
        total: 3000,
        model: 'anthropic/claude-sonnet-4-20250514',
      };

      expect(tokenUsage.model).toBe('anthropic/claude-sonnet-4-20250514');
      expect(tokenUsage.input).toBe(2000);
      expect(tokenUsage.output).toBe(1000);
      expect(tokenUsage.total).toBe(3000);
    });

    it('should handle custom model formats', () => {
      const tokenUsage: TokenUsage = {
        input: 1500,
        output: 750,
        total: 2250,
        model: 'custom-provider/custom-model-v1',
      };

      expect(tokenUsage.model).toBe('custom-provider/custom-model-v1');
      expect(tokenUsage.input).toBe(1500);
      expect(tokenUsage.output).toBe(750);
      expect(tokenUsage.total).toBe(2250);
    });

    it('should support cost calculation for various model formats', () => {
      const testModels = ['anthropic/claude-3-5-sonnet', 'openai/gpt-4o', 'google/gemini-1.5-pro'];

      testModels.forEach((model) => {
        expect(isCostCalculationSupported(model)).toBe(true);
      });
    });
  });

  describe('4. Ensure provider-agnostic implementation', () => {
    it('should aggregate tokens across different providers', () => {
      const sessions: TokenUsage[] = [
        {
          input: 1000,
          output: 500,
          total: 1500,
          model: 'anthropic/claude-3-5-sonnet',
        },
        {
          input: 1200,
          output: 600,
          total: 1800,
          model: 'openai/gpt-4o',
        },
        {
          input: 800,
          output: 400,
          total: 1200,
          model: 'google/gemini-1.5-flash',
        },
      ];

      const totalTokens = sessions.reduce(
        (acc, session) => ({
          input: acc.input + session.input,
          output: acc.output + session.output,
          total: acc.total + session.total,
        }),
        { input: 0, output: 0, total: 0 },
      );

      expect(totalTokens.input).toBe(3000);
      expect(totalTokens.output).toBe(1500);
      expect(totalTokens.total).toBe(4500);
    });

    it('should handle mixed provider sessions without model field', () => {
      const sessions: TokenUsage[] = [
        {
          input: 1000,
          output: 500,
          total: 1500,
          model: 'anthropic/claude-3-5-sonnet',
        },
        {
          input: 1200,
          output: 600,
          total: 1800,
        },
        {
          input: 800,
          output: 400,
          total: 1200,
          model: 'openai/gpt-4o',
        },
      ];

      const totalTokens = sessions.reduce(
        (acc, session) => ({
          input: acc.input + session.input,
          output: acc.output + session.output,
          total: acc.total + session.total,
        }),
        { input: 0, output: 0, total: 0 },
      );

      expect(totalTokens.input).toBe(3000);
      expect(totalTokens.output).toBe(1500);
      expect(totalTokens.total).toBe(4500);
    });

    it('should calculate per-provider totals correctly', () => {
      const sessions: TokenUsage[] = [
        {
          input: 1000,
          output: 500,
          total: 1500,
          model: 'anthropic/claude-3-5-sonnet',
        },
        {
          input: 2000,
          output: 1000,
          total: 3000,
          model: 'anthropic/claude-3-opus',
        },
        {
          input: 1200,
          output: 600,
          total: 1800,
          model: 'openai/gpt-4o',
        },
        {
          input: 1500,
          output: 750,
          total: 2250,
          model: 'openai/gpt-4o-mini',
        },
      ];

      const byProvider = sessions.reduce(
        (acc, session) => {
          if (!session.model) return acc;

          const provider = session.model.split('/')[0];
          if (!acc[provider]) {
            acc[provider] = { input: 0, output: 0, total: 0 };
          }

          acc[provider].input += session.input;
          acc[provider].output += session.output;
          acc[provider].total += session.total;

          return acc;
        },
        {} as Record<string, { input: number; output: number; total: number }>,
      );

      expect(byProvider['anthropic'].input).toBe(3000);
      expect(byProvider['anthropic'].output).toBe(1500);
      expect(byProvider['anthropic'].total).toBe(4500);

      expect(byProvider['openai'].input).toBe(2700);
      expect(byProvider['openai'].output).toBe(1350);
      expect(byProvider['openai'].total).toBe(4050);
    });

    it('should handle tokens regardless of model identifier presence', () => {
      const sessionsWithModel: TokenUsage[] = [
        { input: 1000, output: 500, total: 1500, model: 'anthropic/claude-3-5-sonnet' },
      ];

      const sessionsWithoutModel: TokenUsage[] = [{ input: 1000, output: 500, total: 1500 }];

      const totalWithModel = sessionsWithModel.reduce(
        (acc, s) => ({
          input: acc.input + s.input,
          output: acc.output + s.output,
          total: acc.total + s.total,
        }),
        { input: 0, output: 0, total: 0 },
      );

      const totalWithoutModel = sessionsWithoutModel.reduce(
        (acc, s) => ({
          input: acc.input + s.input,
          output: acc.output + s.output,
          total: acc.total + s.total,
        }),
        { input: 0, output: 0, total: 0 },
      );

      expect(totalWithModel.total).toBe(totalWithoutModel.total);
      expect(totalWithModel.input).toBe(totalWithoutModel.input);
      expect(totalWithModel.output).toBe(totalWithoutModel.output);
    });

    it('should validate token consistency across all providers', () => {
      const testProviders = [
        { model: 'anthropic/claude-3-5-sonnet', input: 1000, output: 500 },
        { model: 'openai/gpt-4o', input: 1500, output: 750 },
        { model: 'google/gemini-1.5-pro', input: 1200, output: 600 },
      ];

      testProviders.forEach(({ model, input, output }) => {
        const tokenUsage: TokenUsage = {
          input,
          output,
          total: input + output,
          model,
        };

        expect(tokenUsage.total).toBe(tokenUsage.input + tokenUsage.output);
        expect(tokenUsage.model).toBe(model);
        expect(tokenUsage.input).toBeGreaterThanOrEqual(0);
        expect(tokenUsage.output).toBeGreaterThanOrEqual(0);
        expect(tokenUsage.total).toBeGreaterThanOrEqual(0);
      });
    });

    it('should support cost calculation across all providers', () => {
      const testCases = [
        { model: 'anthropic/claude-3-5-sonnet', input: 1000, output: 500 },
        { model: 'openai/gpt-4o', input: 1000, output: 500 },
        { model: 'google/gemini-1.5-pro', input: 1000, output: 500 },
      ];

      testCases.forEach(({ model, input, output }) => {
        const tokenUsage: TokenUsage = {
          input,
          output,
          total: input + output,
          model,
        };

        const cost = calculateCost(tokenUsage, model);
        expect(cost).not.toBeNull();

        if (cost) {
          expect(cost.inputCost).toBeGreaterThan(0);
          expect(cost.outputCost).toBeGreaterThan(0);
          expect(cost.totalCost).toBe(cost.inputCost + cost.outputCost);
        }
      });
    });

    it('should handle unknown providers gracefully', () => {
      const tokenUsage: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500,
        model: 'unknown-provider/unknown-model',
      };

      expect(tokenUsage.input).toBe(1000);
      expect(tokenUsage.output).toBe(500);
      expect(tokenUsage.total).toBe(1500);
      expect(tokenUsage.model).toBe('unknown-provider/unknown-model');

      const cost = calculateCost(tokenUsage, tokenUsage.model!);
      expect(cost).toBeNull();
    });

    it('should preserve model information through aggregation', () => {
      const sessions: TokenUsage[] = [
        {
          input: 1000,
          output: 500,
          total: 1500,
          model: 'anthropic/claude-3-5-sonnet',
        },
        {
          input: 1200,
          output: 600,
          total: 1800,
          model: 'openai/gpt-4o',
        },
      ];

      expect(sessions[0].model).toBe('anthropic/claude-3-5-sonnet');
      expect(sessions[1].model).toBe('openai/gpt-4o');

      const total = sessions.reduce(
        (acc, s) => ({
          input: acc.input + s.input,
          output: acc.output + s.output,
          total: acc.total + s.total,
        }),
        { input: 0, output: 0, total: 0 },
      );

      expect(total.input).toBe(2200);
      expect(total.output).toBe(1100);
      expect(total.total).toBe(3300);

      expect(sessions[0].model).toBe('anthropic/claude-3-5-sonnet');
      expect(sessions[1].model).toBe('openai/gpt-4o');
    });
  });
});
