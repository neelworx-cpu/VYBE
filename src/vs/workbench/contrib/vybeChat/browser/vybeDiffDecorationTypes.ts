/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Diff Decoration Types
 * Registers decoration types for visual diff highlights.
 */

import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';

/**
 * Whole-line decoration for added lines (insertions).
 */
export const vybeDiffLineAddedDecoration = ModelDecorationOptions.register({
	className: 'vybe-diff-line-added',
	description: 'vybe-diff-line-added',
	isWholeLine: true,
	glyphMarginClassName: 'vybe-diff-glyph',
});

/**
 * Whole-line decoration for edited lines (modifications).
 */
export const vybeDiffLineEditedDecoration = ModelDecorationOptions.register({
	className: 'vybe-diff-line-edited',
	description: 'vybe-diff-line-edited',
	isWholeLine: true,
	glyphMarginClassName: 'vybe-diff-glyph',
});

/**
 * Whole-line decoration for deleted lines.
 * Note: Deletions are represented at the nearest valid line in the modified model.
 */
export const vybeDiffLineDeletedDecoration = ModelDecorationOptions.register({
	className: 'vybe-diff-line-deleted',
	description: 'vybe-diff-line-deleted',
	isWholeLine: true,
	glyphMarginClassName: 'vybe-diff-glyph',
});

