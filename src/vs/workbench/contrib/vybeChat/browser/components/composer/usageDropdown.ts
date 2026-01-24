/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, getWindow } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { isDarkTheme } from '../../utils/themeUtils.js';
import { type ModelDropdownState } from './modelDropdown.js';

// Model labels mapping (should match modelDropdown.ts)
const MODEL_LABELS: Record<string, string> = {
	'opus-4.5': 'Opus 4.5',
	'sonnet-4.5': 'Sonnet 4.5',
	'gpt-5.1-codex-high': 'GPT-5.1 Codex High',
	'gpt-5.1': 'GPT-5.1',
	'gemini-3-pro': 'Gemini 3 Pro'
};

export class UsageDropdown extends Disposable {
	private dropdownElement: HTMLElement | null = null;
	private modelState: ModelDropdownState | null = null;

	constructor(
		private anchorElement: HTMLElement,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
	}

	private getModelLabel(state: ModelDropdownState): string {
		if (state.isAutoEnabled) {
			return 'Auto';
		}
		const label = MODEL_LABELS[state.selectedModelId];
		if (!label) {
			return state.selectedModelId;
		}
		// Add Max indicator if enabled
		if (state.isMaxModeEnabled) {
			return `${label} (Max)`;
		}
		return label;
	}

	private openDownward: boolean = false;

	public show(modelState?: ModelDropdownState, openDownward: boolean = false): void {
		// Update model state if provided
		if (modelState) {
			this.modelState = modelState;
		}

		// Store direction
		this.openDownward = openDownward;

		// Remove existing dropdown if any (toggle behavior)
		if (this.dropdownElement) {
			this.hide();
			return;
		}

		// Detect theme
		const isDark = isDarkTheme(this.themeService, this.anchorElement);

		// Create dropdown container
		this.dropdownElement = append(getWindow(this.anchorElement).document.body, $('#vybe-usage-dropdown'));
		this.dropdownElement.style.boxSizing = 'border-box';
		this.dropdownElement.style.padding = '0';
		this.dropdownElement.style.borderRadius = '6px';
		this.dropdownElement.style.backgroundColor = isDark ? '#212427' : '#eceff2';
		// Match border styling from model/agent dropdowns
		this.dropdownElement.style.border = isDark ? '1px solid #383838' : '1px solid #d9d9d9';
		this.dropdownElement.style.alignItems = 'stretch';
		this.dropdownElement.style.fontSize = '12px';
		this.dropdownElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
		this.dropdownElement.style.display = 'flex';
		this.dropdownElement.style.flexDirection = 'column';
		this.dropdownElement.style.gap = '0';
		this.dropdownElement.style.position = 'fixed';
		this.dropdownElement.style.visibility = 'visible';
		this.dropdownElement.style.width = '250px';
		this.dropdownElement.style.transformOrigin = 'right bottom';
		this.dropdownElement.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.24)';
		this.dropdownElement.style.zIndex = '10000';

		// Position ABOVE the progress circle - right edge aligned with icon's right edge
		const rect = this.anchorElement.getBoundingClientRect();
		const dropdownWidth = 250;
		// Align dropdown's right edge with progress circle's right edge
		if (this.openDownward) {
			// Open downward (for sticky message at top)
			this.dropdownElement.style.top = `${rect.bottom + 3}px`;
			this.dropdownElement.style.left = `${rect.right - dropdownWidth}px`;
			this.dropdownElement.style.transform = 'none';
		} else {
			// Open upward (for bottom composer)
			this.dropdownElement.style.top = `${rect.top - 3}px`;
			this.dropdownElement.style.left = `${rect.right - dropdownWidth}px`;
			this.dropdownElement.style.transform = 'translateY(-100%)';
		}

		// Inner container
		const innerContainer = append(this.dropdownElement, $('div'));
		innerContainer.style.display = 'flex';
		innerContainer.style.flexDirection = 'column';
		innerContainer.style.gap = '0';

		// Content container
		const contentContainer = append(innerContainer, $('div'));
		contentContainer.setAttribute('tabindex', '0');
		contentContainer.style.boxSizing = 'border-box';
		contentContainer.style.alignItems = 'stretch';
		contentContainer.style.fontSize = '12px';
		contentContainer.style.display = 'flex';
		contentContainer.style.flexDirection = 'column';
		contentContainer.style.gap = '1px';
		contentContainer.style.padding = '2px';
		contentContainer.style.outline = 'none';
		contentContainer.style.pointerEvents = 'auto';

		// Get model label from state
		const modelLabel = this.modelState ? this.getModelLabel(this.modelState) : 'Auto';

		// Usage info items - dynamically set model name
		const usageItems = [
			{ label: 'Context used', value: '0 / 278K tokens' },
			{ label: 'Messages', value: '0 / 50' },
			{ label: 'Model', value: modelLabel },
		];

		usageItems.forEach((item) => {
			const usageItem = append(contentContainer, $('div'));
			usageItem.style.display = 'flex';
			usageItem.style.justifyContent = 'space-between';
			usageItem.style.alignItems = 'center';
			usageItem.style.padding = '4px 6px';
			usageItem.style.borderRadius = '3px';
			usageItem.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

			const labelSpan = append(usageItem, $('span'));
			labelSpan.textContent = item.label;
			labelSpan.style.fontSize = '11px';
			labelSpan.style.lineHeight = '14px';
			labelSpan.style.color = isDark
				? 'rgba(204, 204, 204, 0.7)'
				: 'rgba(102, 102, 102, 0.7)';

			const valueSpan = append(usageItem, $('span'));
			valueSpan.textContent = item.value;
			valueSpan.style.fontSize = '11px';
			valueSpan.style.lineHeight = '14px';
			valueSpan.style.color = isDark
				? 'rgba(228, 228, 228, 0.92)'
				: 'rgba(51, 51, 51, 0.92)';
			valueSpan.style.fontWeight = '500';

			// Hover effect
			this._register(
				addDisposableListener(usageItem, 'mouseenter', () => {
					usageItem.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
				}),
			);
			this._register(
				addDisposableListener(usageItem, 'mouseleave', () => {
					usageItem.style.backgroundColor = 'transparent';
				}),
			);
		});

		// Close dropdown when clicking outside
		const closeHandler = (e: MouseEvent) => {
			if (
				!this.dropdownElement?.contains(e.target as Node) &&
				!this.anchorElement.contains(e.target as Node)
			) {
				this.hide();
				getWindow(this.anchorElement).document.removeEventListener('click', closeHandler);
			}
		};

		// Use setTimeout to avoid immediate close
		setTimeout(() => {
			getWindow(this.anchorElement).document.addEventListener('click', closeHandler);
		}, 0);
	}

	public hide(): void {
		if (this.dropdownElement) {
			this.dropdownElement.remove();
			this.dropdownElement = null;
		}
	}
}

