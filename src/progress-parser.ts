/**
 * progress-parser.ts - Unified progress.txt parser with caching
 *
 * Replaces 4 separate parsing implementations:
 * - status-reporter.ts:extractTokenUsage()
 * - token-exporter.ts:parseProgressData()
 * - token-efficiency.ts:extractFeatureEfficiencyData()
 * - archive-manager.ts:extractTokenUsageForArchive()
 */

import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { TokenUsage } from './types';

/**
 * Parsed session data - single source of truth
 */
export interface ParsedSession {
  sessionId: string;
  featureId: string;
  date: string;
  agentType: string;
  model?: string;
  tokens: TokenUsage;
  cost?: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
  rawContent: string; // For any module needing full text
}

/**
 * Aggregated progress data
 */
export interface ProgressData {
  sessions: ParsedSession[];
  totals: {
    tokens: TokenUsage;
    byModel: Map<string, TokenUsage>;
    byFeature: Map<string, { tokens: number; sessions: number }>;
  };
  lastSession?: ParsedSession;
  parseTime: number;
}

/**
 * Unified progress.txt parser with caching
 */
export class ProgressParser {
  private static cache = new Map<
    string,
    {
      data: ProgressData;
      fileMtime: number; // File modification time in ms
    }
  >();

  /**
   * Parse progress.txt with automatic caching
   *
   * @param projectDir - Project directory path
   * @returns Parsed progress data with aggregations
   */
  static async parse(projectDir: string): Promise<ProgressData> {
    const filePath = join(projectDir, 'progress.txt');

    // Get file modification time
    const fileStats = await stat(filePath);
    const fileMtime = fileStats.mtimeMs;

    // Check cache validity - invalidate if file has been modified
    const cached = this.cache.get(filePath);
    if (cached && cached.fileMtime === fileMtime) {
      return cached.data;
    }

    // Parse file
    const startTime = performance.now();
    const content = await readFile(filePath, 'utf-8');
    const data = this.parseContent(content);
    data.parseTime = performance.now() - startTime;

    // Cache with file modification time
    this.cache.set(filePath, { data, fileMtime });
    return data;
  }

  /**
   * Single-pass parsing of progress content
   * Aggregates all data in one iteration for efficiency
   */
  private static parseContent(content: string): ProgressData {
    const sessions: ParsedSession[] = [];
    const byModel = new Map<string, TokenUsage>();
    const byFeature = new Map<string, { tokens: number; sessions: number }>();
    let totalTokens: TokenUsage = { input: 0, output: 0, total: 0 };

    const sessionPattern = /### Session (\d+) - (F\d+)[\s\S]*?(?=### Session|\n---\n$|$)/g;
    let match: RegExpExecArray | null;

    while ((match = sessionPattern.exec(content)) !== null) {
      const sessionContent = match[0];
      const session = this.parseSession(match[1], match[2], sessionContent);

      if (session) {
        sessions.push(session);

        // Aggregate totals in single pass
        totalTokens.input += session.tokens.input;
        totalTokens.output += session.tokens.output;
        totalTokens.total += session.tokens.total;

        // Model aggregation
        if (session.model) {
          const existing = byModel.get(session.model) || { input: 0, output: 0, total: 0 };
          byModel.set(session.model, {
            input: existing.input + session.tokens.input,
            output: existing.output + session.tokens.output,
            total: existing.total + session.tokens.total,
          });
        }

        // Feature aggregation
        const featureData = byFeature.get(session.featureId) || { tokens: 0, sessions: 0 };
        byFeature.set(session.featureId, {
          tokens: featureData.tokens + session.tokens.total,
          sessions: featureData.sessions + 1,
        });
      }
    }

    return {
      sessions,
      totals: { tokens: totalTokens, byModel, byFeature },
      lastSession: sessions[sessions.length - 1],
      parseTime: 0, // Set by caller
    };
  }

  /**
   * Parse individual session content
   */
  private static parseSession(
    sessionId: string,
    featureId: string,
    content: string,
  ): ParsedSession | null {
    // Helper to parse numbers with comma formatting
    const parseNum = (s?: string) => (s ? parseInt(s.replace(/,/g, '')) || 0 : 0);

    // Extract all fields with single regex pass per field
    const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/);
    const agentMatch = content.match(/\*\*Agent Type:\*\*\s*(\w+)/);
    const modelMatch = content.match(/model:\s*([^\s\n]+)/);
    const inputMatch = content.match(/Input tokens:\s*([\d,]+)/);
    const outputMatch = content.match(/Output tokens:\s*([\d,]+)/);
    const totalMatch = content.match(/Total tokens:\s*([\d,]+)/);

    // Optional cost extraction
    let cost: ParsedSession['cost'];
    const totalCostMatch = content.match(/Total cost:\s*\$([\d.]+)/);
    const inputCostMatch = content.match(/Input cost:\s*\$([\d.]+)/);
    const outputCostMatch = content.match(/Output cost:\s*\$([\d.]+)/);

    if (totalCostMatch || inputCostMatch || outputCostMatch) {
      cost = {
        inputCost: inputCostMatch ? parseFloat(inputCostMatch[1]) : 0,
        outputCost: outputCostMatch ? parseFloat(outputCostMatch[1]) : 0,
        totalCost: totalCostMatch ? parseFloat(totalCostMatch[1]) : 0,
      };
    }

    return {
      sessionId,
      featureId,
      date: dateMatch?.[1]?.trim() || 'unknown',
      agentType: agentMatch?.[1] || 'unknown',
      model: modelMatch?.[1],
      tokens: {
        input: parseNum(inputMatch?.[1]),
        output: parseNum(outputMatch?.[1]),
        total: parseNum(totalMatch?.[1]),
      },
      cost,
      rawContent: content,
    };
  }

  /**
   * Invalidate cache for a project
   * Call this after writing to progress.txt
   */
  static invalidate(projectDir: string): void {
    const filePath = join(projectDir, 'progress.txt');
    this.cache.delete(filePath);
  }

  /**
   * Clear all cached data
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Filter sessions by minimum token usage
   */
  static filterByMinTokens(sessions: ParsedSession[], minTokens: number): ParsedSession[] {
    return sessions.filter((session) => session.tokens.total >= minTokens);
  }

  /**
   * Get sessions sorted by token usage (descending)
   */
  static sortByTokenUsage(sessions: ParsedSession[]): ParsedSession[] {
    return [...sessions].sort((a, b) => b.tokens.total - a.tokens.total);
  }

  /**
   * Get token-intensive features (features with above-average token usage)
   */
  static getTokenIntensiveFeatures(
    byFeature: Map<string, { tokens: number; sessions: number }>,
  ): Array<{ featureId: string; avgTokens: number; sessions: number; totalTokens: number }> {
    const features = Array.from(byFeature.entries()).map(([featureId, data]) => ({
      featureId,
      avgTokens: Math.round(data.tokens / data.sessions),
      sessions: data.sessions,
      totalTokens: data.tokens,
    }));

    const overallAvg = features.reduce((sum, f) => sum + f.avgTokens, 0) / (features.length || 1);

    return features
      .filter((f) => f.avgTokens > overallAvg)
      .sort((a, b) => b.avgTokens - a.avgTokens);
  }
}
