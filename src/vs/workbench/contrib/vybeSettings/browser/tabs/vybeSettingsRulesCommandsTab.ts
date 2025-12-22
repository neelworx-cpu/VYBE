/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createCell } from '../vybeSettingsComponents.js';

function createHelpIcon(parent: HTMLElement, href: string): HTMLElement {
	const helpLink = DOM.append(parent, DOM.$('a.cursor-settings-help-icon'));
	helpLink.setAttribute('target', '_blank');
	helpLink.setAttribute('href', href);
	helpLink.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--cursor-icon-secondary);
		text-decoration: none;
	`;

	const helpIcon = DOM.append(helpLink, DOM.$('span.codicon.codicon-question'));
	helpIcon.style.cssText = 'font-size: 14px;';

	return helpLink;
}

function createSecondaryButton(parent: HTMLElement, label: string, hasDropdown: boolean = false): HTMLElement {
	const button = DOM.append(parent, DOM.$('div'));
	button.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-secondary-button';
	button.setAttribute('data-click-ready', 'true');
	if (hasDropdown) {
		button.id = 'solid-dropdown-button-8abbbg55erc';
		button.className += ' !px-0 add-rule-dropdown';
	}
	button.style.cssText = `
		font-size: 12px;
		line-height: 16px;
		box-sizing: border-box;
		min-height: 20px;
	`;

	const iconContainer = DOM.append(button, DOM.$('div'));
	iconContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 14px;';

	const plusIcon = DOM.append(iconContainer, DOM.$('span.codicon.codicon-plus'));
	plusIcon.className = 'codicon codicon-plus !text-[10px] opacity-70 !overflow-visible undefined';
	plusIcon.style.cssText = 'font-size: 10px; opacity: 0.7; overflow: visible;';
	if (hasDropdown) {
		plusIcon.style.cssText += 'width: 100%; box-sizing: border-box;';
	}

	const labelContainer = DOM.append(button, DOM.$('span.inline-flex.items-baseline.gap-[2px].min-w-0.overflow-hidden'));
	labelContainer.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';

	const labelSpan = DOM.append(labelContainer, DOM.$('span.truncate'));
	labelSpan.textContent = label;
	labelSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
	if (hasDropdown) {
		labelSpan.style.cssText += 'width: 100%; box-sizing: border-box;';
	}

	return button;
}

function createEmptyState(parent: HTMLElement, title: string, description: string, buttonLabel: string): HTMLElement {
	const emptyWrapper = DOM.append(parent, DOM.$('div.empty-state-wrapper'));
	emptyWrapper.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 24px;';

	const emptyContainer = DOM.append(emptyWrapper, DOM.$('div.empty-state-container'));
	emptyContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;';

	const emptyContent = DOM.append(emptyContainer, DOM.$('div.empty-state-content'));
	emptyContent.style.cssText = 'display: flex; flex-direction: column; gap: 4px; align-items: center;';

	const emptyTitle = DOM.append(emptyContent, DOM.$('p.empty-state-title'));
	emptyTitle.textContent = title;
	emptyTitle.style.cssText = `
		font-size: 14px;
		font-weight: 500;
		color: var(--vscode-foreground);
		margin: 0;
	`;

	const emptyDesc = DOM.append(emptyContent, DOM.$('p.empty-state-description'));
	emptyDesc.textContent = description;
	emptyDesc.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		margin: 0;
	`;

	const emptyButton = DOM.append(emptyContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	emptyButton.textContent = buttonLabel;
	emptyButton.style.cssText = 'user-select: none; flex-shrink: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;';

	return emptyWrapper;
}

export function renderRulesCommandsTab(parent: HTMLElement): void {
	// Import Settings section
	const importSection = createSection(parent, 'Import Settings');
	const importSectionList = importSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const importSubSection = DOM.append(importSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(importSubSection, {
		label: 'Include CLAUDE.md in context',
		description: 'CLAUDE.md and CLAUDE.local.md files will be added to the Agent\'s context, when relevant.',
		action: { type: 'switch', checked: false }
	});

	createCell(importSubSection, {
		label: 'Import Claude Commands',
		description: 'Load commands from .claude/commands directories alongside .cursor/commands.',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// User Rules section
	const userRulesContainer = DOM.append(parent, DOM.$('div'));
	userRulesContainer.id = 'user-rules';

	const userRulesSection = createSection(userRulesContainer, null);
	userRulesSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 32px;';

	const userRulesHeader = DOM.append(userRulesSection, DOM.$('.cursor-settings-section-header'));
	userRulesHeader.style.cssText = 'display: flex; align-items: flex-end; gap: 20px; padding: 0 8px;';

	const userRulesLeading = DOM.append(userRulesHeader, DOM.$('.cursor-settings-section-header-leading-items'));
	userRulesLeading.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

	const userRulesTitleRow = DOM.append(userRulesLeading, DOM.$('.cursor-settings-section-header-title-row'));
	userRulesTitleRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';

	const userRulesTitle = DOM.append(userRulesTitleRow, DOM.$('.cursor-settings-section-header-title'));
	userRulesTitle.textContent = 'User Rules';
	userRulesTitle.style.cssText = `
		font-size: 12px;
		font-weight: 400;
		color: rgba(20, 20, 20, 0.55);
		letter-spacing: 0.07px;
		line-height: 14px;
	`;

	createHelpIcon(userRulesTitleRow, 'https://cursor.com/docs/context/rules#user-rules');

	const userRulesDesc = DOM.append(userRulesLeading, DOM.$('.cursor-settings-section-header-description'));
	userRulesDesc.textContent = 'Manage your custom user rules and preferences';
	userRulesDesc.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const userRulesTrailing = DOM.append(userRulesHeader, DOM.$('.cursor-settings-section-header-trailing-items'));
	userRulesTrailing.style.cssText = 'display: flex; gap: 8px;';

	createSecondaryButton(userRulesTrailing, 'Add Rule');

	const userRulesSectionList = DOM.append(userRulesSection, DOM.$('.cursor-settings-section-list'));
	userRulesSectionList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

	const userRulesSubSection = DOM.append(userRulesSectionList, DOM.$('.cursor-settings-sub-section'));
	const userRulesSubSectionList = DOM.append(userRulesSubSection, DOM.$('.cursor-settings-sub-section-list'));
	userRulesSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	const scrollableContainer = DOM.append(userRulesSubSectionList, DOM.$('div'));
	scrollableContainer.style.cssText = 'height: 119px; overflow: hidden;';

	const scrollableDiv = DOM.append(scrollableContainer, DOM.$('div.scrollable-div-container.user-rule-list'));
	scrollableDiv.style.cssText = 'height: 100%;';

	// Empty state for User Rules
	createEmptyState(scrollableDiv, 'No User Rules Yet', 'Add rules and preferences for Agent', 'Add Rule');

	// Project Rules section
	const projectRulesSection = createSection(parent, null);
	const projectRulesHeader = DOM.append(projectRulesSection, DOM.$('.cursor-settings-section-header'));
	projectRulesHeader.style.cssText = 'display: flex; align-items: flex-end; gap: 20px; padding: 0 8px;';

	const projectRulesLeading = DOM.append(projectRulesHeader, DOM.$('.cursor-settings-section-header-leading-items'));
	projectRulesLeading.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

	const projectRulesTitleRow = DOM.append(projectRulesLeading, DOM.$('.cursor-settings-section-header-title-row'));
	projectRulesTitleRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';

	const projectRulesTitle = DOM.append(projectRulesTitleRow, DOM.$('.cursor-settings-section-header-title'));
	projectRulesTitle.textContent = 'Project Rules';
	projectRulesTitle.style.cssText = `
		font-size: 12px;
		font-weight: 400;
		color: rgba(20, 20, 20, 0.55);
		letter-spacing: 0.07px;
		line-height: 14px;
	`;

	createHelpIcon(projectRulesTitleRow, 'https://cursor.com/docs/context/rules#project-rules');

	const projectRulesDesc = DOM.append(projectRulesLeading, DOM.$('.cursor-settings-section-header-description'));
	projectRulesDesc.textContent = 'Help Agent understand conventions in this project directory';
	projectRulesDesc.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const projectRulesTrailing = DOM.append(projectRulesHeader, DOM.$('.cursor-settings-section-header-trailing-items'));
	projectRulesTrailing.style.cssText = 'flex-shrink: 0;';

	createSecondaryButton(projectRulesTrailing, 'Add Rule', true);

	const projectRulesSectionList = DOM.append(projectRulesSection, DOM.$('.cursor-settings-section-list'));
	projectRulesSectionList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

	// Pattern Matched sub-section
	const patternMatchedSubSection = DOM.append(projectRulesSectionList, DOM.$('.cursor-settings-sub-section'));
	const patternMatchedSubSectionList = DOM.append(patternMatchedSubSection, DOM.$('.cursor-settings-sub-section-list'));
	patternMatchedSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	const patternMatchedHeader = DOM.append(patternMatchedSubSectionList, DOM.$('div'));
	patternMatchedHeader.style.cssText = 'padding-top: 8px; padding-left: 12px; margin-bottom: 8px;';

	const patternMatchedTitle = DOM.append(patternMatchedHeader, DOM.$('div'));
	patternMatchedTitle.textContent = 'Pattern Matched';
	patternMatchedTitle.style.cssText = `
		font-size: 12px;
		font-weight: 500;
		color: var(--cursor-text-primary);
		margin-bottom: 2px;
	`;

	const patternMatchedDesc = DOM.append(patternMatchedHeader, DOM.$('div'));
	patternMatchedDesc.textContent = 'These rules are applied when working with files that match their patterns';
	patternMatchedDesc.style.cssText = `
		font-size: 11px;
		color: var(--cursor-text-tertiary);
	`;

	const rulesList = DOM.append(patternMatchedSubSectionList, DOM.$('div.cursor-settings-rules-list'));
	rulesList.style.cssText = 'display: flex; flex-direction: column;';

	const ruleCell = DOM.append(rulesList, DOM.$('div.cursor-settings-rules-cell'));
	ruleCell.style.cssText = `
		border-top: none;
		background: none;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	`;

	const ruleName = DOM.append(ruleCell, DOM.$('div'));
	ruleName.textContent = 'vybe-build-prod';
	ruleName.style.cssText = `
		font-size: 12px;
		line-height: 16px;
		font-style: normal;
		font-weight: 400;
		color: var(--cursor-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
	`;

	const rulePattern = DOM.append(ruleCell, DOM.$('div'));
	rulePattern.textContent = '.cursor/rules/**';
	rulePattern.style.cssText = `
		font-size: 11px;
		line-height: 14px;
		color: var(--cursor-text-tertiary);
	`;

	// May Never Be Used sub-section
	const mayNeverBeUsedSubSection = DOM.append(projectRulesSectionList, DOM.$('.cursor-settings-sub-section'));
	const mayNeverBeUsedSubSectionList = DOM.append(mayNeverBeUsedSubSection, DOM.$('.cursor-settings-sub-section-list'));
	mayNeverBeUsedSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	const mayNeverBeUsedHeader = DOM.append(mayNeverBeUsedSubSectionList, DOM.$('div'));
	mayNeverBeUsedHeader.style.cssText = 'padding-top: 8px; padding-left: 8px; margin-bottom: 8px;';

	const mayNeverBeUsedTitle = DOM.append(mayNeverBeUsedHeader, DOM.$('div'));
	mayNeverBeUsedTitle.textContent = 'May Never Be Used';
	mayNeverBeUsedTitle.style.cssText = `
		font-size: 12px;
		font-weight: 500;
		color: var(--vscode-editorWarning-foreground);
		margin-bottom: 2px;
	`;

	const mayNeverBeUsedDesc = DOM.append(mayNeverBeUsedHeader, DOM.$('div'));
	mayNeverBeUsedDesc.textContent = 'These rules have no description or file patterns, so they may never be applied';
	mayNeverBeUsedDesc.style.cssText = `
		font-size: 11px;
		color: var(--cursor-text-tertiary);
	`;

	const mayNeverBeUsedRulesList = DOM.append(mayNeverBeUsedSubSectionList, DOM.$('div.cursor-settings-rules-list'));
	mayNeverBeUsedRulesList.style.cssText = 'display: flex; flex-direction: column;';

	const mayNeverBeUsedRuleCell = DOM.append(mayNeverBeUsedRulesList, DOM.$('div.cursor-settings-rules-cell'));
	mayNeverBeUsedRuleCell.style.cssText = `
		border-top: none;
		background: none;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	`;

	const mayNeverBeUsedRuleName = DOM.append(mayNeverBeUsedRuleCell, DOM.$('div'));
	mayNeverBeUsedRuleName.textContent = 'vybe-build-prod';
	mayNeverBeUsedRuleName.style.cssText = `
		font-size: 12px;
		line-height: 16px;
		font-style: normal;
		font-weight: 400;
		color: var(--cursor-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
	`;

	// Project Commands section
	const projectCommandsSection = createSection(parent, 'Project Commands');
	const projectCommandsHeader = projectCommandsSection.querySelector('.cursor-settings-section-header') as HTMLElement;
	if (projectCommandsHeader) {
		const projectCommandsLeading = projectCommandsHeader.querySelector('.cursor-settings-section-header-leading-items') as HTMLElement;
		if (projectCommandsLeading) {
			const projectCommandsDesc = DOM.append(projectCommandsLeading, DOM.$('.cursor-settings-section-header-description'));
			projectCommandsDesc.textContent = 'Commands specific to this workspace';
			projectCommandsDesc.style.cssText = `
				font-size: 12px;
				color: rgba(20, 20, 20, 0.55);
				line-height: 16px;
			`;
		}

		const projectCommandsTrailing = projectCommandsHeader.querySelector('.cursor-settings-section-header-trailing-items') as HTMLElement;
		if (projectCommandsTrailing) {
			createSecondaryButton(projectCommandsTrailing, 'Add Command');
		}
	}

	const projectCommandsSectionList = projectCommandsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const projectCommandsSubSection = DOM.append(projectCommandsSectionList, DOM.$('.cursor-settings-sub-section'));
	const projectCommandsSubSectionList = DOM.append(projectCommandsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	projectCommandsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	createEmptyState(projectCommandsSubSectionList, 'No Project Commands', 'Create commands specific to this project', 'Add Command');

	// User Commands section
	const userCommandsSection = createSection(parent, 'User Commands');
	const userCommandsHeader = userCommandsSection.querySelector('.cursor-settings-section-header') as HTMLElement;
	if (userCommandsHeader) {
		const userCommandsLeading = userCommandsHeader.querySelector('.cursor-settings-section-header-leading-items') as HTMLElement;
		if (userCommandsLeading) {
			const userCommandsDesc = DOM.append(userCommandsLeading, DOM.$('.cursor-settings-section-header-description'));
			userCommandsDesc.textContent = 'Your personal commands from ~/.cursor/commands and ~/.claude/commands';
			userCommandsDesc.style.cssText = `
				font-size: 12px;
				color: rgba(20, 20, 20, 0.55);
				line-height: 16px;
			`;
		}

		const userCommandsTrailing = userCommandsHeader.querySelector('.cursor-settings-section-header-trailing-items') as HTMLElement;
		if (userCommandsTrailing) {
			createSecondaryButton(userCommandsTrailing, 'Add Command');
		}
	}

	const userCommandsSectionList = userCommandsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const userCommandsSubSection = DOM.append(userCommandsSectionList, DOM.$('.cursor-settings-sub-section'));
	const userCommandsSubSectionList = DOM.append(userCommandsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	userCommandsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	createEmptyState(userCommandsSubSectionList, 'No User Commands', 'Create personal commands to reuse frequently', 'Add Command');
}




