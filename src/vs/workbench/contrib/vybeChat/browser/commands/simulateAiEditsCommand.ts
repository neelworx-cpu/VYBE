/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEV-ONLY command for simulating AI-style code edits in E2E tests
 * DO NOT use in production code paths
 *
 * This command creates realistic edit transactions with multiple diffs
 * to test Phase 4 UI widgets (VybeDiffHunkWidget, VybeFileCommandBar, decorations)
 */

import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { IVybeDiffService } from '../../common/vybeDiffService.js';
import { IVybeDiffZoneManager } from '../../common/vybeDiffZoneManager.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { STORAGE_KEY_ENABLE_DIFF_DECORATIONS } from '../contribution/vybeDiffDecorations.contribution.js';

/**
 * Creates a test file with known content for E2E testing
 */
function createTestFileContent(): { original: string; modified: string; expectedDiffs: string[] } {
	const original = `// VYBE E2E Test File - Original Content
// This is a comprehensive test file with approximately 100 lines
// It contains various functions, types, and utilities for testing

import { EventEmitter } from 'events';

// Utility types
type Result<T> = {
    success: boolean;
    data?: T;
    error?: string;
};

// Math utilities
function calculateSum(a: number, b: number): number {
    return a + b;
}

function calculateProduct(x: number, y: number): number {
    return x * y;
}

function calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, n) => acc + n, 0);
    return sum / numbers.length;
}

// String utilities
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function reverseString(str: string): string {
    return str.split('').reverse().join('');
}

// Array utilities
function filterEven(numbers: number[]): number[] {
    return numbers.filter(n => n % 2 === 0);
}

function mapToSquares(numbers: number[]): number[] {
    return numbers.map(n => n * n);
}

// Object utilities
interface User {
    id: number;
    name: string;
    email: string;
}

function createUser(id: number, name: string, email: string): User {
    return { id, name, email };
}

function getUserById(users: User[], id: number): User | undefined {
    return users.find(u => u.id === id);
}

// Async utilities
async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUserData(userId: number): Promise<User> {
    await delay(100);
    return { id: userId, name: 'Test User', email: 'test@example.com' };
}

// Event handling
class EventManager extends EventEmitter {
    private events: Map<string, Function[]> = new Map();

    subscribe(event: string, handler: Function): void {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(handler);
    }

    emit(event: string, data: any): void {
        const handlers = this.events.get(event) || [];
        handlers.forEach(handler => handler(data));
    }
}

// Constants
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';

// Configuration
const config = {
    timeout: DEFAULT_TIMEOUT,
    retries: MAX_RETRIES,
    baseUrl: API_BASE_URL,
};

// This is a comment that will be modified
const greeting = "Hello";

// Export all utilities
export {
    calculateSum,
    calculateProduct,
    calculateAverage,
    capitalize,
    reverseString,
    filterEven,
    mapToSquares,
    createUser,
    getUserById,
    delay,
    fetchUserData,
    EventManager,
    greeting,
    config,
};
`;

	const modified = `// VYBE E2E Test File - Modified Content
// This is a comprehensive test file with approximately 100 lines
// It contains various functions, types, and utilities for testing
// Updated with improved implementations and new features

import { EventEmitter } from 'events';

// Utility types
type Result<T> = {
    success: boolean;
    data?: T;
    error?: string;
};

// Math utilities
function calculateSum(a: number, b: number): number {
    // Added: Better implementation with validation
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Invalid arguments');
    }
    return a + b;
}

function calculateProduct(x: number, y: number): number {
    return x * y;
}

// NEW FUNCTION ADDED
function calculateDifference(x: number, y: number): number {
    return x - y;
}

function calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, n) => acc + n, 0);
    return sum / numbers.length;
}

// String utilities
function capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function reverseString(str: string): string {
    return str.split('').reverse().join('');
}

// Array utilities
function filterEven(numbers: number[]): number[] {
    return numbers.filter(n => n % 2 === 0);
}

function mapToSquares(numbers: number[]): number[] {
    return numbers.map(n => n * n);
}

// Object utilities
interface User {
    id: number;
    name: string;
    email: string;
    // Added: Optional avatar field
    avatar?: string;
}

function createUser(id: number, name: string, email: string, avatar?: string): User {
    return { id, name, email, avatar };
}

function getUserById(users: User[], id: number): User | undefined {
    return users.find(u => u.id === id);
}

// Async utilities
async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUserData(userId: number): Promise<User> {
    await delay(100);
    return { id: userId, name: 'Test User', email: 'test@example.com' };
}

// Event handling
class EventManager extends EventEmitter {
    private events: Map<string, Function[]> = new Map();

    subscribe(event: string, handler: Function): void {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(handler);
    }

    emit(event: string, data: any): void {
        const handlers = this.events.get(event) || [];
        handlers.forEach(handler => handler(data));
    }

    // Added: Unsubscribe method
    unsubscribe(event: string, handler: Function): void {
        const handlers = this.events.get(event) || [];
        const index = handlers.indexOf(handler);
        if (index > -1) {
            handlers.splice(index, 1);
        }
    }
}

// Constants
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';

// Configuration
const config = {
    timeout: DEFAULT_TIMEOUT,
    retries: MAX_RETRIES,
    baseUrl: API_BASE_URL,
    // Added: New debug option
    debug: false,
};

// This comment was modified to reflect the changes
const greeting = "Hello, World!";

// Export all utilities
export {
    calculateSum,
    calculateProduct,
    calculateDifference,
    calculateAverage,
    capitalize,
    reverseString,
    filterEven,
    mapToSquares,
    createUser,
    getUserById,
    delay,
    fetchUserData,
    EventManager,
    greeting,
    config,
};
`;

	// NOTE: This is just documentation of expected changes.
	// The actual diffs are computed by VS Code's diff engine, which may group/split
	// changes differently. Check the console logs to see what diffs are actually created.
	const expectedDiffs = [
		'Line 1: Modified header comment',
		'Line 16-20: Modified function calculateSum (added validation)',
		'Line 23-26: Inserted new function calculateDifference',
		'Line 33-35: Modified capitalize function (added null check and toLowerCase)',
		'Line 57-58: Modified User interface (added optional avatar field)',
		'Line 60-62: Modified createUser function (added avatar parameter)',
		'Line 87-92: Modified EventManager class (added unsubscribe method)',
		'Line 100-102: Modified config object (added debug option)',
		'Line 105: Modified comment',
		'Line 106: Modified greeting string',
		'Line 109: Modified export statement (added calculateDifference)'
	];

	return { original, modified, expectedDiffs };
}

export async function simulateAiEdits(accessor: ServicesAccessor): Promise<void> {
	// DEV-ONLY: This command is for E2E testing only
	const editService = accessor.get(IVybeEditService);
	const diffService = accessor.get(IVybeDiffService);
	const diffZoneManager = accessor.get(IVybeDiffZoneManager);
	const notificationService = accessor.get(INotificationService);
	const editorService = accessor.get(IEditorService);
	const modelService = accessor.get(IModelService);
	const storageService = accessor.get(IStorageService);

	try {
		// CRITICAL: Enable diff decorations for E2E testing
		// Decorations are disabled by default, so we must enable them for the test to work
		storageService.store(STORAGE_KEY_ENABLE_DIFF_DECORATIONS, true, StorageScope.APPLICATION, StorageTarget.USER);
		console.log('[VYBE E2E] ✅ Enabled diff decorations for testing');
		// Create test file with known content
		const testUri = URI.parse('untitled:vybe-test-file.ts');
		const { original, modified, expectedDiffs } = createTestFileContent();

		console.log('═══════════════════════════════════════════════════════════');
		console.log('[VYBE E2E] CREATING TEST FILE WITH KNOWN CONTENT');
		console.log('═══════════════════════════════════════════════════════════');
		console.log('\n📄 ORIGINAL CONTENT:');
		console.log('───────────────────────────────────────────────────────────');
		console.log(original);
		console.log('\n📝 MODIFIED CONTENT:');
		console.log('───────────────────────────────────────────────────────────');
		console.log(modified);
		console.log('\n🎯 EXPECTED DIFFS:');
		expectedDiffs.forEach((diff, i) => console.log(`  ${i + 1}. ${diff}`));
		console.log('═══════════════════════════════════════════════════════════\n');

		// Create or get the model with ORIGINAL content
		// The model will be updated with MODIFIED content by computeDiffs
		let model = modelService.getModel(testUri);
		if (!model) {
			model = modelService.createModel(original, null, testUri);
		} else {
			model.setValue(original);
		}

		// Open the file in an editor FIRST
		await editorService.openEditor({
			resource: testUri,
			options: {
				pinned: true
			},
			languageId: 'typescript'
		});

		// Wait for editor to fully open and model to mount
		await new Promise(resolve => setTimeout(resolve, 500));

		const uri = testUri;
		const originalContent = original;

		// Create transaction
		const transactionId = await editService.createEditTransaction(uri, originalContent, {
			streaming: false,
			source: 'tool' // DEV-ONLY: Using 'tool' for E2E test harness
		});

		console.log('[VYBE E2E] ✅ Created transaction:', transactionId);

		// Compute diffs - this will write modified content to the model
		// and create decorations
		const result = await diffService.computeDiffs(uri, originalContent, modified, {
			ignoreTrimWhitespace: false
		});

		// CRITICAL: Manually trigger zone creation and decoration refresh
		// The zone manager might not have received the event yet, or the editor might not be found
		// This ensures decorations are applied immediately after computeDiffs
		diffZoneManager.refreshDecorationsForUri(uri);

		// Wait a bit for decorations to be applied
		await new Promise(resolve => setTimeout(resolve, 500));

		// Detailed logging
		console.log('\n═══════════════════════════════════════════════════════════');
		console.log('[VYBE E2E] DIFF COMPUTATION RESULTS');
		console.log('═══════════════════════════════════════════════════════════');
		console.log(`Transaction ID: ${transactionId}`);
		console.log(`Diffs created: ${result.diffs.length}`);
		console.log(`Diff areas: ${result.diffAreas.length}`);
		console.log(`\n📊 DETAILED DIFFS:`);
		console.log('───────────────────────────────────────────────────────────');

		result.diffs.forEach((diff, i) => {
			console.log(`\n${i + 1}. Diff ID: ${diff.diffId.substring(0, 8)}...`);
			console.log(`   Type: ${diff.originalRange.isEmpty ? 'INSERT' : diff.modifiedRange.isEmpty ? 'DELETE' : 'EDIT'}`);
			console.log(`   Original Range: Line ${diff.originalRange.startLineNumber}-${diff.originalRange.endLineNumberExclusive}`);
			console.log(`   Modified Range: Line ${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`);
			console.log(`   State: ${diff.state}`);
			console.log(`   Original Code (${diff.originalCode.length} chars):`);
			console.log(`   ${diff.originalCode.split('\n').map((l, idx) => `      ${idx + 1}: ${l}`).join('\n')}`);
			console.log(`   Modified Code (${diff.modifiedCode.length} chars):`);
			console.log(`   ${diff.modifiedCode.split('\n').map((l, idx) => `      ${idx + 1}: ${l}`).join('\n')}`);
		});

		console.log('\n═══════════════════════════════════════════════════════════');
		console.log('[VYBE E2E] TEST READY - You can now:');
		console.log('  1. Click "Keep" on any diff widget');
		console.log('  2. Click "Undo" on any diff widget');
		console.log('  3. Click "Keep All" in the file command bar');
		console.log('  4. Click "Undo All" in the file command bar');
		console.log('  5. Type between diffs to see if decorations move');
		console.log('═══════════════════════════════════════════════════════════\n');

		notificationService.info(
			`✅ E2E Test: Created ${result.diffs.length} diff(s). Check console for details. Test file: ${testUri.path}`
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		notificationService.error(`Error simulating AI edits: ${errorMessage}`);
		console.error('[VYBE E2E] Error simulating AI edits:', error);
	}
}

