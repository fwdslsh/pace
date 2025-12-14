/**
 * validators.test.ts - Unit tests for validation functions
 */

import { describe, test, expect } from 'bun:test';
import {
	validateFeature,
	validateMetadata,
	validateFeatureList,
	formatValidationErrors,
	formatValidationStats
} from '../src/validators';
import type { Feature, FeatureList } from '../src/types';

describe('validators', () => {
	describe('validateFeature()', () => {
		test('should validate correct feature', () => {
			const feature: Feature = {
				id: 'F001',
				category: 'auth',
				description: 'User authentication feature',
				priority: 'high',
				steps: ['Step 1', 'Step 2'],
				passes: false
			};

			const errors = validateFeature(feature, 0);
			expect(errors.length).toBe(0);
		});

		test('should detect missing required fields', () => {
			const feature: any = {
				id: 'F001',
				// missing category, description, priority, steps, passes
			};

			const errors = validateFeature(feature, 0);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.field === 'category')).toBe(true);
			expect(errors.some((e) => e.field === 'description')).toBe(true);
		});

		test('should detect invalid priority', () => {
			const feature: any = {
				id: 'F001',
				category: 'test',
				description: 'Test feature description here',
				priority: 'invalid_priority',
				steps: ['Step 1'],
				passes: false
			};

			const errors = validateFeature(feature, 0);
			expect(errors.some((e) => e.field === 'priority')).toBe(true);
		});

		test('should detect short description', () => {
			const feature: any = {
				id: 'F001',
				category: 'test',
				description: 'Short',
				priority: 'high',
				steps: ['Step 1'],
				passes: false
			};

			const errors = validateFeature(feature, 0);
			expect(errors.some((e) => e.field === 'description')).toBe(true);
			expect(errors.some((e) => e.message.includes('too short'))).toBe(true);
		});

		test('should detect empty steps array', () => {
			const feature: any = {
				id: 'F001',
				category: 'test',
				description: 'Test feature description',
				priority: 'high',
				steps: [],
				passes: false
			};

			const errors = validateFeature(feature, 0);
			expect(errors.some((e) => e.field === 'steps')).toBe(true);
		});

		test('should detect non-string steps', () => {
			const feature: any = {
				id: 'F001',
				category: 'test',
				description: 'Test feature description',
				priority: 'high',
				steps: ['Step 1', 123, 'Step 3'],
				passes: false
			};

			const errors = validateFeature(feature, 0);
			expect(errors.some((e) => e.field === 'steps')).toBe(true);
		});

		test('should detect non-boolean passes', () => {
			const feature: any = {
				id: 'F001',
				category: 'test',
				description: 'Test feature description',
				priority: 'high',
				steps: ['Step 1'],
				passes: 'true' // string instead of boolean
			};

			const errors = validateFeature(feature, 0);
			expect(errors.some((e) => e.field === 'passes')).toBe(true);
		});
	});

	describe('validateMetadata()', () => {
		test('should validate correct metadata', () => {
			const metadata = {
				project_name: 'Test Project',
				total_features: 5,
				passing: 3,
				failing: 2
			};

			const actualCounts = { total: 5, passing: 3, failing: 2 };
			const errors = validateMetadata(metadata, actualCounts);
			expect(errors.length).toBe(0);
		});

		test('should detect missing required fields', () => {
			const metadata: any = {
				project_name: 'Test Project'
				// missing total_features, passing, failing
			};

			const actualCounts = { total: 0, passing: 0, failing: 0 };
			const errors = validateMetadata(metadata, actualCounts);
			expect(errors.length).toBeGreaterThan(0);
		});

		test('should detect mismatched counts', () => {
			const metadata = {
				project_name: 'Test Project',
				total_features: 10,
				passing: 6,
				failing: 3 // Should be 4 to sum to 10
			};

			const actualCounts = { total: 10, passing: 6, failing: 4 };
			const errors = validateMetadata(metadata, actualCounts);
			expect(errors.length).toBeGreaterThan(0);
		});

		test('should detect mismatch with actual counts', () => {
			const metadata = {
				project_name: 'Test Project',
				total_features: 5,
				passing: 3,
				failing: 2
			};

			const actualCounts = { total: 6, passing: 4, failing: 2 };
			const errors = validateMetadata(metadata, actualCounts);
			expect(errors.some((e) => e.message.includes('actual count'))).toBe(true);
		});
	});

	describe('validateFeatureList()', () => {
		test('should validate correct feature list', () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'auth',
						description: 'User authentication',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F002',
						category: 'ui',
						description: 'Dark mode toggle',
						priority: 'medium',
						steps: ['Step 1'],
						passes: true
					}
				],
				metadata: {
					project_name: 'Test',
					total_features: 2,
					passing: 1,
					failing: 1
				}
			};

			const result = validateFeatureList(data);
			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
			expect(result.stats.total).toBe(2);
			expect(result.stats.passing).toBe(1);
		});

		test('should detect missing features array', () => {
			const data: any = {
				metadata: {}
			};

			const result = validateFeatureList(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === 'features')).toBe(true);
		});

		test('should detect duplicate IDs', () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'First feature here',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F001', // Duplicate
						category: 'test',
						description: 'Second feature here',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			const result = validateFeatureList(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
		});

		test('should validate stats calculation', () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'auth',
						description: 'Authentication feature',
						priority: 'critical',
						steps: ['Step 1'],
						passes: true
					},
					{
						id: 'F002',
						category: 'auth',
						description: 'Authorization feature',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F003',
						category: 'ui',
						description: 'UI feature here today',
						priority: 'medium',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			const result = validateFeatureList(data);
			expect(result.stats.total).toBe(3);
			expect(result.stats.passing).toBe(2);
			expect(result.stats.failing).toBe(1);
			expect(result.stats.byCategory['auth']).toBe(2);
			expect(result.stats.byCategory['ui']).toBe(1);
			expect(result.stats.byPriority.critical).toBe(1);
			expect(result.stats.byPriority.high).toBe(1);
		});

		test('should validate with invalid metadata', () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Test feature description',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					}
				],
				metadata: {
					project_name: 'Test',
					total_features: 5, // Wrong count
					passing: 0, // Wrong count
					failing: 5 // Wrong count
				}
			};

			const result = validateFeatureList(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.featureId === 'metadata')).toBe(true);
		});
	});

	describe('formatValidationErrors()', () => {
		test('should format no errors correctly', () => {
			const output = formatValidationErrors([]);
			expect(output).toContain('VALID');
		});

		test('should format errors correctly', () => {
			const errors = [
				{ featureId: 'F001', field: 'description', message: 'Too short' },
				{ featureId: 'F002', field: 'priority', message: 'Invalid priority' }
			];

			const output = formatValidationErrors(errors);
			expect(output).toContain('INVALID');
			expect(output).toContain('2 error');
			expect(output).toContain('F001');
			expect(output).toContain('F002');
		});
	});

	describe('formatValidationStats()', () => {
		test('should format stats correctly', () => {
			const stats = {
				total: 5,
				passing: 3,
				failing: 2,
				byCategory: { auth: 2, ui: 3 },
				byPriority: { critical: 1, high: 2, medium: 1, low: 1 }
			};

			const output = formatValidationStats(stats);
			expect(output).toContain('Total features: 5');
			expect(output).toContain('Passing: 3');
			expect(output).toContain('Failing: 2');
			expect(output).toContain('auth: 2');
			expect(output).toContain('ui: 3');
		});

		test('should handle empty stats', () => {
			const stats = {
				total: 0,
				passing: 0,
				failing: 0,
				byCategory: {},
				byPriority: { critical: 0, high: 0, medium: 0, low: 0 }
			};

			const output = formatValidationStats(stats);
			expect(output).toContain('Total features: 0');
		});
	});
});
