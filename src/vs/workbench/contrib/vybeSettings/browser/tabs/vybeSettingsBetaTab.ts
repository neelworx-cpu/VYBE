/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createCell } from '../vybeSettingsComponents.js';

export function renderBetaTab(parent: HTMLElement): void {
	// Beta section (no title)
	const betaSection = createSection(parent, null);
	const betaSectionList = betaSection.querySelector('.cursor-settings-section-list') as HTMLElement;

	// Update Access sub-section
	const updateSubSection = DOM.append(betaSectionList, DOM.$('.cursor-settings-sub-section'));
	const updateSubSectionList = DOM.append(updateSubSection, DOM.$('.cursor-settings-sub-section-list'));
	updateSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Update Access cell
	const updateCell = DOM.append(updateSubSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	updateCell.style.cssText = `
		display: flex;
		align-items: flex-start;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	const updateLeading = DOM.append(updateCell, DOM.$('.cursor-settings-cell-leading-items'));
	updateLeading.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const updateLabel = DOM.append(updateLeading, DOM.$('p.cursor-settings-cell-label'));
	updateLabel.textContent = 'Update Access';
	updateLabel.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const updateDesc = DOM.append(updateLeading, DOM.$('p.cursor-settings-cell-description'));
	updateDesc.textContent = 'By default, get notifications for stable updates. In Early Access, pre-release builds may be unstable for production work.';
	updateDesc.style.cssText = `
		margin: 0;
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const updateTrailing = DOM.append(updateCell, DOM.$('.cursor-settings-cell-trailing-items'));
	updateTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	const updateDropdown = DOM.append(updateTrailing, DOM.$('div.solid-dropdown'));
	updateDropdown.id = 'solid-dropdown-7efg91eb43l';

	const updateDropdownButton = DOM.append(updateDropdown, DOM.$('button.solid-dropdown-toggle'));
	updateDropdownButton.style.cssText = 'cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background);';

	const updateDropdownLabel = DOM.append(updateDropdownButton, DOM.$('div.solid-dropdown-toggle-label.solid-dropdown-toggle-label-min'));
	updateDropdownLabel.textContent = 'Default';
	updateDropdownLabel.style.cssText = 'font-size: 12px; color: var(--vscode-input-foreground);';

	const updateDropdownChevron = DOM.append(updateDropdownButton, DOM.$('span.codicon.codicon-chevron-up-down'));
	updateDropdownChevron.style.cssText = 'color: var(--cursor-icon-secondary); font-size: 14px;';

	// Beta features sub-section
	const featuresSubSection = DOM.append(betaSectionList, DOM.$('.cursor-settings-sub-section'));
	const featuresSubSectionList = DOM.append(featuresSubSection, DOM.$('.cursor-settings-sub-section-list'));
	featuresSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Agent Autocomplete cell
	createCell(featuresSubSectionList, {
		label: 'Agent Autocomplete',
		description: 'Contextual suggestions while prompting Agent',
		action: { type: 'switch', checked: true }
	});

	// Extension RPC Tracer cell
	createCell(featuresSubSectionList, {
		label: 'Extension RPC Tracer',
		description: 'Log extension host RPC messages to JSON files viewable in Perfetto for performance analysis. Requires a restart to take effect.',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Development section
	const devSection = createSection(parent, 'Development');
	const devSectionList = devSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const devSubSection = DOM.append(devSectionList, DOM.$('.cursor-settings-sub-section'));
	const devSubSectionList = DOM.append(devSubSection, DOM.$('.cursor-settings-sub-section-list'));
	devSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;
	// Empty for now as per outerHTML
}




