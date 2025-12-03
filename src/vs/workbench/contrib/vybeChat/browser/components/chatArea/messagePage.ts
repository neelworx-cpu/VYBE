/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MessageComposer, AgentMode, ModelDropdownState } from '../composer/messageComposer.js';
import { ContextDropdown } from '../composer/contextDropdown.js';
import { UsageDropdown } from '../composer/usageDropdown.js';
import { ISpeechService } from '../../../../../contrib/speech/common/speechService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IVybeChatContentPart, IVybeChatContentData } from '../../contentParts/vybeChatContentPart.js';
import { VybeChatMarkdownPart } from '../../contentParts/vybeChatMarkdownPart.js';
import { VybeChatThinkingPart } from '../../contentParts/vybeChatThinkingPart.js';
import { VybeChatCodeBlockPart } from '../../contentParts/vybeChatCodeBlockPart.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';

export interface ContextPillData {
	id: string;
	type: 'file' | 'terminal' | 'doc';
	name: string;
	path?: string;
	iconClasses?: string[];
}

export interface ImageAttachmentData {
	id: string;
	url: string;
	file?: File;
}

export interface MessagePageOptions {
	messageId: string;
	messageIndex: number;
	content: string;
	contextPills?: ContextPillData[];
	images?: ImageAttachmentData[];
	agentMode?: AgentMode;
	modelState?: ModelDropdownState;
	isPlanMode?: boolean;
	isStreaming?: boolean;
	onStop?: () => void;
	onComposerSend?: (content: string, pills: ContextPillData[], images: ImageAttachmentData[], agentMode: AgentMode, modelState: ModelDropdownState) => void;
	speechService?: ISpeechService;
	instantiationService?: IInstantiationService;
}

/**
 * MessagePage - Each message+response is a full viewport height "page"
 * The sticky header contains a composer that toggles between readonly (collapsed) and editable (expanded) modes
 */
export class MessagePage extends Disposable {
	private pageElement: HTMLElement;
	private messageHeader!: HTMLElement;
	private composer!: MessageComposer;
	private contextDropdown: ContextDropdown | null = null;
	private usageDropdown: UsageDropdown | null = null;
	private aiResponseArea!: HTMLElement;
	private options: MessagePageOptions;
	private isEditMode: boolean = false;

	// Content parts for AI response
	private contentParts: IVybeChatContentPart[] = [];
	private markdownRendererService: IMarkdownRendererService | undefined;
	private instantiationService: IInstantiationService | undefined;
	private modelService: IModelService | undefined;
	private languageService: ILanguageService | undefined;
	private clipboardService: IClipboardService | undefined;
	private codeBlockIndex: number = 0;

	private _onStop = this._register(new Emitter<void>());
	public readonly onStop = this._onStop.event;

	constructor(
		parent: HTMLElement,
		options: MessagePageOptions,
		markdownRendererService?: IMarkdownRendererService,
		modelService?: IModelService,
		languageService?: ILanguageService,
		instantiationService?: IInstantiationService,
		clipboardService?: IClipboardService
	) {
		super();
		this.options = options;
		this.markdownRendererService = markdownRendererService;
		this.modelService = modelService;
		this.languageService = languageService;
		this.instantiationService = instantiationService;
		this.clipboardService = clipboardService;
		this.pageElement = this.createPage(options);
		parent.appendChild(this.pageElement);
	}

	private createPage(options: MessagePageOptions): HTMLElement {
		// Page container - takes full viewport height
		const page = $('div');
		page.className = 'vybe-chat-message-page';
		page.setAttribute('data-message-id', options.messageId);
		page.setAttribute('data-message-index', options.messageIndex.toString());
		page.style.cssText = `
			min-height: 100%;
			height: auto;
			display: flex;
			flex-direction: column;
			position: relative;
		`;

		// Message header (sticky within this page)
		// Scrollbar is hidden, so use 10px margin on all sides for consistency
		this.messageHeader = $('div');
		this.messageHeader.className = 'vybe-chat-message-header';
		this.messageHeader.style.cssText = `
			position: sticky;
			top: 0;
			z-index: 101;
			padding: 0px;
			margin: 0px 10px 8px 10px;
			overflow-x: hidden;
			background-color: var(--vscode-sideBar-background);
			flex-shrink: 0;
		`;

		// Create composer in readonly mode (collapsed state)
		this.composer = this._register(new MessageComposer(
			this.messageHeader,
			options.speechService,
			true, // Open dropdowns downward
			true  // Start in readonly mode
		));

		// Remove composer's default margin (we have margin on messageHeader)
		const composerOuter = this.messageHeader.querySelector('.vybe-ai-composer-outer') as HTMLElement;
		if (composerOuter) {
			composerOuter.style.margin = '0';
		}

		// Set initial content and state
		this.composer.setInputText(options.content);

		// Restore context pills
		if (options.contextPills && options.contextPills.length > 0) {
			this.composer.restoreContextPills(options.contextPills);
		}

		// Restore images
		if (options.images && options.images.length > 0) {
			this.composer.restoreImages(options.images);
		}

		// Set readonly mode with click handler to switch to edit mode
		this.composer.setReadonly(true, () => {
			this.switchToEditMode();
		});

		// If streaming, switch to stop button
		if (options.isStreaming) {
			this.composer.switchToStopButton();
		}

		// Wire up composer events
		this._register(this.composer.onSend((content) => {
			// Capture full composer state BEFORE composer clears input
			const pills = this.composer.getContextPillsData();
			const images = this.composer.getImagesData();
			const agentMode = this.composer.getAgentMode();
			const modelState = this.composer.getModelState();

			// Update stored content
			this.options.content = content;
			this.options.contextPills = pills;
			this.options.images = images;
			this.options.agentMode = agentMode;
			this.options.modelState = modelState;

			// Restore content immediately (composer cleared it after firing onSend)
			// Use requestAnimationFrame to ensure clearInput has completed
			requestAnimationFrame(() => {
				// Restore the content to the composer
				if (this.options.content) {
					this.composer.setInputText(this.options.content);
				}
				// Restore pills and images if any
				if (this.options.contextPills && this.options.contextPills.length > 0) {
					this.composer.restoreContextPills(this.options.contextPills);
				}
				if (this.options.images && this.options.images.length > 0) {
					this.composer.restoreImages(this.options.images);
				}
				// Switch back to readonly mode
				this.switchToReadonlyMode();
			});

			// Fire send event with full state
			if (this.options.onComposerSend) {
				this.options.onComposerSend(content, pills, images, agentMode, modelState);
			}
		}));

		this._register(this.composer.onStop(() => {
			this._onStop.fire();
			if (this.options.onStop) {
				this.options.onStop();
			}
		}));

		// Wire up context dropdown
		this._register(this.composer.onContextClick(() => {
			const contextButton = this.composer.getContextButton();
			if (contextButton && this.options.instantiationService) {
				if (!this.contextDropdown) {
					this.contextDropdown = this._register(this.options.instantiationService.createInstance(
						ContextDropdown,
						contextButton
					));

					// Set up pill insert callback
					this.contextDropdown.setPillInsertCallback((type, name, path, iconClasses) => {
						this.composer.insertContextPill(type, name, path, iconClasses);
					});
				}
				this.contextDropdown.show(true); // Open downward
			}
		}));

		// Wire up usage dropdown
		this._register(this.composer.onUsageClick(() => {
			const progressContainer = this.composer.getProgressContainer();
			if (progressContainer && this.options.instantiationService) {
				if (!this.usageDropdown) {
					this.usageDropdown = this._register(this.options.instantiationService.createInstance(
						UsageDropdown,
						progressContainer
					));
				}
				const modelState = this.composer.getModelState();
				this.usageDropdown.show(modelState, true); // Open downward
			}
		}));

		page.appendChild(this.messageHeader);

		// AI response area (scrollable within page, initially empty)
		this.aiResponseArea = $('div');
		this.aiResponseArea.className = 'vybe-chat-response-area';
		this.aiResponseArea.setAttribute('data-response-for', options.messageId);
		this.aiResponseArea.style.cssText = `
			flex: 1;
			overflow: auto;
			padding: 0 10px 16px 18px;
			box-sizing: border-box;
		`;
		page.appendChild(this.aiResponseArea);

		return page;
	}

	private switchToEditMode(): void {
		if (this.isEditMode) {
			return;
		}

		this.isEditMode = true;

		// Switch composer to edit mode
		this.composer.setReadonly(false);

		// Click outside to switch back to readonly
		setTimeout(() => {
			const clickOutsideHandler = (e: MouseEvent) => {
				const target = e.target as HTMLElement;

				// Don't collapse if clicking on dropdowns, modals, etc.
				const isClickOnDropdown = target.closest('.agent-mode-dropdown, .model-dropdown, .context-dropdown, .usage-dropdown, .vybe-overflow-dropdown, .image-modal');
				const isClickOnModal = target.closest('.monaco-dialog, .context-view, .quick-input-widget');

				if (!this.messageHeader.contains(target) && !isClickOnDropdown && !isClickOnModal) {
					this.switchToReadonlyMode();
				}
			};
			this._register(addDisposableListener(document, 'click', clickOutsideHandler));
		}, 100);
	}

	private switchToReadonlyMode(): void {
		if (!this.isEditMode) {
			return;
		}

		this.isEditMode = false;

		// Switch composer back to readonly mode
		// Content should already be restored before calling this method
		this.composer.setReadonly(true, () => {
			this.switchToEditMode();
		});
	}

	public getElement(): HTMLElement {
		return this.pageElement;
	}

	public getResponseArea(): HTMLElement {
		return this.aiResponseArea;
	}

	public updateContent(content: string, pills: ContextPillData[], images: ImageAttachmentData[], agentMode: AgentMode, modelState: ModelDropdownState): void {
		// Update stored options
		this.options.content = content;
		this.options.contextPills = pills;
		this.options.images = images;
		this.options.agentMode = agentMode;
		this.options.modelState = modelState;

		// Update the composer's content
		if (this.composer) {
			this.composer.setInputText(content);
			this.composer.restoreContextPills(pills);
			this.composer.restoreImages(images);
			// Agent mode and model state are already set when the composer was created
		}
	}

	public setStreaming(isStreaming: boolean): void {
		this.options.isStreaming = isStreaming;

		// Update composer button state
		if (isStreaming) {
			this.composer.switchToStopButton();
		} else {
			this.composer.switchToSendButton();
		}
	}

	/**
	 * Render content parts in the AI response area.
	 * This is where thinking, markdown, code blocks, etc. will appear.
	 */
	public renderContentParts(contentParts: IVybeChatContentData[]): void {
		if (!this.aiResponseArea || !this.markdownRendererService) {
			return;
		}

		// Clear existing parts
		this.disposeContentParts();

		// Render each content part
		for (const contentData of contentParts) {
			const part = this.createContentPart(contentData);
			if (part) {
				this.contentParts.push(part);
				this.aiResponseArea.appendChild(part.domNode);
			}
		}
	}

	/**
	 * Create a content part based on its type.
	 */
	private createContentPart(contentData: IVybeChatContentData): IVybeChatContentPart | null {
		if (!this.markdownRendererService) {
			return null;
		}

		switch (contentData.kind) {
			case 'thinking':
				return this._register(new VybeChatThinkingPart(contentData));

			case 'markdown':
				if (!this.instantiationService) {
					return null;
				}
				return this._register(new VybeChatMarkdownPart(contentData, this.markdownRendererService, this.instantiationService));

			case 'codeBlock':
				if (!this.instantiationService || !this.modelService || !this.languageService || !this.clipboardService) {
					return null;
				}
				return this._register(new VybeChatCodeBlockPart(
					contentData,
					this.codeBlockIndex++,
					this.instantiationService,
					this.modelService,
					this.languageService,
					this.clipboardService
				));

			// TODO: Add more content types (errors, progress, etc.)

			default:
				return null;
		}
	}

	/**
	 * Update existing content parts with streaming data.
	 */
	public updateContentParts(contentParts: IVybeChatContentData[]): void {
		// For now, just re-render everything
		// TODO: Optimize to update only changed parts (like Copilot does with diff)
		this.renderContentParts(contentParts);
	}

	/**
	 * Dispose all content parts.
	 */
	private disposeContentParts(): void {
		for (const part of this.contentParts) {
			part.dispose();
		}
		this.contentParts = [];

		// Clear response area
		if (this.aiResponseArea) {
			while (this.aiResponseArea.firstChild) {
				this.aiResponseArea.removeChild(this.aiResponseArea.firstChild);
			}
		}
	}

	public override dispose(): void {
		this.disposeContentParts();
		if (this.pageElement && this.pageElement.parentNode) {
			this.pageElement.parentNode.removeChild(this.pageElement);
		}
		super.dispose();
	}
}
