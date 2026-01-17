/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection } from '../vybeSettingsComponents.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IVybeLLMModelService } from '../../../vybeLLM/common/vybeLLMModelService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ModelHoverPopup } from '../../../../contrib/vybeChat/browser/components/composer/modelHoverPopup.js';

export function renderModelsTab(
	parent: HTMLElement,
	_storageService: IStorageService,
	instantiationService: IInstantiationService,
	disposables: DisposableStore
): void {
	// Models section (Frontier Cloud Models only) - with search bar
	// Pass null to avoid duplicate title (tab title already shows "Models")
	const modelsSection = createSection(parent, null);
	const modelsSectionList = modelsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const modelsSubSection = DOM.append(modelsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list for models
	const modelsSubSectionList = DOM.append(modelsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	modelsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px 8px 8px 8px;
		gap: 0;
		position: relative;
	`;

	// Search bar
	const searchContainer = DOM.append(modelsSubSectionList, DOM.$('div'));
	searchContainer.style.cssText = `
		padding: 12px;
		border-bottom: 1px solid rgba(20, 20, 20, 0.1);
		border-radius: 8px 8px 0 0;
	`;

	const searchCell = DOM.append(searchContainer, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-center'));
	searchCell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0;
	`;

	const searchInput = DOM.append(searchCell, DOM.$('input'));
	(searchInput as HTMLInputElement).placeholder = 'Search models...';
	(searchInput as HTMLInputElement).spellcheck = false;
	searchInput.style.cssText = `
		flex: 1;
		background-color: var(--vscode-input-background);
		border-radius: 4px;
		border: 1px solid var(--vscode-input-border);
		outline: none;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--vscode-input-foreground);
	`;

	const refreshButton = DOM.append(searchCell, DOM.$('span.codicon.codicon-refresh'));
	refreshButton.style.cssText = `
		flex-shrink: 0;
		cursor: pointer;
		font-size: 16px;
		color: var(--vscode-foreground);
		opacity: 0.7;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: opacity 0.2s;
	`;
	refreshButton.title = 'Refresh models';

	// Hover effect
	refreshButton.addEventListener('mouseenter', () => {
		refreshButton.style.opacity = '1';
		refreshButton.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.1))';
	});
	refreshButton.addEventListener('mouseleave', () => {
		refreshButton.style.opacity = '0.7';
		refreshButton.style.backgroundColor = 'transparent';
	});

	// Models list container
	const modelsList = DOM.append(modelsSubSectionList, DOM.$('div'));
	modelsList.style.cssText = 'display: flex; flex-direction: column; gap: 0;';

	// Render models dynamically
	const renderModels = async (searchQuery: string = ''): Promise<void> => {
		DOM.clearNode(modelsList);

		try {
			const modelService: IVybeLLMModelService | null = instantiationService.invokeFunction((accessor) => {
				try {
					return accessor.get(IVybeLLMModelService);
				} catch {
					return null;
				}
			});

			if (modelService) {
				await modelService.refreshModels();
				const allModels = await modelService.getAllModels();

				// All models are cloud models now
				let filteredModels = allModels;

				// Apply search filter
				if (searchQuery.trim()) {
					const query = searchQuery.toLowerCase();
					filteredModels = filteredModels.filter(m =>
						m.label.toLowerCase().includes(query) ||
						m.providerLabel.toLowerCase().includes(query) ||
						m.description?.toLowerCase().includes(query)
					);
				}

				if (filteredModels.length === 0) {
					const emptyCell = DOM.append(modelsList, DOM.$('.cursor-settings-cell'));
					emptyCell.style.cssText = `
						display: flex;
						align-items: center;
						justify-content: center;
						padding: 24px;
						color: rgba(20, 20, 20, 0.55);
						font-size: 12px;
					`;
					emptyCell.textContent = searchQuery
						? 'No models match your search.'
						: 'No models found. Make sure your API keys are configured.';
				} else {
					// Create hover popup instance for settings tab
					// Pass parent (tab content) as container so popup positions relative to it and stays within editor bounds
					const hoverPopup = new ModelHoverPopup(parent);
					disposables.add(hoverPopup);

					// Render all models in a flat list (no provider grouping)
					for (const model of filteredModels) {
							const modelCell = DOM.append(modelsList, DOM.$('.cursor-settings-cell'));
							modelCell.style.cssText = `
								display: flex;
								align-items: center;
								gap: 12px;
								padding: 8px 12px;
							`;

							// Model name container with label and icon
							const modelLabelContainer = DOM.append(modelCell, DOM.$('div'));
							modelLabelContainer.style.cssText = `
								display: flex;
								align-items: center;
								gap: 6px;
								flex: 1;
								min-width: 0;
							`;

							// Model name
							const modelLabel = DOM.append(modelLabelContainer, DOM.$('span'));
							modelLabel.textContent = model.label;
							modelLabel.style.cssText = `
								font-size: 12px;
								color: var(--vscode-foreground);
								flex-shrink: 1;
								min-width: 0;
							`;

							// Add hover popup for model label (position relative to label text, not cell)
							disposables.add(addDisposableListener(modelLabel, EventType.MOUSE_ENTER, () => {
								hoverPopup.show(model, modelLabel);
							}));
							disposables.add(addDisposableListener(modelLabel, EventType.MOUSE_LEAVE, () => {
								hoverPopup.hide();
							}));

							// Thinking icon for models with thinking (aligned with text baseline)
							if (model.hasThinking) {
								const iconContainer = DOM.append(modelLabelContainer, DOM.$('span'));
								iconContainer.style.cssText = `
									display: inline-flex;
									align-items: center;
									justify-content: center;
									gap: 2px;
									flex-shrink: 0;
									height: 17px;
									line-height: 17px;
								`;

								const brainIcon = DOM.append(iconContainer, DOM.$('span.codicon.codicon-thinking'));
								brainIcon.className = 'codicon codicon-thinking';
								brainIcon.style.cssText = `
									order: 0;
									margin-right: 2px !important;
									font-size: 10px !important;
									opacity: 0.6;
									line-height: 17px;
									vertical-align: middle;
									display: inline-block;
								`;
								brainIcon.title = 'Supports reasoning/thinking';
							}

							// Enable/disable toggle
							const toggleContainer = DOM.append(modelCell, DOM.$('.cursor-settings-cell-switch-container'));
							toggleContainer.style.cssText = 'display: flex; align-items: center; cursor: pointer;';

							const switchOuter = DOM.append(toggleContainer, DOM.$('.solid-switch'));
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
								background: ${model.enabled ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)'};
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
								opacity: ${model.enabled ? '1' : '0'};
								width: ${model.enabled ? '100%' : '0%'};
								transition: 300ms cubic-bezier(0.4, 0, 0.2, 1);
							`;

							const knob = DOM.append(switchOuter, DOM.$('div.solid-switch-toggle'));
							knob.style.cssText = `
								width: 14px;
								height: 14px;
								border-radius: 50%;
								position: absolute;
								background: white;
								transition: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
								left: ${model.enabled ? 'calc(100% - 16px)' : '2px'};
							`;

							// Toggle click handler
							let isEnabled = model.enabled;
							disposables.add(addDisposableListener(toggleContainer, EventType.CLICK, () => {
								isEnabled = !isEnabled;
								modelService.setModelEnabled(model.id, isEnabled);

								// Update visual state
								switchOuter.style.background = isEnabled ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
								bgFill.style.opacity = isEnabled ? '1' : '0';
								bgFill.style.width = isEnabled ? '100%' : '0%';
								knob.style.left = isEnabled ? 'calc(100% - 16px)' : '2px';

							}));
					}
				}
			}
		} catch (error) {
			console.error('Error rendering models:', error);
		}
	};

	// Initial load
	renderModels();

	// Search input handler
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	disposables.add(addDisposableListener(searchInput, EventType.INPUT, () => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		searchTimeout = setTimeout(() => {
			const query = (searchInput as HTMLInputElement).value;
			renderModels(query);
		}, 300);
	}));

	// Refresh button handler
	disposables.add(addDisposableListener(refreshButton, EventType.CLICK, () => {
		renderModels((searchInput as HTMLInputElement).value);
	}));

}

