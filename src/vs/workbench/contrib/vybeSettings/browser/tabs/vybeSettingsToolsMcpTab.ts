/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createCell } from '../vybeSettingsComponents.js';

interface McpServerItem {
	name: string;
	avatar: string;
	status: 'enabled' | 'error';
	statusColor: 'passed' | 'failed';
	toolsMessage: string;
	checked: boolean;
}

function createMcpServerItem(parent: HTMLElement, server: McpServerItem, hasDivider: boolean = false): HTMLElement {
	const container = DOM.append(parent, DOM.$('.mcp-server-item-container'));
	container.style.cssText = 'position: relative;';

	if (hasDivider) {
		const divider = DOM.append(container, DOM.$('.cursor-settings-cell-divider'));
		divider.style.cssText = `
			position: absolute;
			top: 0;
			left: 12px;
			right: 12px;
			height: 1px;
			background-color: rgba(20, 20, 20, 0.07);
		`;
	}

	const item = DOM.append(container, DOM.$('.mcp-server-item'));
	item.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		position: relative;
	`;

	// Avatar container
	const avatarContainer = DOM.append(item, DOM.$('.mcp-avatar-container'));
	avatarContainer.style.cssText = 'position: relative; flex-shrink: 0;';

	const avatar = DOM.append(avatarContainer, DOM.$('.mcp-server-avatar'));
	avatar.textContent = server.avatar;
	avatar.style.cssText = `
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background-color: rgba(20, 20, 20, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--vscode-foreground);
	`;

	const statusDot = DOM.append(avatarContainer, DOM.$('.mcp-server-dot.mcp-server-dot-enabled'));
	statusDot.style.cssText = `
		position: absolute;
		bottom: 0;
		right: 0;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--vscode-activityBar-background);
		background-color: var(--vscode-testing-icon${server.statusColor === 'passed' ? 'Passed' : 'Failed'});
	`;

	// Main content
	const mainContent = DOM.append(item, DOM.$('.mcp-server-item-main-content'));
	mainContent.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;';

	const name = DOM.append(mainContent, DOM.$('.mcp-server-item-main-content-name'));
	name.textContent = server.name;
	name.style.cssText = `
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const toolsButton = DOM.append(mainContent, DOM.$('div'));
	toolsButton.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-text-button';
	toolsButton.setAttribute('data-click-ready', 'true');
	toolsButton.style.cssText = `
		font-size: 12px;
		line-height: 16px;
		box-sizing: border-box;
		min-height: 20px;
		padding-left: 0px;
		width: fit-content;
	`;

	const buttonInner = DOM.append(toolsButton, DOM.$('span.inline-flex.items-baseline.gap-[2px].min-w-0.overflow-hidden'));
	buttonInner.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';

	const message = DOM.append(buttonInner, DOM.$('span.truncate'));
	message.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

	const messageDiv = DOM.append(message, DOM.$('div.mcp-tools-toggle-message'));
	messageDiv.textContent = server.toolsMessage;
	messageDiv.style.cssText = 'font-size: 12px; color: var(--vscode-foreground);';

	if (server.toolsMessage !== 'No tools, prompts, or resources' && !server.toolsMessage.startsWith('Error')) {
		const chevron = DOM.append(buttonInner, DOM.$('span.codicon.codicon-chevron-up-down'));
		chevron.className = 'codicon codicon-chevron-up-down !text-[12px] opacity-70 !overflow-visible';
		chevron.style.cssText = 'font-size: 12px; opacity: 0.7; overflow: visible; padding-top: 1px;';
	}

	// Controls
	const controls = DOM.append(item, DOM.$('.mcp-server-item-controls'));
	controls.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

	const editIcon = DOM.append(controls, DOM.$('div.mcp-server-item-edit-icon'));
	editIcon.title = 'Edit configuration';
	editIcon.style.cssText = `
		padding: 4px;
		cursor: pointer;
		color: var(--cursor-icon-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	`;

	const editIconSpan = DOM.append(editIcon, DOM.$('span.codicon.codicon-edit'));
	editIconSpan.style.cssText = 'font-size: 14px;';

	const deleteIcon = DOM.append(controls, DOM.$('div.mcp-server-item-delete-icon'));
	deleteIcon.title = 'Delete server';
	deleteIcon.style.cssText = `
		padding: 4px;
		cursor: pointer;
		color: var(--cursor-icon-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	`;

	const deleteIconSpan = DOM.append(deleteIcon, DOM.$('span.codicon.codicon-trash'));
	deleteIconSpan.style.cssText = 'font-size: 14px;';

	// Toggle switch
	const switchContainer = DOM.append(controls, DOM.$('.cursor-settings-cell-switch-container'));
	switchContainer.style.cssText = 'display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; cursor: pointer;';

	const switchOuter = DOM.append(switchContainer, DOM.$('.solid-switch'));
	switchOuter.style.cssText = `
		width: 30px;
		height: 18px;
		border-radius: 18px;
		position: relative;
		display: flex;
		align-items: center;
		cursor: pointer;
		transition: all 300ms;
		overflow: hidden;
		background: ${server.checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)'};
	`;

	const bgFill = DOM.append(switchOuter, DOM.$('div'));
	bgFill.style.cssText = `
		border-radius: 18px;
		position: absolute;
		top: 0;
		bottom: 0;
		height: 100%;
		left: 0;
		background: rgb(85, 165, 131);
		opacity: ${server.checked ? '1' : '0'};
		width: ${server.checked ? '100%' : '0%'};
		transition: ${server.checked ? '300ms' : '150ms'} cubic-bezier(0.4, 0, 0.2, 1);
	`;

	const knob = DOM.append(switchOuter, DOM.$('div.solid-switch-toggle'));
	knob.className = `solid-switch-toggle ${server.checked ? 'on' : 'off'}`;
	knob.style.cssText = `
		width: 14px;
		height: 14px;
		border-radius: 50%;
		position: absolute;
		background: white;
		transition: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
		left: ${server.checked ? 'calc(100% - 16px)' : '2px'};
	`;

	return container;
}

export function renderToolsMcpTab(parent: HTMLElement): void {
	// Browser section
	const browserSection = createSection(parent, 'Browser');
	const browserSectionList = browserSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const browserSubSection = DOM.append(browserSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list with background
	const browserSubSectionList = DOM.append(browserSubSection, DOM.$('.cursor-settings-sub-section-list'));
	browserSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Browser Automation MCP server item container
	const browserServerContainer = DOM.append(browserSubSectionList, DOM.$('.mcp-server-item-container'));
	browserServerContainer.style.cssText = 'position: relative;';

	const browserServerList = DOM.append(browserServerContainer, DOM.$('.mcp-server-list'));
	browserServerList.style.cssText = 'display: flex; flex-direction: column;';

	const browserServerItem = DOM.append(browserServerList, DOM.$('.mcp-server-item'));
	browserServerItem.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		position: relative;
	`;

	const browserMainContent = DOM.append(browserServerItem, DOM.$('.mcp-server-item-main-content'));
	browserMainContent.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;';

	const browserTitle = DOM.append(browserMainContent, DOM.$('div'));
	browserTitle.textContent = 'Browser Automation';
	browserTitle.style.cssText = 'font-weight: 400; margin-bottom: 2px; font-size: 12px; color: var(--vscode-foreground);';

	const browserSubtext = DOM.append(browserMainContent, DOM.$('div.mcp-server-item-subtext.flex.gap-1.items-center'));
	browserSubtext.style.cssText = 'display: flex; gap: 4px; align-items: center;';

	const statusContainer = DOM.append(browserSubtext, DOM.$('div'));
	statusContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';

	const statusText = DOM.append(statusContainer, DOM.$('span'));
	statusText.textContent = 'Ready (Chrome detected)';
	statusText.style.cssText = 'font-size: 12px; color: rgba(20, 20, 20, 0.55);';

	const editIcon = DOM.append(browserSubtext, DOM.$('div.mcp-server-item-edit-icon'));
	editIcon.title = 'Configure connection';
	editIcon.style.cssText = `
		padding: 4px;
		cursor: pointer;
		color: var(--cursor-icon-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	`;

	const editChevron = DOM.append(editIcon, DOM.$('span.codicon.codicon-chevron-right'));
	editChevron.style.cssText = 'font-size: 14px;';

	const browserControls = DOM.append(browserServerItem, DOM.$('.mcp-server-item-controls'));
	browserControls.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

	const refreshIcon = DOM.append(browserControls, DOM.$('div.mcp-server-item-edit-icon'));
	refreshIcon.title = 'Refresh status';
	refreshIcon.style.cssText = `
		padding: 4px;
		cursor: pointer;
		color: var(--cursor-icon-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	`;

	const refreshIconSpan = DOM.append(refreshIcon, DOM.$('span.codicon.codicon-refresh'));
	refreshIconSpan.style.cssText = 'font-size: 14px;';

	const browserDropdown = DOM.append(browserControls, DOM.$('div.solid-dropdown'));
	const browserDropdownButton = DOM.append(browserDropdown, DOM.$('button.solid-dropdown-toggle'));
	browserDropdownButton.style.cssText = 'cursor: pointer;';

	const browserDropdownLabel = DOM.append(browserDropdownButton, DOM.$('div.solid-dropdown-toggle-label.solid-dropdown-toggle-label-min'));
	browserDropdownLabel.textContent = 'Google Chrome';
	browserDropdownLabel.style.cssText = 'font-size: 12px;';

	const browserDropdownChevron = DOM.append(browserDropdownButton, DOM.$('span.codicon.codicon-chevron-up-down'));
	browserDropdownChevron.style.cssText = 'color: var(--cursor-icon-secondary); font-size: 14px;';

	// Show Localhost Links cell (in the same sub-section-list)
	createCell(browserSubSectionList, {
		label: 'Show Localhost Links in Browser',
		description: 'Automatically open localhost links in the Browser Tab',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// Installed MCP Servers section
	const mcpSection = createSection(parent, 'Installed MCP Servers');
	const mcpSectionList = mcpSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const mcpSubSection = DOM.append(mcpSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list with background
	const mcpSubSectionList = DOM.append(mcpSubSection, DOM.$('.cursor-settings-sub-section-list'));
	mcpSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	const mcpServerList = DOM.append(mcpSubSectionList, DOM.$('.mcp-server-list'));
	mcpServerList.style.cssText = 'display: flex; flex-direction: column;';

	// Define MCP servers
	const mcpServers: McpServerItem[] = [
		{ name: 'supabase', avatar: 'S', status: 'enabled', statusColor: 'passed', toolsMessage: '20 tools enabled', checked: true },
		{ name: 'Magic MCP', avatar: 'M', status: 'enabled', statusColor: 'passed', toolsMessage: '4 tools enabled', checked: true },
		{ name: 'Context7', avatar: 'C', status: 'error', statusColor: 'failed', toolsMessage: 'Error - Show Output', checked: true },
		{ name: 'Socket', avatar: 'S', status: 'enabled', statusColor: 'passed', toolsMessage: 'No tools, prompts, or resources', checked: true },
		{ name: 'SonarQube', avatar: 'S', status: 'error', statusColor: 'failed', toolsMessage: 'Error - Show Output', checked: true },
	];

	// Render MCP servers
	for (let i = 0; i < mcpServers.length; i++) {
		createMcpServerItem(mcpServerList, mcpServers[i], i > 0);
	}

	// New MCP Server item
	const newServerContainer = DOM.append(mcpServerList, DOM.$('.mcp-server-item-container'));
	newServerContainer.style.cssText = 'position: relative;';

	const newServerDivider = DOM.append(newServerContainer, DOM.$('.cursor-settings-cell-divider'));
	newServerDivider.style.cssText = `
		position: absolute;
		top: 0;
		left: 12px;
		right: 12px;
		height: 1px;
		background-color: rgba(20, 20, 20, 0.07);
	`;

	const newServerItem = DOM.append(newServerContainer, DOM.$('.mcp-server-item'));
	newServerItem.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		position: relative;
		cursor: pointer;
	`;

	const newServerAvatar = DOM.append(newServerItem, DOM.$('.mcp-server-avatar'));
	DOM.append(newServerAvatar, DOM.$('span.codicon.codicon-add'));
	newServerAvatar.style.cssText = `
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background-color: rgba(20, 20, 20, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: var(--vscode-foreground);
	`;

	const newServerMainContent = DOM.append(newServerItem, DOM.$('.mcp-server-item-main-content'));
	newServerMainContent.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;';

	const newServerName = DOM.append(newServerMainContent, DOM.$('.mcp-server-item-main-content-name'));
	newServerName.textContent = 'New MCP Server';
	newServerName.style.cssText = `
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const newServerSubtext = DOM.append(newServerMainContent, DOM.$('.mcp-server-item-subtext'));
	newServerSubtext.textContent = 'Add a Custom MCP Server';
	newServerSubtext.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;
}

