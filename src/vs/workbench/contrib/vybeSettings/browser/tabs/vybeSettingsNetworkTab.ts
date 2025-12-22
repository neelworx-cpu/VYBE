/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection } from '../vybeSettingsComponents.js';

export function renderNetworkTab(parent: HTMLElement): void {
	// Network section (no title)
	const networkSection = createSection(parent, null);
	const networkSectionList = networkSection.querySelector('.cursor-settings-section-list') as HTMLElement;

	// HTTP Compatibility Mode sub-section
	const httpSubSection = DOM.append(networkSectionList, DOM.$('.cursor-settings-sub-section'));
	const httpSubSectionList = DOM.append(httpSubSection, DOM.$('.cursor-settings-sub-section-list'));
	httpSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// HTTP Compatibility Mode cell
	const httpCell = DOM.append(httpSubSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	httpCell.style.cssText = `
		display: flex;
		align-items: flex-start;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	const httpLeading = DOM.append(httpCell, DOM.$('.cursor-settings-cell-leading-items'));
	httpLeading.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const httpLabel = DOM.append(httpLeading, DOM.$('p.cursor-settings-cell-label'));
	httpLabel.textContent = 'HTTP Compatibility Mode';
	httpLabel.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const httpDesc = DOM.append(httpLeading, DOM.$('p.cursor-settings-cell-description'));
	httpDesc.textContent = 'HTTP/2 is recommended for low-latency streaming. In some corporate proxy and VPN environments, the compatibility mode may need to be lowered.';
	httpDesc.style.cssText = `
		margin: 0;
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const httpTrailing = DOM.append(httpCell, DOM.$('.cursor-settings-cell-trailing-items'));
	httpTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	const httpDropdown = DOM.append(httpTrailing, DOM.$('div.solid-dropdown'));
	httpDropdown.id = 'solid-dropdown-r1t4b1ntypk';

	const httpDropdownButton = DOM.append(httpDropdown, DOM.$('button.solid-dropdown-toggle'));
	httpDropdownButton.style.cssText = 'cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background);';

	const httpDropdownLabel = DOM.append(httpDropdownButton, DOM.$('div.solid-dropdown-toggle-label.solid-dropdown-toggle-label-min'));
	httpDropdownLabel.textContent = 'HTTP/2';
	httpDropdownLabel.style.cssText = 'font-size: 12px; color: var(--vscode-input-foreground);';

	const httpDropdownChevron = DOM.append(httpDropdownButton, DOM.$('span.codicon.codicon-chevron-up-down'));
	httpDropdownChevron.style.cssText = 'color: var(--cursor-icon-secondary); font-size: 14px;';

	// Network Diagnostics sub-section
	const diagnosticsSubSection = DOM.append(networkSectionList, DOM.$('.cursor-settings-sub-section'));
	const diagnosticsSubSectionList = DOM.append(diagnosticsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	diagnosticsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Network Diagnostics cell
	const diagnosticsCell = DOM.append(diagnosticsSubSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	diagnosticsCell.style.cssText = `
		display: flex;
		align-items: flex-start;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	const diagnosticsLeading = DOM.append(diagnosticsCell, DOM.$('.cursor-settings-cell-leading-items'));
	diagnosticsLeading.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const diagnosticsLabel = DOM.append(diagnosticsLeading, DOM.$('p.cursor-settings-cell-label'));
	diagnosticsLabel.textContent = 'Network Diagnostics';
	diagnosticsLabel.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const diagnosticsDesc = DOM.append(diagnosticsLeading, DOM.$('div.cursor-settings-cell-description'));
	diagnosticsDesc.textContent = 'Check network connectivity to backend AI services';
	diagnosticsDesc.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const diagnosticsTrailing = DOM.append(diagnosticsCell, DOM.$('.cursor-settings-cell-trailing-items'));
	diagnosticsTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	const diagnosticsButtonContainer = DOM.append(diagnosticsTrailing, DOM.$('div'));
	diagnosticsButtonContainer.style.cssText = 'display: flex;';

	const diagnosticsButton = DOM.append(diagnosticsButtonContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	diagnosticsButton.textContent = 'Run Diagnostic';
	diagnosticsButton.style.cssText = 'user-select: none; flex-shrink: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;';

	// Diagnostic progress container (initially empty)
	const diagnosticProgress = DOM.append(diagnosticsSubSectionList, DOM.$('div.diagnostic-progress'));
	diagnosticProgress.style.cssText = 'padding: 0 12px 12px 12px;';
}

