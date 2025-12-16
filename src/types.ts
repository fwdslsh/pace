/**
 * types.ts - Shared type definitions for pace
 */

// ============================================================================
// Agent Names
// ============================================================================

/**
 * Built-in Pace agent names used by the CLI
 */
export const PACE_AGENTS = {
  CODING: 'pace-coding',
  INITIALIZER: 'pace-initializer',
  COORDINATOR: 'pace-coordinator',
  CODE_REVIEWER: 'pace-code-reviewer',
  PRACTICES_REVIEWER: 'pace-practices-reviewer',
} as const;

export type PaceAgentName = (typeof PACE_AGENTS)[keyof typeof PACE_AGENTS];

// ============================================================================
// Feature Types
// ============================================================================

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface Feature {
  id: string;
  category: string;
  description: string;
  priority: Priority;
  steps: string[];
  passes: boolean;
  tags?: string[];
}

export interface FeatureListMetadata {
  project_name?: string;
  total_features?: number;
  passing?: number;
  failing?: number;
  last_updated?: string;
  [key: string]: unknown;
}

export interface FeatureList {
  features: Feature[];
  metadata?: FeatureListMetadata;
}

export interface SessionSummary {
  sessionsRun: number;
  featuresCompleted: number;
  finalProgress: string;
  completionPercentage: number;
  elapsedTime: string;
  isComplete: boolean;
}

export interface ValidationError {
  featureId: string;
  field: string;
  message: string;
}

export interface ValidationStats {
  total: number;
  passing: number;
  failing: number;
  byCategory: Record<string, number>;
  byPriority: Record<Priority, number>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  stats: ValidationStats;
}

export interface StatusReportOptions {
  verbose?: boolean;
  showGitLog?: boolean;
  showNextFeatures?: number;
  showProgress?: boolean;
  json?: boolean;
}

export interface CategoryStatus {
  passing: number;
  failing: number;
  total: number;
}

export interface StatusOutput {
  progress: {
    passing: number;
    failing: number;
    total: number;
    percentage: number;
  };
  projectName?: string;
  nextFeatures: Array<{
    id: string;
    description: string;
    priority: Priority;
    category: string;
  }>;
  byCategory?: Record<string, CategoryStatus>;
  gitLog?: string[];
  lastSession?: string;
  workingDirectory: string;
}

export interface ValidationOutput {
  valid: boolean;
  errorCount: number;
  errors: ValidationError[];
  stats: ValidationStats;
}

export interface UpdateOutput {
  success: boolean;
  featureId: string;
  oldStatus: 'passing' | 'failing';
  newStatus: 'passing' | 'failing';
  description: string;
  category: string;
  progress: {
    passing: number;
    total: number;
    percentage: number;
  };
}
