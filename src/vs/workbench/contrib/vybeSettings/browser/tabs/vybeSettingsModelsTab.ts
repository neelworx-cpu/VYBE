/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createButton } from '../vybeSettingsComponents.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IVybeLLMModelService } from '../../../vybeLLM/common/vybeLLMModelService.js';
import { defaultVybeLLMProviderSettings, VybeLLMProviderSettings } from '../../../vybeLLM/common/vybeLLMMessageTypes.js';

const VYBE_LLM_SETTINGS_STORAGE_KEY = 'vybe.llm.providers';

export function renderModelsTab(
	parent: HTMLElement,
	storageService: IStorageService,
	instantiationService: IInstantiationService,
	disposables: DisposableStore
): void {
	// Local LLM Providers section
	const providersSection = createSection(parent, 'Local LLM Providers');
	const providersSectionList = providersSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const providersSubSection = DOM.append(providersSectionList, DOM.$('.cursor-settings-sub-section'));

	// Get current settings
	const getProviderSettings = (): VybeLLMProviderSettings => {
		const stored = storageService.get(VYBE_LLM_SETTINGS_STORAGE_KEY, StorageScope.APPLICATION);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<VybeLLMProviderSettings>;
				return {
					ollama: parsed.ollama || defaultVybeLLMProviderSettings.ollama,
					lmStudio: parsed.lmStudio || defaultVybeLLMProviderSettings.lmStudio,
				};
			} catch {
				return defaultVybeLLMProviderSettings;
			}
		}
		return defaultVybeLLMProviderSettings;
	};

	const saveProviderSettings = (settings: VybeLLMProviderSettings): void => {
		storageService.store(VYBE_LLM_SETTINGS_STORAGE_KEY, JSON.stringify(settings), StorageScope.APPLICATION, StorageTarget.USER);
	};

	// Create endpoint input cells for each provider
	const createEndpointCell = (providerName: 'ollama' | 'lmStudio', label: string, description: string, hasDivider: boolean = false): HTMLElement => {
		const currentSettings = getProviderSettings();
		const currentValue = currentSettings[providerName].endpoint;

		let subSectionList = providersSubSection.querySelector('.cursor-settings-sub-section-list') as HTMLElement | null;
		if (!subSectionList) {
			subSectionList = DOM.append(providersSubSection, DOM.$('.cursor-settings-sub-section-list'));
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

		if (hasDivider) {
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
		labelContainer.textContent = label;
		labelContainer.style.cssText = `
			margin: 0;
			font-size: 12px;
			font-weight: 400;
			color: var(--vscode-foreground);
			line-height: 16px;
		`;

		const descriptionEl = DOM.append(leadingItems, DOM.$('div.cursor-settings-cell-description'));
		descriptionEl.textContent = description;
		descriptionEl.style.cssText = `
			font-size: 12px;
			color: rgba(20, 20, 20, 0.55);
			line-height: 16px;
		`;

		const trailingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-trailing-items'));
		trailingItems.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px;';

		const inputContainer = DOM.append(trailingItems, DOM.$('div'));
		inputContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

		const input = DOM.append(inputContainer, DOM.$('input'));
		(input as HTMLInputElement).type = 'text';
		(input as HTMLInputElement).value = currentValue;
		(input as HTMLInputElement).placeholder = `e.g. ${currentValue}`;
		(input as HTMLInputElement).spellcheck = false;
		input.style.cssText = `
			width: 250px;
			background-color: var(--vscode-input-background);
			border-radius: 2px;
			border: 1px solid var(--vscode-settings-dropdownBorder);
			outline: none;
			padding: 2px 6px;
			font-size: 12px;
			color: var(--vscode-input-foreground);
			line-height: 1.4;
			box-sizing: border-box;
		`;

		const testButton = createButton('Test', 'tertiary');
		testButton.title = 'Test connection';
		inputContainer.appendChild(testButton);

		// Save on input change (debounced)
		let saveTimeout: ReturnType<typeof setTimeout> | null = null;
		disposables.add(addDisposableListener(input, EventType.INPUT, () => {
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}
			saveTimeout = setTimeout(() => {
				const newSettings = getProviderSettings();
				newSettings[providerName].endpoint = (input as HTMLInputElement).value.trim() || defaultVybeLLMProviderSettings[providerName].endpoint;
				saveProviderSettings(newSettings);
			}, 500);
		}));

		// Test button handler
		disposables.add(addDisposableListener(testButton, EventType.CLICK, async () => {
			const endpoint = (input as HTMLInputElement).value.trim() || defaultVybeLLMProviderSettings[providerName].endpoint;
			testButton.textContent = 'Testing...';
			testButton.style.opacity = '0.6';
			testButton.style.pointerEvents = 'none';

			try {
				// Get model service and test connection
				const modelService = instantiationService.invokeFunction((accessor) => {
					try {
						return accessor.get(IVybeLLMModelService);
					} catch {
						return null;
					}
				});

				if (modelService) {
					// Save endpoint first
					const newSettings = getProviderSettings();
					newSettings[providerName].endpoint = endpoint;
					saveProviderSettings(newSettings);

					// Refresh models to test connection
					await modelService.refreshModels();
					const models = await modelService.getModelsByProvider(providerName);

					testButton.textContent = `✓ ${models.length} models`;
					testButton.style.color = 'rgb(85, 165, 131)';
					setTimeout(() => {
						testButton.textContent = 'Test';
						testButton.style.color = '';
					}, 2000);
				} else {
					throw new Error('Model service not available');
				}
			} catch (error) {
				testButton.textContent = '✗ Failed';
				testButton.style.color = 'rgb(200, 50, 50)';
				setTimeout(() => {
					testButton.textContent = 'Test';
					testButton.style.color = '';
				}, 2000);
			} finally {
				testButton.style.opacity = '1';
				testButton.style.pointerEvents = 'auto';
			}
		}));

		return cell;
	};

	// Create provider endpoint cells
	createEndpointCell('ollama', 'Ollama Endpoint', 'Local endpoint for Ollama (default: http://127.0.0.1:11434)', false);
	createEndpointCell('lmStudio', 'LM Studio Endpoint', 'Local endpoint for LM Studio (default: http://localhost:1234)', true);

	// Local Models section (only local models)
	const localModelsSection = createSection(parent, 'Local Models');
	const localModelsSectionList = localModelsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const localModelsSubSection = DOM.append(localModelsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list for models
	const localModelsSubSectionList = DOM.append(localModelsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	localModelsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px 8px 8px 8px;
		gap: 0;
	`;

	// Search bar (same design as cloud models)
	const localSearchContainer = DOM.append(localModelsSubSectionList, DOM.$('div'));
	localSearchContainer.style.cssText = `
		padding: 12px;
		border-bottom: 1px solid rgba(20, 20, 20, 0.1);
		border-radius: 8px 8px 0 0;
	`;

	const localSearchCell = DOM.append(localSearchContainer, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-center'));
	localSearchCell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0;
	`;

	const localSearchInput = DOM.append(localSearchCell, DOM.$('input'));
	(localSearchInput as HTMLInputElement).placeholder = 'Search local models...';
	(localSearchInput as HTMLInputElement).spellcheck = false;
	localSearchInput.style.cssText = `
		flex: 1;
		background-color: var(--vscode-input-background);
		border-radius: 4px;
		border: 1px solid var(--vscode-input-border);
		outline: none;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--vscode-input-foreground);
	`;

	const localRefreshButton = createButton('Refresh', 'tertiary');
	localRefreshButton.style.cssText = 'flex-shrink: 0;';
	localSearchCell.appendChild(localRefreshButton);

	const localModelsList = DOM.append(localModelsSubSectionList, DOM.$('div'));
	localModelsList.style.cssText = 'display: flex; flex-direction: column; gap: 0;';

	const renderLocalModels = async (searchQuery: string = ''): Promise<void> => {
		DOM.clearNode(localModelsList);

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
				let localModels = (await modelService.getAllModels()).filter(m => m.isLocal);

				// Apply search filter
				if (searchQuery.trim()) {
					const query = searchQuery.toLowerCase();
					localModels = localModels.filter(m =>
						m.label.toLowerCase().includes(query) ||
						m.providerLabel.toLowerCase().includes(query)
					);
				}

				if (localModels.length === 0) {
					const emptyCell = DOM.append(localModelsList, DOM.$('.cursor-settings-cell'));
					emptyCell.style.cssText = `
						display: flex;
						align-items: center;
						justify-content: center;
						padding: 24px;
						color: rgba(20, 20, 20, 0.55);
						font-size: 12px;
					`;
					emptyCell.textContent = searchQuery
						? 'No local models match your search.'
						: 'No local models found. Configure providers above and click Refresh.';
				} else {
					// Group by provider
					const modelsByProvider = new Map<string, typeof localModels>();
					for (const model of localModels) {
						if (!modelsByProvider.has(model.providerLabel)) {
							modelsByProvider.set(model.providerLabel, []);
						}
						modelsByProvider.get(model.providerLabel)!.push(model);
					}

					let isFirst = true;
					for (const [providerLabel, models] of modelsByProvider) {
						if (!isFirst) {
							const divider = DOM.append(localModelsList, DOM.$('.cursor-settings-cell-divider'));
							divider.style.cssText = `
								height: 1px;
								background-color: rgba(20, 20, 20, 0.07);
								margin: 0 12px;
							`;
						}

						// Provider header (no cloud badge)
						const providerHeader = DOM.append(localModelsList, DOM.$('.cursor-settings-cell'));
						providerHeader.style.cssText = `
							display: flex;
							align-items: center;
							padding: 8px 12px;
							background-color: rgba(20, 20, 20, 0.03);
						`;
						const providerLabelEl = DOM.append(providerHeader, DOM.$('span'));
						providerLabelEl.textContent = providerLabel;
						providerLabelEl.style.cssText = `
							font-size: 11px;
							font-weight: 600;
							color: rgba(20, 20, 20, 0.55);
							text-transform: uppercase;
							letter-spacing: 0.5px;
						`;

						// Models with enable/disable toggles
						for (const model of models) {
							const modelCell = DOM.append(localModelsList, DOM.$('.cursor-settings-cell'));
							modelCell.style.cssText = `
								display: flex;
								align-items: center;
								gap: 12px;
								padding: 8px 12px;
							`;

							// Model name
							const modelLabel = DOM.append(modelCell, DOM.$('span'));
							modelLabel.textContent = model.label;
							modelLabel.style.cssText = `
								font-size: 12px;
								color: var(--vscode-foreground);
								flex: 1;
							`;

							// Brain icon for reasoning models
							if (model.hasThinking) {
								const brainIcon = DOM.append(modelCell, DOM.$('span.codicon.codicon-brain'));
								brainIcon.style.cssText = 'font-size: 10px; opacity: 0.6;';
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

						isFirst = false;
					}
				}
			}
		} catch (error) {
			console.error('Error rendering local models:', error);
		}
	};

	// Initial load
	renderLocalModels();

	// Search input handler
	let localSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	disposables.add(addDisposableListener(localSearchInput, EventType.INPUT, () => {
		if (localSearchTimeout) {
			clearTimeout(localSearchTimeout);
		}
		localSearchTimeout = setTimeout(() => {
			const query = (localSearchInput as HTMLInputElement).value;
			renderLocalModels(query);
		}, 300);
	}));

	// Refresh button handler
	disposables.add(addDisposableListener(localRefreshButton, EventType.CLICK, () => {
		renderLocalModels((localSearchInput as HTMLInputElement).value);
	}));

	// Cloud Models section (Frontier Models) - with search bar
	const cloudModelsSection = createSection(parent, 'Cloud Models');
	const cloudModelsSectionList = cloudModelsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const cloudModelsSubSection = DOM.append(cloudModelsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list for cloud models
	const cloudModelsSubSectionList = DOM.append(cloudModelsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	cloudModelsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px 8px 8px 8px;
		gap: 0;
	`;

	// Search bar (same design as local models, not sticky)
	const cloudSearchContainer = DOM.append(cloudModelsSubSectionList, DOM.$('div'));
	cloudSearchContainer.style.cssText = `
		padding: 12px;
		border-bottom: 1px solid rgba(20, 20, 20, 0.1);
		border-radius: 8px 8px 0 0;
	`;

	const cloudSearchCell = DOM.append(cloudSearchContainer, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-center'));
	cloudSearchCell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0;
	`;

	const cloudSearchInput = DOM.append(cloudSearchCell, DOM.$('input'));
	(cloudSearchInput as HTMLInputElement).placeholder = 'Search cloud models...';
	(cloudSearchInput as HTMLInputElement).spellcheck = false;
	cloudSearchInput.style.cssText = `
		flex: 1;
		background-color: var(--vscode-input-background);
		border-radius: 4px;
		border: 1px solid var(--vscode-input-border);
		outline: none;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--vscode-input-foreground);
	`;

	const cloudRefreshButton = createButton('Refresh', 'tertiary');
	cloudRefreshButton.style.cssText = 'flex-shrink: 0;';
	cloudSearchCell.appendChild(cloudRefreshButton);

	// Cloud models list container
	const cloudModelsList = DOM.append(cloudModelsSubSectionList, DOM.$('div'));
	cloudModelsList.style.cssText = 'display: flex; flex-direction: column; gap: 0;';

	// Render cloud models dynamically
	const renderCloudModels = async (searchQuery: string = ''): Promise<void> => {
		DOM.clearNode(cloudModelsList);

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

				// Filter to only cloud models (non-local)
				let cloudModels = allModels.filter(m => !m.isLocal);

				// Apply search filter
				if (searchQuery.trim()) {
					const query = searchQuery.toLowerCase();
					cloudModels = cloudModels.filter(m =>
						m.label.toLowerCase().includes(query) ||
						m.providerLabel.toLowerCase().includes(query) ||
						m.description?.toLowerCase().includes(query)
					);
				}

				if (cloudModels.length === 0) {
					const emptyCell = DOM.append(cloudModelsList, DOM.$('.cursor-settings-cell'));
					emptyCell.style.cssText = `
						display: flex;
						align-items: center;
						justify-content: center;
						padding: 24px;
						color: rgba(20, 20, 20, 0.55);
						font-size: 12px;
					`;
					emptyCell.textContent = searchQuery
						? 'No cloud models match your search.'
						: 'No cloud models found. Make sure your API keys are configured.';
		} else {
					// Group by provider
					const modelsByProvider = new Map<string, typeof cloudModels>();
					for (const model of cloudModels) {
						if (!modelsByProvider.has(model.providerLabel)) {
							modelsByProvider.set(model.providerLabel, []);
						}
						modelsByProvider.get(model.providerLabel)!.push(model);
					}

					let isFirst = true;
					for (const [providerLabel, models] of modelsByProvider) {
						if (!isFirst) {
							const divider = DOM.append(cloudModelsList, DOM.$('.cursor-settings-cell-divider'));
							divider.style.cssText = `
								height: 1px;
								background-color: rgba(20, 20, 20, 0.07);
								margin: 0 12px;
							`;
						}

						// Provider header (no cloud badge)
						const providerHeader = DOM.append(cloudModelsList, DOM.$('.cursor-settings-cell'));
						providerHeader.style.cssText = `
			display: flex;
							align-items: center;
							padding: 8px 12px;
							background-color: rgba(20, 20, 20, 0.03);
						`;
						const providerLabelEl = DOM.append(providerHeader, DOM.$('span'));
						providerLabelEl.textContent = providerLabel;
						providerLabelEl.style.cssText = `
							font-size: 11px;
							font-weight: 600;
							color: rgba(20, 20, 20, 0.55);
							text-transform: uppercase;
							letter-spacing: 0.5px;
						`;

						// Models with enable/disable toggles
						for (const model of models) {
							const modelCell = DOM.append(cloudModelsList, DOM.$('.cursor-settings-cell'));
							modelCell.style.cssText = `
			display: flex;
			align-items: center;
								gap: 12px;
								padding: 8px 12px;
							`;

							// Model name
							const modelLabel = DOM.append(modelCell, DOM.$('span'));
							modelLabel.textContent = model.label;
							modelLabel.style.cssText = `
			font-size: 12px;
			color: var(--vscode-foreground);
								flex: 1;
							`;

							// Brain icon for reasoning models
							if (model.hasThinking) {
								const brainIcon = DOM.append(modelCell, DOM.$('span.codicon.codicon-brain'));
								brainIcon.style.cssText = 'font-size: 10px; opacity: 0.6;';
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

						isFirst = false;
					}
				}
			}
		} catch (error) {
			console.error('Error rendering cloud models:', error);
		}
	};

	// Initial load
	renderCloudModels();

	// Search input handler
	let cloudSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	disposables.add(addDisposableListener(cloudSearchInput, EventType.INPUT, () => {
		if (cloudSearchTimeout) {
			clearTimeout(cloudSearchTimeout);
		}
		cloudSearchTimeout = setTimeout(() => {
			const query = (cloudSearchInput as HTMLInputElement).value;
			renderCloudModels(query);
		}, 300);
	}));

	// Refresh button handler
	disposables.add(addDisposableListener(cloudRefreshButton, EventType.CLICK, () => {
		renderCloudModels((cloudSearchInput as HTMLInputElement).value);
	}));

}

