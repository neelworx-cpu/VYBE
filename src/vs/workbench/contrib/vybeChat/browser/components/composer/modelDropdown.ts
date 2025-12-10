/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, clearNode } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';

export interface ModelItem {
	id: string;
	label: string;
	hasThinking?: boolean; // Shows brain icon
}

export interface ModelDropdownState {
	isAutoEnabled: boolean;
	isMaxModeEnabled: boolean;
	selectedModelId: string;
}

export class ModelDropdown extends Disposable {
	private readonly _onStateChange = this._register(new Emitter<ModelDropdownState>());
	readonly onStateChange = this._onStateChange.event;

	private dropdownContainer: HTMLElement | null = null;
	private contentArea: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private currentHoveredItem: HTMLElement | null = null;

	private state: ModelDropdownState = {
		isAutoEnabled: true,
		isMaxModeEnabled: false,
		selectedModelId: 'composer-1'
	};

	private readonly models: ModelItem[] = [
		{ id: 'composer-1', label: 'Composer 1' },
		{ id: 'opus-4.5', label: 'Opus 4.5', hasThinking: true },
		{ id: 'sonnet-4.5', label: 'Sonnet 4.5', hasThinking: true },
		{ id: 'gpt-5.1-codex-high', label: 'GPT-5.1 Codex High', hasThinking: true },
		{ id: 'gpt-5.1', label: 'GPT-5.1', hasThinking: true },
		{ id: 'gemini-3-pro', label: 'Gemini 3 Pro', hasThinking: true }
	];

	constructor(private anchorElement: HTMLElement) {
		super();
	}

	show(currentState: ModelDropdownState, openDownward: boolean = false, alignRight: boolean = false): void {
		// Toggle behavior: if already open, close it
		if (this.dropdownContainer) {
			this.hide();
			return;
		}
		this.state = { ...currentState };
		this.createDropdown(openDownward, alignRight);
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

	private createDropdown(openDownward: boolean = false, alignRight: boolean = false): void {

		const isDarkTheme = this.isDarkTheme();

		// Outer container
		this.dropdownContainer = append(document.body, $('.model-dropdown'));
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
			width: 200px;
			min-width: 170px;
			transform-origin: ${alignRight ? 'right' : 'left'} bottom;
			box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.12);
			z-index: 2548;
		`;

		// Position dropdown
		const rect = this.anchorElement.getBoundingClientRect();
		if (openDownward) {
			// Open downward (for sticky message at top)
			this.dropdownContainer.style.top = `${rect.bottom + 3}px`;
			if (alignRight) {
				this.dropdownContainer.style.right = `${window.innerWidth - rect.right}px`;
			} else {
				this.dropdownContainer.style.left = `${rect.left}px`;
			}
			this.dropdownContainer.style.transform = 'none';
		} else {
			// Open upward (for bottom composer)
			this.dropdownContainer.style.top = `${rect.top - 3}px`;
			if (alignRight) {
				this.dropdownContainer.style.right = `${window.innerWidth - rect.right}px`;
				this.dropdownContainer.style.transform = 'translateY(-100%)';
			} else {
				this.dropdownContainer.style.left = `${rect.left}px`;
				this.dropdownContainer.style.transform = 'translateY(-100%)';
			}
		}

		// Inner container - matches history dropdown
		const innerContainer = append(this.dropdownContainer, $('.model-dropdown-inner'));
		innerContainer.setAttribute('tabindex', '0');
		innerContainer.setAttribute('data-testid', 'model-picker-menu');
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
			padding: 0px;
			contain: paint;
			outline: none;
			pointer-events: auto;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		// Search input container
		const searchContainer = append(innerContainer, $('.model-search-container'));
		searchContainer.style.cssText = `
			display: flex;
			gap: 4px;
			align-items: center;
			padding: 0px 6px;
			border: none;
			box-sizing: border-box;
			outline: none;
			margin: 2px;
		`;

		this.searchInput = document.createElement('input');
		this.searchInput.placeholder = 'Search models';
		this.searchInput.style.cssText = `
			font-size: 12px;
			line-height: 15px;
			border-radius: 3px;
			background: transparent;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			padding: 3px 0;
			flex: 1;
			min-width: 0;
			border: none;
			outline: none;
			box-sizing: border-box;
			font-family: -apple-system, "system-ui", sans-serif;
		`;
		this.searchInput.style.setProperty('caret-color', isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)');
		searchContainer.appendChild(this.searchInput);

		// Content area - no scrolling wrapper, just direct content
		this.contentArea = append(innerContainer, $('.model-content-area'));
		this.contentArea.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

		// Render content
		this.renderContent();

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

	private renderContent(): void {
		if (!this.contentArea) {
			return;
		}

		clearNode(this.contentArea);
		const isDarkTheme = this.isDarkTheme();
		const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

		// Toggles section (not scrollable) - with padding
		const togglesSection = append(this.contentArea, $('.model-toggles-section'));
		togglesSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px; padding: 2px;';

		// Auto toggle
		this.renderToggle(
			togglesSection,
			'Auto',
			this.state.isAutoEnabled,
			this.state.isAutoEnabled ? 'Balanced quality and speed, recommended for most tasks' : null,
			(newState) => {
				this.state.isAutoEnabled = newState;
				// When Auto is turned ON, disable MAX mode
				if (newState) {
					this.state.isMaxModeEnabled = false;
				}
				this._onStateChange.fire(this.state);
				// Re-render to show/hide model list
				this.renderContent();
			}
		);

		// MAX Mode toggle (only show when Auto is OFF)
		if (!this.state.isAutoEnabled) {
			this.renderToggle(
				togglesSection,
				'MAX Mode',
				this.state.isMaxModeEnabled,
				null,
				(newState) => {
					this.state.isMaxModeEnabled = newState;
					this._onStateChange.fire(this.state);
					// Don't re-render for MAX mode - just update the badge
				}
			);
		}

		// Show model list only if Auto is OFF (scrollable section)
		if (!this.state.isAutoEnabled) {
			// Divider
			const divider = append(this.contentArea, $('.model-divider'));
			divider.style.cssText = `
				height: 1px;
				width: 100%;
				background-color: ${isDarkTheme ? '#383838' : '#d9d9d9'};
				opacity: 0.8;
				margin: 0 2px;
			`;

			// Scrollable models section
			const scrollableContainer = append(this.contentArea, $('.model-scrollable-container'));
			scrollableContainer.style.cssText = 'max-height: 180px; overflow-y: auto; padding: 2px;';

			// Models section
			const modelsSection = append(scrollableContainer, $('.model-list-section'));
			modelsSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

			this.models.forEach(model => {
				this.renderModelItem(modelsSection, model, hoverBg);
			});
		}
	}

	private renderToggle(
		container: HTMLElement,
		label: string,
		isOn: boolean,
		description: string | null,
		onToggle: (newState: boolean) => void
	): void {
		const isDarkTheme = this.isDarkTheme();
		const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

		const itemWrapper = append(container, $('.toggle-item-wrapper'));
		itemWrapper.id = `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;

		const item = append(itemWrapper, $('.composer-unified-context-menu-item'));
		item.style.cssText = `
			display: flex;
			flex-direction: column;
			padding: 2px 6px;
			min-width: 0;
			cursor: pointer;
			border-radius: 4px;
			background-color: ${isOn && !description ? hoverBg : 'transparent'};
		`;

		// Main row
		const mainRow = append(item, $('.toggle-main-row'));
		mainRow.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Left side
		const leftSide = append(mainRow, $('.toggle-left'));
		leftSide.style.cssText = `
			display: flex;
			width: 100%;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 17px;
			flex: 1;
		`;

		const labelSpan = append(leftSide, $('span'));
		labelSpan.textContent = label;
		labelSpan.style.cssText = `
			font-size: 12px;
			padding: 4px 0;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		// Right side - toggle switch
		const rightSide = append(mainRow, $('.toggle-right'));
		rightSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			height: 17px;
		`;

		// Create toggle switch elements that we can update
		const { switchContainer, switchOuter, bgFill, knob } = this.createToggleSwitch(isOn);
		rightSide.appendChild(switchContainer);

		// Description (if provided)
		if (description) {
			const descRow = append(item, $('.toggle-desc-row'));
			descRow.textContent = description;
			descRow.style.cssText = `
				opacity: 0.6;
				line-height: 14px;
				white-space: normal;
				padding-bottom: 2px;
				color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			`;
		}

		// Track current state in a mutable object so we can update it
		const toggleState = { isOn };

		// Click handler - update switch visually and call callback
		this._register(addDisposableListener(item, 'click', (e) => {
			e.stopPropagation();
			const newState = !toggleState.isOn;
			toggleState.isOn = newState;

			// Update switch visual immediately
			this.updateToggleSwitch(switchOuter, bgFill, knob, newState);

			// Call the callback
			onToggle(newState);
		}));

		// Hover effect
		this._register(addDisposableListener(item, 'mouseenter', () => {
			if (this.currentHoveredItem && this.currentHoveredItem !== item) {
				this.currentHoveredItem.style.backgroundColor = 'transparent';
			}
			item.style.backgroundColor = hoverBg;
			this.currentHoveredItem = item;
		}));
	}

	private createToggleSwitch(isOn: boolean): { switchContainer: HTMLElement; switchOuter: HTMLElement; bgFill: HTMLElement; knob: HTMLElement } {
		const switchContainer = $('span');
		switchContainer.style.cssText = `
			flex-shrink: 0;
			margin-left: 4px;
			cursor: pointer;
		`;

		const switchOuter = append(switchContainer, $('div'));
		switchOuter.style.cssText = `
			width: 24px;
			height: 14px;
			border-radius: 14px;
			position: relative;
			display: flex;
			align-items: center;
			cursor: pointer;
			transition: all 300ms;
			overflow: hidden;
			background: ${isOn ? '#3ecf8e' : 'rgba(128, 128, 128, 0.3)'};
			opacity: 1;
		`;

		// Background fill (animated)
		const bgFill = append(switchOuter, $('div'));
		bgFill.style.cssText = `
			border-radius: 14px;
			position: absolute;
			top: 0;
			bottom: 0;
			height: 100%;
			left: 0;
			background: #3ecf8e;
			opacity: ${isOn ? '1' : '0'};
			width: ${isOn ? '100%' : '0%'};
			transition: ${isOn ? '300ms' : '150ms'} cubic-bezier(0.4, 0, 0.2, 1);
		`;

		// Knob
		const knob = append(switchOuter, $('div'));
		knob.style.cssText = `
			width: 10px;
			height: 10px;
			border-radius: 50%;
			position: absolute;
			background: white;
			transition: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
			left: ${isOn ? 'calc(100% - 12px)' : '2px'};
		`;

		return { switchContainer, switchOuter, bgFill, knob };
	}

	private updateToggleSwitch(switchOuter: HTMLElement, bgFill: HTMLElement, knob: HTMLElement, isOn: boolean): void {
		// Update outer background
		switchOuter.style.background = isOn ? '#3ecf8e' : 'rgba(128, 128, 128, 0.3)';

		// Update fill
		bgFill.style.opacity = isOn ? '1' : '0';
		bgFill.style.width = isOn ? '100%' : '0%';
		bgFill.style.transition = isOn ? '300ms cubic-bezier(0.4, 0, 0.2, 1)' : '150ms cubic-bezier(0.4, 0, 0.2, 1)';

		// Update knob position
		knob.style.left = isOn ? 'calc(100% - 12px)' : '2px';
	}

	private renderModelItem(container: HTMLElement, model: ModelItem, hoverBg: string): void {
		const isDarkTheme = this.isDarkTheme();
		const isSelected = model.id === this.state.selectedModelId;

		const itemWrapper = append(container, $('.model-item-wrapper'));
		itemWrapper.id = `model-${model.id}`;

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

		if (isSelected) {
			this.currentHoveredItem = item;
		}

		// Main row
		const mainRow = append(item, $('.model-main-row'));
		mainRow.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Left side
		const leftSide = append(mainRow, $('.model-left'));
		leftSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			height: 16px;
			width: 100%;
		`;

		const labelContainer = append(leftSide, $('.model-label-container'));
		labelContainer.style.cssText = `
			display: flex;
			width: 100%;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 17px;
			overflow: hidden;
		`;

		const labelWrapper = append(labelContainer, $('.model-label-wrapper'));
		labelWrapper.style.cssText = `
			max-width: 100%;
			flex-shrink: 1;
			min-width: 0;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		const label = append(labelWrapper, $('span.monaco-highlighted-label'));
		label.textContent = model.label;
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

		// Brain icon if model has thinking
		if (model.hasThinking) {
			const iconContainer = append(labelContainer, $('.model-icon-container'));
			iconContainer.style.cssText = 'flex-shrink: 0;';

			const icon = append(iconContainer, $('span.codicon.codicon-symbol-namespace'));
			icon.style.cssText = `
				font-size: 10px;
				opacity: 0.6;
				line-height: 1;
				transform: translateY(3px);
				margin-right: 2px;
			`;
		}

		// Right side - checkmark if selected
		const rightSide = append(mainRow, $('.model-right'));
		rightSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			height: 17px;
		`;

		if (isSelected) {
			const checkmark = append(rightSide, $('span.codicon.codicon-check'));
			checkmark.style.cssText = `
				font-size: 10px;
				flex-shrink: 0;
				margin-right: 0;
				color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			`;
		}

		// Hover effect
		this._register(addDisposableListener(item, 'mouseenter', () => {
			if (this.currentHoveredItem && this.currentHoveredItem !== item) {
				this.currentHoveredItem.style.backgroundColor = 'transparent';
			}
			item.style.backgroundColor = hoverBg;
			this.currentHoveredItem = item;
		}));

		// Click handler
		this._register(addDisposableListener(item, 'click', (e) => {
			e.stopPropagation();
			this.state.selectedModelId = model.id;
			this._onStateChange.fire(this.state);
			this.hide();
		}));
	}
}

