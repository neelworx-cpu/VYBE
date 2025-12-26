/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test command for Phase 4 UI widgets
 * Creates a test edit transaction and computes diffs to trigger widget display
 */

import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { IVybeDiffService } from '../../common/vybeDiffService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

export async function testEditWidgets(accessor: ServicesAccessor): Promise<void> {
	const editService = accessor.get(IVybeEditService);
	const diffService = accessor.get(IVybeDiffService);
	const codeEditorService = accessor.get(ICodeEditorService);
	const notificationService = accessor.get(INotificationService);

	try {
		// Get active editor
		const activeEditor = codeEditorService.getFocusedCodeEditor();
		if (!activeEditor) {
			notificationService.warn('No active editor. Please open a file first.');
			return;
		}

		const model = activeEditor.getModel();
		if (!model) {
			notificationService.warn('No model for active editor.');
			return;
		}

		const uri = model.uri;
		const originalContent = model.getValue();

		if (!originalContent) {
			notificationService.warn('File is empty. Please open a file with content.');
			return;
		}

		// Create test modifications
		const testEdit = '\n\n// AI-generated test edit\nfunction testFunction() {\n  console.log("test");\n  return "test";\n}';
		const modifiedContent = originalContent + testEdit;

		// Create transaction
		const transactionId = await editService.createEditTransaction(uri, originalContent, {
			streaming: false,
			source: 'agent'
		});

		// Compute diffs
		const result = await diffService.computeDiffs(uri, originalContent, modifiedContent, {
			ignoreTrimWhitespace: false
		});

		// Get diff areas to verify they were created
		const diffAreas = diffService.getDiffAreasForUri(uri);
		const allDiffs = editService.getDiffsForFile(uri);

		notificationService.info(
			`✅ Test complete! Created transaction ${transactionId.substring(0, 8)}... with ${result.diffs.length} diff(s) in ${result.diffAreas.length} diff area(s). Widgets should now be visible in the editor.`
		);

		console.log('✅ Test Edit Widgets:', {
			transactionId,
			diffsCount: result.diffs.length,
			diffAreasCount: result.diffAreas.length,
			diffAreasFromService: diffAreas.length,
			allDiffsFromService: allDiffs.length,
			uri: uri.toString(),
			diffAreaIds: result.diffAreas.map(da => da.diffAreaId)
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		notificationService.error(`Error testing edit widgets: ${errorMessage}`);
		console.error('Error testing edit widgets:', error);
	}
}

