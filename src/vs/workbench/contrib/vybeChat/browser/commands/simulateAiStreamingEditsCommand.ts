/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEV-ONLY command for simulating streaming AI-style code edits in E2E tests
 * DO NOT use in production code paths
 *
 * This command simulates incremental streaming updates to test
 * Phase 4 UI widgets with streaming diffs
 */

import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { IVybeDiffService } from '../../common/vybeDiffService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IModelService } from '../../../../../editor/common/services/model.js';

/**
 * Creates a test file with known content for streaming E2E testing
 */
function createStreamingTestFileContent(): { original: string; final: string } {
	const original = `// VYBE Streaming E2E Test - Original
function test() {
    return 1;
}
`;

	const final = `// VYBE Streaming E2E Test - Final
function test() {
    return 1;
}

// Streamed addition 1
function added1() {
    return 2;
}

// Streamed addition 2
function added2() {
    return 3;
}
`;

	return { original, final };
}

/**
 * Break content into chunks for streaming simulation
 */
function breakIntoChunks(content: string, chunkCount: number = 5): string[] {
	const lines = content.split('\n');
	const totalLines = lines.length;
	const chunkSize = Math.ceil(totalLines / chunkCount);
	const chunks: string[] = [];

	for (let i = 0; i < chunkCount; i++) {
		const startLine = i * chunkSize;
		const endLine = Math.min(startLine + chunkSize, totalLines);
		chunks.push(lines.slice(0, endLine).join('\n'));
	}

	return chunks;
}

/**
 * Delay helper for streaming simulation
 */
function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function simulateAiStreamingEdits(accessor: ServicesAccessor): Promise<void> {
	// DEV-ONLY: This command is for E2E testing only
	const editService = accessor.get(IVybeEditService);
	const diffService = accessor.get(IVybeDiffService);
	const notificationService = accessor.get(INotificationService);
	const editorService = accessor.get(IEditorService);
	const modelService = accessor.get(IModelService);

	try {
		// Create test file with known content
		const testUri = URI.parse('untitled:vybe-streaming-test.ts');
		const { original, final } = createStreamingTestFileContent();

		console.log('═══════════════════════════════════════════════════════════');
		console.log('[VYBE E2E Streaming] CREATING STREAMING TEST FILE');
		console.log('═══════════════════════════════════════════════════════════');
		console.log('\n📄 ORIGINAL CONTENT:');
		console.log('───────────────────────────────────────────────────────────');
		console.log(original);
		console.log('\n📝 FINAL CONTENT (will be streamed):');
		console.log('───────────────────────────────────────────────────────────');
		console.log(final);
		console.log('═══════════════════════════════════════════════════════════\n');

		// Create or get the model
		let model = modelService.getModel(testUri);
		if (!model) {
			model = modelService.createModel(original, null, testUri);
		} else {
			model.setValue(original);
		}

		// Open the file in an editor
		await editorService.openEditor({
			resource: testUri,
			options: {
				pinned: true
			},
			languageId: 'typescript'
		});

		// Wait a bit for editor to open
		await new Promise(resolve => setTimeout(resolve, 200));

		const uri = testUri;
		const originalContent = original;
		const finalModifiedContent = final;

		// Create streaming transaction
		const transactionId = await editService.createEditTransaction(uri, originalContent, {
			streaming: true,
			source: 'tool' // DEV-ONLY: Using 'tool' for E2E test harness
		});

		console.log('[VYBE E2E Streaming] Created streaming transaction:', transactionId);

		// Break final content into chunks
		const chunks = breakIntoChunks(finalModifiedContent, 5);
		console.log('[VYBE E2E Streaming] Breaking content into', chunks.length, 'chunks');

		// First chunk: Create initial diff area using computeDiffs
		const firstChunk = chunks[0];
		console.log(`[VYBE E2E Streaming] Creating initial diff area with first chunk`);
		const initialResult = await diffService.computeDiffs(uri, originalContent, firstChunk, {
			ignoreTrimWhitespace: false
		});

		if (initialResult.diffAreas.length === 0) {
			notificationService.warn('No diff areas created from first chunk. Cannot proceed with streaming.');
			return;
		}

		const diffAreaId = initialResult.diffAreas[0].diffAreaId;
		console.log('[VYBE E2E Streaming] Created initial diff area with ID:', diffAreaId);

		// Stream remaining chunks incrementally
		for (let i = 1; i < chunks.length; i++) {
			const chunkContent = chunks[i];
			console.log(`[VYBE E2E Streaming] Streaming chunk ${i + 1}/${chunks.length}`);

			const result = await diffService.updateDiffsForStreaming(diffAreaId, chunkContent);

			console.log(`[VYBE E2E Streaming] Chunk ${i + 1} update:`, {
				newDiffs: result.newDiffs.length,
				updatedDiffs: result.updatedDiffs.length,
				removedDiffs: result.removedDiffs.length
			});

			// Add delay between chunks (200-500ms) for realistic streaming effect
			if (i < chunks.length - 1) {
				const delayMs = 200 + Math.random() * 300; // 200-500ms
				await delay(delayMs);
			}
		}

		// Final verification
		const diffAreas = diffService.getDiffAreasForUri(uri);
		const allDiffs = editService.getDiffsForFile(uri);

		console.log('\n═══════════════════════════════════════════════════════════');
		console.log('[VYBE E2E Streaming] STREAMING COMPLETE');
		console.log('═══════════════════════════════════════════════════════════');
		console.log(`Transaction ID: ${transactionId}`);
		console.log(`Diff Area ID: ${diffAreaId}`);
		console.log(`Chunks streamed: ${chunks.length}`);
		console.log(`Final diffs: ${allDiffs.length}`);
		console.log(`Diff areas: ${diffAreas.length}`);
		console.log('\n📊 FINAL DIFFS:');
		console.log('───────────────────────────────────────────────────────────');
		allDiffs.forEach((diff, i) => {
			console.log(`\n${i + 1}. ${diff.diffId.substring(0, 8)}... - ${diff.state}`);
			console.log(`   Original: Line ${diff.originalRange.startLineNumber}-${diff.originalRange.endLineNumberExclusive}`);
			console.log(`   Modified: Line ${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`);
		});
		console.log('\n═══════════════════════════════════════════════════════════\n');

		notificationService.info(
			`✅ E2E Streaming Test: Streamed ${chunks.length} chunks, created ${allDiffs.length} diff(s). Check console for details.`
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		notificationService.error(`Error simulating streaming AI edits: ${errorMessage}`);
		console.error('[VYBE E2E Streaming] Error simulating streaming AI edits:', error);
	}
}

