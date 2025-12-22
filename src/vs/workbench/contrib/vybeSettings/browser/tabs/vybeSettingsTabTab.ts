/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createCell } from '../vybeSettingsComponents.js';

export function renderTabTab(parent: HTMLElement): void {
	// Main section (no title)
	const mainSection = createSection(parent, null);
	const mainSectionList = mainSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const mainSubSection = DOM.append(mainSectionList, DOM.$('.cursor-settings-sub-section'));

	// Cursor Tab cell
	createCell(mainSubSection, {
		label: 'Cursor Tab',
		description: 'Context-aware, multi-line suggestions around your cursor based on recent edits',
		action: { type: 'switch', checked: true }
	});

	// Partial Accepts cell - with info icon in label
	const partialAcceptsCell = createCell(mainSubSection, {
		label: 'Partial Accepts',
		description: 'Accept the next word of a suggestion via ⌘→',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Add info icon to the label
	const partialAcceptsLabel = partialAcceptsCell.querySelector('.cursor-settings-cell-label') as HTMLElement;
	if (partialAcceptsLabel) {
		const infoIconContainer = DOM.append(partialAcceptsLabel, DOM.$('div'));
		infoIconContainer.style.cssText = 'display: flex; align-items: center; justify-content: center;';

		const infoIcon = DOM.append(infoIconContainer, DOM.$('span.codicon.codicon-info'));
		infoIcon.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground);';
	}

	// Suggestions While Commenting cell
	createCell(mainSubSection, {
		label: 'Suggestions While Commenting',
		description: 'Allow Tab to trigger while in a comment region',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// Whitespace-Only Suggestions cell
	createCell(mainSubSection, {
		label: 'Whitespace-Only Suggestions',
		description: 'Suggest edits like new lines and indentation that modify whitespace only',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Imports cell
	createCell(mainSubSection, {
		label: 'Imports',
		description: 'Automatically import necessary modules for TypeScript',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// Auto Import for Python cell - with BETA badge
	const autoImportCell = createCell(mainSubSection, {
		label: 'Auto Import for Python',
		description: 'Enable auto import for Python. This is a beta feature.',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Add BETA badge to the label
	const autoImportLabel = autoImportCell.querySelector('.cursor-settings-cell-label') as HTMLElement;
	if (autoImportLabel) {
		const betaBadge = DOM.append(autoImportLabel, DOM.$('span.cursor-badge.cursor-badge-subtle.cursor-badge-small'));
		betaBadge.textContent = 'BETA';
		betaBadge.style.cssText = `
			margin-left: 4px;
			padding: 2px 6px;
			border-radius: 3px;
			font-size: 10px;
			font-weight: 500;
			background-color: rgba(20, 20, 20, 0.08);
			color: rgba(20, 20, 20, 0.65);
		`;
	}

	// Add trailing caption div (empty for now, but structure matches outerHTML)
	const subSectionTrailingCaption = DOM.append(mainSubSection, DOM.$('.cursor-settings-sub-section-trailing-caption'));
	subSectionTrailingCaption.style.cssText = 'display: block;';
}




