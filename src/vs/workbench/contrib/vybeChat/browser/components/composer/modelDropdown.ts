/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, clearNode } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IVybeLLMModelService, VybeModel } from '../../../../vybeLLM/common/vybeLLMModelService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { ModelHoverPopup } from './modelHoverPopup.js';

export interface ModelItem {
	id: string;
	label: string;
	hasThinking?: boolean; // Shows brain icon
}

export interface ModelDropdownState {
	isAutoEnabled: boolean;
	isMaxModeEnabled: boolean;
	selectedModelId: string;
	reasoningLevel: 'low' | 'medium' | 'high' | 'xhigh';
}

export class ModelDropdown extends Disposable {
	private readonly _onStateChange = this._register(new Emitter<ModelDropdownState>());
	readonly onStateChange = this._onStateChange.event;

	private dropdownContainer: HTMLElement | null = null;
	private contentArea: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private currentHoveredItem: HTMLElement | null = null;
	private isHiding: boolean = false; // Flag to prevent immediate re-opening after hide
	private justSelectedModel: boolean = false; // Flag to prevent reopening after model selection
	private hoverPopup: ModelHoverPopup | null = null;
	private modelCache: Map<string, VybeModel> = new Map(); // Cache full model info for hover popup

	private state: ModelDropdownState = {
		isAutoEnabled: true,
		isMaxModeEnabled: false,
		selectedModelId: '', // Will be set to first available model when Auto is off
		reasoningLevel: 'medium' // Default reasoning level
	};

	private selectedReasoningLevel: 'low' | 'medium' | 'high' | 'xhigh' = 'medium';

	// Cloud models (hardcoded for now - can be moved to a service later)
	private readonly cloudModels: ModelItem[] = [];

	private localModels: ModelItem[] = [];
	private isLoadingModels = false;

	constructor(
		private anchorElement: HTMLElement,
		private readonly modelService?: IVybeLLMModelService,
		private readonly commandService?: ICommandService,
		private readonly editorService?: IEditorService
	) {
		super();

		// Clean up any existing dropdowns on construction
		this.cleanupAllDropdowns();

		// Initialize hover popup
		this.hoverPopup = this._register(new ModelHoverPopup());

		// Load local models if service is available
		if (this.modelService) {
			this._register(this.modelService.onDidModelsChange(() => {
				// Always refresh the models list when models change (even if dropdown is closed)
				// This ensures the dropdown shows correct models when opened next time
					this.loadLocalModels().then(() => {
					// Only re-render if dropdown is currently open and not being hidden
						if (this.dropdownContainer && !this.isHiding && this.contentArea) {
							this.renderContent();
						}
					});
			}));
		}

		// Ensure cleanup on dispose
		this._register({
			dispose: () => {
				this.cleanupAllDropdowns();
				this.hide();
			}
		});
	}

	private async loadLocalModels(): Promise<void> {
		if (!this.modelService || this.isLoadingModels) {
			if (!this.modelService) {
				console.warn('[ModelDropdown] Model service not available, models will not be shown');
			}
			return;
		}

		this.isLoadingModels = true;
		try {
			console.log('[ModelDropdown] Loading enabled models...');
			// Use getEnabledModels() to only show models user has enabled in settings
			const vybeModels = await this.modelService.getEnabledModels();
			console.log(`[ModelDropdown] Loaded ${vybeModels.length} enabled models:`, vybeModels.map(m => m.label));

			// Cache full model info for hover popup
			this.modelCache.clear();
			vybeModels.forEach(model => {
				this.modelCache.set(model.id, model);
			});

			this.localModels = vybeModels.map((model) => ({
				id: model.id,
				label: model.isLocal ? `${model.label} (${model.providerLabel})` : `${model.label}`,
				hasThinking: model.hasThinking,
			}));
		} catch (error) {
			console.error('[ModelDropdown] Failed to load models:', error);
			// Failed to load - keep existing models
			this.localModels = [];
		} finally {
			this.isLoadingModels = false;
		}
	}

	private getAllModels(): ModelItem[] {
		// Combine cloud and local models
		return [...this.cloudModels, ...this.localModels];
	}

	/**
	 * Check if a model supports reasoning levels (L/M/H/xH buttons)
	 */
	private modelSupportsReasoning(modelId: string): boolean {
		const fullModel = this.modelCache.get(modelId);
		return fullModel?.supportsReasoning === true;
	}

	/**
	 * Check if a model supports xhigh reasoning (only GPT-5.2 models)
	 */
	private modelSupportsXHigh(modelId: string): boolean {
		// Only models with "5.2" in the name support xhigh
		return modelId.includes('5.2');
	}

	async show(currentState: ModelDropdownState, openDownward: boolean = false, alignRight: boolean = false): Promise<void> {
		// CRITICAL: First, clean up ANY existing dropdowns in the DOM (prevent multiple instances)
		this.cleanupAllDropdowns();

		// If already open, close it (toggle behavior)
		if (this.dropdownContainer) {
			this.hide();
			return;
		}

		// Don't show if we're in the middle of hiding (prevents immediate re-opening after model selection)
		if (this.isHiding) {
			return;
		}

		// Don't show if we just selected a model (prevents reopening due to state changes)
		if (this.justSelectedModel) {
			return;
		}

		// Update state before showing
		this.state = { ...currentState };

		// Load local models before showing dropdown
		await this.loadLocalModels();

		// If Auto is off and no valid model is selected, select the first available model
		if (!this.state.isAutoEnabled && this.state.selectedModelId) {
			const allModels = this.getAllModels();
			const modelExists = allModels.some(m => m.id === this.state.selectedModelId);
			if (!modelExists && allModels.length > 0) {
				// Selected model doesn't exist, use first available
				this.state.selectedModelId = allModels[0].id;
				// Fire state change to update parent
				this._onStateChange.fire({ ...this.state });
			} else if (!modelExists && allModels.length === 0) {
				// No models available, clear selection
				this.state.selectedModelId = '';
			}
		}

		this.createDropdown(openDownward, alignRight);
	}

	/**
	 * Clean up ALL dropdown containers in the DOM (prevent multiple instances)
	 */
	private cleanupAllDropdowns(): void {
		// Find all existing dropdown containers in the DOM
		const existingDropdowns = document.querySelectorAll('.model-dropdown');
		existingDropdowns.forEach(dropdown => {
			try {
				if (dropdown.parentNode) {
					dropdown.parentNode.removeChild(dropdown);
				}
				dropdown.remove();
			} catch (e) {
				// Already removed, ignore
			}
		});
	}

	hide(): void {
		// Hide hover popup
		if (this.hoverPopup) {
			this.hoverPopup.hide();
		}

		// Clean up ALL dropdowns in DOM first (prevent multiple instances)
		this.cleanupAllDropdowns();

		if (this.dropdownContainer) {
			// Set flag to prevent immediate re-opening during cleanup
			this.isHiding = true;

			// Clear all references immediately
			this.dropdownContainer = null;
			this.contentArea = null;
			this.searchInput = null;
			this.currentHoveredItem = null;

			// Clear flag after a delay to allow click events to settle
			// This prevents the button click from immediately reopening
			setTimeout(() => {
				this.isHiding = false;
			}, 200);
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
		// CRITICAL: Ensure no existing dropdowns before creating new one
		this.cleanupAllDropdowns();

		const isDarkTheme = this.isDarkTheme();

		// Outer container - create with unique class to identify it
		this.dropdownContainer = append(document.body, $('.model-dropdown'));
		// Add a unique identifier to track this instance
		this.dropdownContainer.setAttribute('data-model-dropdown-instance', 'active');
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
			width: 260px;
			min-width: 221px;
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
		// Store reference to handler for proper cleanup
		const clickHandler = (e: MouseEvent) => {
			// Only handle if this is still the active dropdown
			if (!this.dropdownContainer || this.dropdownContainer.getAttribute('data-model-dropdown-instance') !== 'active') {
				document.removeEventListener('click', clickHandler, true);
				return;
			}

			// Don't close if clicking inside the dropdown
			if (this.dropdownContainer.contains(e.target as Node)) {
				return;
			}

			// Don't close if clicking the anchor button (it will toggle itself)
			if (this.anchorElement.contains(e.target as Node)) {
				return;
			}

			// Close if clicking outside
			this.hide();
			document.removeEventListener('click', clickHandler, true);
		};

		// Add listener after a small delay to avoid immediate triggering
		setTimeout(() => {
			document.addEventListener('click', clickHandler, true);
		}, 0);

		// Register for cleanup
		this._register({
			dispose: () => {
				document.removeEventListener('click', clickHandler, true);
				// Also clean up the dropdown container if it still exists
				if (this.dropdownContainer) {
					this.cleanupAllDropdowns();
				}
			}
		});
	}

	private renderContent(): void {
		// Don't render if dropdown is being hidden or has been hidden
		if (!this.contentArea || !this.dropdownContainer || this.isHiding) {
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
				// Fire state change with a copy to ensure immutability
				this._onStateChange.fire({ ...this.state });
				// Re-render to show/hide model list (only if dropdown is still open)
				if (this.contentArea) {
					this.renderContent();
				}
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
			// Max-height calculated for exactly 8 items (no partial 9th item visible):
			// Each item: 2px (top padding) + 16px (row) + 2px (bottom padding) = 20px
			// 8 items × 20px = 160px
			// 7 gaps × 2px = 14px
			// Container padding: 2px top + 2px bottom = 4px
			// Total: 160px + 14px + 4px = 178px
			// Reduced to 174px to ensure no partial 9th item hover background is visible
			const scrollableContainer = append(this.contentArea, $('.model-scrollable-container'));
			scrollableContainer.style.cssText = 'max-height: 174px; overflow-y: auto; padding: 2px;';

			// Models section
			const modelsSection = append(scrollableContainer, $('.model-list-section'));
			modelsSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

			// Show loading state if models are being loaded
			if (this.isLoadingModels) {
				const loadingItem = append(modelsSection, $('.model-loading-item'));
				loadingItem.textContent = 'Loading models...';
				loadingItem.style.cssText = `
					padding: 6px;
					color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.6)' : 'rgba(51, 51, 51, 0.6)'};
					font-size: 12px;
					text-align: center;
				`;
			}

			// Render all models (cloud + local)
			const allModels = this.getAllModels();
			if (allModels.length === 0 && !this.isLoadingModels) {
				const emptyItem = append(modelsSection, $('.model-empty-item'));
				emptyItem.textContent = 'No models available';
				emptyItem.style.cssText = `
					padding: 6px;
					color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.6)' : 'rgba(51, 51, 51, 0.6)'};
					font-size: 12px;
					text-align: center;
				`;
			} else {
				allModels.forEach(model => {
					this.renderModelItem(modelsSection, model, hoverBg);
				});
			}

			// Add Models item at the very bottom
			this.renderAddModelsItem(this.contentArea, hoverBg);
		}
	}

	private renderAddModelsItem(container: HTMLElement, _hoverBg: string): void {
		const isDarkTheme = this.isDarkTheme();

		// Divider
		const divider = append(container, $('.model-divider'));
		divider.style.cssText = `
			height: 1px;
			width: 100%;
			background-color: ${isDarkTheme ? '#383838' : '#d9d9d9'};
			opacity: 0.8;
			margin: 0 2px;
		`;

		const itemWrapper = append(container, $('.model-item-wrapper'));
		itemWrapper.id = 'open-model-settings';

		const item = append(itemWrapper, $('.composer-unified-context-menu-item'));
		item.style.cssText = `
			display: flex;
			flex-direction: column;
			padding: 0px 6px 4px 6px;
			min-width: 0;
			cursor: pointer;
			border-radius: 4px;
			background-color: transparent;
		`;

		// Main row - vertically centered
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

		// Left side - vertically centered
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
			height: 16px;
		`;

		const labelWrapper = append(labelContainer, $('.model-label-wrapper'));
		labelWrapper.style.cssText = `
			max-width: 100%;
			flex-shrink: 1;
			min-width: 0;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			display: flex;
			align-items: center;
		`;

		const label = append(labelWrapper, $('span.monaco-highlighted-label'));
		label.textContent = 'Add Models';
		label.style.cssText = `
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		// Right side - chevron, vertically centered
		const rightSide = append(mainRow, $('.model-right'));
		rightSide.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			height: 16px;
		`;

		const chevron = append(rightSide, $('span.codicon.codicon-chevron-right'));
		chevron.style.cssText = `
			font-size: 10px;
			opacity: 0.3;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			display: flex;
			align-items: center;
			line-height: 1;
			transform: translateY(2px);
		`;

		// No hover effect - remove background on hover
		// Click handler - open settings models tab directly
		this._register(addDisposableListener(item, 'click', async (e) => {
			e.stopPropagation();
			e.preventDefault();
			this.hide();
			if (this.commandService && this.editorService) {
				// Open VYBE settings editor
				await this.commandService.executeCommand('vybe.openSettingsEditor');
				// Wait for editor to open, then select models tab
				setTimeout(() => {
					if (this.editorService) {
						const activeEditor = this.editorService.activeEditorPane;
						if (activeEditor && (activeEditor as any).selectTab) {
							(activeEditor as any).selectTab('models');
						}
					}
				}, 100);
			}
		}));
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

		// Label text wrapper (flex-shrink: 1 to allow icon space)
		const labelTextWrapper = append(labelContainer, $('div'));
		labelTextWrapper.style.cssText = `
			display: flex;
			width: 100%;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 17px;
			overflow: hidden;
		`;

		// Label text container (flex-shrink: 1)
		const labelWrapper = append(labelTextWrapper, $('div'));
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

		// Thinking icon if model has thinking (aligned with text baseline)
		const showThinkingIcon = !!model.hasThinking && !model.id.toLowerCase().includes('codex');
		if (showThinkingIcon) {
			const iconContainer = append(labelTextWrapper, $('div'));
			iconContainer.style.cssText = `
				flex-shrink: 0;
				display: flex;
				align-items: center;
				height: 17px;
			`;

			const iconInner = append(iconContainer, $('span'));
			iconInner.style.cssText = `
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 2px;
				flex-shrink: 0;
				height: 17px;
				line-height: 17px;
			`;

			const icon = append(iconInner, $('span.codicon.codicon-thinking'));
			icon.className = 'codicon codicon-thinking';
			icon.style.cssText = `
				order: 0;
				margin-right: 2px !important;
				font-size: 10px !important;
				opacity: 0.6;
				line-height: 17px;
				vertical-align: middle;
				display: inline-block;
			`;
		}

		// Right side - reasoning buttons (if supported) or checkmark if selected
		const rightSide = append(mainRow, $('.model-right'));
		rightSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			height: 17px;
			margin-left: auto;
			flex-shrink: 0;
		`;

		// Add reasoning level buttons for models that support reasoning
		const supportsReasoning = this.modelSupportsReasoning(model.id);
		if (supportsReasoning) {
			const reasoningButtonsContainer = append(rightSide, $('.model-reasoning-buttons'));
			reasoningButtonsContainer.style.cssText = `
				display: flex;
				align-items: center;
				gap: 4px;
				flex-shrink: 0;
			`;

			// Define reasoning levels: L (low), M (medium), H (high), xH (xhigh)
			const reasoningLevels: Array<{ id: 'low' | 'medium' | 'high' | 'xhigh'; label: string }> = [
				{ id: 'low', label: 'L' },
				{ id: 'medium', label: 'M' },
				{ id: 'high', label: 'H' },
			];

			// Only add xH for 5.2 models
			if (this.modelSupportsXHigh(model.id)) {
				reasoningLevels.push({ id: 'xhigh', label: 'xH' });
			}

			reasoningLevels.forEach(level => {
				const isLevelSelected = this.selectedReasoningLevel === level.id;
				const levelButton = append(reasoningButtonsContainer, $('span.model-reasoning-button'));
				levelButton.textContent = level.label;
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

				// Click handler - fire reasoning level select but don't close dropdown
				this._register(addDisposableListener(levelButton, 'click', (e) => {
					e.stopPropagation(); // Prevent model selection
					e.preventDefault();

					// Update selected reasoning level
					this.selectedReasoningLevel = level.id;
					this.state.reasoningLevel = level.id;

					// Update button states
					reasoningLevels.forEach(l => {
						const btn = reasoningButtonsContainer.querySelector(`[data-level="${l.id}"]`) as HTMLElement;
						if (btn) {
							const isSelected = l.id === level.id;
							btn.setAttribute('data-selected', isSelected ? 'true' : 'false');
							btn.style.color = isSelected ? '#3ecf8e' : (isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(51, 51, 51, 0.7)');
							btn.style.fontWeight = isSelected ? '600' : '400';
						}
					});

					// Fire state change event
					this._onStateChange.fire({ ...this.state });
				}));
			});
		} else if (isSelected) {
			// Show checkmark for non-reasoning models
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

			// Show hover popup with model info
			if (this.hoverPopup && this.modelService) {
				const fullModel = this.modelCache.get(model.id);
				if (fullModel) {
					this.hoverPopup.show(fullModel, item);
				}
			}
		}));

		// Hide hover popup on mouse leave
		this._register(addDisposableListener(item, 'mouseleave', () => {
			if (this.hoverPopup) {
				this.hoverPopup.hide();
			}
		}));

		// Click handler
		this._register(addDisposableListener(item, 'click', (e) => {
			e.stopPropagation();
			e.preventDefault();
			e.stopImmediatePropagation(); // Prevent any other handlers from firing

			// Set flag to prevent reopening
			this.justSelectedModel = true;

			// Update state: when a model is manually selected, auto mode should be disabled
			this.state.isAutoEnabled = false;
			this.state.selectedModelId = model.id;

			// If selecting a reasoning-capable model, ensure reasoning level is set (default to medium)
			if (this.modelSupportsReasoning(model.id)) {
				// Keep current reasoning level if already set, otherwise default to medium
				if (!this.selectedReasoningLevel) {
					this.selectedReasoningLevel = 'medium';
				}
				this.state.reasoningLevel = this.selectedReasoningLevel;
			}

			// Hide dropdown FIRST to prevent any re-opening
			this.hide();

			// Fire state change AFTER hiding to update parent
			// Use setTimeout to ensure hide() completes first
			setTimeout(() => {
				this._onStateChange.fire({ ...this.state });
				// Clear the flag after state change is fired
				setTimeout(() => {
					this.justSelectedModel = false;
				}, 200);
			}, 0);
		}));
	}
}

