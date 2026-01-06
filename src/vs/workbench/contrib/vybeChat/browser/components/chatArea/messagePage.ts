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
import { VybeChatTextEditPart } from '../../contentParts/vybeChatTextEditPart.js';
import { VybeChatTerminalPart } from '../../contentParts/vybeChatTerminalPart.js';
import { VybeChatReadingFilesPart, IVybeChatReadingFilesContent } from '../../contentParts/vybeChatReadingFilesPart.js';
import { VybeChatSearchedPart, IVybeChatSearchedContent } from '../../contentParts/vybeChatSearchedPart.js';
import { VybeChatExploredPart, IVybeChatExploredContent, ExploredAction } from '../../contentParts/vybeChatExploredPart.js';
import { VybeChatPlanDocumentPart } from '../../contentParts/vybeChatPlanDocumentPart.js';
import type { IVybeChatPlanDocumentContent, IVybeChatListedContent, IVybeChatDirectoryContent, IVybeChatMarkdownContent, IVybeChatCodeBlockContent, IVybeChatThinkingContent, VybeChatContentPartKind } from '../../contentParts/vybeChatContentPart.js';
import type { ContentBlock } from '../../../common/streaming_event_types.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';

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
	onContentUpdate?: () => void; // Callback when content changes (for smart scrolling)
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
	private contentPartsData: IVybeChatContentData[] = []; // Track original data for grouping

	// NEW: Block-based content model (Production architecture)
	private blocks: Map<string, ContentBlock> = new Map(); // Track blocks by ID
	private blockToPartMap: Map<string, IVybeChatContentPart> = new Map(); // Map block ID to content part

	private markdownRendererService: IMarkdownRendererService | undefined;
	private instantiationService: IInstantiationService | undefined;
	private modelService: IModelService | undefined;
	private languageService: ILanguageService | undefined;
	private clipboardService: IClipboardService | undefined;
	private editorService: IEditorService | undefined;
	private fileService: IFileService | undefined;
	private notificationService: INotificationService | undefined;
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
		clipboardService?: IClipboardService,
		editorService?: IEditorService,
		fileService?: IFileService,
		notificationService?: INotificationService
	) {
		super();
		this.options = options;
		this.markdownRendererService = markdownRendererService;
		this.modelService = modelService;
		this.languageService = languageService;
		this.instantiationService = instantiationService;
		this.clipboardService = clipboardService;
		this.editorService = editorService;
		this.fileService = fileService;
		this.notificationService = notificationService;
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
			padding: 0 18px 16px 18px;
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
	 * Check if a content part is a research action (read, search, listed, directory).
	 */
	private isResearchAction(contentData: IVybeChatContentData): boolean {
		return contentData.kind === 'readingFiles' ||
			contentData.kind === 'searched' ||
			contentData.kind === 'listed' ||
			contentData.kind === 'directory';
	}

	/**
	 * Group consecutive research actions (3+) into an Explored block.
	 * @deprecated Not currently used - kept for potential future use
	 */
	// @ts-expect-error - Deprecated method kept for potential future use
	private _groupResearchActions(_contentParts: IVybeChatContentData[]): IVybeChatContentData[] {
		const grouped: IVybeChatContentData[] = [];
		let researchGroup: IVybeChatContentData[] = [];

		for (let i = 0; i < _contentParts.length; i++) {
			const current = _contentParts[i];

			if (this.isResearchAction(current)) {
				// Add to research group
				researchGroup.push(current);
			} else {
				// Non-research action - process any pending research group first
				if (researchGroup.length > 0) {
					if (researchGroup.length >= 3) {
						// Group into Explored block
						const exploredActions: ExploredAction[] = researchGroup.map(action => {
							if (action.kind === 'readingFiles') {
								return {
									type: 'read' as const,
									data: action as IVybeChatReadingFilesContent
								};
							} else if (action.kind === 'searched') {
								return {
									type: 'searched' as const,
									data: action as IVybeChatSearchedContent
								};
							} else if (action.kind === 'listed') {
								return {
									type: 'listed' as const,
									data: action as IVybeChatListedContent
								};
							} else if (action.kind === 'directory') {
								return {
									type: 'directory' as const,
									data: action as IVybeChatDirectoryContent
								};
							}
							return null;
						}).filter((a): a is NonNullable<typeof a> => a !== null) as ExploredAction[];

						grouped.push({
							kind: 'explored',
							actions: exploredActions,
							isStreaming: false
						});
					} else {
						// Keep as individual items (1 or 2 actions)
						grouped.push(...researchGroup);
					}
					researchGroup = [];
				}
				// Add non-research action
				grouped.push(current);
			}
		}

		// Process any remaining research group at the end
		if (researchGroup.length > 0) {
			if (researchGroup.length >= 3) {
				// Group into Explored block
				const exploredActions: ExploredAction[] = researchGroup.map(action => {
					if (action.kind === 'readingFiles') {
						return {
							type: 'read' as const,
							data: action as IVybeChatReadingFilesContent
						};
					} else if (action.kind === 'searched') {
						return {
							type: 'searched' as const,
							data: action as IVybeChatSearchedContent
						};
					} else if (action.kind === 'listed') {
						return {
							type: 'listed' as const,
							data: action as IVybeChatListedContent
						};
					} else if (action.kind === 'directory') {
						return {
							type: 'directory' as const,
							data: action as IVybeChatDirectoryContent
						};
					}
					return null;
				}).filter((a): a is NonNullable<typeof a> => a !== null) as ExploredAction[];

				grouped.push({
					kind: 'explored',
					actions: exploredActions,
					isStreaming: false
				});
			} else {
				// Keep as individual items (1 or 2 actions)
				grouped.push(...researchGroup);
			}
		}

		return grouped;
	}

	/**
	 * Add a single content part (for streaming updates).
	 * Items appear individually, then group into Explored when 3+ research actions complete.
	 * Returns the created part for further updates.
	 */
	public addContentPart(contentData: IVybeChatContentData): IVybeChatContentPart | null {
		if (!this.aiResponseArea || !this.markdownRendererService) {
			return null;
		}

		// Check if part already exists (for streaming updates)
		const existingIndex = this.contentPartsData.findIndex(d => {
			// For thinking/markdown/codeBlock, only one of each kind should exist during streaming
			if (d.kind === contentData.kind && (d.kind === 'thinking' || d.kind === 'markdown' || d.kind === 'codeBlock')) {
				return true;
			}
			return false;
		});

		if (existingIndex >= 0) {
			// Update existing part
			const existingPart = this.contentParts[existingIndex];
			if (existingPart && existingPart.updateContent) {
				existingPart.updateContent(contentData);
				this.contentPartsData[existingIndex] = contentData;
				return existingPart;
			}
		}

		// Add to data tracking
		this.contentPartsData.push(contentData);

		// Render individually (don't group yet if streaming)
		const part = this.createContentPart(contentData);
		if (part) {
			this.contentParts.push(part);
			this.aiResponseArea.appendChild(part.domNode);

			// If this is a research action that just completed, check for grouping
			// Use setTimeout to ensure DOM updates are complete
			if (this.isResearchAction(contentData) && !(contentData as any).isStreaming) {
				setTimeout(() => {
					this.checkAndGroupResearchActions();
				}, 0);
			}

			return part;
		}

		console.warn('[MessagePage] Failed to create content part:', contentData.kind);
		return null;
	}

	/**
	 * Check if we have 3+ consecutive completed research actions and group them.
	 * Only groups when ALL items in a consecutive sequence are complete.
	 */
	private checkAndGroupResearchActions(): void {
		if (!this.aiResponseArea) {
			return;
		}

		// Find consecutive research actions where ALL are completed (3+)
		const groups: Array<{ start: number; end: number; actions: IVybeChatContentData[] }> = [];
		let currentGroup: { start: number; actions: IVybeChatContentData[] } | null = null;

		for (let i = 0; i < this.contentPartsData.length; i++) {
			const data = this.contentPartsData[i];
			const isResearch = this.isResearchAction(data);
			const isCompleted = !(data as any).isStreaming;

			if (isResearch) {
				if (isCompleted) {
					// Completed research action - add to group
					if (!currentGroup) {
						currentGroup = { start: i, actions: [data] };
					} else {
						currentGroup.actions.push(data);
					}
				} else {
					// Research action still streaming - break group (don't group incomplete sequences)
					if (currentGroup) {
						currentGroup = null;
					}
				}
			} else {
				// Non-research action - finalize group if it has 3+ completed actions
				if (currentGroup && currentGroup.actions.length >= 3) {
					groups.push({ start: currentGroup.start, end: i - 1, actions: currentGroup.actions });
				}
				currentGroup = null;
			}
		}

		// Check final group (only if all are completed)
		if (currentGroup && currentGroup.actions.length >= 3) {
			// Verify all actions in group are completed
			const allCompleted = currentGroup.actions.every(action => !(action as any).isStreaming);
			if (allCompleted) {
				groups.push({ start: currentGroup.start, end: this.contentPartsData.length - 1, actions: currentGroup.actions });
			}
		}

		// Process groups from end to start (to preserve indices)
		for (let g = groups.length - 1; g >= 0; g--) {
			const group = groups[g];

			// Check if these parts are still individual (not already grouped)
			const firstPart = this.contentParts[group.start];
			if (firstPart && firstPart.kind === 'explored') {
				continue; // Already grouped
			}

			// Remove individual parts from DOM and tracking
			for (let i = group.start; i <= group.end; i++) {
				const part = this.contentParts[i];
				if (part) {
					part.domNode.remove();
					part.dispose();
				}
			}

			// Create Explored block
			const exploredActions: ExploredAction[] = group.actions.map(action => {
				if (action.kind === 'readingFiles') {
					return {
						type: 'read' as const,
						data: action as IVybeChatReadingFilesContent
					};
				} else if (action.kind === 'searched') {
					return {
						type: 'searched' as const,
						data: action as IVybeChatSearchedContent
					};
				} else if (action.kind === 'listed') {
					return {
						type: 'listed' as const,
						data: action as IVybeChatListedContent
					};
				} else if (action.kind === 'directory') {
					return {
						type: 'directory' as const,
						data: action as IVybeChatDirectoryContent
					};
				}
				return null;
			}).filter((a): a is NonNullable<typeof a> => a !== null) as ExploredAction[];

			const exploredData: IVybeChatExploredContent = {
				kind: 'explored',
				actions: exploredActions,
				isStreaming: false
			};

			const exploredPart = this.createContentPart(exploredData);
			if (exploredPart) {
				// Replace the range with single Explored part
				this.contentParts.splice(group.start, group.end - group.start + 1, exploredPart);
				this.contentPartsData.splice(group.start, group.end - group.start + 1, exploredData);

				// Insert into DOM at the position of the first removed part
				const insertBefore = group.start < this.contentParts.length - 1
					? this.contentParts[group.start + 1].domNode
					: null;
				if (insertBefore) {
					this.aiResponseArea.insertBefore(exploredPart.domNode, insertBefore);
				} else {
					this.aiResponseArea.appendChild(exploredPart.domNode);
				}
			}
		}
	}

	/**
	 * Render content parts in the AI response area.
	 * This is where thinking, markdown, code blocks, etc. will appear.
	 * For streaming, use addContentPart() instead.
	 */
	public renderContentParts(contentParts: IVybeChatContentData[]): void {
		if (!this.aiResponseArea || !this.markdownRendererService) {
			return;
		}

		// Clear existing parts
		this.disposeContentParts();
		this.contentPartsData = [];

		// Add each part individually (they'll group automatically when complete)
		for (const contentData of contentParts) {
			this.addContentPart(contentData);
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
			case 'thinking': {
				const thinkingPart = this._register(new VybeChatThinkingPart(
					contentData,
					this.markdownRendererService,
					this.instantiationService
				));

				// Wire up streaming callback for smart scrolling
				if (thinkingPart && this.options.onContentUpdate) {
					thinkingPart.setStreamingUpdateCallback(this.options.onContentUpdate);
				}

				return thinkingPart;
			}

			case 'markdown': {
				if (!this.instantiationService) {
					return null;
				}
				const markdownPart = this._register(new VybeChatMarkdownPart(contentData, this.markdownRendererService, this.instantiationService));

				// Wire up streaming callback for smart scrolling
				if (markdownPart && this.options.onContentUpdate) {
					markdownPart.setStreamingUpdateCallback(this.options.onContentUpdate);
				}

				return markdownPart;
			}

			case 'codeBlock': {
				if (!this.instantiationService || !this.modelService || !this.languageService || !this.clipboardService) {
					return null;
				}
				const codeBlockPart = this._register(new VybeChatCodeBlockPart(
					contentData,
					this.codeBlockIndex++,
					this.instantiationService,
					this.modelService,
					this.languageService,
					this.clipboardService
				));

				// Wire up streaming callback for smart scrolling
				if (codeBlockPart && this.options.onContentUpdate) {
					codeBlockPart.setStreamingUpdateCallback(this.options.onContentUpdate);
				}

				return codeBlockPart;
			}

		case 'textEdit': {
			if (!this.instantiationService) {
				return null;
			}
			const textEditPart = this._register(this.instantiationService.createInstance(
				VybeChatTextEditPart,
				contentData
			));

			// Wire up streaming callback for smart scrolling
			if (textEditPart && this.options.onContentUpdate) {
				textEditPart.setStreamingUpdateCallback(this.options.onContentUpdate);
			}

			return textEditPart;
		}

		case 'terminal': {
			if (!this.instantiationService) {
				return null;
			}
			const terminalPart = this._register(this.instantiationService.createInstance(
				VybeChatTerminalPart,
				contentData
			));

			// Wire up streaming callback for smart scrolling
			if (terminalPart && this.options.onContentUpdate) {
				terminalPart.setStreamingUpdateCallback(this.options.onContentUpdate);
			}

			return terminalPart;
		}

		case 'readingFiles': {
			const readingPart = this._register(new VybeChatReadingFilesPart(contentData as IVybeChatReadingFilesContent, this.editorService, this.fileService, this.notificationService));
			return readingPart;
		}

		case 'searched': {
			const searchedPart = this._register(new VybeChatSearchedPart(contentData as IVybeChatSearchedContent, this.editorService, this.fileService, this.notificationService));
			return searchedPart;
		}

		case 'explored': {
			const exploredPart = this._register(new VybeChatExploredPart(contentData as IVybeChatExploredContent, this.editorService, this.fileService, this.notificationService));
			return exploredPart;
		}

		case 'planDocument': {
			if (!this.instantiationService) {
				throw new Error('IInstantiationService is required for plan document');
			}
			const planPart = this._register(new VybeChatPlanDocumentPart(contentData as IVybeChatPlanDocumentContent, this.instantiationService, this.markdownRendererService));

			// Wire up streaming callback for smart scrolling
			if (planPart && this.options.onContentUpdate) {
				planPart.onStreamingUpdate = this.options.onContentUpdate;
			}

			return planPart;
		}

		// TODO: Add more content types (errors, progress, etc.)

		default:
			return null;
		}
	}

	/**
	 * Get or create a content part by kind (for streaming updates).
	 * Returns the existing part if found, or creates a new one.
	 */
	public getOrCreateContentPart(kind: VybeChatContentPartKind, initialData?: Partial<IVybeChatContentData>): IVybeChatContentPart | null {
		// Find existing part of this kind
		for (let i = 0; i < this.contentParts.length; i++) {
			if (this.contentParts[i].kind === kind) {
				return this.contentParts[i];
			}
		}

		// Create new part if not found
		if (initialData) {
			const contentData = { ...initialData, kind } as IVybeChatContentData;
			return this.addContentPart(contentData);
		}

		return null;
	}

	// Track accumulated content for streaming updates
	private accumulatedThinking: string = '';
	private thinkingStartTime: number | null = null; // Track when thinking started (for duration)
	// Track accumulated markdown content (single source of truth for what we're building)
	// This is needed because markdown part's currentContent is only updated after rendering,
	// and rendering may be batched via requestAnimationFrame, causing stale reads
	private accumulatedMarkdown: string = '';
	private accumulatedCodeBlocks: Map<string, { code: string; language: string }> = new Map(); // key: language, value: {code, language}

	// Phase 7: New state for normalized streaming events
	private activeCodeBlocks: Map<string, VybeChatCodeBlockPart> = new Map(); // Track code blocks by block_id
	private toolCallElements: Map<string, HTMLElement> = new Map(); // Track tool call UI elements by tool_id
	private phaseIndicator: HTMLElement | null = null; // Current phase status element

	/**
	 * Append chunk to thinking part (creates if doesn't exist).
	 */
	public appendThinkingChunk(chunk: string): void {
		// Track when thinking started (for duration calculation)
		if (this.thinkingStartTime === null) {
			this.thinkingStartTime = Date.now();
		}

		this.accumulatedThinking += chunk;

		// Find or create thinking part
		let existingPart = this.contentParts.find(p => p.kind === 'thinking') as VybeChatThinkingPart | undefined;

		if (!existingPart) {
			// Create new thinking part
			const contentData: IVybeChatThinkingContent = {
				kind: 'thinking',
				value: this.accumulatedThinking,
				isStreaming: true
			};
			existingPart = this.addContentPart(contentData) as VybeChatThinkingPart | undefined;
		}

		if (existingPart && existingPart.updateContent) {
			const thinkingContent: IVybeChatThinkingContent = {
				kind: 'thinking',
				value: this.accumulatedThinking,
				isStreaming: true
			};
			existingPart.updateContent(thinkingContent);
			// Update data tracking - ensure it's always updated
			const index = this.contentPartsData.findIndex(d => d.kind === 'thinking');
			if (index >= 0) {
				this.contentPartsData[index] = thinkingContent;
			} else {
				// If not found, add it (shouldn't happen, but be safe)
				this.contentPartsData.push(thinkingContent);
			}
		}
	}

	/**
	 * Finalize thinking part when content starts streaming.
	 * Transitions from "Thinking" → "Thought for Xs"
	 */
	public finalizeThinking(): void {
		const thinkingPart = this.contentParts.find(p => p.kind === 'thinking') as VybeChatThinkingPart | undefined;
		if (!thinkingPart) {
			return; // No thinking part to finalize
		}

		// Calculate duration
		const duration = this.thinkingStartTime !== null ? Date.now() - this.thinkingStartTime : 0;

		// Update thinking part with isStreaming: false and duration
		const thinkingContent: IVybeChatThinkingContent = {
			kind: 'thinking',
			value: this.accumulatedThinking,
			isStreaming: false,
			duration
		};

		thinkingPart.updateContent(thinkingContent);

		// Update data tracking
		const index = this.contentPartsData.findIndex(d => d.kind === 'thinking');
		if (index >= 0) {
			this.contentPartsData[index] = thinkingContent;
		}

		console.log('[MessagePage] Thinking finalized:', { duration: Math.round(duration / 1000) + 's' });
	}

	/**
	 * Append chunk to markdown part (creates if doesn't exist).
	 * SIMPLIFIED: Same pattern as appendText - accumulate in MessagePage, update part
	 */
	public appendMarkdownChunk(chunk: string): void {
		// Accumulate chunk (single source of truth in MessagePage)
		this.accumulatedMarkdown += chunk;

		// Find or create markdown part
		let part = this.contentParts.find(p => p.kind === 'markdown') as VybeChatMarkdownPart | undefined;

		if (!part) {
			// Create new markdown part
			const contentData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: true
			};
			part = this.addContentPart(contentData) as VybeChatMarkdownPart | undefined;
			if (!part) {
				return;
			}
		}

		// Update part with accumulated content
		if (part.updateContent) {
			part.updateContent({
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: true
			});
		}

		// Update data tracking
		const index = this.contentPartsData.findIndex(d => d.kind === 'markdown');
		if (index >= 0) {
			this.contentPartsData[index] = { kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true };
		} else {
			this.contentPartsData.push({ kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true });
		}
	}

	/**
	 * Append chunk to codeblock part (creates if doesn't exist).
	 * Multiple code blocks can exist (one per language).
	 */
	public appendCodeBlockChunk(chunk: string, language: string = 'plaintext', isFinal: boolean = false): void {
		const key = language;

		// Get or create code block for this language
		if (!this.accumulatedCodeBlocks.has(key)) {
			this.accumulatedCodeBlocks.set(key, { code: '', language });
		}
		const codeBlock = this.accumulatedCodeBlocks.get(key)!;
		codeBlock.code += chunk;

		// Find existing code block part for this language, or create new one
		let existingPart: VybeChatCodeBlockPart | undefined;
		for (let i = 0; i < this.contentParts.length; i++) {
			const part = this.contentParts[i];
			if (part.kind === 'codeBlock') {
				const partData = this.contentPartsData[i] as IVybeChatCodeBlockContent;
				if (partData.language === language) {
					existingPart = part as VybeChatCodeBlockPart;
					break;
				}
			}
		}

		if (!existingPart) {
			// Create new code block part
			const contentData: IVybeChatCodeBlockContent = {
				kind: 'codeBlock',
				code: codeBlock.code,
				language: codeBlock.language,
				isStreaming: !isFinal
			};
			existingPart = this.addContentPart(contentData) as VybeChatCodeBlockPart | undefined;
		}

		if (existingPart && existingPart.updateContent) {
			existingPart.updateContent({
				kind: 'codeBlock',
				code: codeBlock.code,
				language: codeBlock.language,
				isStreaming: !isFinal
			});
			// Update data tracking
			const index = this.contentPartsData.findIndex(d => {
				if (d.kind === 'codeBlock') {
					const cb = d as IVybeChatCodeBlockContent;
					return cb.language === language;
				}
				return false;
			});
			if (index >= 0) {
				this.contentPartsData[index] = { kind: 'codeBlock', code: codeBlock.code, language: codeBlock.language, isStreaming: !isFinal };
			}
		}
	}

	/**
	 * Reset markdown accumulation (called when a new stream starts after finalization)
	 */
	public resetMarkdownAccumulation(): void {
		this.accumulatedMarkdown = '';
	}

	/**
	 * Get accumulated markdown content (for comparison with final events)
	 */
	public getAccumulatedMarkdown(): string {
		return this.accumulatedMarkdown;
	}

	/**
	 * Phase 7: Append plain text to markdown part (for assistant.delta events)
	 * SIMPLIFIED: Just append delta. No guards, no deduplication, no complexity.
	 * The markdown part's internal dedupe will handle duplicate renders.
	 */
	public appendText(text: string): void {
		if (!text || text.length === 0) {
			return;
		}

		// CRITICAL: Check if we already have final content (from setMarkdownContent)
		// If so, ignore appendText - the final content is authoritative
		// This prevents late-arriving deltas from corrupting the final content
		const existingData = this.contentPartsData.find(d => d.kind === 'markdown');
		if (existingData && !existingData.isStreaming) {
			// Already finalized - ignore late deltas
			return;
		}

		// Simple: append delta to accumulated content
		this.accumulatedMarkdown += text;

		// Find or create markdown part
		let part = this.contentParts.find(p => p.kind === 'markdown') as VybeChatMarkdownPart | undefined;

		if (!part) {
			// Create new markdown part
			const contentData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: true
			};
			part = this.addContentPart(contentData) as VybeChatMarkdownPart | undefined;
			if (!part) {
				return; // Can't proceed without a part
			}
		}

		// Update part with accumulated content (part's internal dedupe will prevent duplicate renders)
		if (part.updateContent) {
			part.updateContent({
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: true
			});
		}

		// Update data tracking
		const index = this.contentPartsData.findIndex(d => d.kind === 'markdown');
		if (index >= 0) {
			this.contentPartsData[index] = { kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true };
		} else {
			this.contentPartsData.push({ kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true });
		}
	}

	/**
	 * Set markdown content directly (used by assistant.final to ensure completeness)
	 * This replaces accumulated content with the authoritative full_text
	 * ONLY if the content has actually changed - prevents unnecessary re-renders
	 */
	public setMarkdownContentIfChanged(fullText: string): void {
		// DIAGNOSTIC: Log content being set
		const hasCodeBlocks = fullText.includes('```');
		const currentHasCodeBlocks = this.accumulatedMarkdown.includes('```');
		console.log('[MessagePage] setMarkdownContentIfChanged', {
			fullTextLength: fullText.length,
			accumulatedLength: this.accumulatedMarkdown.length,
			fullTextHasCodeBlocks: hasCodeBlocks,
			accumulatedHasCodeBlocks: currentHasCodeBlocks,
			contentMatches: this.accumulatedMarkdown === fullText
		});

		// CRITICAL: Only update if content actually changed
		// This prevents re-rendering code blocks unnecessarily, which causes flicker
		if (this.accumulatedMarkdown === fullText) {
			// Content matches - update data tracking and markdown part's streaming state
			// updateContent will detect content unchanged and skip re-render (code blocks preserved)
			const existingData = this.contentPartsData.find(d => d.kind === 'markdown');
			if (existingData && existingData.isStreaming) {
				existingData.isStreaming = false;
				// Call updateContent - it will detect content unchanged and just update streaming state
				const part = this.contentParts.find(p => p.kind === 'markdown') as VybeChatMarkdownPart | undefined;
				if (part && part.updateContent) {
					part.updateContent({
						kind: 'markdown',
						content: this.accumulatedMarkdown,
						isStreaming: false
					});
				}
			}
			return; // No change needed
		}


		// Replace accumulated content with full_text (authoritative source)
		this.accumulatedMarkdown = fullText;

		// Find or create markdown part
		let part = this.contentParts.find(p => p.kind === 'markdown') as VybeChatMarkdownPart | undefined;

		if (!part) {
			// Create new markdown part
			const contentData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: false // Not streaming - this is the final content
			};
			part = this.addContentPart(contentData) as VybeChatMarkdownPart | undefined;
			if (!part) {
				return; // Can't proceed without a part
			}
		}

		// Update part with full text (part's internal dedupe will prevent duplicate renders)
		// CRITICAL: Set isStreaming: false since this is the final authoritative content
		// This prevents late-arriving deltas from appending after we've set the final content
		if (part.updateContent) {
			part.updateContent({
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: false // Not streaming - this is the final content
			});
		}

		// Update data tracking
		const index = this.contentPartsData.findIndex(d => d.kind === 'markdown');
		if (index >= 0) {
			this.contentPartsData[index] = { kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: false };
		} else {
			this.contentPartsData.push({ kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: false });
		}
	}

	/**
	 * Phase 7: Start a new code block with given block_id
	 */
	public startCodeBlock(block_id: string, language: string): void {
		// Create new code block part with empty code
		const contentData: IVybeChatCodeBlockContent = {
			kind: 'codeBlock',
			code: '',
			language: language || 'plaintext',
			isStreaming: true
		};

		const codeBlockPart = this.addContentPart(contentData) as VybeChatCodeBlockPart | undefined;
		if (codeBlockPart) {
			// Store in Map keyed by block_id (not language, as multiple blocks can have same language)
			this.activeCodeBlocks.set(block_id, codeBlockPart);
		}
	}

	/**
	 * Phase 7: Append text to existing code block by block_id
	 */
	public appendCodeBlock(block_id: string, text: string): void {
		// Find code block part by block_id
		const codeBlockPart = this.activeCodeBlocks.get(block_id);
		if (!codeBlockPart) {
			console.warn('[MessagePage] appendCodeBlock: block_id not found:', block_id);
			return;
		}

		// Find the corresponding data in contentPartsData
		const partIndex = this.contentParts.findIndex(p => p === codeBlockPart);
		if (partIndex >= 0 && partIndex < this.contentPartsData.length) {
			const existingData = this.contentPartsData[partIndex] as IVybeChatCodeBlockContent;
			const updatedData: IVybeChatCodeBlockContent = {
				kind: 'codeBlock',
				code: existingData.code + text,
				language: existingData.language,
				isStreaming: true
			};

			// Update code block part's content
			if (codeBlockPart.updateContent) {
				codeBlockPart.updateContent(updatedData);
			}
			this.contentPartsData[partIndex] = updatedData;
		}

		// Trigger scroll update if callback exists
		if (codeBlockPart.onStreamingUpdate) {
			codeBlockPart.onStreamingUpdate();
		}
	}

	/**
	 * Phase 7: Finalize a code block (mark as complete, stop streaming)
	 */
	public endCodeBlock(block_id: string): void {
		// Find code block part by block_id
		const codeBlockPart = this.activeCodeBlocks.get(block_id);
		if (!codeBlockPart) {
			console.warn('[MessagePage] endCodeBlock: block_id not found:', block_id);
			return;
		}

		// Find the corresponding data in contentPartsData
		const partIndex = this.contentParts.findIndex(p => p === codeBlockPart);
		if (partIndex >= 0 && partIndex < this.contentPartsData.length) {
			const existingData = this.contentPartsData[partIndex] as IVybeChatCodeBlockContent;
			const updatedData: IVybeChatCodeBlockContent = {
				kind: 'codeBlock',
				code: existingData.code,
				language: existingData.language,
				isStreaming: false
			};

			// Update code block part with isStreaming: false
			if (codeBlockPart.updateContent) {
				codeBlockPart.updateContent(updatedData);
			}
			this.contentPartsData[partIndex] = updatedData;
		}

		// Remove from active blocks Map
		this.activeCodeBlocks.delete(block_id);

		// Trigger scroll update if callback exists
		if (codeBlockPart.onStreamingUpdate) {
			codeBlockPart.onStreamingUpdate();
		}
	}

	/**
	 * Phase 7: Update agent phase status indicator
	 * Simple structure matching provided HTML: <div class="simulated-thinking-container"><span class="make-shine">text</span></div>
	 */
	public updatePhase(phase: string, label?: string): void {
		// Create or update phase indicator element above assistant message
		if (!this.phaseIndicator) {
			// Create simple structure matching provided HTML
			const container = document.createElement('div');
			container.className = 'simulated-thinking-container simulated-thinking-container-group-summary';

			// Phase text with shine animation
			const phaseTextElement = document.createElement('span');
			phaseTextElement.className = 'make-shine';

			// Build hierarchy
			container.appendChild(phaseTextElement);

			// Store the text element for updates
			(container as any).__phaseTextElement = phaseTextElement;

			this.phaseIndicator = container;

			// Insert before aiResponseArea
			if (this.aiResponseArea && this.aiResponseArea.parentElement) {
				this.aiResponseArea.parentElement.insertBefore(this.phaseIndicator, this.aiResponseArea);
			}
		}

		// Display label or default label based on phase
		const displayLabel = label || this.getDefaultPhaseLabel(phase);
		const phaseTextElement = (this.phaseIndicator as any).__phaseTextElement;
		if (phaseTextElement) {
			phaseTextElement.textContent = displayLabel;
		}
	}

	/**
	 * Get default phase label if none provided
	 */
	private getDefaultPhaseLabel(phase: string): string {
		switch (phase) {
			case 'planning':
				return 'Planning next step';
			case 'acting':
				return 'Executing tool';
			case 'reflecting':
				return 'Analyzing result';
			case 'finalizing':
				return 'Finalizing response';
			default:
				return phase;
		}
	}

	/**
	 * Phase 7: Add a tool call card to the message
	 */
	public addToolCall(tool_id: string, tool_name: string, arguments_: Record<string, unknown>): void {
		// Create a new UI element for tool call
		const toolCallElement = document.createElement('div');
		toolCallElement.className = 'vybe-tool-call';
		toolCallElement.dataset.toolId = tool_id;
		toolCallElement.style.cssText = `
			margin: 8px 0;
			padding: 12px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
		`;

		// Header with tool name
		const header = document.createElement('div');
		header.style.cssText = 'font-weight: 600; margin-bottom: 8px;';
		header.textContent = `🔧 ${tool_name}`;
		toolCallElement.appendChild(header);

		// Arguments preview (truncated)
		const argsPreview = document.createElement('div');
		argsPreview.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground); font-family: monospace;';
		const argsStr = JSON.stringify(arguments_, null, 2);
		argsPreview.textContent = argsStr.length > 200 ? argsStr.substring(0, 200) + '...' : argsStr;
		toolCallElement.appendChild(argsPreview);

		// Status: pending
		const status = document.createElement('div');
		status.style.cssText = 'font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;';
		status.textContent = 'Status: Pending';
		toolCallElement.appendChild(status);

		// Add to message timeline
		if (this.aiResponseArea) {
			this.aiResponseArea.appendChild(toolCallElement);
		}

		// Store in Map
		this.toolCallElements.set(tool_id, toolCallElement);
	}

	/**
	 * Phase 7: Update tool call with result or error
	 */
	public updateToolResult(tool_id: string, result: unknown, error?: string): void {
		// Find tool call element by tool_id
		const toolCallElement = this.toolCallElements.get(tool_id);
		if (!toolCallElement) {
			console.warn('[MessagePage] updateToolResult: tool_id not found:', tool_id);
			return;
		}

		// Find status element
		const statusElement = toolCallElement.querySelector('div:last-child') as HTMLElement;
		if (statusElement) {
			if (error) {
				statusElement.textContent = `Status: Failed - ${error}`;
				statusElement.style.color = 'var(--vscode-errorForeground)';
			} else {
				statusElement.textContent = 'Status: Completed';
				statusElement.style.color = 'var(--vscode-descriptionForeground)';

				// Add result preview
				const resultPreview = document.createElement('div');
				resultPreview.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground); font-family: monospace; margin-top: 8px;';
				const resultStr = JSON.stringify(result, null, 2);
				resultPreview.textContent = resultStr.length > 200 ? resultStr.substring(0, 200) + '...' : resultStr;
				toolCallElement.appendChild(resultPreview);
			}
		}
	}

	/**
	 * Phase 7: Mark message as complete, stop streaming indicators
	 */
	/**
	 * Block-based methods (Production architecture)
	 * These methods handle structured block events from the server.
	 */

	/**
	 * Create a new content block
	 */
	public createBlock(block: ContentBlock): void {
		// DEDUPE: Skip if block already exists
		if (this.blocks.has(block.id)) {
			console.log('[MessagePage] createBlock: block already exists, skipping', block.id);
			return;
		}
		console.log('[MessagePage] createBlock', { id: block.id, type: block.type, contentLength: block.content.length });
		this.blocks.set(block.id, block);
		this.renderBlock(block);
	}

	/**
	 * Append delta to an existing block
	 */
	public appendToBlock(blockId: string, delta: string): void {
		const block = this.blocks.get(blockId);
		if (!block) {
			console.warn('[MessagePage] appendToBlock: block not found', blockId);
			return;
		}

		block.content += delta;
		this.updateBlockContent(blockId, block.content);
	}

	/**
	 * Finalize a block (mark as complete)
	 */
	public finalizeBlock(blockId: string, content: string): void {
		const block = this.blocks.get(blockId);
		if (!block) {
			console.warn('[MessagePage] finalizeBlock: block not found', blockId);
			return;
		}

		block.content = content;
		block.isStreaming = false;
		this.updateBlockContent(blockId, content);
	}

	/**
	 * Mark message as complete
	 */
	public setComplete(): void {
		// Finalize all streaming blocks (block-based model)
		for (const block of this.blocks.values()) {
			if (block.isStreaming) {
				block.isStreaming = false;
				this.updateBlockContent(block.id, block.content);
			}
		}

		// Also finalize content parts (thinking, markdown, etc.)
		// This ensures thinking transitions from "Thinking" → "Thought for Xs"
		this.finalize();
	}

	/**
	 * Add a code block from a display tool (show_code)
	 * Production architecture: Code blocks come from tool calls, not markdown parsing
	 */
	public addCodeBlockFromTool(
		toolId: string,
		language: string,
		code: string,
		filename?: string,
		description?: string
	): void {
		console.log('[MessagePage] addCodeBlockFromTool', { toolId, language, codeLength: code.length, filename });

		// Create a code block content part
		const contentData: IVybeChatCodeBlockContent = {
			kind: 'codeBlock',
			code: code,
			language: language || 'plaintext',
			isStreaming: false,
			filename: filename
		};

		// If there's a description, add it as markdown before the code block
		if (description) {
			const descriptionData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				content: description,
				isStreaming: false
			};
			this.addContentPart(descriptionData);
		}

		// Add the code block
		const part = this.addContentPart(contentData);
		if (part) {
			// Track as a block for consistency
			const block: ContentBlock = {
				id: toolId,
				type: 'code',
				content: code,
				isStreaming: false,
				language: language
			};
			this.blocks.set(toolId, block);
			this.blockToPartMap.set(toolId, part);
		}
	}

	/**
	 * Render a block (create appropriate content part)
	 */
	private renderBlock(block: ContentBlock): void {
		let part: IVybeChatContentPart | undefined;

		if (block.type === 'text') {
			// Text block - use markdown part
			const contentData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				content: block.content,
				isStreaming: block.isStreaming
			};
			part = this.addContentPart(contentData) || undefined;
		} else if (block.type === 'code') {
			// Code block - use code block part
			const contentData: IVybeChatCodeBlockContent = {
				kind: 'codeBlock',
				code: block.content,
				language: block.language || 'plaintext',
				isStreaming: block.isStreaming
			};
			part = this.addContentPart(contentData) || undefined;
		} else if (block.type === 'thinking') {
			// Thinking block - use thinking part
			const contentData: IVybeChatThinkingContent = {
				kind: 'thinking',
				value: block.content, // Thinking uses 'value' not 'content'
				isStreaming: block.isStreaming
			};
			part = this.addContentPart(contentData) || undefined;
		}

		if (part) {
			this.blockToPartMap.set(block.id, part);
		}
	}

	/**
	 * Update block content (update existing content part)
	 */
	private updateBlockContent(blockId: string, content: string): void {
		const block = this.blocks.get(blockId);
		if (!block) {
			return;
		}

		const part = this.blockToPartMap.get(blockId);
		if (!part || !part.updateContent) {
			return;
		}

		if (block.type === 'text') {
			part.updateContent({
				kind: 'markdown',
				content: content,
				isStreaming: block.isStreaming
			});
		} else if (block.type === 'code') {
			part.updateContent({
				kind: 'codeBlock',
				code: content,
				language: block.language || 'plaintext',
				isStreaming: block.isStreaming
			});
		} else if (block.type === 'thinking') {
			part.updateContent({
				kind: 'thinking',
				value: content, // Thinking uses 'value' not 'content'
				isStreaming: block.isStreaming
			});
		}

		// Trigger scroll update
		if (this.options.onContentUpdate) {
			this.options.onContentUpdate();
		}
	}

	public finalize(): void {
		// Finalize all content parts

		// Set isStreaming: false on all content parts
		for (const part of this.contentParts) {
			if (part.updateContent) {
				// Find part data by kind (more reliable than index, especially for thinking/markdown/codeBlock)
				const partData = this.contentPartsData.find(d => {
					if (d.kind === part.kind) {
						// For thinking/markdown/codeBlock, there's only one of each kind
						if (d.kind === 'thinking' || d.kind === 'markdown' || d.kind === 'codeBlock') {
							return true;
						}
						// For other kinds, match by kind
						return true;
					}
					return false;
				});

				if (partData) {
					// Ensure content exists for markdown parts before updating
					if (partData.kind === 'markdown') {
						const markdownContent = (partData as any).content;
						if (!markdownContent || markdownContent.length === 0) {
							continue;
						}
					}
					const updatedData = { ...partData, isStreaming: false };

					// Add duration for thinking parts
					if (updatedData.kind === 'thinking' && this.thinkingStartTime !== null) {
						(updatedData as any).duration = Date.now() - this.thinkingStartTime;
					}

					try {
						// Ensure content is always a string (never undefined)
						if (updatedData.kind === 'markdown' && !(updatedData as any).content) {
							(updatedData as any).content = '';
						}
						// Update the part
						part.updateContent(updatedData);
						// Update contentPartsData to reflect finalization
						const dataIndex = this.contentPartsData.findIndex(d => {
							if (d.kind === part.kind) {
								if (d.kind === 'thinking' || d.kind === 'markdown' || d.kind === 'codeBlock') {
									return true;
								}
								return true;
							}
							return false;
						});
						if (dataIndex >= 0) {
							this.contentPartsData[dataIndex] = updatedData;
						}
					} catch (error) {
						console.error('[MessagePage] Error updating content part during finalize:', error, {
							partKind: partData.kind,
							hasContent: !!(partData as any).content || !!(partData as any).value,
							contentLength: (partData as any).content ? (partData as any).content.length :
							             ((partData as any).value ? ((partData as any).value instanceof Array ? (partData as any).value.join('').length : (partData as any).value.length) : 0),
							errorMessage: error instanceof Error ? error.message : String(error)
						});
						// Don't re-throw - continue finalizing other parts
					}
				}
			}
		}

		// Remove phase indicator if exists, but only if we have content
		// This prevents the phase indicator from vanishing before content appears
		const hasContent = this.contentParts.length > 0 && this.contentParts.some(part => {
			if (part.kind === 'markdown') {
				const index = this.contentParts.indexOf(part);
				const partData = index >= 0 ? this.contentPartsData[index] : undefined;
				return partData && (partData as any).content && (partData as any).content.length > 0;
			}
			return true; // Other parts count as content
		});

		if (this.phaseIndicator && hasContent) {
			this.phaseIndicator.remove();
			this.phaseIndicator = null;
		}
	}

	/**
	 * Phase 7: Display error banner in message
	 */
	public showError(message: string, code?: string): void {
		// Create error content part or banner element
		const errorElement = document.createElement('div');
		errorElement.className = 'vybe-error-banner';
		errorElement.style.cssText = `
			margin: 8px 0;
			padding: 12px;
			background: var(--vscode-inputValidation-errorBackground);
			border: 1px solid var(--vscode-inputValidation-errorBorder);
			border-radius: 4px;
			color: var(--vscode-errorForeground);
		`;

		// Display message prominently
		const messageElement = document.createElement('div');
		messageElement.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
		messageElement.textContent = `⚠️ ${message}`;
		errorElement.appendChild(messageElement);

		// Show code if available (smaller, muted)
		if (code) {
			const codeElement = document.createElement('div');
			codeElement.style.cssText = 'font-size: 11px; opacity: 0.8;';
			codeElement.textContent = `Code: ${code}`;
			errorElement.appendChild(codeElement);
		}

		// Add to message timeline
		if (this.aiResponseArea) {
			this.aiResponseArea.appendChild(errorElement);
		}

		// Finalize message (stop streaming)
		this.finalize();
	}

	/**
	 * Update existing content parts with streaming data.
	 * Updates individual parts, then checks for grouping when research actions complete.
	 * contentParts should be the full array of all parts so far.
	 */
	/**
	 * Update content parts (legacy fallback or non-streaming content)
	 * NOTE: This method is called ONLY when hasReceivedEvents === false OR for non-streaming content updates (e.g., error messages).
	 */
	public updateContentParts(contentParts: IVybeChatContentData[]): void {
		if (!this.aiResponseArea || !this.markdownRendererService) {
			return;
		}

		// Update existing parts or add new ones
		for (let i = 0; i < contentParts.length; i++) {
			const contentData = contentParts[i];

			if (i < this.contentParts.length && i < this.contentPartsData.length) {
				// Update existing part
				const existingPart = this.contentParts[i];
				const existingData = this.contentPartsData[i];

				// Only update if data actually changed
				if (existingPart && existingPart.updateContent && existingData.kind === contentData.kind) {
					existingPart.updateContent(contentData);
					this.contentPartsData[i] = contentData;

					// Check for grouping when research action completes
					if (this.isResearchAction(contentData) && !(contentData as any).isStreaming) {
						// Use setTimeout to allow DOM updates to complete
						setTimeout(() => {
							this.checkAndGroupResearchActions();
						}, 0);
					}
				} else if (existingData.kind !== contentData.kind) {
					// Kind changed - replace the part
					existingPart?.dispose();
					const newPart = this.createContentPart(contentData);
					if (newPart) {
						this.contentParts[i] = newPart;
						this.contentPartsData[i] = contentData;
						// Replace in DOM
						if (existingPart) {
							existingPart.domNode.replaceWith(newPart.domNode);
						}
					}
				}
			} else {
				// Add new part
				this.addContentPart(contentData);
			}
		}
	}

	/**
	 * Dispose all content parts.
	 */
	private disposeContentParts(): void {
		for (const part of this.contentParts) {
			part.dispose();
		}
		this.contentParts = [];
		this.contentPartsData = [];

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
