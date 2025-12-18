/**
 * token-exporter.ts - Export token usage data to CSV or JSON files
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { TokenUsage } from './types';
import { ProgressParser, type ParsedSession } from './progress-parser';

/**
 * Token export data structure
 */
export interface TokenExportEntry {
  sessionId: string;
  featureId: string;
  date: string;
  agentType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  toolCalls: number;
  textParts: number;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
}

/**
 * Export configuration options
 */
export interface ExportOptions {
  format: 'csv' | 'json';
  outputFile?: string;
  includeCost?: boolean;
  sortby?: 'date' | 'feature' | 'tokens' | 'duration';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Token exporter for creating CSV and JSON exports
 */
export class TokenExporter {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Load and parse progress.txt file
   */
  private async loadProgressFile(): Promise<string> {
    try {
      return await readFile(join(this.projectDir, 'progress.txt'), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read progress.txt: ${error}`);
    }
  }

  /**
   * Sort entries based on options
   */
  private sortEntries(entries: TokenExportEntry[], options: ExportOptions): TokenExportEntry[] {
    const { sortby = 'date', sortOrder = 'desc' } = options;

    return entries.sort((a, b) => {
      let comparison = 0;

      switch (sortby) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'feature':
          comparison = a.featureId.localeCompare(b.featureId);
          break;
        case 'tokens':
          comparison = a.totalTokens - b.totalTokens;
          break;
        case 'duration':
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
        default:
          comparison = a.date.localeCompare(b.date);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Export data to CSV format
   */
  private exportToCSV(entries: TokenExportEntry[], includeCost: boolean = false): string {
    const headers = [
      'Session ID',
      'Feature ID',
      'Date',
      'Agent Type',
      'Success',
      'Tool Calls',
      'Text Parts',
      'Model',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
    ];

    if (includeCost) {
      headers.push('Input Cost ($)', 'Output Cost ($)', 'Total Cost ($)');
    }

    const csvLines = [headers.join(',')];

    for (const entry of entries) {
      const row = [
        entry.sessionId,
        entry.featureId,
        entry.date,
        entry.agentType,
        entry.success,
        entry.toolCalls,
        entry.textParts,
        entry.model || '',
        entry.inputTokens,
        entry.outputTokens,
        entry.totalTokens,
      ];

      if (includeCost && entry.cost) {
        row.push(
          entry.cost.inputCost.toFixed(4),
          entry.cost.outputCost.toFixed(4),
          entry.cost.totalCost.toFixed(4),
        );
      } else if (includeCost) {
        row.push('0.0000', '0.0000', '0.0000');
      }

      csvLines.push(row.join(','));
    }

    return csvLines.join('\n');
  }

  /**
   * Export data to JSON format
   */
  private exportToJSON(entries: TokenExportEntry[], includeCost: boolean = false): string {
    // Create sessions with all fields explicitly included
    const sessionsWithAllFields = entries.map((entry) => {
      const sessionObj: any = {
        sessionId: entry.sessionId,
        featureId: entry.featureId,
        date: entry.date,
        agentType: entry.agentType,
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: entry.duration,
        success: entry.success,
        toolCalls: entry.toolCalls,
        textParts: entry.textParts,
        model: entry.model, // Explicitly include even if undefined
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.totalTokens,
      };

      // Include cost if requested and available
      if (includeCost && entry.cost) {
        sessionObj.cost = entry.cost;
      } else if (includeCost) {
        sessionObj.cost = { inputCost: 0, outputCost: 0, totalCost: 0 };
      }

      return sessionObj;
    });

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalSessions: entries.length,
        totalTokens: entries.reduce((sum, entry) => sum + entry.totalTokens, 0),
        totalInputTokens: entries.reduce((sum, entry) => sum + entry.inputTokens, 0),
        totalOutputTokens: entries.reduce((sum, entry) => sum + entry.outputTokens, 0),
        includeCost,
      },
      sessions: sessionsWithAllFields,
    };

    // Use replacer to ensure undefined fields are included as null
    return JSON.stringify(exportData, (key, value) => (value === undefined ? null : value), 2);
  }

  /**
   * Export token usage data to file
   */
  async exportTokens(
    options: ExportOptions,
  ): Promise<{ success: boolean; filename: string; entries: number }> {
    // Use unified parser
    const progressData = await ProgressParser.parse(this.projectDir);

    // Convert to export format
    let entries: TokenExportEntry[] = progressData.sessions.map((session) => ({
      sessionId: session.sessionId,
      featureId: session.featureId,
      date: session.date,
      agentType: session.agentType,
      startTime: 0, // Not available in progress.txt
      endTime: 0,
      duration: 0,
      success: true, // Assume success if in progress.txt
      toolCalls: 0, // Not available
      textParts: 0, // Not available
      model: session.model,
      inputTokens: session.tokens.input,
      outputTokens: session.tokens.output,
      totalTokens: session.tokens.total,
      cost: session.cost,
    }));

    // Sort entries if requested
    if (options.sortby) {
      entries = this.sortEntries(entries, options);
    }

    // Generate output filename if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const extension = options.format === 'csv' ? 'csv' : 'json';
    const filename = options.outputFile || `token-export-${timestamp}.${extension}`;
    const filePath = join(this.projectDir, filename);

    // Generate output content
    let content: string;
    if (options.format === 'csv') {
      content = this.exportToCSV(entries, options.includeCost);
    } else {
      content = this.exportToJSON(entries, options.includeCost);
    }

    // Write to file
    await writeFile(filePath, content, 'utf-8');

    return {
      success: true,
      filename: filePath,
      entries: entries.length,
    };
  }

  /**
   * Get export summary without writing to file
   */
  async getExportSummary(): Promise<{
    totalSessions: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    entries: TokenExportEntry[];
  }> {
    const progressData = await ProgressParser.parse(this.projectDir);
    const entries: TokenExportEntry[] = progressData.sessions.map((session) => ({
      sessionId: session.sessionId,
      featureId: session.featureId,
      date: session.date,
      agentType: session.agentType,
      startTime: 0,
      endTime: 0,
      duration: 0,
      success: true,
      toolCalls: 0,
      textParts: 0,
      model: session.model,
      inputTokens: session.tokens.input,
      outputTokens: session.tokens.output,
      totalTokens: session.tokens.total,
      cost: session.cost,
    }));

    return {
      totalSessions: entries.length,
      totalTokens: entries.reduce((sum, entry) => sum + entry.totalTokens, 0),
      totalInputTokens: entries.reduce((sum, entry) => sum + entry.inputTokens, 0),
      totalOutputTokens: entries.reduce((sum, entry) => sum + entry.outputTokens, 0),
      entries,
    };
  }
}
