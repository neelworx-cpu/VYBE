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

interface ModelItem {
	name: string;
	hasBrainIcon?: boolean;
	hasMaxOnlyBadge?: boolean;
	checked: boolean;
}

interface ApiKeySection {
	title: string;
	description: string;
	descriptionLinkText?: string;
	hasToggle?: boolean;
	toggleChecked?: boolean;
	inputs: Array<{
		label: string;
		type: 'text' | 'password';
		placeholder: string;
	}>;
}

function createModelItem(parent: HTMLElement, model: ModelItem, hasDivider: boolean = false): HTMLElement {
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

	const cell = DOM.append(subSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-center.settings-model-item'));
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
	labelContainer.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const labelInner = DOM.append(labelContainer, DOM.$('div'));
	labelInner.style.cssText = 'display: flex; align-items: center; gap: 6px;';

	const nameSpan = DOM.append(labelInner, DOM.$('span'));
	nameSpan.style.cssText = 'display: inline-flex; align-items: baseline; gap: 6px; opacity: 1;';

	const nameText = DOM.append(nameSpan, DOM.$('span'));
	nameText.textContent = model.name;

	if (model.hasMaxOnlyBadge) {
		const badge = DOM.append(nameSpan, DOM.$('span'));
		badge.textContent = 'MAX Only';
		badge.style.cssText = `
			display: inline-block;
			padding: 0px 1px;
			border-radius: 4px;
			font-size: 9px;
			font-weight: 600;
			color: var(--cursor-text-tertiary);
			width: fit-content;
			vertical-align: baseline;
		`;
	}

	if (model.hasBrainIcon) {
		const brainIcon = DOM.append(labelInner, DOM.$('span.codicon.codicon-brain'));
		brainIcon.style.cssText = 'font-size: 12px; opacity: 0.6; display: flex; align-items: center;';
	}

	const trailingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-trailing-items'));
	trailingItems.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	const trailingInner = DOM.append(trailingItems, DOM.$('div'));
	trailingInner.style.cssText = 'display: flex;';

	const trailingActions = DOM.append(trailingInner, DOM.$('div'));
	trailingActions.style.cssText = 'display: flex; align-items: center; gap: 8px;';

	// Hidden trash icon
	const trashIcon = DOM.append(trailingActions, DOM.$('div.codicon.codicon-trash.settings-menu-hoverable.light'));
	trashIcon.style.cssText = `
		padding: 2px;
		font-size: 12px;
		border-radius: 4px;
		cursor: pointer;
		color: var(--cursor-icon-secondary);
		pointer-events: none;
		visibility: hidden;
	`;

	// Toggle switch
	const switchContainer = DOM.append(trailingActions, DOM.$('.cursor-settings-cell-switch-container'));
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
		background: ${model.checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)'};
		transform-origin: right center;
		opacity: 1;
	`;

	// Background fill (animated)
	const bgFill = DOM.append(switchOuter, DOM.$('div'));
	bgFill.style.cssText = `
		border-radius: 18px;
		position: absolute;
		top: 0;
		bottom: 0;
		height: 100%;
		left: 0;
		background: rgb(85, 165, 131);
		opacity: ${model.checked ? '1' : '0'};
		width: ${model.checked ? '100%' : '0%'};
		transition: ${model.checked ? '300ms' : '150ms'} cubic-bezier(0.4, 0, 0.2, 1);
	`;

	// Knob (thumb)
	const knob = DOM.append(switchOuter, DOM.$('div.solid-switch-toggle'));
	knob.className = `solid-switch-toggle ${model.checked ? 'on' : 'off'}`;
	knob.style.cssText = `
		width: 14px;
		height: 14px;
		border-radius: 50%;
		position: absolute;
		background: white;
		transition: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
		left: ${model.checked ? 'calc(100% - 16px)' : '2px'};
	`;

	return cell;
}

function createApiKeySection(parent: HTMLElement, config: ApiKeySection): HTMLElement {
	const section = createSection(parent, null);
	section.style.cssText = 'display: flex; flex-direction: column; gap: 14px;';

	const sectionHeader = DOM.append(section, DOM.$('.cursor-settings-section-header'));
	sectionHeader.style.cssText = 'display: flex; align-items: flex-end; gap: 20px; padding: 0 8px;';

	const leadingItems = DOM.append(sectionHeader, DOM.$('.cursor-settings-section-header-leading-items'));
	leadingItems.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

	const titleRow = DOM.append(leadingItems, DOM.$('.cursor-settings-section-header-title-row'));
	titleRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';

	const sectionTitle = DOM.append(titleRow, DOM.$('.cursor-settings-section-header-title'));
	sectionTitle.textContent = config.title;
	sectionTitle.style.cssText = `
		font-size: 12px;
		font-weight: 400;
		color: rgba(20, 20, 20, 0.55);
		letter-spacing: 0.07px;
		line-height: 14px;
	`;

	const description = DOM.append(leadingItems, DOM.$('.cursor-settings-section-header-description'));
	description.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
		line-height: 16px;
	`;

	// Parse description with optional link
	if (config.descriptionLinkText) {
		const parts = config.description.split(config.descriptionLinkText);
		description.appendChild(document.createTextNode(parts[0]));
		const link = DOM.append(description, DOM.$('span'));
		link.textContent = config.descriptionLinkText;
		link.style.cssText = 'display: inline; color: var(--vscode-textLink-foreground); cursor: pointer;';
		if (parts[1]) {
			description.appendChild(document.createTextNode(parts[1]));
		}
	} else {
		// Handle <br> tags by splitting and creating text nodes and br elements
		const parts = config.description.split('<br>');
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				DOM.append(description, DOM.$('br'));
			}
			if (parts[i]) {
				description.appendChild(document.createTextNode(parts[i]));
			}
		}
	}

	const trailingItems = DOM.append(sectionHeader, DOM.$('.cursor-settings-section-header-trailing-items'));
	if (config.hasToggle) {
		trailingItems.style.cssText = 'margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-right: 12px;';

		const switchContainer = DOM.append(trailingItems, DOM.$('div'));
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
			background: ${config.toggleChecked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)'};
			transform: scale(0.8);
			transform-origin: right center;
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
			opacity: ${config.toggleChecked ? '1' : '0'};
			width: ${config.toggleChecked ? '100%' : '0%'};
			transition: ${config.toggleChecked ? '300ms' : '150ms'} cubic-bezier(0.4, 0, 0.2, 1);
		`;

		const knob = DOM.append(switchOuter, DOM.$('div.solid-switch-toggle'));
		knob.className = `solid-switch-toggle ${config.toggleChecked ? 'on' : 'off'}`;
		knob.style.cssText = `
			width: 14px;
			height: 14px;
			border-radius: 50%;
			position: absolute;
			background: white;
			transition: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
			left: ${config.toggleChecked ? 'calc(100% - 16px)' : '2px'};
		`;
	} else {
		trailingItems.style.cssText = 'flex-shrink: 0;';
	}

	const sectionList = section.querySelector('.cursor-settings-section-list') as HTMLElement;
	sectionList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

	for (let i = 0; i < config.inputs.length; i++) {
		const inputConfig = config.inputs[i];
		const subSection = DOM.append(sectionList, DOM.$('.cursor-settings-sub-section'));
		const subSectionList = DOM.append(subSection, DOM.$('.cursor-settings-sub-section-list'));
		subSectionList.style.cssText = `
			display: flex;
			flex-direction: column;
			background-color: var(--vscode-activityBar-background);
			border-radius: 8px;
			gap: 0;
		`;

		const cell = DOM.append(subSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-center'));
		if (i > 0) {
			cell.className = 'cursor-settings-cell cursor-settings-cell-align-center';
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
		cell.style.cssText = `
			display: flex;
			align-items: center;
			gap: 20px;
			padding: 12px;
			position: relative;
		`;

		const leadingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-leading-items'));
		leadingItems.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

		const label = DOM.append(leadingItems, DOM.$('p.cursor-settings-cell-label'));
		label.textContent = inputConfig.label;
		label.style.cssText = `
			margin: 0;
			font-size: 12px;
			font-weight: 400;
			color: var(--vscode-foreground);
			line-height: 16px;
		`;

		const trailingItems = DOM.append(cell, DOM.$('.cursor-settings-cell-trailing-items'));
		trailingItems.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

		const inputContainer = DOM.append(trailingItems, DOM.$('div'));
		inputContainer.style.cssText = 'display: flex;';

		const inputWrapper = DOM.append(inputContainer, DOM.$('div'));
		if (inputConfig.type === 'password') {
			const input = DOM.append(inputWrapper, DOM.$('input'));
			(input as HTMLInputElement).type = 'password';
			(input as HTMLInputElement).placeholder = inputConfig.placeholder;
			(input as HTMLInputElement).spellcheck = false;
			input.style.cssText = `
				width: 100%;
				background-color: var(--vscode-input-background);
				border-radius: 2px;
				border: 1px solid var(--vscode-settings-dropdownBorder);
				outline: none;
				padding: 2px 6px;
				font-size: 12px;
				color: var(--vscode-input-foreground);
				line-height: 1.4;
				box-sizing: border-box;
				opacity: 1;
			`;
		} else {
			const input = DOM.append(inputWrapper, DOM.$('input'));
			(input as HTMLInputElement).type = 'text';
			(input as HTMLInputElement).placeholder = inputConfig.placeholder;
			(input as HTMLInputElement).spellcheck = false;
			input.style.cssText = `
				width: 100%;
				background-color: var(--vscode-input-background);
				border-radius: 2px;
				border: 1px solid var(--vscode-settings-dropdownBorder);
				outline: none;
				padding: 2px 6px;
				font-size: 12px;
				color: var(--vscode-input-foreground);
				line-height: 1.4;
				box-sizing: border-box;
				opacity: 1;
			`;
		}
	}

	return section;
}

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
					vLLM: parsed.vLLM || defaultVybeLLMProviderSettings.vLLM,
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
	const createEndpointCell = (providerName: 'ollama' | 'vLLM' | 'lmStudio', label: string, description: string, hasDivider: boolean = false): HTMLElement => {
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
	createEndpointCell('vLLM', 'vLLM Endpoint', 'Local endpoint for vLLM (default: http://localhost:8000)', true);
	createEndpointCell('lmStudio', 'LM Studio Endpoint', 'Local endpoint for LM Studio (default: http://localhost:1234)', true);

	// Local Models section
	const localModelsSection = createSection(parent, 'Local Models');
	const localModelsSectionList = localModelsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const localModelsSubSection = DOM.append(localModelsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list for local models
	const localModelsSubSectionList = DOM.append(localModelsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	localModelsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Refresh button and status
	const refreshContainer = DOM.append(localModelsSubSectionList, DOM.$('div'));
	refreshContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px;';

	const statusText = DOM.append(refreshContainer, DOM.$('span'));
	statusText.style.cssText = `
		font-size: 12px;
		color: rgba(20, 20, 20, 0.55);
	`;

	const refreshButton = createButton('Refresh', 'tertiary');
	refreshButton.style.marginLeft = 'auto';
	refreshContainer.appendChild(refreshButton);

	const modelsList = DOM.append(localModelsSubSectionList, DOM.$('div'));
	modelsList.style.cssText = 'display: flex; flex-direction: column; gap: 0;';

	const renderLocalModels = async (): Promise<void> => {
		statusText.textContent = 'Loading models...';
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

				if (allModels.length === 0) {
					const emptyCell = DOM.append(modelsList, DOM.$('.cursor-settings-cell'));
					emptyCell.style.cssText = `
						display: flex;
						align-items: center;
						justify-content: center;
						padding: 24px;
						color: rgba(20, 20, 20, 0.55);
						font-size: 12px;
					`;
					emptyCell.textContent = 'No local models found. Configure providers above and click Refresh.';
					statusText.textContent = 'No models found';
				} else {
					// Group by provider
					const modelsByProvider = new Map<string, typeof allModels>();
					for (const model of allModels) {
						if (!modelsByProvider.has(model.providerLabel)) {
							modelsByProvider.set(model.providerLabel, []);
						}
						modelsByProvider.get(model.providerLabel)!.push(model);
					}

					let isFirst = true;
					for (const [providerLabel, models] of modelsByProvider) {
						if (!isFirst) {
							const divider = DOM.append(modelsList, DOM.$('.cursor-settings-cell-divider'));
							divider.style.cssText = `
								height: 1px;
								background-color: rgba(20, 20, 20, 0.07);
								margin: 0 12px;
							`;
						}

						// Provider header
						const providerHeader = DOM.append(modelsList, DOM.$('.cursor-settings-cell'));
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

						// Models
						for (const model of models) {
							const modelCell = DOM.append(modelsList, DOM.$('.cursor-settings-cell'));
							modelCell.style.cssText = `
								display: flex;
								align-items: center;
								gap: 12px;
								padding: 8px 12px;
							`;

							const modelLabel = DOM.append(modelCell, DOM.$('span'));
							modelLabel.textContent = model.label;
							modelLabel.style.cssText = `
								font-size: 12px;
								color: var(--vscode-foreground);
								flex: 1;
							`;

							if (model.hasThinking) {
								const brainIcon = DOM.append(modelCell, DOM.$('span.codicon.codicon-symbol-namespace'));
								brainIcon.style.cssText = `
									font-size: 10px;
									opacity: 0.6;
								`;
							}
						}

						isFirst = false;
					}

					statusText.textContent = `${allModels.length} model${allModels.length !== 1 ? 's' : ''} from ${modelsByProvider.size} provider${modelsByProvider.size !== 1 ? 's' : ''}`;
				}
			} else {
				statusText.textContent = 'Model service not available';
			}
		} catch (error) {
			statusText.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
		}
	};

	// Initial load
	renderLocalModels();

	// Refresh button handler
	disposables.add(addDisposableListener(refreshButton, EventType.CLICK, () => {
		renderLocalModels();
	}));

	// Models section (existing cloud models)
	const modelsSection = createSection(parent, null);
	const modelsSectionList = modelsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const modelsSubSection = DOM.append(modelsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Create sub-section-list for models
	const modelSubSectionList = DOM.append(modelsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	modelSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Sticky search container wrapper (inside sub-section-list)
	const searchContainer = DOM.append(modelSubSectionList, DOM.$('div'));
	searchContainer.style.cssText = 'display: flex; flex-direction: column;';

	const stickyWrapper = DOM.append(searchContainer, DOM.$('div'));
	stickyWrapper.style.cssText = 'position: sticky; top: 0px; z-index: 1;';

	const searchCell = DOM.append(stickyWrapper, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-center'));
	searchCell.style.cssText = `
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px;
		position: relative;
	`;

	const searchLeading = DOM.append(searchCell, DOM.$('.cursor-settings-cell-leading-items'));
	searchLeading.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const searchLabel = DOM.append(searchLeading, DOM.$('p.cursor-settings-cell-label'));
	searchLabel.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
	`;

	const searchInput = DOM.append(searchLabel, DOM.$('input'));
	(searchInput as HTMLInputElement).placeholder = 'Add or search model';
	(searchInput as HTMLInputElement).spellcheck = false;
	searchInput.style.cssText = `
		width: min(200px, 100%);
		background-color: var(--vscode-panel-background);
		border-radius: 4px;
		border: 1px solid var(--vscode-input-border);
		outline: none;
		padding: 5px 12px;
		font-size: 13px;
		color: var(--vscode-input-foreground);
		line-height: 1.4;
		box-sizing: border-box;
		flex: 1 1 0%;
		backdrop-filter: blur(10px);
		box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 10px 0px;
	`;

	const searchTrailing = DOM.append(searchCell, DOM.$('.cursor-settings-cell-trailing-items'));
	searchTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	const trailingInner = DOM.append(searchTrailing, DOM.$('div'));
	trailingInner.style.cssText = 'display: flex;';

	const cloudRefreshContainer = DOM.append(trailingInner, DOM.$('div'));
	cloudRefreshContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-left: 8px;';

	const refreshIcon = DOM.append(cloudRefreshContainer, DOM.$('div.codicon.codicon-refresh.settings-menu-hoverable.light'));
	refreshIcon.title = 'Refresh model list';
	refreshIcon.style.cssText = `
		padding: 6px;
		font-size: 14px;
		border-radius: 4px;
		color: var(--cursor-icon-secondary);
		cursor: pointer;
		opacity: 1;
	`;

	// Define all models from the outerHTML
	const allModels: ModelItem[] = [
		{ name: 'Composer 1', checked: true },
		{ name: 'Opus 4.5', hasBrainIcon: true, checked: true },
		{ name: 'Sonnet 4.5', hasBrainIcon: true, checked: true },
		{ name: 'GPT-5.1 Codex Max', hasBrainIcon: true, checked: true },
		{ name: 'GPT-5.2', hasBrainIcon: true, checked: true },
		{ name: 'GPT-5.1 Codex Mini', hasBrainIcon: true, checked: true },
		{ name: 'Grok Code', hasBrainIcon: true, checked: true },
		{ name: 'Opus 4.1', hasBrainIcon: true, hasMaxOnlyBadge: true, checked: true },
		{ name: 'Opus 4', hasMaxOnlyBadge: true, checked: true },
		{ name: 'Opus 4.5', checked: false },
		{ name: 'Sonnet 4.5', checked: false },
		{ name: 'GPT-5.1 Codex Max High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Max Low', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Max Extra High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Max Medium Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Max High Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Max Low Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Max Extra High Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex High Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Low', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Low Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 High Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 Extra High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 Extra High Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 Low', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.2 Low Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 High Fast', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Low', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Low Fast', hasBrainIcon: true, checked: false },
		{ name: 'Gemini 3 Pro', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Mini High', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5.1 Codex Mini Low', hasBrainIcon: true, checked: false },
		{ name: 'Haiku 4.5', checked: false },
		{ name: 'Haiku 4.5', hasBrainIcon: true, checked: false },
		{ name: 'Opus 4.1', hasMaxOnlyBadge: true, checked: false },
		{ name: 'Opus 4', hasMaxOnlyBadge: true, hasBrainIcon: true, checked: false },
		{ name: 'Sonnet 4', checked: false },
		{ name: 'Sonnet 4', hasBrainIcon: true, checked: false },
		{ name: 'Sonnet 4 1M', hasMaxOnlyBadge: true, checked: false },
		{ name: 'Sonnet 4 1M', hasMaxOnlyBadge: true, hasBrainIcon: true, checked: false },
		{ name: 'o3', hasBrainIcon: true, checked: false },
		{ name: 'GPT-4.1', checked: false },
		{ name: 'GPT-5 Mini', hasBrainIcon: true, checked: false },
		{ name: 'GPT-5 Nano', hasBrainIcon: true, checked: false },
		{ name: 'o3 Pro', hasMaxOnlyBadge: true, hasBrainIcon: true, checked: false },
		{ name: 'GPT-5 Pro', hasMaxOnlyBadge: true, hasBrainIcon: true, checked: false },
		{ name: 'Gemini 2.5 Flash', hasBrainIcon: true, checked: false },
		{ name: 'Kimi K2', checked: false },
	];

	// Initially show first 7 models
	const visibleModels = allModels.slice(0, 7);
	const hiddenModels = allModels.slice(7);

	// Render first 7 models (visible) - pass the sub-section so createModelItem can find the list
	for (let i = 0; i < visibleModels.length; i++) {
		createModelItem(modelsSubSection, visibleModels[i], i > 0);
	}

	// "View All Models" link (when collapsed) or "Add Custom Model" (when expanded)
	let modelsExpanded = false;
	const viewAllLink = DOM.append(modelSubSectionList, DOM.$('div.settings-menu-hoverable'));
	viewAllLink.textContent = 'View All Models';
	viewAllLink.style.cssText = `
		padding: 8px 12px;
		cursor: pointer;
		color: var(--vscode-textLink-foreground);
	`;

	// Store references to hidden model cells
	const hiddenModelCells: HTMLElement[] = [];

	// Toggle models expansion
	addDisposableListener(viewAllLink, EventType.CLICK, () => {
		modelsExpanded = !modelsExpanded;
		if (modelsExpanded) {
			viewAllLink.textContent = 'Add Custom Model';
			// Render hidden models
			for (let i = 0; i < hiddenModels.length; i++) {
				const modelCell = createModelItem(modelsSubSection, hiddenModels[i], true);
				modelSubSectionList.insertBefore(modelCell, viewAllLink);
				hiddenModelCells.push(modelCell);
			}
		} else {
			viewAllLink.textContent = 'View All Models';
			// Remove hidden models from DOM
			for (const cell of hiddenModelCells) {
				cell.remove();
			}
			hiddenModelCells.length = 0;
		}
	});

	// API Keys collapsible section
	const apiKeysContainer = DOM.append(parent, DOM.$('div'));
	apiKeysContainer.style.cssText = 'cursor: pointer; display: flex; align-items: center;';

	let apiKeysExpanded = false;

	const chevron = DOM.append(apiKeysContainer, DOM.$('div.codicon'));
	chevron.className = 'codicon codicon-chevron-right';
	chevron.style.cssText = 'font-size: 1.5em; margin: 0px 4px; color: var(--cursor-text-secondary);';

	const apiKeysLabel = DOM.append(apiKeysContainer, DOM.$('div'));
	apiKeysLabel.textContent = 'API Keys';
	apiKeysLabel.style.cssText = 'font-size: 1.1em; color: var(--cursor-text-secondary);';

	// API Keys content (initially hidden)
	const apiKeysContent = DOM.append(parent, DOM.$('div'));
	apiKeysContent.style.cssText = 'display: none;';

	// Toggle API Keys section
	addDisposableListener(apiKeysContainer, EventType.CLICK, () => {
		apiKeysExpanded = !apiKeysExpanded;
		if (apiKeysExpanded) {
			chevron.className = 'codicon codicon-chevron-down';
			apiKeysContent.style.display = 'block';
		} else {
			chevron.className = 'codicon codicon-chevron-right';
			apiKeysContent.style.display = 'none';
		}
	});

	// OpenAI API Key section
	createApiKeySection(apiKeysContent, {
		title: 'OpenAI API Key',
		description: 'You can put in your OpenAI key to use OpenAI models at cost.',
		descriptionLinkText: 'your OpenAI key',
		hasToggle: true,
		toggleChecked: false,
		inputs: [
			{ label: '', type: 'password', placeholder: 'Enter your OpenAI API Key' }
		]
	});

	// Override OpenAI Base URL (separate cell)
	const openAiSection = apiKeysContent.querySelector('.cursor-settings-section') as HTMLElement;
	if (openAiSection) {
		const sectionList = openAiSection.querySelector('.cursor-settings-section-list') as HTMLElement;
		const overrideSubSection = DOM.append(sectionList, DOM.$('.cursor-settings-sub-section'));
		const overrideSubSectionList = DOM.append(overrideSubSection, DOM.$('.cursor-settings-sub-section-list'));
		overrideSubSectionList.style.cssText = `
			display: flex;
			flex-direction: column;
			background-color: var(--vscode-activityBar-background);
			border-radius: 8px;
			gap: 0;
		`;

		const overrideCell = DOM.append(overrideSubSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
		overrideCell.style.cssText = `
			display: flex;
			align-items: center;
			gap: 20px;
			padding: 12px;
			position: relative;
		`;

		const overrideLeading = DOM.append(overrideCell, DOM.$('.cursor-settings-cell-leading-items'));
		overrideLeading.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

		const overrideLabel = DOM.append(overrideLeading, DOM.$('p.cursor-settings-cell-label'));
		overrideLabel.textContent = 'Override OpenAI Base URL';
		overrideLabel.style.cssText = `
			margin: 0;
			font-size: 12px;
			font-weight: 400;
			color: var(--vscode-foreground);
			line-height: 16px;
		`;

		const overrideDesc = DOM.append(overrideLeading, DOM.$('div.cursor-settings-cell-description'));
		overrideDesc.textContent = 'Change the base URL for OpenAI API requests.';
		overrideDesc.style.cssText = `
			font-size: 12px;
			color: rgba(20, 20, 20, 0.55);
			line-height: 16px;
		`;

		const overrideTrailing = DOM.append(overrideCell, DOM.$('.cursor-settings-cell-trailing-items'));
		overrideTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

		const overrideInner = DOM.append(overrideTrailing, DOM.$('div'));
		overrideInner.style.cssText = 'display: flex;';

		const overrideActions = DOM.append(overrideInner, DOM.$('div'));
		overrideActions.style.cssText = 'display: flex; align-items: center; gap: 8px;';

		const overrideSwitch = DOM.append(overrideActions, DOM.$('.solid-switch'));
		overrideSwitch.style.cssText = `
			width: 30px;
			height: 18px;
			border-radius: 18px;
			position: relative;
			display: flex;
			align-items: center;
			cursor: pointer;
			transition: all 300ms;
			overflow: hidden;
			background: rgba(128, 128, 128, 0.3);
			transform: scale(0.8);
			transform-origin: right center;
		`;

		const overrideBgFill = DOM.append(overrideSwitch, DOM.$('div'));
		overrideBgFill.style.cssText = `
			border-radius: 18px;
			position: absolute;
			top: 0;
			bottom: 0;
			height: 100%;
			left: 0;
			background: rgb(85, 165, 131);
			opacity: 0;
			width: 0%;
			transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
		`;

		const overrideKnob = DOM.append(overrideSwitch, DOM.$('div.solid-switch-toggle'));
		overrideKnob.className = 'solid-switch-toggle off';
		overrideKnob.style.cssText = `
			width: 14px;
			height: 14px;
			border-radius: 50%;
			position: absolute;
			background: white;
			transition: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
			left: 2px;
		`;
	}

	// Anthropic API Key section
	createApiKeySection(apiKeysContent, {
		title: 'Anthropic API Key',
		description: 'You can put in your Anthropic key to use Claude at cost. When enabled, this key will be used for all models beginning with "claude-".',
		descriptionLinkText: 'your Anthropic key',
		inputs: [
			{ label: '', type: 'password', placeholder: 'Enter your Anthropic API Key' }
		]
	});

	// Google API Key section
	createApiKeySection(apiKeysContent, {
		title: 'Google API Key',
		description: 'You can put in your Google AI Studio key to use Google models at-cost.',
		descriptionLinkText: 'your Google AI Studio key',
		hasToggle: true,
		toggleChecked: false,
		inputs: [
			{ label: '', type: 'password', placeholder: 'Enter your Google AI Studio API Key' }
		]
	});

	// Azure OpenAI section
	createApiKeySection(apiKeysContent, {
		title: 'Azure OpenAI',
		description: 'Configure Azure OpenAI to use OpenAI models through your Azure account.',
		hasToggle: true,
		toggleChecked: false,
		inputs: [
			{ label: 'Base URL', type: 'text', placeholder: 'e.g. my-resource.openai.azure.com' },
			{ label: 'Deployment Name', type: 'text', placeholder: 'e.g. gpt-35-turbo' },
			{ label: 'API Key', type: 'password', placeholder: 'Enter your Azure OpenAI API Key' }
		]
	});

	// AWS Bedrock section
	createApiKeySection(apiKeysContent, {
		title: 'AWS Bedrock',
		description: 'Configure AWS Bedrock to use Anthropic Claude models through your AWS account.<br>Cursor Enterprise teams can configure IAM roles to access Bedrock without any Access Keys.',
		hasToggle: true,
		toggleChecked: false,
		inputs: [
			{ label: 'Access Key ID', type: 'password', placeholder: 'AWS Access Key ID' },
			{ label: 'Secret Access Key', type: 'password', placeholder: 'AWS Secret Access Key' },
			{ label: 'Region', type: 'text', placeholder: 'e.g. us-east-1' },
			{ label: 'Test Model', type: 'text', placeholder: 'e.g. anthropic.claude-3-sonnet-20240229-v1:0' }
		]
	});
}

