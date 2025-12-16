/**
 * validators.ts - Validation logic for feature lists
 */

import type { FeatureList, Priority, ValidationError, ValidationResult } from './types';

const VALID_PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
const REQUIRED_FEATURE_FIELDS = ['id', 'category', 'description', 'priority', 'steps', 'passes'];
const REQUIRED_METADATA_FIELDS = ['project_name', 'total_features', 'passing', 'failing'];

/** Minimum length for feature descriptions */
const MIN_DESCRIPTION_LENGTH = 10;

/**
 * Validate a single feature
 */
export function validateFeature(feature: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!feature || typeof feature !== 'object') {
    return [
      {
        featureId: `index-${index}`,
        field: 'root',
        message: 'Feature must be an object',
      },
    ];
  }

  const f = feature as Record<string, unknown>;
  const featureId = typeof f.id === 'string' ? f.id : `index-${index}`;

  // Check required fields
  for (const field of REQUIRED_FEATURE_FIELDS) {
    if (!(field in f)) {
      errors.push({
        featureId,
        field,
        message: `Missing required field '${field}'`,
      });
    }
  }

  // Type validation
  if ('id' in f && typeof f.id !== 'string') {
    errors.push({ featureId, field: 'id', message: "'id' must be a string" });
  }

  if ('category' in f && typeof f.category !== 'string') {
    errors.push({ featureId, field: 'category', message: "'category' must be a string" });
  }

  if ('description' in f && typeof f.description !== 'string') {
    errors.push({ featureId, field: 'description', message: "'description' must be a string" });
  }

  if ('priority' in f) {
    if (typeof f.priority !== 'string' || !VALID_PRIORITIES.includes(f.priority as Priority)) {
      errors.push({
        featureId,
        field: 'priority',
        message: `'priority' must be one of: ${VALID_PRIORITIES.join(', ')}`,
      });
    }
  }

  if ('steps' in f) {
    if (!Array.isArray(f.steps)) {
      errors.push({ featureId, field: 'steps', message: "'steps' must be an array" });
    } else if (f.steps.length === 0) {
      errors.push({ featureId, field: 'steps', message: "'steps' array cannot be empty" });
    } else {
      for (let i = 0; i < f.steps.length; i++) {
        if (typeof f.steps[i] !== 'string') {
          errors.push({
            featureId,
            field: 'steps',
            message: `step ${i + 1} must be a string`,
          });
        }
      }
    }
  }

  if ('passes' in f && typeof f.passes !== 'boolean') {
    errors.push({ featureId, field: 'passes', message: "'passes' must be a boolean" });
  }

  // Content validation
  if ('description' in f && typeof f.description === 'string') {
    if (f.description.length < MIN_DESCRIPTION_LENGTH) {
      errors.push({
        featureId,
        field: 'description',
        message: `description too short (min ${MIN_DESCRIPTION_LENGTH} chars)`,
      });
    }
  }

  return errors;
}

/**
 * Validate metadata section
 */
export function validateMetadata(
  metadata: unknown,
  actualCounts: { total: number; passing: number; failing: number },
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!metadata || typeof metadata !== 'object') {
    return [
      {
        featureId: 'metadata',
        field: 'root',
        message: 'Metadata must be an object',
      },
    ];
  }

  const m = metadata as Record<string, unknown>;

  // Check required fields
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in m)) {
      errors.push({
        featureId: 'metadata',
        field,
        message: `Missing required field '${field}'`,
      });
    }
  }

  // Check counts match
  if ('total_features' in m && 'passing' in m && 'failing' in m) {
    const total = typeof m.total_features === 'number' ? m.total_features : -1;
    const passing = typeof m.passing === 'number' ? m.passing : -1;
    const failing = typeof m.failing === 'number' ? m.failing : -1;

    if (total !== -1 && passing !== -1 && failing !== -1) {
      if (passing + failing !== total) {
        errors.push({
          featureId: 'metadata',
          field: 'counts',
          message: `passing (${passing}) + failing (${failing}) != total_features (${total})`,
        });
      }

      // Check against actual counts
      if (total !== actualCounts.total) {
        errors.push({
          featureId: 'metadata',
          field: 'total_features',
          message: `metadata (${total}) doesn't match actual count (${actualCounts.total})`,
        });
      }

      if (passing !== actualCounts.passing) {
        errors.push({
          featureId: 'metadata',
          field: 'passing',
          message: `metadata (${passing}) doesn't match actual count (${actualCounts.passing})`,
        });
      }

      if (failing !== actualCounts.failing) {
        errors.push({
          featureId: 'metadata',
          field: 'failing',
          message: `metadata (${failing}) doesn't match actual count (${actualCounts.failing})`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate entire feature list
 */
export function validateFeatureList(data: FeatureList): ValidationResult {
  const errors: ValidationError[] = [];
  const stats = {
    total: 0,
    passing: 0,
    failing: 0,
    byCategory: {} as Record<string, number>,
    byPriority: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    } as Record<Priority, number>,
  };

  // Validate structure
  if (!('features' in data)) {
    errors.push({
      featureId: 'root',
      field: 'features',
      message: "Missing 'features' array at top level",
    });
    return { valid: false, errors, stats };
  }

  if (!Array.isArray(data.features)) {
    errors.push({
      featureId: 'root',
      field: 'features',
      message: "'features' must be an array",
    });
    return { valid: false, errors, stats };
  }

  // Track duplicate IDs
  const seenIds = new Set<string>();

  // Validate each feature
  for (let i = 0; i < data.features.length; i++) {
    const feature = data.features[i];

    // Check for duplicate IDs
    if (feature.id) {
      if (seenIds.has(feature.id)) {
        errors.push({
          featureId: feature.id,
          field: 'id',
          message: 'Duplicate feature ID',
        });
      }
      seenIds.add(feature.id);
    }

    // Validate feature
    const featureErrors = validateFeature(feature, i);
    errors.push(...featureErrors);

    // Collect stats (only if feature is valid enough)
    if (feature && typeof feature === 'object') {
      stats.total++;

      if ('passes' in feature) {
        if (feature.passes) {
          stats.passing++;
        } else {
          stats.failing++;
        }
      }

      const cat = feature.category || 'uncategorized';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;

      const pri = (feature.priority || 'low') as Priority;
      if (VALID_PRIORITIES.includes(pri)) {
        stats.byPriority[pri]++;
      }
    }
  }

  // Validate metadata if present
  if (data.metadata) {
    const actualCounts = {
      total: stats.total,
      passing: stats.passing,
      failing: stats.failing,
    };
    const metadataErrors = validateMetadata(data.metadata, actualCounts);
    errors.push(...metadataErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats,
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return '✅ VALID - No errors found';
  }

  const lines = [`❌ INVALID - ${errors.length} error(s) found`, '', 'Errors:'];

  for (const error of errors) {
    lines.push(`  • [${error.featureId}] ${error.field}: ${error.message}`);
  }

  return lines.join('\n');
}

/**
 * Format validation statistics for display
 */
export function formatValidationStats(stats: ValidationResult['stats']): string {
  const lines = ['Statistics:'];
  lines.push(`  Total features: ${stats.total}`);

  if (stats.total > 0) {
    const passingPct = (stats.passing / stats.total) * 100;
    const failingPct = (stats.failing / stats.total) * 100;
    lines.push(`  Passing: ${stats.passing} (${passingPct.toFixed(1)}%)`);
    lines.push(`  Failing: ${stats.failing} (${failingPct.toFixed(1)}%)`);
  }

  if (Object.keys(stats.byCategory).length > 0) {
    lines.push('');
    lines.push('  By Category:');
    for (const [cat, count] of Object.entries(stats.byCategory).sort()) {
      lines.push(`    ${cat}: ${count}`);
    }
  }

  const priorityOrder: Priority[] = ['critical', 'high', 'medium', 'low'];
  const hasPriorities = priorityOrder.some((pri) => stats.byPriority[pri] > 0);

  if (hasPriorities) {
    lines.push('');
    lines.push('  By Priority:');
    for (const pri of priorityOrder) {
      if (stats.byPriority[pri] > 0) {
        lines.push(`    ${pri}: ${stats.byPriority[pri]}`);
      }
    }
  }

  return lines.join('\n');
}
