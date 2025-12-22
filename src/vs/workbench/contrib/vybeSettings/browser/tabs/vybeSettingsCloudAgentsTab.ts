/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { createSection, createCell } from '../vybeSettingsComponents.js';

interface CollapsibleItem {
	label: string;
	status?: string;
	statusColor?: string;
}

function createCollapsibleItem(parent: HTMLElement, item: CollapsibleItem): HTMLElement {
	const itemContainer = DOM.append(parent, DOM.$('div'));
	itemContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

	const header = DOM.append(itemContainer, DOM.$('div.collapsible-header'));
	header.style.cssText = `
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		width: 100%;
		box-sizing: border-box;
		overflow: hidden;
	`;

	let expanded = false;

	const chevron = DOM.append(header, DOM.$('div.codicon.codicon-chevron-right'));
	chevron.style.cssText = `
		color: var(--cursor-text-primary);
		width: 9px;
		height: 9px;
		display: flex;
		justify-content: center;
		align-items: center;
		transition: transform 0.1s;
	`;

	const content = DOM.append(header, DOM.$('div'));
	content.style.cssText = 'display: flex; align-items: center; gap: 4px; overflow: hidden;';

	const textContainer = DOM.append(content, DOM.$('div'));
	textContainer.style.cssText = 'color: var(--cursor-text-primary); font-size: 12px;';

	const labelRow = DOM.append(textContainer, DOM.$('div.flex.items-baseline.gap-1.5'));
	labelRow.style.cssText = 'display: flex; align-items: baseline; gap: 6px;';

	const label = DOM.append(labelRow, DOM.$('div'));
	label.textContent = item.label;
	label.style.cssText = 'font-size: 12px; font-weight: 510;';

	if (item.status) {
		const statusContainer = DOM.append(labelRow, DOM.$('div'));
		const status = DOM.append(statusContainer, DOM.$('span'));
		status.textContent = item.status;
		status.style.cssText = `
			font-size: 12px;
			opacity: ${item.statusColor === 'warning' ? '1' : '0.8'};
			color: ${item.statusColor === 'warning' ? 'var(--vscode-editorWarning-foreground)' : 'inherit'};
		`;
	}

	// Toggle expansion
	addDisposableListener(header, EventType.CLICK, () => {
		expanded = !expanded;
		if (expanded) {
			chevron.className = 'codicon codicon-chevron-down';
			chevron.style.transform = 'rotate(90deg)';
		} else {
			chevron.className = 'codicon codicon-chevron-right';
			chevron.style.transform = 'rotate(0deg)';
		}
	});

	return itemContainer;
}

export function renderCloudAgentsTab(parent: HTMLElement): void {
	// Integrations section (no title)
	const integrationsSection = createSection(parent, null);
	integrationsSection.id = 'cursor-settings-integrations';
	const integrationsSectionList = integrationsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const integrationsSubSection = DOM.append(integrationsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Manage Settings cell
	createCell(integrationsSubSection, {
		label: 'Manage Settings',
		description: 'Connect GitHub, manage team and user settings, and more',
		action: { type: 'button', label: 'Open', icon: 'codicon-link-external', variant: 'tertiary' }
	});

	// Connect Slack cell
	const slackCell = createCell(integrationsSubSection, {
		label: 'Connect Slack',
		description: 'Work with Cloud Agents from Slack',
		action: null,
		hasDivider: true
	});

	// Custom button for Slack (different style)
	const slackTrailing = slackCell.querySelector('.cursor-settings-cell-trailing-items') as HTMLElement;
	if (slackTrailing) {
		DOM.clearNode(slackTrailing);
		slackTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

		const buttonContainer = DOM.append(slackTrailing, DOM.$('div'));
		buttonContainer.style.cssText = 'display: flex;';

		const button = DOM.append(buttonContainer, DOM.$('div'));
		button.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-button';
		button.setAttribute('data-loading', 'false');
		button.setAttribute('data-disabled', 'false');
		button.setAttribute('data-click-ready', 'true');
		button.style.cssText = `
			font-size: 12px;
			line-height: 16px;
			box-sizing: border-box;
			min-height: 20px;
		`;

		const buttonText = DOM.append(button, DOM.$('span.inline-flex.items-baseline.gap-[2px].min-w-0.overflow-hidden'));
		buttonText.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';

		const buttonLabel = DOM.append(buttonText, DOM.$('span.truncate'));
		buttonLabel.textContent = 'Connect';
		buttonLabel.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

		const buttonIcon = DOM.append(button, DOM.$('span.codicon.codicon-link-external'));
		buttonIcon.className = 'codicon codicon-link-external !text-[12px] opacity-70 !overflow-visible';
		buttonIcon.style.cssText = 'font-size: 12px; opacity: 0.7; overflow: visible;';
	}

	// Workspace Configuration section
	const workspaceSection = createSection(parent, 'Workspace Configuration');
	workspaceSection.id = 'background-agent-configuration';

	// Add description
	const sectionHeader = workspaceSection.querySelector('.cursor-settings-section-header') as HTMLElement;
	if (sectionHeader) {
		const leadingItems = sectionHeader.querySelector('.cursor-settings-section-header-leading-items') as HTMLElement;
		if (leadingItems) {
			// Check if description already exists, if not create it
			let description = leadingItems.querySelector('.cursor-settings-section-header-description') as HTMLElement;
			if (!description) {
				description = DOM.append(leadingItems, DOM.$('.cursor-settings-section-header-description'));
			}
			description.textContent = 'Configure environment settings and secrets';
			description.style.cssText = `
				font-size: 12px;
				color: rgba(20, 20, 20, 0.55);
				line-height: 16px;
			`;
		}
	}

	const workspaceSectionList = workspaceSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const workspaceSubSection = DOM.append(workspaceSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list with background (like Manage Settings and Connect Slack)
	const workspaceSubSectionList = DOM.append(workspaceSubSection, DOM.$('.cursor-settings-sub-section-list'));
	workspaceSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Personal Configuration cell
	const configCell = DOM.append(workspaceSubSectionList, DOM.$('.cursor-settings-cell'));
	configCell.style.cssText = `
		display: flex;
		align-items: flex-start;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	const configContent = DOM.append(configCell, DOM.$('div'));
	configContent.style.cssText = 'width: 100%; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;';

	// Header section
	const headerSection = DOM.append(configContent, DOM.$('div.flex.flex-col.gap-1.5.text-[12px]'));
	headerSection.style.cssText = 'display: flex; flex-direction: column; gap: 6px; font-size: 12px;';

	const headerRow = DOM.append(headerSection, DOM.$('div.flex.items-center.gap-3.justify-between.w-full.box-border'));
	headerRow.style.cssText = 'display: flex; align-items: center; gap: 12px; justify-content: space-between; width: 100%; box-sizing: border-box;';

	const headerLeft = DOM.append(headerRow, DOM.$('div.flex.items-center.gap-1.5'));
	headerLeft.style.cssText = 'display: flex; align-items: center; gap: 6px;';

	const headerLabel = DOM.append(headerLeft, DOM.$('span'));
	headerLabel.textContent = 'Personal Configuration';
	headerLabel.style.cssText = 'font-weight: 510;';

	const cloudIcon = DOM.append(headerLeft, DOM.$('span.codicon.codicon-cloud-two'));
	cloudIcon.style.cssText = 'opacity: 0.5;';

	const descriptionText = DOM.append(headerSection, DOM.$('div'));
	descriptionText.textContent = 'These settings will be used for new cloud agents. For more info, see ';
	descriptionText.style.cssText = 'font-size: 12px; color: rgba(20, 20, 20, 0.55); line-height: 16px;';

	const docsLink = DOM.append(descriptionText, DOM.$('span.underline'));
	docsLink.textContent = 'our docs';
	docsLink.style.cssText = 'text-decoration: underline; cursor: pointer; color: var(--vscode-textLink-foreground);';

	// Collapsible items container
	const collapsibleContainer = DOM.append(configContent, DOM.$('div.pl-1.flex.flex-col.gap-2.5'));
	collapsibleContainer.style.cssText = 'padding-left: 4px; display: flex; flex-direction: column; gap: 10px;';

	const collapsibleItems: CollapsibleItem[] = [
		{ label: 'Sharing', status: 'Stored in database' },
		{ label: 'Usage-Based Pricing', status: 'Not Configured', statusColor: 'warning' },
		{ label: 'GitHub Access', status: 'Verified' },
		{ label: 'Base Environment', status: 'Using Default Ubuntu' },
		{ label: 'Runtime Configuration', status: 'Nothing configured' },
		{ label: 'Secrets' }
	];

	for (const item of collapsibleItems) {
		createCollapsibleItem(collapsibleContainer, item);
	}
}

