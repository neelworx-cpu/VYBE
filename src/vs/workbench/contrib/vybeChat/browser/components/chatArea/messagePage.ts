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
import type { IVybeChatPlanDocumentContent, IVybeChatListedContent, IVybeChatDirectoryContent } from '../../contentParts/vybeChatContentPart.js';
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
	 */
	public addContentPart(contentData: IVybeChatContentData): void {
		if (!this.aiResponseArea || !this.markdownRendererService) {
			return;
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
		}
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
				const thinkingPart = this._register(new VybeChatThinkingPart(contentData));

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
	 * Update existing content parts with streaming data.
	 * Updates individual parts, then checks for grouping when research actions complete.
	 * contentParts should be the full array of all parts so far.
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
