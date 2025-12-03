/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';

export type AgentMode = 'agent' | 'plan' | 'ask';

export interface AgentModeItem {
	id: AgentMode;
	label: string;
	icon: string; // codicon class name
	shortcut?: string;
}

export class AgentModeDropdown extends Disposable {
	private readonly _onModeSelect = this._register(new Emitter<AgentMode>());
	readonly onModeSelect = this._onModeSelect.event;

	private dropdownContainer: HTMLElement | null = null;
	private selectedMode: AgentMode = 'agent';
	private currentHoveredItem: HTMLElement | null = null;

	private readonly modes: AgentModeItem[] = [
		{ id: 'agent', label: 'Agent', icon: 'codicon-gear', shortcut: '⌘I' },
		{ id: 'plan', label: 'Plan', icon: 'codicon-check-all' },
		{ id: 'ask', label: 'Ask', icon: 'codicon-comment' }
	];

	constructor(private anchorElement: HTMLElement) {
		super();
	}

	show(currentMode: AgentMode, openDownward: boolean = false): void {
		// Toggle behavior: if already open, close it
		if (this.dropdownContainer) {
			this.hide();
			return;
		}
		this.selectedMode = currentMode;
		this.createDropdown(openDownward);
	}

	hide(): void {
		if (this.dropdownContainer) {
			this.dropdownContainer.remove();
			this.dropdownContainer = null;
		}
	}

	private isDarkTheme(): boolean {
		const workbench = document.querySelector('.monaco-workbench');
		if (workbench) {
			return workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black');
		}
		return document.body.classList.contains('vs-dark') || document.body.classList.contains('hc-black');
	}

	private createDropdown(openDownward: boolean = false): void {

		const isDarkTheme = this.isDarkTheme();

		// Outer container - matches reference exactly
		this.dropdownContainer = append(document.body, $('.agent-mode-dropdown'));
		this.dropdownContainer.style.cssText = `
			box-sizing: border-box;
			padding: 0px;
			border-radius: 6px;
			background: transparent;
			border: none;
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 10px;
			display: flex;
			flex-direction: column;
			gap: 0px;
			position: fixed;
			visibility: visible;
			width: 170px;
			min-width: 170px;
			transform-origin: left bottom;
			box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.12);
			z-index: 2548;
		`;

		// Position dropdown (opens upward)
		const rect = this.anchorElement.getBoundingClientRect();
		if (openDownward) {
			// Open downward (for sticky message at top)
			this.dropdownContainer.style.top = `${rect.bottom + 3}px`;
			this.dropdownContainer.style.left = `${rect.left}px`;
			this.dropdownContainer.style.transform = 'none';
		} else {
			// Open upward (for bottom composer)
			this.dropdownContainer.style.top = `${rect.top - 3}px`;
			this.dropdownContainer.style.left = `${rect.left}px`;
			this.dropdownContainer.style.transform = 'translateY(-100%)';
		}

		// Inner container with background and border - matches history dropdown
		const innerContainer = append(this.dropdownContainer, $('.agent-mode-dropdown-inner'));
		innerContainer.style.cssText = `
			box-sizing: border-box;
			border-radius: 6px;
			background-color: ${isDarkTheme ? '#1e1f21' : '#f8f8f9'};
			border: 1px solid ${isDarkTheme ? '#383838' : '#d9d9d9'};
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 2px;
			contain: paint;
			outline: none;
			pointer-events: auto;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		// Items container - no extra wrappers needed
		const itemsContainer = append(innerContainer, $('.agent-mode-items'));
		itemsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

		// Render each mode
		this.modes.forEach(mode => {
			this.renderModeItem(itemsContainer, mode);
		});

		// Click outside to close
		const clickHandler = (e: MouseEvent) => {
			if (this.dropdownContainer && !this.dropdownContainer.contains(e.target as Node) && !this.anchorElement.contains(e.target as Node)) {
				this.hide();
				document.removeEventListener('click', clickHandler, true);
			}
		};
		setTimeout(() => {
			document.addEventListener('click', clickHandler, true);
		}, 0);

		this._register({
			dispose: () => document.removeEventListener('click', clickHandler, true)
		});
	}

	private renderModeItem(container: HTMLElement, mode: AgentModeItem): void {
		const isDarkTheme = this.isDarkTheme();
		const isSelected = mode.id === this.selectedMode;

		// Hover background color - same as history dropdown
		const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

		// Item wrapper
		const itemWrapper = append(container, $('.agent-mode-item-wrapper'));
		itemWrapper.id = `composer-mode-${mode.id}`;

		// Item with proper styling - matches reference
		const item = append(itemWrapper, $('.composer-unified-context-menu-item'));
		item.style.cssText = `
			display: flex;
			flex-direction: column;
			padding: 2px 6px;
			min-width: 0;
			cursor: pointer;
			border-radius: 4px;
			background-color: ${isSelected ? hoverBg : 'transparent'};
		`;
		item.setAttribute('data-is-selected', isSelected ? 'true' : 'false');

		// Track selected item as initially hovered
		if (isSelected) {
			this.currentHoveredItem = item;
		}

		// Main content row - height: 16px, gap: 6px (1.5 * 4px = 6px)
		const contentRow = append(item, $('.agent-mode-content'));
		contentRow.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Left side (icon + label + shortcut)
		const leftSide = append(contentRow, $('.agent-mode-left'));
		leftSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			height: 16px;
			width: 100%;
		`;

		// Icon - 14px
		const icon = append(leftSide, $(`span.codicon.${mode.icon}`));
		icon.style.cssText = `
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: start;
			font-size: 14px;
			line-height: 16px;
			margin-right: 0;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		// Label container - height: 17px
		const labelContainer = append(leftSide, $('.agent-mode-label-container'));
		labelContainer.style.cssText = `
			display: flex;
			width: 100%;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 17px;
		`;

		// Label wrapper
		const labelWrapper = append(labelContainer, $('.agent-mode-label-wrapper'));
		labelWrapper.style.cssText = `
			max-width: 100%;
			flex-shrink: 1;
			min-width: 0;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		// Label span (monaco-highlighted-label)
		const label = append(labelWrapper, $('span.monaco-highlighted-label'));
		label.textContent = mode.label;
		label.style.cssText = `
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			font-size: 12px;
			line-height: 17px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		// Shortcut (if exists)
		if (mode.shortcut) {
			const shortcut = append(labelContainer, $('span.truncate.keybinding-font-settings'));
			shortcut.style.cssText = `
				direction: rtl;
				text-overflow: ellipsis;
				overflow: hidden;
				white-space: nowrap;
				color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.6)' : 'rgba(51, 51, 51, 0.6)'};
				flex-shrink: 0;
				opacity: 0.6;
				padding-right: 4px;
			`;

			const shortcutInner = append(shortcut, $('span.monaco-highlighted-label'));
			shortcutInner.textContent = mode.shortcut;
			shortcutInner.style.cssText = `
				font-size: 11px;
				line-height: 16px;
				direction: ltr;
				unicode-bidi: embed;
			`;
		}

		// Right side (checkmark only, no pencil) - height: 17px
		const rightSide = append(contentRow, $('.agent-mode-right'));
		rightSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			height: 17px;
		`;

		// Checkmark (only for selected) - 10px
		if (isSelected) {
			const checkmark = append(rightSide, $('span.codicon.codicon-check'));
			checkmark.style.cssText = `
				font-size: 10px;
				flex-shrink: 0;
				margin-right: 0;
				color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			`;
		}

		// Hover effect - same behavior as history dropdown
		// Background moves from one item to another on hover and stays
		this._register(addDisposableListener(item, 'mouseenter', () => {
			// Remove background from previously hovered item
			if (this.currentHoveredItem && this.currentHoveredItem !== item) {
				this.currentHoveredItem.style.backgroundColor = 'transparent';
			}

			// Add background to current item
			item.style.backgroundColor = hoverBg;

			// Track this as the current hovered item
			this.currentHoveredItem = item;
		}));

		// Note: No mouseleave handler - background stays on last hovered item

		// Click handler
		this._register(addDisposableListener(item, 'click', (e) => {
			e.stopPropagation();
			this._onModeSelect.fire(mode.id);
			this.hide();
		}));
	}
}

