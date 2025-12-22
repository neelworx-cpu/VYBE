/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';

export interface CellConfig {
	label: string;
	labelIcon?: string;
	description: string;
	action: { type: 'button' | 'switch' | 'dropdown'; label?: string; icon?: string; variant?: 'primary' | 'tertiary'; checked?: boolean } | null;
	hasDivider?: boolean;
}

export interface NumberInputCellConfig {
	label: string;
	description: string;
	numberValue: number;
	dropdownLabel: string;
	hasDivider?: boolean;
}

export interface TagEditorCellConfig {
	label: string;
	description: string;
	placeholder: string;
	initialTags: string[];
	hasDivider?: boolean;
}

export function createSection(parent: HTMLElement, title: string | null): HTMLElement {
	const section = DOM.append(parent, DOM.$('.cursor-settings-section'));
	section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

	if (title) {
		const sectionHeader = DOM.append(section, DOM.$('.cursor-settings-section-header'));
		sectionHeader.style.cssText = 'display: flex; align-items: flex-end; gap: 20px; padding: 0 8px;';

		const leadingItems = DOM.append(sectionHeader, DOM.$('.cursor-settings-section-header-leading-items'));
		leadingItems.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

		const titleRow = DOM.append(leadingItems, DOM.$('.cursor-settings-section-header-title-row'));
		titleRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';

		const sectionTitle = DOM.append(titleRow, DOM.$('.cursor-settings-section-header-title'));
		sectionTitle.textContent = title;
		sectionTitle.style.cssText = `
			font-size: 12px;
			font-weight: 400;
			color: rgba(20, 20, 20, 0.55);
			letter-spacing: 0.07px;
			line-height: 14px;
		`;

		const trailingItems = DOM.append(sectionHeader, DOM.$('.cursor-settings-section-header-trailing-items'));
		trailingItems.style.cssText = 'flex-shrink: 0;';
	}

	const sectionList = DOM.append(section, DOM.$('.cursor-settings-section-list'));
	sectionList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

	return section;
}

export function createCell(parent: HTMLElement, config: CellConfig): HTMLElement {
	let subSectionList = parent.querySelector('.cursor-settings-sub-section-list') as HTMLElement | null;
	if (!subSectionList) {
		subSectionList = DOM.append(parent, DOM.$('.cursor-settings-sub-section-list'));
		subSectionList.style.cssText = `
			display: flex;
			flex-direction: column;
			background-color: var(--vscode-activityBar-background);
			border-radius: 8px;
			gap: 0;
		`;
	}

	const cell = DOM.append(subSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	cell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	if (config.hasDivider) {
		const divider = DOM.append(cell, DOM.$('.cursor-settings-cell-divider'));
		divider.style.cssText = `
			position: absolute;
			top: 0;
			left: 12px;
			right: 12px;
			height: 1px;
			background-color: rgba(20, 20, 20, 0.07);
		`;
	}

	const leadingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-leading-items'));
	leadingItems.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const labelContainer = DOM.append(leadingItems, DOM.$('p.cursor-settings-cell-label'));
	labelContainer.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
		display: flex;
		align-items: center;
		gap: 4px;
	`;

	if (config.labelIcon) {
		const labelIcon = DOM.append(labelContainer, DOM.$(`span.codicon.${config.labelIcon}`));
		labelIcon.style.cssText = 'font-size: 16px;';
	}

	const labelText = document.createTextNode(config.label);
	labelContainer.appendChild(labelText);

	const description = DOM.append(leadingItems, DOM.$('div.cursor-settings-cell-description'));
	description.textContent = config.description;
	description.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const trailingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-trailing-items'));
	trailingItems.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	if (config.action) {
		if (config.action.type === 'button') {
			const button = createButton(config.action.label || '', config.action.variant || 'tertiary', config.action.icon);
			trailingItems.appendChild(button);
		} else if (config.action.type === 'switch') {
			const switchContainer = DOM.append(trailingItems, DOM.$('.cursor-settings-cell-switch-container'));
			switchContainer.style.cssText = 'display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; cursor: pointer;';

			const switchOuter = DOM.append(switchContainer, DOM.$('.solid-switch'));
			const isChecked = config.action.checked ?? false;
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
				background: ${isChecked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)'};
			`;
			switchOuter.setAttribute('data-checked', String(isChecked));

			// Background fill (animated)
			const bgFill = DOM.append(switchOuter, DOM.$('div'));
			bgFill.className = 'solid-switch-bg-fill';
			bgFill.style.cssText = `
				border-radius: 18px;
				position: absolute;
				top: 0;
				bottom: 0;
				height: 100%;
				left: 0;
				background: rgb(85, 165, 131);
				opacity: ${isChecked ? '1' : '0'};
				width: ${isChecked ? '100%' : '0%'};
				transition: ${isChecked ? '300ms' : '150ms'} cubic-bezier(0.4, 0, 0.2, 1);
			`;

			// Knob (thumb)
			const knob = DOM.append(switchOuter, DOM.$('div'));
			knob.className = 'solid-switch-knob';
			knob.style.cssText = `
				width: 14px;
				height: 14px;
				border-radius: 50%;
				position: absolute;
				background: white;
				transition: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
				left: ${isChecked ? 'calc(100% - 16px)' : '2px'};
			`;
		} else if (config.action.type === 'dropdown') {
			const dropdown = DOM.append(trailingItems, DOM.$('.solid-dropdown'));
			dropdown.style.cssText = 'position: relative;';

			const toggle = DOM.append(dropdown, DOM.$('button.solid-dropdown-toggle'));
			toggle.style.cssText = `
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 3px 6px;
				border: 1px solid rgba(20, 20, 20, 0.15);
				border-radius: 6px;
				background: transparent;
				cursor: pointer;
				font-size: 12px;
				color: var(--vscode-foreground);
			`;

			const toggleLabel = DOM.append(toggle, DOM.$('div.solid-dropdown-toggle-label'));
			toggleLabel.textContent = config.action.label || '';
			toggleLabel.style.cssText = 'flex: 1; text-align: left;';

			const chevron = DOM.append(toggle, DOM.$('span.codicon.codicon-chevron-down'));
			chevron.style.cssText = 'font-size: 16px;';
		}
	}

	return cell;
}

export function createButton(label: string, variant: 'primary' | 'tertiary' = 'tertiary', icon?: string): HTMLElement {
	const button = DOM.$(`div.cursor-button.cursor-button-${variant}.cursor-button-${variant}-clickable.cursor-button-small`);
	button.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 3px 6px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 12px;
		line-height: 16px;
		${variant === 'primary'
			? 'background-color: rgb(60, 124, 171); color: rgb(252, 252, 252);'
			: 'border: 1px solid rgba(20, 20, 20, 0.15); color: var(--vscode-foreground); background: transparent;'
		}
	`;

	if (icon) {
		const iconEl = DOM.append(button, DOM.$(`span.codicon.${icon}`));
		iconEl.style.cssText = 'font-size: 12px;';
	}

	button.appendChild(document.createTextNode(label));

	return button;
}

export function createCellWithNumberInput(parent: HTMLElement, config: NumberInputCellConfig): HTMLElement {
	let subSectionList = parent.querySelector('.cursor-settings-sub-section-list') as HTMLElement | null;
	if (!subSectionList) {
		subSectionList = DOM.append(parent, DOM.$('.cursor-settings-sub-section-list'));
		subSectionList.style.cssText = `
			display: flex;
			flex-direction: column;
			background-color: var(--vscode-activityBar-background);
			border-radius: 8px;
			gap: 0;
		`;
	}

	const cell = DOM.append(subSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	cell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	if (config.hasDivider) {
		const divider = DOM.append(cell, DOM.$('.cursor-settings-cell-divider'));
		divider.style.cssText = `
			position: absolute;
			top: 0;
			left: 12px;
			right: 12px;
			height: 1px;
			background-color: rgba(20, 20, 20, 0.07);
		`;
	}

	const leadingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-leading-items'));
	leadingItems.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const labelContainer = DOM.append(leadingItems, DOM.$('p.cursor-settings-cell-label'));
	labelContainer.textContent = config.label;
	labelContainer.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const description = DOM.append(leadingItems, DOM.$('div.cursor-settings-cell-description'));
	description.textContent = config.description;
	description.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const trailingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-trailing-items'));
	trailingItems.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px;';

	// Number input
	const numberInput = DOM.append(trailingItems, DOM.$('input'));
	(numberInput as HTMLInputElement).type = 'number';
	(numberInput as HTMLInputElement).min = '1';
	(numberInput as HTMLInputElement).value = config.numberValue.toString();
	numberInput.style.cssText = `
		width: 68px;
		padding: 4px 6px;
		box-sizing: border-box;
		font-size: 12px;
		border: 1px solid var(--vscode-input-border);
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border-radius: 6px;
		outline: none;
	`;

	// Dropdown
	const dropdown = DOM.append(trailingItems, DOM.$('.solid-dropdown'));
	dropdown.style.cssText = 'position: relative;';

	const toggle = DOM.append(dropdown, DOM.$('button.solid-dropdown-toggle'));
	toggle.style.cssText = `
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 3px 6px;
		border: 1px solid rgba(20, 20, 20, 0.15);
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		font-size: 12px;
		color: var(--vscode-foreground);
	`;

	const toggleLabel = DOM.append(toggle, DOM.$('div.solid-dropdown-toggle-label'));
	toggleLabel.textContent = config.dropdownLabel;
	toggleLabel.style.cssText = 'flex: 1; text-align: left;';

	const chevron = DOM.append(toggle, DOM.$('span.codicon.codicon-chevron-down'));
	chevron.style.cssText = 'font-size: 16px;';

	return cell;
}

export function createCellWithTagEditor(parent: HTMLElement, config: TagEditorCellConfig): HTMLElement {
	let subSectionList = parent.querySelector('.cursor-settings-sub-section-list') as HTMLElement | null;
	if (!subSectionList) {
		subSectionList = DOM.append(parent, DOM.$('.cursor-settings-sub-section-list'));
		subSectionList.style.cssText = `
			display: flex;
			flex-direction: column;
			background-color: var(--vscode-activityBar-background);
			border-radius: 8px;
			gap: 0;
		`;
	}

	const cell = DOM.append(subSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	cell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	if (config.hasDivider) {
		const divider = DOM.append(cell, DOM.$('.cursor-settings-cell-divider'));
		divider.style.cssText = `
			position: absolute;
			top: 0;
			left: 12px;
			right: 12px;
			height: 1px;
			background-color: rgba(20, 20, 20, 0.07);
		`;
	}

	const leadingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-leading-items'));
	leadingItems.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const labelContainer = DOM.append(leadingItems, DOM.$('p.cursor-settings-cell-label'));
	labelContainer.textContent = config.label;
	labelContainer.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const description = DOM.append(leadingItems, DOM.$('div.cursor-settings-cell-description'));
	description.textContent = config.description;
	description.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	const trailingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-trailing-items'));
	trailingItems.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	// Tag editor
	const tagEditor = DOM.append(trailingItems, DOM.$('.tag-editor'));
	tagEditor.style.cssText = 'display: flex;';

	const elementList = DOM.append(tagEditor, DOM.$('.element-list'));
	elementList.style.cssText = 'display: flex; gap: 4px; align-items: center; flex-wrap: wrap;';

	// Add initial tags
	for (const tag of config.initialTags) {
		const element = DOM.append(elementList, DOM.$('.element'));
		element.style.cssText = `
			display: flex;
			gap: 4px;
			align-items: center;
			max-width: 240px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`;

		const tagSpan = DOM.append(element, DOM.$('span'));
		tagSpan.textContent = tag;
		tagSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

		const removeButton = DOM.append(element, DOM.$('button.tag-editor-remove-button.codicon.codicon-x'));
		removeButton.style.cssText = 'cursor: pointer; background: transparent; border: none; padding: 0;';
	}

	// Input
	const input = DOM.append(elementList, DOM.$('input'));
	(input as HTMLInputElement).placeholder = config.placeholder;
	input.style.cssText = `
		width: ${config.placeholder ? '100%' : 'auto'};
		background-color: transparent;
		border-radius: 2px;
		border: none;
		outline: none;
		padding: 2px 6px;
		font-size: 12px;
		color: var(--vscode-input-foreground);
		line-height: 1.4;
		box-sizing: border-box;
		height: 20px;
		min-width: ${config.placeholder ? '60px' : '30px'};
		flex: ${config.placeholder ? '1 1 120px' : '1 0 30px'};
	`;

	return cell;
}
