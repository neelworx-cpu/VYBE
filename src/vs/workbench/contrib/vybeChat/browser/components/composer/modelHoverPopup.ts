/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { VybeModel } from '../../../../vybeLLM/common/vybeLLMModelService.js';

// Model information mapping based on user specifications
interface ModelInfo {
	popupTitle: string; // Title shown in popup (may differ from dropdown label)
	description: string;
	contextWindow: number;
	reasoningVersion?: string; // e.g., "high reasoning", "medium reasoning", "low reasoning", "high effort", "medium effort"
}

const MODEL_INFO: Record<string, ModelInfo> = {
	// Gemini Models
	'gemini-2.5-pro': {
		popupTitle: 'Gemini 2.5 Pro (dynamic)',
		description: 'Powerful, medium cost, heavy tasks.',
		contextWindow: 1000000,
		reasoningVersion: 'dynamic'
	},
	'gemini-2.5-flash': {
		popupTitle: 'Gemini 2.5 Flash (dynamic)',
		description: 'Fast, low cost, simple tasks.',
		contextWindow: 1000000,
		reasoningVersion: 'dynamic'
	},
	// Gemini 3 Pro variants
	'gemini-3-pro-preview-high': {
		popupTitle: 'Gemini 3 Pro (Thinking)',
		description: "Google's latest flagship model, great for daily use.",
		contextWindow: 1000000,
		reasoningVersion: 'high reasoning'
	},
	'gemini-3-pro-preview-low': {
		popupTitle: 'Gemini 3 Pro (Thinking)',
		description: "Google's latest flagship model, great for daily use.",
		contextWindow: 1000000,
		reasoningVersion: 'low reasoning'
	},
	// Gemini 3 Flash variants
	'gemini-3-flash-preview-high': {
		popupTitle: 'Gemini 3 Flash (Thinking)',
		description: "Google's latest flagship model, great for daily use.",
		contextWindow: 1000000,
		reasoningVersion: 'high reasoning'
	},
	'gemini-3-flash-preview-medium': {
		popupTitle: 'Gemini 3 Flash (Thinking)',
		description: "Google's latest flagship model, great for daily use.",
		contextWindow: 1000000,
		reasoningVersion: 'medium reasoning'
	},
	'gemini-3-flash-preview-low': {
		popupTitle: 'Gemini 3 Flash (Thinking)',
		description: "Google's latest flagship model, great for daily use.",
		contextWindow: 1000000,
		reasoningVersion: 'low reasoning'
	},
	// OpenAI GPT 5.2 variants
	'openai/gpt-5.2-xhigh': {
		popupTitle: 'GPT 5.2',
		description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'extra high reasoning'
	},
	'openai/gpt-5.2-high': {
		popupTitle: 'GPT 5.2',
		description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'high reasoning'
	},
	'openai/gpt-5.2-medium': {
		popupTitle: 'GPT 5.2',
		description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'medium reasoning'
	},
	'openai/gpt-5.2-low': {
		popupTitle: 'GPT 5.2',
		description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'low reasoning'
	},
	// OpenAI GPT 5.1 variants
	'openai/gpt-5.1-high': {
		popupTitle: 'GPT 5.1',
		description: "OpenAI's flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'high reasoning'
	},
	'openai/gpt-5.1-medium': {
		popupTitle: 'GPT 5.1',
		description: "OpenAI's flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'medium reasoning'
	},
	'openai/gpt-5.1-low': {
		popupTitle: 'GPT 5.1',
		description: "OpenAI's flagship model. Good for planning, debugging, coding and more.",
		contextWindow: 272000,
		reasoningVersion: 'low reasoning'
	},
	// Anthropic Opus 4.5 variants
	'anthropic/claude-opus-4.5-high': {
		popupTitle: 'Opus 4.5 (Thinking)',
		description: "Anthropics smartest model, great for difficult tasks",
		contextWindow: 200000,
		reasoningVersion: 'high effort'
	},
	'anthropic/claude-opus-4.5-medium': {
		popupTitle: 'Opus 4.5 (Thinking)',
		description: "Anthropics smartest model, great for difficult tasks",
		contextWindow: 200000,
		reasoningVersion: 'medium effort'
	},
	// Anthropic Sonnet 4.5 variants
	'anthropic/claude-sonnet-4.5-high': {
		popupTitle: 'Sonnet 4.5 (Thinking)',
		description: "Anthropics latest model, great for daily use",
		contextWindow: 200000,
		reasoningVersion: 'high effort'
	},
	'anthropic/claude-sonnet-4.5-medium': {
		popupTitle: 'Sonnet 4.5 (Thinking)',
		description: "Anthropics latest model, great for daily use",
		contextWindow: 200000,
		reasoningVersion: 'medium effort'
	},
	// Anthropic Haiku 4.5 (no reasoning variants)
	'anthropic/claude-haiku-4.5': {
		popupTitle: 'Haiku 4.5',
		description: "Anthropics lightest model, cheaper and faster",
		contextWindow: 200000
		// No reasoning version for Haiku
	},
};

// Extract reasoning version from model ID or label
function getReasoningVersion(model: VybeModel): string | undefined {
	const id = model.id.toLowerCase();
	const label = model.label.toLowerCase();

	// Check for reasoning level suffix in model ID (e.g., "-xhigh", "-high", "-medium", "-low")
	// Priority: xhigh > high > medium > low
	if (id.endsWith('-xhigh') || label.includes('xhigh') || label.includes('extra high')) {
		return 'extra high reasoning';
	}
	if (id.endsWith('-high') || (id.includes('-high') && !id.endsWith('-xhigh'))) {
		// Check if it's "high effort" for Anthropic
		if (id.includes('anthropic') || model.provider === 'anthropic') {
			return 'high effort';
		}
		return 'high reasoning';
	}
	if (id.endsWith('-medium')) {
		// Check if it's "medium effort" for Anthropic
		if (id.includes('anthropic') || model.provider === 'anthropic') {
			return 'medium effort';
		}
		return 'medium reasoning';
	}
	if (id.endsWith('-low')) {
		// Check if it's "low effort" for Anthropic
		if (id.includes('anthropic') || model.provider === 'anthropic') {
			return 'low effort';
		}
		return 'low reasoning';
	}

	// Fallback: check for reasoning level in label (for backward compatibility)
	if (label.includes('xhigh') || label.includes('extra high')) {
		return 'extra high reasoning';
	}
	if (label.includes('high')) {
		if (id.includes('anthropic') || model.provider === 'anthropic') {
			return 'high effort';
		}
		return 'high reasoning';
	}
	if (label.includes('medium')) {
		if (id.includes('anthropic') || model.provider === 'anthropic') {
			return 'medium effort';
		}
		return 'medium reasoning';
	}
	if (label.includes('low')) {
		if (id.includes('anthropic') || model.provider === 'anthropic') {
			return 'low effort';
		}
		return 'low reasoning';
	}

	// Check for dynamic reasoning (Gemini 2.5)
	if (id.includes('2.5-pro') || id.includes('2.5-flash')) {
		return 'dynamic';
	}

	// Default to medium if model has thinking but no explicit level
	if (model.hasThinking) {
		if (model.provider === 'anthropic') {
			return 'medium effort';
		}
		return 'medium reasoning';
	}

	return undefined;
}

function formatContextWindow(tokens: number): string {
	if (tokens >= 1000000) {
		return `${(tokens / 1000000).toFixed(1)}M`;
	} else if (tokens >= 1000) {
		return `${(tokens / 1000).toFixed(0)}k`;
	}
	return `${tokens}`;
}

export class ModelHoverPopup extends Disposable {
	private popupElement: HTMLElement | null = null;
	private hideTimeout: number | null = null;
	private showTimeout: number | null = null;
	private parentContainer: HTMLElement | null = null;

	constructor(parentContainer?: HTMLElement) {
		super();
		this.parentContainer = parentContainer || null;
	}

	private isDarkTheme(): boolean {
		const workbench = document.querySelector('.monaco-workbench');
		if (workbench) {
			return workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black');
		}
		return document.body.classList.contains('vs-dark') || document.body.classList.contains('hc-black');
	}

	public show(model: VybeModel, anchorElement: HTMLElement): void {
		// Clear any pending hide
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		// Delay showing to avoid flicker
		if (this.showTimeout) {
			clearTimeout(this.showTimeout);
		}

		this.showTimeout = window.setTimeout(() => {
			this.showTimeout = null;
			this.renderPopup(model, anchorElement);
		}, 300); // 300ms delay before showing
	}

	public hide(): void {
		// Clear any pending show
		if (this.showTimeout) {
			clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}

		// Delay hiding slightly to allow moving between items
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
		}

		this.hideTimeout = window.setTimeout(() => {
			this.hideTimeout = null;
			if (this.popupElement) {
				this.popupElement.remove();
				this.popupElement = null;
			}
		}, 100);
	}

	private renderPopup(model: VybeModel, anchorElement: HTMLElement): void {
		// Remove existing popup
		if (this.popupElement) {
			this.popupElement.remove();
		}

		const isDark = this.isDarkTheme();
		// Match dropdown styling exactly
		const bgColor = isDark ? '#212427' : '#eceff2';
		const borderColor = isDark ? '#383838' : '#d9d9d9';
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';

		// Get model info (fallback to defaults if not found)
		const modelInfo = MODEL_INFO[model.id] || {
			popupTitle: model.label,
			description: model.description || '',
			contextWindow: 128000, // Default
			reasoningVersion: undefined
		};

		// Get reasoning version (from model info or extract from model)
		const reasoningVersion = modelInfo.reasoningVersion !== undefined
			? modelInfo.reasoningVersion
			: getReasoningVersion(model);

		// Create popup container - match dropdown styling
		this.popupElement = $('.model-hover-popup');
		// Always use fixed positioning for consistent behavior
		this.popupElement.style.cssText = `
			position: fixed;
			z-index: 2549;
			box-sizing: border-box;
			border-radius: 6px;
			background-color: ${bgColor};
			border: 1px solid ${borderColor};
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			display: flex;
			flex-direction: column;
			gap: 0px;
			padding: 0px;
			width: 200px;
			min-width: 200px;
			color: ${textColor};
			box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.12);
		`;

		// Inner container - match dropdown inner container
		const innerContainer = append(this.popupElement, $('.model-hover-popup-inner'));
		innerContainer.style.cssText = `
			box-sizing: border-box;
			border-radius: 6px;
			background-color: ${bgColor};
			border: none;
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
			color: ${textColor};
		`;

		// Title (model name)
		const title = append(innerContainer, $('.model-hover-title'));
		title.textContent = modelInfo.popupTitle;
		title.style.cssText = `
			font-size: 12px;
			line-height: 15px;
			color: ${textColor};
			padding: 3px 6px;
			font-weight: 500;
		`;

		// Description (reduced gap from title by 4px - from 2px to -2px margin)
		if (modelInfo.description) {
			const description = append(innerContainer, $('.model-hover-description'));
			description.textContent = modelInfo.description;
			description.style.cssText = `
				font-size: 12px;
				line-height: 15px;
				color: ${textColor};
				padding: 0px 6px;
				opacity: 0.8;
				margin-top: -2px;
			`;
		}

		// Spacer for one line gap before context/version
		const spacer = append(innerContainer, $('.model-hover-spacer'));
		spacer.style.cssText = `
			height: 12px;
			flex-shrink: 0;
		`;

		// Context window
		const contextRow = append(innerContainer, $('.model-hover-context'));
		contextRow.style.cssText = `
			font-size: 12px;
			line-height: 15px;
			color: ${textColor};
			padding: 0px 6px;
			opacity: 0.7;
		`;
		contextRow.textContent = `${formatContextWindow(modelInfo.contextWindow)} context window`;

		// Reasoning version (if available)
		if (reasoningVersion) {
			// Spacer for one line gap between context and version (only if version exists)
			const contextVersionSpacer = append(innerContainer, $('.model-hover-context-version-spacer'));
			contextVersionSpacer.style.cssText = `
				height: 12px;
				flex-shrink: 0;
			`;

			const reasoningRow = append(innerContainer, $('.model-hover-reasoning'));
			reasoningRow.style.cssText = `
				font-size: 12px;
				line-height: 15px;
				color: ${textColor};
				padding: 0px 6px;
				opacity: 0.7;
			`;
			reasoningRow.textContent = `Version: ${reasoningVersion}`;
		}

		// Always append to document body for fixed positioning
		document.body.appendChild(this.popupElement);

		const anchorRect = anchorElement.getBoundingClientRect();
		const popupRect = this.popupElement.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let left: number;
		let top: number;

		if (this.parentContainer) {
			// For settings tab: position below the model name text, aligned to left edge
			left = anchorRect.left;
			top = anchorRect.bottom + 6;

			// Adjust if would overflow to the right
			if (left + popupRect.width > viewportWidth - 8) {
				left = viewportWidth - popupRect.width - 8;
			}

			// Adjust if would overflow bottom, position above instead
			if (top + popupRect.height > viewportHeight - 8) {
				top = anchorRect.top - popupRect.height - 6;
			}

			// Ensure top doesn't go negative
			if (top < 8) {
				top = 8;
			}

			// Ensure left doesn't go negative
			if (left < 8) {
				left = 8;
			}
		} else {
			// Position relative to viewport (for dropdown)
			// Position to the right with some spacing
			left = anchorRect.right + 12;
			// Center vertically with model item
			top = anchorRect.top + (anchorRect.height / 2) - (popupRect.height / 2);

			// Adjust if popup would go off-screen to the right
			if (left + popupRect.width > viewportWidth) {
				// Position to the left instead
				left = anchorRect.left - popupRect.width - 12;
			}

			// Adjust if popup would go off-screen vertically
			if (top + popupRect.height > viewportHeight) {
				top = viewportHeight - popupRect.height - 8;
			}
			if (top < 8) {
				top = 8;
			}
		}

		this.popupElement.style.left = `${left}px`;
		this.popupElement.style.top = `${top}px`;
	}

	public override dispose(): void {
		if (this.showTimeout) {
			clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		this.hide();
		super.dispose();
	}
}
