/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';

export type AgentMode = 'agent' | 'plan' | 'ask';
export type AgentLevel = 'L1' | 'L2' | 'L3';

export interface AgentModeItem {
	id: AgentMode;
	label: string;
	icon: string; // codicon class name
	shortcut?: string;
}

export interface AgentLevelItem {
	id: AgentLevel;
	label: string;
	description: string;
}

export class AgentModeDropdown extends Disposable {
	private readonly _onModeSelect = this._register(new Emitter<AgentMode>());
	readonly onModeSelect = this._onModeSelect.event;

	private readonly _onLevelSelect = this._register(new Emitter<AgentLevel>());
	readonly onLevelSelect = this._onLevelSelect.event;

	private dropdownContainer: HTMLElement | null = null;
	private selectedMode: AgentMode = 'agent';
	private selectedLevel: AgentLevel = 'L2';
	private currentHoveredItem: HTMLElement | null = null;

	private readonly modes: AgentModeItem[] = [
		{ id: 'agent', label: 'Agent', icon: 'codicon-gear' },
		{ id: 'plan', label: 'Plan', icon: 'codicon-check-all' },
		{ id: 'ask', label: 'Ask', icon: 'codicon-comment' }
	];

	private readonly levels: AgentLevelItem[] = [
		{ id: 'L1', label: 'L1', description: 'Quick · 10 tools, 5 turns' },
		{ id: 'L2', label: 'L2', description: 'Standard · 30 tools, 15 turns' },
		{ id: 'L3', label: 'L3', description: 'Deep · 100 tools, planning' }
	];

	constructor(private anchorElement: HTMLElement) {
		super();
	}

	show(currentMode: AgentMode, currentLevel: AgentLevel = 'L2', openDownward: boolean = false): void {
		// Toggle behavior: if already open, close it
		if (this.dropdownContainer) {
			this.hide();
			return;
		}
		this.selectedMode = currentMode;
		this.selectedLevel = currentLevel;
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

		// Inner container with background and border - use text edit header colors
		const innerContainer = append(this.dropdownContainer, $('.agent-mode-dropdown-inner'));
		innerContainer.style.cssText = `
			box-sizing: border-box;
			border-radius: 6px;
			background-color: ${isDarkTheme ? '#212427' : '#eceff2'};
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

		// Track selected item as initially hovered and keep background
		if (isSelected) {
			this.currentHoveredItem = item;
			// Ensure selected item always has background
			item.style.backgroundColor = hoverBg;
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
			flex: 1;
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
		`;

		// For Agent mode, add inline L1/L2/L3 buttons on the right side
		if (mode.id === 'agent') {
			// Move level buttons to right side instead of after label
			const levelButtonsContainer = append(contentRow, $('.agent-level-buttons'));
			levelButtonsContainer.style.cssText = `
				display: flex;
				align-items: center;
				gap: 4px;
				margin-left: auto;
				flex-shrink: 0;
			`;

			this.levels.forEach(level => {
				const isLevelSelected = level.id === this.selectedLevel;
				const levelButton = append(levelButtonsContainer, $('span.agent-level-button'));
				levelButton.textContent = level.id;
				levelButton.setAttribute('data-level', level.id);
				levelButton.setAttribute('data-selected', isLevelSelected ? 'true' : 'false');
				levelButton.style.cssText = `
					font-size: 11px;
					line-height: 14px;
					padding: 1px 4px;
					border-radius: 3px;
					cursor: pointer;
					user-select: none;
					color: ${isLevelSelected ? '#3ecf8e' : (isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(51, 51, 51, 0.7)')};
					font-weight: ${isLevelSelected ? '600' : '400'};
					transition: color 0.15s ease;
				`;

				// Hover effect - don't change color if selected (keep vybe green)
				this._register(addDisposableListener(levelButton, 'mouseenter', () => {
					const isSelected = levelButton.getAttribute('data-selected') === 'true';
					if (!isSelected) {
						levelButton.style.color = isDarkTheme ? 'rgba(228, 228, 228, 0.9)' : 'rgba(51, 51, 51, 0.9)';
					}
				}));

				this._register(addDisposableListener(levelButton, 'mouseleave', () => {
					const isSelected = levelButton.getAttribute('data-selected') === 'true';
					if (!isSelected) {
						levelButton.style.color = isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(51, 51, 51, 0.7)';
					}
				}));

				// Click handler - fire level select but don't close dropdown
				this._register(addDisposableListener(levelButton, 'click', (e) => {
					e.stopPropagation(); // Prevent mode selection

					// Update selected level
					const previousLevel = this.selectedLevel;
					this.selectedLevel = level.id;

					// Update colors in place
					if (previousLevel !== level.id) {
						const currentIsDarkTheme = this.isDarkTheme();
						// Update previous button
						const prevButton = levelButtonsContainer.querySelector(`[data-level="${previousLevel}"]`) as HTMLElement;
						if (prevButton) {
							prevButton.style.color = currentIsDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(51, 51, 51, 0.7)';
							prevButton.style.fontWeight = '400';
							prevButton.setAttribute('data-selected', 'false');
						}

						// Update current button - always use vybe green for selected
						levelButton.style.color = '#3ecf8e';
						levelButton.style.fontWeight = '600';
						levelButton.setAttribute('data-selected', 'true');
					}

					// Fire event
					this._onLevelSelect.fire(level.id);
				}));
			});
		}

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

		// Right side removed - checkmark icon no longer needed

		// Hover effect - same behavior as history dropdown
		// Background moves from one item to another on hover and stays
		// Selected item always keeps its background
		this._register(addDisposableListener(item, 'mouseenter', () => {
			// Remove background from previously hovered item (unless it's selected)
			if (this.currentHoveredItem && this.currentHoveredItem !== item) {
				const wasSelected = this.currentHoveredItem.getAttribute('data-is-selected') === 'true';
				if (!wasSelected) {
					this.currentHoveredItem.style.backgroundColor = 'transparent';
				}
			}

			// Add background to current item
			item.style.backgroundColor = hoverBg;

			// Track this as the current hovered item
			this.currentHoveredItem = item;
		}));

		// Note: No mouseleave handler - background stays on last hovered item

		// Click handler - but don't close if clicking on level buttons
		this._register(addDisposableListener(item, 'click', (e) => {
			// If clicking on a level button, don't handle mode selection
			if ((e.target as HTMLElement).closest('.agent-level-button')) {
				return;
			}
			e.stopPropagation();
			this._onModeSelect.fire(mode.id);
			this.hide();
		}));
	}
}

