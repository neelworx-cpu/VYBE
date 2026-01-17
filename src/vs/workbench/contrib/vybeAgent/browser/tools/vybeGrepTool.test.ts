/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Grep Tool Tests
 *
 * Tests for pattern normalization and grep functionality.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { normalizeGrepPattern, normalizeGlobPattern } from './vybeGrepTool.js';

suite('VybeGrepTool', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('normalizeGrepPattern', () => {

		// ========================================================================
		// Multiline mode detection
		// The function detects if ^ or $ anchors are present and sets needsMultiline
		// ========================================================================

		test('simple word - no multiline needed', () => {
			const result = normalizeGrepPattern('import');
			assert.strictEqual(result.normalized, 'import');
			assert.strictEqual(result.wasNormalized, false);
			assert.strictEqual(result.needsMultiline, false);
		});

		test('^import - needs multiline', () => {
			const result = normalizeGrepPattern('^import');
			assert.strictEqual(result.normalized, '^import');
			assert.strictEqual(result.wasNormalized, false);
			assert.strictEqual(result.needsMultiline, true);
		});

		test('^import$ - needs multiline', () => {
			const result = normalizeGrepPattern('^import$');
			assert.strictEqual(result.normalized, '^import$');
			assert.strictEqual(result.needsMultiline, true);
		});

		test('import$ - needs multiline', () => {
			const result = normalizeGrepPattern('import$');
			assert.strictEqual(result.normalized, 'import$');
			assert.strictEqual(result.needsMultiline, true);
		});

		test('import|export - no multiline needed', () => {
			const result = normalizeGrepPattern('import|export');
			assert.strictEqual(result.normalized, 'import|export');
			assert.strictEqual(result.needsMultiline, false);
		});

		test('\\bimport\\b - no multiline needed', () => {
			const result = normalizeGrepPattern('\\bimport\\b');
			assert.strictEqual(result.normalized, '\\bimport\\b');
			assert.strictEqual(result.needsMultiline, false);
		});

		test('empty string - no multiline needed', () => {
			const result = normalizeGrepPattern('');
			assert.strictEqual(result.normalized, '');
			assert.strictEqual(result.needsMultiline, false);
		});

		test('^ alone - needs multiline', () => {
			const result = normalizeGrepPattern('^');
			assert.strictEqual(result.normalized, '^');
			assert.strictEqual(result.needsMultiline, true);
		});

		test('complex regex with ^ - needs multiline', () => {
			const result = normalizeGrepPattern('^import\\s+\\w+');
			assert.strictEqual(result.normalized, '^import\\s+\\w+');
			assert.strictEqual(result.needsMultiline, true);
		});

		test('regex without anchors - no multiline needed', () => {
			const result = normalizeGrepPattern('function\\s+\\w+\\s*\\(');
			assert.strictEqual(result.normalized, 'function\\s+\\w+\\s*\\(');
			assert.strictEqual(result.needsMultiline, false);
		});
	});

	suite('normalizeGlobPattern', () => {

		test('*.ts becomes **/*.ts', () => {
			const result = normalizeGlobPattern('*.ts');
			assert.strictEqual(result, '**/*.ts');
		});

		test('*.{js,jsx} becomes **/*.{js,jsx}', () => {
			const result = normalizeGlobPattern('*.{js,jsx}');
			assert.strictEqual(result, '**/*.{js,jsx}');
		});

		test('**/*.ts stays unchanged', () => {
			const result = normalizeGlobPattern('**/*.ts');
			assert.strictEqual(result, '**/*.ts');
		});

		test('src/*.ts stays unchanged (has directory prefix)', () => {
			const result = normalizeGlobPattern('src/*.ts');
			assert.strictEqual(result, 'src/*.ts');
		});

		test('empty string stays empty', () => {
			const result = normalizeGlobPattern('');
			assert.strictEqual(result, '');
		});
	});
});
