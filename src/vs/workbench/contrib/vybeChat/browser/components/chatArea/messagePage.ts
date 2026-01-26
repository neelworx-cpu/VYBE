/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, getWindow, getActiveWindow, getDocument } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MessageComposer, AgentMode, ModelDropdownState } from '../composer/messageComposer.js';
import { ContextDropdown } from '../composer/contextDropdown.js';
import { UsageDropdown } from '../composer/usageDropdown.js';
import { ISpeechService } from '../../../../../contrib/speech/common/speechService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import type { IVybeChatContentPart, IVybeChatContentData, IVybeChatPlanDocumentContent, IVybeChatListedContent, IVybeChatDirectoryContent, IVybeChatGreppedContent, IVybeChatMarkdownContent, IVybeChatCodeBlockContent, IVybeChatThinkingContent, IVybeChatErrorContent, IVybeChatProgressContent, IVybeChatTodoContent, IVybeChatTodoItemContent, IVybeChatPhaseIndicatorContent, IVybeChatToolContent, VybeChatContentPartKind } from '../../contentParts/vybeChatContentPart.js';
import { VybeChatMarkdownPart } from '../../contentParts/vybeChatMarkdownPart.js';
import { VybeChatThinkingPart } from '../../contentParts/vybeChatThinkingPart.js';
import { VybeChatCodeBlockPart } from '../../contentParts/vybeChatCodeBlockPart.js';
import { VybeChatTextEditPart } from '../../contentParts/vybeChatTextEditPart.js';
import { VybeChatTerminalPart } from '../../contentParts/vybeChatTerminalPart.js';
import { VybeChatReadingFilesPart, IVybeChatReadingFilesContent } from '../../contentParts/vybeChatReadingFilesPart.js';
import { VybeChatSearchedPart, IVybeChatSearchedContent } from '../../contentParts/vybeChatSearchedPart.js';
import { VybeChatGreppedPart } from '../../contentParts/vybeChatGreppedPart.js';
import { VybeChatExploredPart, IVybeChatExploredContent, ExploredAction } from '../../contentParts/vybeChatExploredPart.js';
import { VybeChatListedPart } from '../../contentParts/vybeChatListedPart.js';
import { VybeChatPlanDocumentPart } from '../../contentParts/vybeChatPlanDocumentPart.js';
import { VybeChatTodoPart } from '../../contentParts/vybeChatTodoPart.js';
import { VybeChatTodoItemPart } from '../../contentParts/vybeChatTodoItemPart.js';
import { VybeChatPhaseIndicatorPart } from '../../contentParts/vybeChatPhaseIndicatorPart.js';
import { VybeChatToolPart } from '../../contentParts/vybeChatToolPart.js';
import { VybeChatReferencePart } from '../../contentParts/vybeChatReferencePart.js';
import type { ContentBlock } from '../../../common/streaming_event_types.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';

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

	// Block-based markdown tracking - ensures each markdown block is independent
	private markdownBlockCounter = 0; // Auto-incrementing counter for unique markdown block IDs
	private currentMarkdownBlockId: string | null = null; // Current active markdown block ID

	/**
	 * Get content parts data (for checking existing parts)
	 */
	public getContentPartsData(): IVybeChatContentData[] {
		return this.contentPartsData;
	}

	// NEW: Block-based content model (Production architecture)
	private blocks: Map<string, ContentBlock> = new Map(); // Track blocks by ID
	private blockToPartMap: Map<string, IVybeChatContentPart> = new Map(); // Map block ID to content part

	// Phase 1: Unified message wrapper tracking (Cursor UI alignment)
	private messagePartIndex: number = 0; // Auto-incrementing index for each content part
	private partToWrapperMap: Map<IVybeChatContentPart, HTMLElement> = new Map(); // Map part to its wrapper element

	// Phase 3: Message grouping - not currently used
	// Message groups are only needed for "Explored" summaries, handled by VybeChatExploredPart

	private markdownRendererService: IMarkdownRendererService | undefined;
	private instantiationService: IInstantiationService | undefined;
	private modelService: IModelService | undefined;
	private languageService: ILanguageService | undefined;
	private clipboardService: IClipboardService | undefined;
	private editorService: IEditorService | undefined;
	private fileService: IFileService | undefined;
	private notificationService: INotificationService | undefined;
	private workspaceContextService: IWorkspaceContextService | undefined;
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
		notificationService?: INotificationService,
		workspaceContextService?: IWorkspaceContextService
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
		this.workspaceContextService = workspaceContextService;
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
			const targetWindow = this.pageElement ? getWindow(this.pageElement) : getActiveWindow();
			targetWindow.requestAnimationFrame(() => {
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
		// NO padding here - each composer-rendered-message has its own padding (matches Cursor)
		this.aiResponseArea = $('div');
		this.aiResponseArea.className = 'vybe-chat-response-area';
		this.aiResponseArea.setAttribute('data-response-for', options.messageId);
		this.aiResponseArea.style.cssText = `
			flex: 1;
			overflow: auto;
			padding: 0 0 16px 0;
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
			const targetDocument = this.pageElement ? getDocument(this.pageElement) : getActiveWindow().document;
			this._register(addDisposableListener(targetDocument, 'click', clickOutsideHandler));
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

	public getMessageHeader(): HTMLElement {
		return this.messageHeader;
	}

	/**
	 * Get a content part by its kind.
	 * Used by streaming coordinator to check typewriter status.
	 */
	public getContentPartByKind(kind: string): IVybeChatContentPart | undefined {
		return this.contentParts.find(p => p.kind === kind);
	}

	/**
	 * Attach a TODO component to the human message container.
	 * This is used when todos from a previous message page need to persist to the next conversation.
	 */
	public attachTodoToHumanMessage(todoContent: IVybeChatTodoContent): IVybeChatContentPart | null {
		// Create the todo part with isAttachedToHuman flag
		const todoData: IVybeChatTodoContent = {
			...todoContent,
			isAttachedToHuman: true,
			isExpanded: true, // Always expanded when attached to human
		};

		const todoPart = this.createContentPart(todoData);
		if (!todoPart) {
			return null;
		}

		// Find the composer container within messageHeader to attach the todo
		const composerOuter = this.messageHeader.querySelector('.vybe-ai-composer-outer') as HTMLElement;
		if (!composerOuter) {
			return null;
		}

		// Find the input wrapper (blur wrapper) to attach directly after it
		const inputWrapper = composerOuter.querySelector('.composer-input-blur-wrapper') as HTMLElement;
		if (!inputWrapper) {
			// Fallback: attach to composer outer
			const todoContainer = $('div', {
				style: `
					width: 100%;
					box-sizing: border-box;
					margin-top: -8px;
					margin-left: 0px;
					margin-right: 0px;
				`
			});
			todoContainer.appendChild(todoPart.domNode);
			composerOuter.appendChild(todoContainer);
		} else {
			// Attach with negative margin to overlap by border radius (8px) for seamless connection
			const todoContainer = $('div', {
				style: `
					width: 100%;
					box-sizing: border-box;
					margin-top: -8px;
					margin-left: 0px;
					margin-right: 0px;
					position: relative;
				`
			});
			todoContainer.appendChild(todoPart.domNode);
			// Insert right after input wrapper
			if (inputWrapper.nextSibling) {
				composerOuter.insertBefore(todoContainer, inputWrapper.nextSibling);
			} else {
				composerOuter.appendChild(todoContainer);
			}
		}

		// Track the part
		this.contentParts.push(todoPart);
		this.contentPartsData.push(todoData);

		return todoPart;
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
			contentData.kind === 'grepped' ||
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
							} else if (action.kind === 'grepped') {
								return {
									type: 'grepped' as const,
									data: action as IVybeChatGreppedContent
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
	 * Map content part kind to Cursor's data-message-kind attribute.
	 */
	private mapKindToMessageKind(kind: VybeChatContentPartKind): string {
		switch (kind) {
			case 'thinking':
				return 'thinking';
			case 'phaseIndicator':
				return 'phaseIndicator'; // Phase indicator has its own kind
			case 'markdown':
			case 'codeBlock':
			case 'planDocument':
				return 'assistant';
			case 'tool':
			case 'readingFiles':
			case 'searched':
			case 'grepped':
			case 'explored':
			case 'listed':
			case 'directory':
			case 'textEdit':
			case 'terminal':
				return 'tool';
			case 'error':
			case 'progress':
				return 'assistant';
			default:
				return 'assistant';
		}
	}

	/**
	 * Create a unified message wrapper for a content part.
	 * Matches Cursor's `composer-rendered-message` structure with proper data attributes.
	 */
	private createMessageWrapper(
		part: IVybeChatContentPart,
		contentData: IVybeChatContentData,
		toolCallId?: string
	): HTMLElement {
		const messageIndex = this.messagePartIndex++;
		const messageId = `${this.options.messageId}-${messageIndex}`;
		const messageKind = this.mapKindToMessageKind(contentData.kind);
		const isStreaming = (contentData as any).isStreaming ?? false;

		const wrapper = $('div');
		wrapper.className = 'composer-rendered-message hide-if-empty composer-message-blur';
		wrapper.setAttribute('tabindex', '0');
		wrapper.setAttribute('data-message-index', messageIndex.toString());
		wrapper.setAttribute('data-message-id', messageId);
		wrapper.setAttribute('data-message-role', 'ai');
		wrapper.setAttribute('data-message-kind', messageKind);
		wrapper.id = `bubble-${messageId}`;

		// Add tool-specific attributes
		if (messageKind === 'tool') {
			if (toolCallId) {
				wrapper.setAttribute('data-tool-call-id', toolCallId);
			}
			wrapper.setAttribute('data-tool-status', isStreaming ? 'loading' : 'completed');
		}

		// Each message wrapper has its own padding (matches Cursor structure)
		wrapper.style.cssText = `
			display: block;
			outline: none;
			padding: 0px 18px;
			background-color: var(--composer-pane-background);
			opacity: 1;
			z-index: 99;
		`;

		// Append the content part's DOM node to the wrapper
		wrapper.appendChild(part.domNode);

		// Track the wrapper for later updates
		this.partToWrapperMap.set(part, wrapper);

		return wrapper;
	}

	/**
	 * Update tool status on a content part's wrapper.
	 * Called when a tool completes execution.
	 */
	public updateToolStatus(part: IVybeChatContentPart, status: 'loading' | 'completed'): void {
		const wrapper = this.partToWrapperMap.get(part);
		if (wrapper && wrapper.getAttribute('data-message-kind') === 'tool') {
			wrapper.setAttribute('data-tool-status', status);
		}
	}

	// Note: Message grouping methods removed - not currently used
	// Message groups are only needed for "Explored" summaries, which are handled
	// by VybeChatExploredPart creating its own composer-message-group structure

	/**
	 * Get incomplete todos from this message page.
	 * Returns todos that have at least one incomplete item.
	 */
	public getIncompleteTodos(): IVybeChatTodoContent | null {
		const todoData = this.contentPartsData.find(d => d.kind === 'todo') as IVybeChatTodoContent | undefined;
		if (!todoData || todoData.items.length < 2) {
			return null;
		}
		const incompleteCount = todoData.items.filter(item => item.status !== 'completed').length;
		if (incompleteCount === 0) {
			return null; // All completed
		}
		return todoData;
	}

	/**
	 * Check if any todoItem parts exist (indicating work has started on todos).
	 */
	public hasTodoItemParts(): boolean {
		return this.contentPartsData.some(d => d.kind === 'todoItem');
	}

	/**
	 * Add a single content part (for streaming updates).
	 * Items appear individually, then group into Explored when 3+ research actions complete.
	 * Returns the created part for further updates.
	 */
	public addContentPart(contentData: IVybeChatContentData, toolCallId?: string): IVybeChatContentPart | null {
		// Removed verbose logging

		if (!this.aiResponseArea || !this.markdownRendererService) {
			console.error(`[MessagePage] addContentPart: Missing aiResponseArea or markdownRendererService!`);
			return null;
		}

		// Check if part already exists (for streaming updates)
		const existingIndex = this.contentPartsData.findIndex(d => {
			// For thinking parts, only match if it's still streaming (not finalized)
			// This allows multiple thinking parts - one per reasoning part
			if (d.kind === 'thinking' && contentData.kind === 'thinking') {
				const thinkingData = d as IVybeChatThinkingContent;
				return thinkingData.isStreaming === true; // Only match if still streaming
			}
			// For codeBlock, only one of each kind should exist during streaming
			if (d.kind === contentData.kind && d.kind === 'codeBlock') {
				return true;
			}
			// For markdown, only match if IDs are the same (allows multiple markdown blocks)
			if (d.kind === 'markdown' && contentData.kind === 'markdown') {
				const dId = (d as IVybeChatMarkdownContent).id;
				const newId = (contentData as IVybeChatMarkdownContent).id;
				// If both have IDs, only match if they're the same
				if (dId && newId) {
					return dId === newId;
				}
				// If neither has an ID, match (legacy behavior)
				if (!dId && !newId) {
					return true;
				}
				// One has ID, one doesn't - they're different blocks
				return false;
			}
			// For phaseIndicator, only one should exist at a time (replace existing)
			if (d.kind === 'phaseIndicator' && contentData.kind === 'phaseIndicator') {
				return true;
			}
			// For tool parts (tool, readingFiles, listed, grepped, searched), check by ID if provided
			if (d.kind === contentData.kind) {
				const hasId = (data: IVybeChatContentData): data is IVybeChatContentData & { id?: string } => {
					return 'id' in data;
				};
				if (hasId(d) && hasId(contentData) && d.id && contentData.id && d.id === contentData.id) {
					return true;
				}
			}
			return false;
		});

		if (existingIndex >= 0) {
			// Removed verbose logging
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

			// Create unified message wrapper (Cursor UI alignment)
			const wrapper = this.createMessageWrapper(part, contentData, toolCallId);

			// Append all content parts in order - no grouping
			// The LLM outputs content sequentially and we must preserve that order:
			// thinking → markdown → tool → markdown → tool → markdown...
			this.aiResponseArea.appendChild(wrapper);

			// Check for grouping when:
			// 1. A research action completes (might form a group with previous actions)
			// 2. A non-research action appears (should group previous research actions)
			const isResearch = this.isResearchAction(contentData);
			const isNonResearch = !isResearch && (contentData.kind === 'markdown' || contentData.kind === 'thinking' || contentData.kind === 'textEdit' || contentData.kind === 'terminal' || contentData.kind === 'codeBlock');

			if ((isResearch && !(contentData as any).isStreaming) || isNonResearch) {
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
	 * Check for consecutive research actions (2+) and group them when a break occurs.
	 * Matches Cursor's behavior: groups 2+ consecutive research actions when:
	 * - A non-research action appears (markdown, thinking, textEdit, terminal, etc.)
	 * - All actions in the group are completed
	 */
	private checkAndGroupResearchActions(): void {
		if (!this.aiResponseArea) {
			return;
		}

		// Find consecutive research actions (2+) that should be grouped
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
					// Research action still streaming - finalize previous group if it has 2+ actions
					if (currentGroup && currentGroup.actions.length >= 2) {
						groups.push({ start: currentGroup.start, end: i - 1, actions: currentGroup.actions });
					}
					currentGroup = null;
				}
			} else {
				// Non-research action (markdown, thinking, textEdit, terminal, etc.) - finalize group if it has 2+ actions
				if (currentGroup && currentGroup.actions.length >= 2) {
					groups.push({ start: currentGroup.start, end: i - 1, actions: currentGroup.actions });
				}
				currentGroup = null;
			}
		}

		// Check final group (only if all are completed and has 2+ actions)
		if (currentGroup && currentGroup.actions.length >= 2) {
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

			// Remove individual parts from DOM and tracking (including wrappers)
			for (let i = group.start; i <= group.end; i++) {
				const part = this.contentParts[i];
				if (part) {
					// Remove wrapper from DOM (which also removes part.domNode)
					const wrapper = this.partToWrapperMap.get(part);
					if (wrapper) {
						wrapper.remove();
						this.partToWrapperMap.delete(part);
					} else {
						// Fallback: remove domNode directly if no wrapper
						part.domNode.remove();
					}
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

				// Wrap explored part in message group structure (matches Cursor)
				const messageGroup = $('div');
				messageGroup.className = 'composer-message-group';

				const innerWrapper = $('div');
				innerWrapper.style.cssText = 'padding: 0px 18px; opacity: 1;';

				const summaryWrapper = $('div');
				summaryWrapper.className = 'composer-message-group composer-new-convo-summary';
				summaryWrapper.style.cssText = 'padding: 0px 2px; cursor: pointer;';

				// The explored part's DOM node goes directly into summary wrapper
				summaryWrapper.appendChild(exploredPart.domNode);
				innerWrapper.appendChild(summaryWrapper);
				messageGroup.appendChild(innerWrapper);

				// Track the wrapper (use messageGroup as the wrapper for tracking)
				this.partToWrapperMap.set(exploredPart, messageGroup);

				// Insert into DOM at the position of the first removed part
				const nextPartIndex = group.start + 1;
				const nextPart = nextPartIndex < this.contentParts.length ? this.contentParts[nextPartIndex] : null;
				const insertBefore = nextPart ? this.partToWrapperMap.get(nextPart) : null;

				if (insertBefore) {
					this.aiResponseArea.insertBefore(messageGroup, insertBefore);
				} else {
					this.aiResponseArea.appendChild(messageGroup);
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
				const markdownPart = this._register(new VybeChatMarkdownPart(
					contentData,
					this.markdownRendererService,
					this.instantiationService,
					{
						editorService: this.editorService,
						workspaceContextService: this.workspaceContextService
					}
				));

				// Wire up streaming callback for smart scrolling
				if (markdownPart && this.options.onContentUpdate) {
					markdownPart.setStreamingUpdateCallback(this.options.onContentUpdate);
				}

				return markdownPart;
			}

			case 'codeBlock': {
				if (!this.instantiationService || !this.modelService || !this.languageService || !this.clipboardService || !this.editorService || !this.workspaceContextService) {
					return null;
				}
				const codeBlockPart = this._register(new VybeChatCodeBlockPart(
					contentData,
					this.codeBlockIndex++,
					this.instantiationService,
					this.modelService,
					this.languageService,
					this.clipboardService,
					this.editorService,
					this.workspaceContextService
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

			case 'reference': {
				if (!this.instantiationService || !this.modelService || !this.languageService || !this.clipboardService || !this.editorService || !this.workspaceContextService) {
					return null;
				}
				const referencePart = this._register(new VybeChatReferencePart(
					contentData,
					this.instantiationService,
					this.modelService,
					this.languageService,
					this.clipboardService,
					this.editorService,
					this.workspaceContextService
				));
				return referencePart;
			}

			case 'readingFiles': {
				const readingPart = this._register(new VybeChatReadingFilesPart(contentData as IVybeChatReadingFilesContent, this.editorService, this.fileService, this.notificationService));
				return readingPart;
			}

			case 'searched': {
				const searchedPart = this._register(new VybeChatSearchedPart(contentData as IVybeChatSearchedContent, this.editorService, this.fileService, this.notificationService));
				return searchedPart;
			}

			case 'grepped': {
				const greppedPart = this._register(new VybeChatGreppedPart(contentData as IVybeChatGreppedContent));
				return greppedPart;
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

			case 'error': {
				// Error content part - show as markdown with error styling
				const errorContent = contentData as IVybeChatErrorContent;
				const errorMarkdown = `**Error (${errorContent.level}):** ${errorContent.message}`;
				const errorMarkdownData: IVybeChatMarkdownContent = {
					kind: 'markdown',
					content: errorMarkdown,
					isStreaming: false
				};
				return this.createContentPart(errorMarkdownData);
			}

			case 'progress': {
				// Progress content part - show as markdown
				const progressContent = contentData as IVybeChatProgressContent;
				const progressMarkdown = `_${progressContent.message}_`;
				const progressMarkdownData: IVybeChatMarkdownContent = {
					kind: 'markdown',
					content: progressMarkdown,
					isStreaming: false
				};
				return this.createContentPart(progressMarkdownData);
			}

			case 'listed': {
				const listedPart = this._register(new VybeChatListedPart(contentData as IVybeChatListedContent));
				return listedPart;
			}

			case 'directory': {
				// Directory content part - show as markdown for now
				const dirContent = contentData as IVybeChatDirectoryContent;
				const dirMarkdown = `**Directory:** ${dirContent.name}`;
				const dirMarkdownData: IVybeChatMarkdownContent = {
					kind: 'markdown',
					content: dirMarkdown,
					isStreaming: false
				};
				return this.createContentPart(dirMarkdownData);
			}

			case 'todo': {
				const todoPart = this._register(new VybeChatTodoPart(contentData as IVybeChatTodoContent));
				// Wire up streaming callback for smart scrolling
				if (todoPart && this.options.onContentUpdate) {
					todoPart.onStreamingUpdate = this.options.onContentUpdate;
				}
				return todoPart;
			}

			case 'todoItem': {
				const todoItemPart = this._register(new VybeChatTodoItemPart(contentData as IVybeChatTodoItemContent));
				return todoItemPart;
			}

			case 'phaseIndicator': {
				const phaseIndicatorPart = this._register(new VybeChatPhaseIndicatorPart(contentData as IVybeChatPhaseIndicatorContent));
				return phaseIndicatorPart;
			}

			case 'tool': {
				const toolPart = this._register(new VybeChatToolPart(
					contentData as IVybeChatToolContent,
					this.editorService,
					this.fileService,
					this.notificationService,
					this.workspaceContextService,
					this.modelService,
					this.languageService
				));
				return toolPart;
			}

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
	private thinkingFinalized: boolean = false; // Track if thinking has been finalized (prevents recalculating duration)
	// Track accumulated markdown content (single source of truth for what we're building)
	// This is needed because markdown part's currentContent is only updated after rendering,
	// and rendering may be batched via requestAnimationFrame, causing stale reads
	private accumulatedMarkdown: string = '';
	private accumulatedCodeBlocks: Map<string, { code: string; language: string }> = new Map(); // key: language, value: {code, language}

	// Phase 7: New state for normalized streaming events
	private activeCodeBlocks: Map<string, VybeChatCodeBlockPart> = new Map(); // Track code blocks by block_id
	// REMOVED: toolCallElements - no longer using generic tool call UI
	// REMOVED: phaseIndicator - now handled as content part

	/**
	 * Append chunk to thinking part (creates if doesn't exist).
	 */
	// Track summaries by index (for structured summaries from OpenAI Responses API)
	// CURSOR-STYLE: Keep one streaming block open until interrupted by non-thinking content
	private summaryByIndex = new Map<number, string>(); // Global accumulation by index
	private currentBlockSummaryIndices = new Set<number>(); // Track which summary indices are in the CURRENT streaming block

	private buildCombinedContentForBlock(indices: number[]): string {
		// Combine summaries for a specific block, sorted by index
		const sortedIndices = [...indices].sort((a, b) => a - b);
		let combinedContent = '';
		for (let i = 0; i < sortedIndices.length; i++) {
			const index = sortedIndices[i];
			const summaryText = this.summaryByIndex.get(index) || '';
			if (summaryText.trim().length > 0) {
				if (i > 0 && combinedContent.length > 0) {
					// Add spacing between summaries
					combinedContent += '\n\n';
				}
				combinedContent += summaryText;
			}
		}
		return combinedContent;
	}

	public appendThinkingChunk(chunk: string, summaryIndex?: number): void {
		// CURSOR-STYLE: Keep one streaming thinking block open until interrupted
		if (summaryIndex !== undefined) {
			// 1. Accumulate delta by index (global accumulation)
			const existing = this.summaryByIndex.get(summaryIndex) || '';
			const accumulated = existing + chunk;
			this.summaryByIndex.set(summaryIndex, accumulated);

			// 2. Find or create the streaming thinking block
			let lastStreamingPart: VybeChatThinkingPart | undefined;
			let lastStreamingIndex = -1;
			for (let i = this.contentParts.length - 1; i >= 0; i--) {
				const p = this.contentParts[i];
				if (p.kind !== 'thinking') continue;
				const contentData = this.contentPartsData[i] as IVybeChatThinkingContent | undefined;
				if (contentData && contentData.isStreaming === true) {
					lastStreamingPart = p as VybeChatThinkingPart;
					lastStreamingIndex = i;
					break;
				}
			}

			// 3. If no streaming block exists, start NEW block (clear indices)
			if (!lastStreamingPart) {
				this.currentBlockSummaryIndices.clear();
				this.currentBlockSummaryIndices.add(summaryIndex);
			} else {
				// 4. Add index to current block if new
				if (!this.currentBlockSummaryIndices.has(summaryIndex)) {
					this.currentBlockSummaryIndices.add(summaryIndex);
				}
			}

			// 5. Build content from current block indices only
			const blockIndices = Array.from(this.currentBlockSummaryIndices);
			const combinedContent = this.buildCombinedContentForBlock(blockIndices);
			this.accumulatedThinking = combinedContent;

			// 6. Update streaming block
			if (lastStreamingPart) {
				if (lastStreamingPart.updateContent) {
					const thinkingContent: IVybeChatThinkingContent = {
						kind: 'thinking',
						value: this.accumulatedThinking,
						isStreaming: true
					};
					lastStreamingPart.updateContent(thinkingContent);
					if (lastStreamingIndex >= 0 && lastStreamingIndex < this.contentPartsData.length) {
						this.contentPartsData[lastStreamingIndex] = thinkingContent;
					}
				}
			} else {
				// Create new streaming block
				if (this.thinkingStartTime === null) {
					this.thinkingStartTime = Date.now();
				}
				this.thinkingFinalized = false;

				const contentData: IVybeChatThinkingContent = {
					kind: 'thinking',
					value: this.accumulatedThinking,
					isStreaming: true
				};
				this.addContentPart(contentData);
			}
			return; // Structured approach handled, exit early
		}

		// DEPRECATED: Fallback to text-based approach for backward compatibility (Anthropic, etc.)
		// CRITICAL: Check if THIS CHUNK starts a new reasoning part
		// New reasoning parts start with a title pattern like "**Title**"
		// We check the chunk itself, not the accumulated result, to avoid splitting a single reasoning part
		const chunkStartsWithTitle = /^\s*\*\*[^*]+\*\*/.test(chunk.trim());

		// CRITICAL: Check if chunk is just punctuation/whitespace (very small, no title pattern)
		const isJustPunctuation = chunk.trim().length <= 3 && !chunkStartsWithTitle && /^[\s\.,;:!?\-]*$/.test(chunk.trim());

		// CRITICAL: Check if accumulated thinking contains a title pattern anywhere (not just at start)
		// This helps determine if a new title chunk is a continuation (same block) or new part (new block)
		const accumulatedHasTitle = /\*\*[^*]+\*\*/.test(this.accumulatedThinking);

		// CRITICAL: A new reasoning part is detected if:
		// 1. This chunk starts with a title pattern AND we already have accumulated thinking that doesn't contain a title (replacing old part)
		// 2. OR this chunk starts with a title pattern AND accumulation is empty (first part or after finalized)
		// 3. OR we're after a finalized thinking block and accumulation is empty AND chunk is NOT just punctuation (new turn)
		// NOTE: If accumulated has a title and new chunk has title, it's a continuation (same block, add spacing)
		const isNewReasoningPart = chunkStartsWithTitle && this.accumulatedThinking.length > 0 && !accumulatedHasTitle;
		const isFirstReasoningPart = chunkStartsWithTitle && this.accumulatedThinking.length === 0;
		const isAfterFinalized = this.thinkingFinalized && this.accumulatedThinking.length === 0 && !isJustPunctuation;

		if (isNewReasoningPart || isFirstReasoningPart || isAfterFinalized) {
			// This is a new reasoning part - finalize the previous one if it exists and is still streaming
			if (this.accumulatedThinking.length > 0) {
				// Find and finalize the current streaming thinking part
				for (let i = 0; i < this.contentParts.length; i++) {
					const p = this.contentParts[i];
					if (p.kind !== 'thinking') continue;
					const contentData = this.contentPartsData[i] as IVybeChatThinkingContent | undefined;
					if (contentData && contentData.isStreaming === true) {
						// Finalize this part before starting a new one
						const finalizedContent: IVybeChatThinkingContent = {
							kind: 'thinking',
							value: this.accumulatedThinking,
							isStreaming: false,
							duration: this.thinkingStartTime !== null ? Math.max(Date.now() - this.thinkingStartTime, 1000) : 1000
						};
						if (p.updateContent) {
							p.updateContent(finalizedContent);
						}
						this.contentPartsData[i] = finalizedContent;
						break;
					}
				}
			}

			// CRITICAL: For new reasoning parts, the chunk contains the FULL content
			// Set accumulation directly to the chunk (don't append)
			this.accumulatedThinking = chunk;
			this.thinkingStartTime = Date.now();
			this.thinkingFinalized = false;
		} else {
			// CRITICAL: If this is just punctuation and we have no accumulated thinking,
			// ALWAYS try to append it to the last finalized thinking block (even if markdown/tools appeared in between)
			// This ensures punctuation stays with its reasoning part
			if (this.accumulatedThinking.length === 0 && isJustPunctuation) {
				// Find the last finalized thinking block (search backwards through all content parts)
				for (let i = this.contentParts.length - 1; i >= 0; i--) {
					const p = this.contentParts[i];
					if (p.kind !== 'thinking') continue;
					const contentData = this.contentPartsData[i] as IVybeChatThinkingContent | undefined;
					if (contentData && contentData.isStreaming === false) {
						// Found last finalized thinking block - append punctuation to it
						const updatedContent: IVybeChatThinkingContent = {
							kind: 'thinking',
							value: contentData.value + chunk,
							isStreaming: false,
							duration: contentData.duration
						};
						if (p.updateContent) {
							p.updateContent(updatedContent);
						}
						this.contentPartsData[i] = updatedContent;
						return; // Don't create new block or update accumulation
					}
				}
				// If no finalized thinking block found, ignore the punctuation chunk (don't create empty block)
				return;
			}

		// Track when thinking started (for duration calculation)
		if (this.thinkingStartTime === null) {
			this.thinkingStartTime = Date.now();
		}

			// CRITICAL: If chunk starts with a title pattern and we already have accumulated thinking,
			// this is a new reasoning summary within the same thinking block - add spacing for proper separation
			// This is a continuation but contains a new title, so we need to separate it from previous content
			if (chunkStartsWithTitle && this.accumulatedThinking.length > 0) {
				// Remove ALL trailing whitespace (including newlines) and ensure we have exactly double newline before the new title
				// This ensures proper separation regardless of what the accumulated thinking ends with
				const trimmed = this.accumulatedThinking.replace(/\s+$/, ''); // Remove all trailing whitespace
				if (trimmed.length > 0) {
					// CRITICAL: Ensure the accumulated thinking ends with a newline, then add another newline
					// This guarantees the title will be in a separate paragraph
					// Check if it already ends with newline
					if (trimmed.endsWith('\n')) {
						// Already has newline, add one more for blank line
						this.accumulatedThinking = trimmed + '\n';
					} else {
						// No newline, add double newline
						this.accumulatedThinking = trimmed + '\n\n';
					}
				} else {
					// If after trimming we have nothing, just set to double newline
					this.accumulatedThinking = '\n\n';
				}
			}

			// Append chunk to accumulation (continuation of current part)
		this.accumulatedThinking += chunk;
		}

		// CRITICAL: If this is a new reasoning part, ALWAYS create a new block (don't look for existing)
		// Otherwise, look for existing streaming part to update
		let existingPart: VybeChatThinkingPart | undefined;

		if (isNewReasoningPart || isFirstReasoningPart || isAfterFinalized) {
			// This is a new reasoning part - ALWAYS create a new block
			const contentData: IVybeChatThinkingContent = {
				kind: 'thinking',
				value: this.accumulatedThinking,
				isStreaming: true
			};
			existingPart = this.addContentPart(contentData) as VybeChatThinkingPart | undefined;
			if (existingPart) {
				console.log(`[MessagePage] ✅ Created new thinking block for new reasoning part (${this.accumulatedThinking.length} chars)`);
			}
		} else {
			// This is a continuation - find existing streaming part
			for (let i = 0; i < this.contentParts.length; i++) {
				const p = this.contentParts[i];
				if (p.kind !== 'thinking') continue;
				// Check content data to see if it's still streaming (isStreaming is private)
				const contentData = this.contentPartsData[i] as IVybeChatThinkingContent | undefined;
				if (contentData && contentData.isStreaming === true) {
					existingPart = p as VybeChatThinkingPart;
					break;
				}
			}

		if (!existingPart) {
				// No existing streaming part found - create new one
			const contentData: IVybeChatThinkingContent = {
				kind: 'thinking',
				value: this.accumulatedThinking,
				isStreaming: true
			};
			existingPart = this.addContentPart(contentData) as VybeChatThinkingPart | undefined;
				if (existingPart) {
				}
			}
		}

		// Update the part with current accumulated content
		if (existingPart && existingPart.updateContent) {
			const thinkingContent: IVybeChatThinkingContent = {
				kind: 'thinking',
				value: this.accumulatedThinking,
				isStreaming: true
			};
			existingPart.updateContent(thinkingContent);
			// Update data tracking - ensure it's always updated
			// Find the index of THIS specific thinking part (there may be multiple if previous was finalized)
			const partIndex = this.contentParts.findIndex(p => p === existingPart);
			if (partIndex >= 0 && partIndex < this.contentPartsData.length) {
				this.contentPartsData[partIndex] = thinkingContent;
			} else {
				// Fallback: find by kind (shouldn't happen, but be safe)
				const index = this.contentPartsData.findIndex(d => d.kind === 'thinking' && (d as IVybeChatThinkingContent).isStreaming === true);
			if (index >= 0) {
				this.contentPartsData[index] = thinkingContent;
			} else {
					// If not found, add it
				this.contentPartsData.push(thinkingContent);
				}
			}
		}
	}

	/**
	 * Finalize thinking part when content starts streaming.
	 * Transitions from "Thinking" → "Thought for Xs"
	 * Only calculates duration ONCE - subsequent calls are no-ops.
	 */
	public finalizeThinking(): void {
		// CURSOR-STYLE: Clear current block indices when finalizing
		// This allows a new thinking block to start fresh when thinking resumes

		// CRITICAL: Remove finalized block's indices from summaryByIndex to prevent cross-block contamination
		// When a new block starts, it should only see summaries that arrive during its lifetime
		for (const index of this.currentBlockSummaryIndices) {
			this.summaryByIndex.delete(index);
		}

		this.currentBlockSummaryIndices.clear();

		// CRITICAL: Only finalize once - prevent duration from increasing during text streaming
		if (this.thinkingFinalized) {
			return; // Already finalized, don't recalculate duration
		}

		// Find the currently streaming thinking part (not just any thinking part)
		let thinkingPart: VybeChatThinkingPart | undefined;
		let thinkingIndex = -1;
		for (let i = 0; i < this.contentParts.length; i++) {
			const p = this.contentParts[i];
			if (p.kind !== 'thinking') continue;
			// Check content data to see if it's still streaming
			const contentData = this.contentPartsData[i] as IVybeChatThinkingContent | undefined;
			if (contentData && contentData.isStreaming === true) {
				thinkingPart = p as VybeChatThinkingPart;
				thinkingIndex = i;
				break;
			}
		}

		if (!thinkingPart) {
			return; // No streaming thinking part to finalize
		}

		// Mark as finalized BEFORE calculating to prevent race conditions
		this.thinkingFinalized = true;

		// Calculate duration (only happens once)
		// Minimum of 1 second - "Thought for 0s" looks wrong
		const rawDuration = this.thinkingStartTime !== null ? Date.now() - this.thinkingStartTime : 0;
		const duration = Math.max(rawDuration, 1000); // Minimum 1 second

		// Update thinking part with isStreaming: false and duration
		const thinkingContent: IVybeChatThinkingContent = {
			kind: 'thinking',
			value: this.accumulatedThinking,
			isStreaming: false,
			duration
		};

		thinkingPart.updateContent(thinkingContent);

		// Update data tracking - use the specific index we found
		if (thinkingIndex >= 0 && thinkingIndex < this.contentPartsData.length) {
			this.contentPartsData[thinkingIndex] = thinkingContent;
		} else {
			// Fallback: find by kind and streaming status
			const index = this.contentPartsData.findIndex(d => d.kind === 'thinking' && (d as IVybeChatThinkingContent).isStreaming === true);
		if (index >= 0) {
			this.contentPartsData[index] = thinkingContent;
			}
		}

		// CRITICAL: Reset accumulation state for next thinking phase (new turn)
		// This prevents later thinking from being appended to this finalized block
		this.accumulatedThinking = '';
		this.thinkingStartTime = null;
		this.thinkingFinalized = false; // Allow new thinking block to be created

	}

	/**
	 * Append chunk to markdown part (creates if doesn't exist).
	 * SIMPLIFIED: Same pattern as appendText - accumulate in MessagePage, update part
	 */
	public appendMarkdownChunk(chunk: string): void {
		// Accumulate chunk (single source of truth in MessagePage)
		this.accumulatedMarkdown += chunk;

		// Find existing markdown part - but only if it's still streaming
		// If it's finalized (isStreaming: false), we need to create a new one
		let part: VybeChatMarkdownPart | undefined;
		let partIndex = -1;
		for (let i = 0; i < this.contentParts.length; i++) {
			const p = this.contentParts[i];
			if (p.kind !== 'markdown') continue;
			// Check content data to see if it's still streaming
			const contentData = this.contentPartsData[i] as IVybeChatMarkdownContent | undefined;
			if (contentData && contentData.isStreaming === true) {
				part = p as VybeChatMarkdownPart;
				partIndex = i;
				break;
			}
		}

		if (!part) {
			// Create new markdown part (either first one, or new one after previous was finalized)
			const contentData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: true
			};
			part = this.addContentPart(contentData) as VybeChatMarkdownPart | undefined;
			if (!part) {
				return;
			}
			partIndex = this.contentPartsData.length - 1;
		}

		// Update part with accumulated content
		if (part.updateContent) {
			part.updateContent({
				kind: 'markdown',
				content: this.accumulatedMarkdown,
				isStreaming: true
			});
		}

		// Update data tracking - use the specific index we found
		if (partIndex >= 0 && partIndex < this.contentPartsData.length) {
			this.contentPartsData[partIndex] = { kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true };
		} else {
			// Fallback: find by kind and streaming status
			const index = this.contentPartsData.findIndex(d => d.kind === 'markdown' && (d as IVybeChatMarkdownContent).isStreaming === true);
		if (index >= 0) {
			this.contentPartsData[index] = { kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true };
		} else {
			this.contentPartsData.push({ kind: 'markdown', content: this.accumulatedMarkdown, isStreaming: true });
			}
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
	 * Finalize current markdown block (stops streaming).
	 * Called before adding tool UI to ensure markdown before and after tools are in separate groups.
	 * CRITICAL: Clears currentMarkdownBlockId so next appendText creates a new block.
	 */
	public finalizeCurrentMarkdown(): void {
		// Find the markdown part with the current block ID
		if (!this.currentMarkdownBlockId) {
			// Removed verbose logging
			return;
		}

		const markdownIndex = this.contentPartsData.findIndex(d =>
			d.kind === 'markdown' && (d as IVybeChatMarkdownContent).id === this.currentMarkdownBlockId
		);

		if (markdownIndex >= 0) {
			const markdownData = this.contentPartsData[markdownIndex] as IVybeChatMarkdownContent;
			// Type guard: check if it's markdown content with isStreaming
			if (markdownData.isStreaming) {
				// Removed verbose logging
				// Update the markdown part to finalize it
				const markdownPart = this.contentParts[markdownIndex];
				if (markdownPart && markdownPart.updateContent) {
					markdownPart.updateContent({
						...markdownData,
						isStreaming: false
					});
				}
				// Update data tracking
				this.contentPartsData[markdownIndex] = {
					...markdownData,
					isStreaming: false
				};
				// Removed verbose logging
			} else {
				// Removed verbose logging
			}
		} else {
			// Removed verbose logging
		}

		// CRITICAL: Clear the current block ID so next appendText creates a NEW block
		// Removed verbose logging
		this.currentMarkdownBlockId = null;
		// Reset accumulator for the next block
		this.accumulatedMarkdown = '';
	}

	/**
	 * Phase 7: Append plain text to markdown part (for assistant.delta events)
	 * Uses block-based tracking to ensure each markdown block is independent.
	 * When a block is finalized, new content creates a NEW block.
	 */
	public appendText(text: string): void {
		if (!text || text.length === 0) {
			return;
		}

		// Append text to accumulator first (before checking for duplicates)
		// This allows us to check the full accumulated content against existing blocks
		const testAccumulated = this.accumulatedMarkdown + text;


		// CRITICAL: Check if this content already exists in ANY markdown block
		// This prevents duplicates when final content arrives after streaming completes
		// Check BEFORE creating a new block ID
		const existingBlock = this.contentPartsData.find(d => {
			if (d.kind !== 'markdown') return false;
			const mdData = d as IVybeChatMarkdownContent;

			// CRITICAL FIX: Check if incoming text matches existing block's content EXACTLY
			// This catches cases where the backend sends the full content again as a "delta"
			// This is the most common duplicate case: backend sends full content that was already streamed
			if (mdData.content === text && text.length > 10) {
				return true;
			}

			// Check if incoming text is contained within existing content (backend sent full content that was already streamed)
			// This handles cases where the existing block has more content but the incoming text is a duplicate
			if (mdData.content.includes(text) && text.length > 50 && mdData.content.length >= text.length) {
				// Only match if the text is at the start (most common case) or if it's a substantial portion
				const textStartIndex = mdData.content.indexOf(text);
				if (textStartIndex === 0 || (textStartIndex >= 0 && text.length > mdData.content.length * 0.8)) {
					return true;
				}
			}

			// Check if the accumulated content matches an existing block's content exactly
			if (mdData.content === testAccumulated) {
				return true;
			}

			// Check if the incoming text (when accumulated is empty) matches a finalized block
			// This handles cases where a complete message arrives after a block was finalized and accumulator was reset
			if (this.accumulatedMarkdown === '' && !mdData.isStreaming && mdData.content === text) {
				return true;
			}

			// Check if the existing finalized block's content exactly matches the incoming accumulated content
			// This handles cases where the same full content is sent again
			if (!mdData.isStreaming && mdData.content === testAccumulated) {
				return true;
			}

			return false;
		});

		if (existingBlock) {
			// This content already exists - reuse the existing block instead of creating a duplicate
			const existingIndex = this.contentPartsData.findIndex(d => d === existingBlock);
			if (existingIndex >= 0) {
				const mdData = existingBlock as IVybeChatMarkdownContent;

				// CRITICAL: When duplicate is detected, DO NOT update the content
				// The existing block already has the correct content
				// Just ensure the block ID and accumulator are in sync
				this.currentMarkdownBlockId = mdData.id || null;

				// Set accumulator to match the existing block's content (not the doubled testAccumulated)
				// This ensures future chunks continue from the correct point
				this.accumulatedMarkdown = mdData.content;

				// DO NOT update the existing block - it already has the correct content
				// Just return early to prevent creating a duplicate
			}
			return; // Skip creating a duplicate
		}

		// No duplicate found - proceed with normal flow
		// If no current block ID, create a new one
		if (!this.currentMarkdownBlockId) {
			this.currentMarkdownBlockId = `md_${++this.markdownBlockCounter}`;
			this.accumulatedMarkdown = ''; // Reset accumulator for new block
		}

		// Append text to accumulator
		this.accumulatedMarkdown += text;

		// Find or create markdown part with the current block ID
		const existingIndex = this.contentPartsData.findIndex(d =>
			d.kind === 'markdown' && (d as IVybeChatMarkdownContent).id === this.currentMarkdownBlockId
		);

		if (existingIndex >= 0) {
			// Update existing part
			const existingPart = this.contentParts[existingIndex];
			if (existingPart && existingPart.updateContent) {
				existingPart.updateContent({
					kind: 'markdown',
					id: this.currentMarkdownBlockId,
					content: this.accumulatedMarkdown,
					isStreaming: true
				});
				// Update data tracking
				this.contentPartsData[existingIndex] = {
					kind: 'markdown',
					id: this.currentMarkdownBlockId,
					content: this.accumulatedMarkdown,
					isStreaming: true
				};
			}
		} else {
			// Create new markdown part with block ID
			const contentData: IVybeChatMarkdownContent = {
				kind: 'markdown',
				id: this.currentMarkdownBlockId,
				content: this.accumulatedMarkdown,
				isStreaming: true
			};
			const part = this.addContentPart(contentData);
			if (!part) {
				console.error(`[MessagePage] appendText: Failed to create markdown part for block ${this.currentMarkdownBlockId}!`);
			}
		}
	}

	/**
	 * Set markdown content directly (used by assistant.final to ensure completeness)
	 * This replaces accumulated content with the authoritative full_text
	 * ONLY if the content has actually changed - prevents unnecessary re-renders
	 */
	public setMarkdownContentIfChanged(fullText: string): void {
		// Removed verbose logging
		// CRITICAL: Only update if content actually changed
		// This prevents re-rendering code blocks unnecessarily, which causes flicker
		if (this.accumulatedMarkdown === fullText) {
			// Content matches - update data tracking and markdown part's streaming state
			// updateContent will detect content unchanged and skip re-render (code blocks preserved)
			const existingData = this.contentPartsData.find(d => d.kind === 'markdown') as IVybeChatMarkdownContent | undefined;
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
	 * Remove phase indicator content parts.
	 * Called when agent moves to next phase (no longer planning).
	 */
	public removePhaseIndicator(): void {
		// Find and remove all phase indicator parts
		// Work backwards to avoid index shifting issues
		for (let i = this.contentParts.length - 1; i >= 0; i--) {
			const part = this.contentParts[i];
			if (part.kind === 'phaseIndicator') {
				// Remove from arrays
				this.contentParts.splice(i, 1);
				// Find and remove corresponding data (should be at same index)
				if (i < this.contentPartsData.length && this.contentPartsData[i].kind === 'phaseIndicator') {
					this.contentPartsData.splice(i, 1);
				} else {
					// Fallback: find first phaseIndicator data
					const dataIndex = this.contentPartsData.findIndex(d => d.kind === 'phaseIndicator');
					if (dataIndex >= 0) {
						this.contentPartsData.splice(dataIndex, 1);
					}
				}
				// Remove from DOM (wrapper is the message bubble; fallback to part's parent if map missed)
				const wrapper = this.partToWrapperMap.get(part);
				if (wrapper) {
					wrapper.remove();
				} else if (part.domNode?.parentElement) {
					part.domNode.parentElement.remove();
				}
				this.partToWrapperMap.delete(part);
				// Dispose part
				part.dispose();
			}
		}
	}

	/**
	 * Clear all AI response content (partial response and tools) for "Try Again from scratch".
	 * Keeps the human message; next stream will fill the response area fresh.
	 */
	public clearAiContent(): void {
		for (let i = this.contentParts.length - 1; i >= 0; i--) {
			const part = this.contentParts[i];
			const wrapper = this.partToWrapperMap.get(part);
			if (wrapper) {
				wrapper.remove();
			} else if (part.domNode?.parentElement) {
				part.domNode.parentElement.remove();
			}
			this.partToWrapperMap.delete(part);
			part.dispose();
		}
		this.contentParts = [];
		this.contentPartsData = [];
		if (this.aiResponseArea) {
			while (this.aiResponseArea.firstChild) {
				this.aiResponseArea.removeChild(this.aiResponseArea.firstChild);
			}
		}
		this.accumulatedThinking = '';
		this.thinkingStartTime = null;
		this.thinkingFinalized = false;
		this.accumulatedMarkdown = '';
		this.accumulatedCodeBlocks.clear();
		this.activeCodeBlocks.clear();
		this.summaryByIndex.clear();
		this.currentBlockSummaryIndices.clear();
		this.currentMarkdownBlockId = null;
		this.blocks.clear();
		this.blockToPartMap.clear();
	}

	/**
	 * Update a content part by its ID
	 * Used to update tool content parts from loading → complete state
	 */
	public updateContentPartById(id: string, updates: Partial<IVybeChatContentData>): boolean {
		// Find content part by ID
		const index = this.contentPartsData.findIndex(data => (data as any).id === id);
		if (index === -1) {
			return false;
		}

		const existingData = this.contentPartsData[index];
		const existingPart = this.contentParts[index];

		// Merge updates into existing data
		const updatedData = { ...existingData, ...updates } as IVybeChatContentData;
		this.contentPartsData[index] = updatedData;

		// Update the part if it has an updateContent method
		if (existingPart && existingPart.updateContent) {
			existingPart.updateContent(updatedData);
		}

		// Update wrapper's data-tool-status attribute if isStreaming changed to false
		if (existingPart && 'isStreaming' in updates && updates.isStreaming === false) {
			this.updateToolStatus(existingPart, 'completed');
		}

		// Check for grouping when research action completes
		if (this.isResearchAction(updatedData) && !(updatedData as any).isStreaming) {
			setTimeout(() => {
				this.checkAndGroupResearchActions();
			}, 0);
		}

		return true;
	}

	/**
	 * REMOVED: addToolCall, removeToolCall, updateToolResult
	 * These methods created generic "vybe-tool-call" UI elements.
	 * We now use custom content parts instead (readingFiles, searched, etc.)
	 * No generic tool call UI is shown - only custom content parts after tool execution.
	 */

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
			return;
		}
		// Removed verbose logging
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
		// Removed verbose logging

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

		// CRITICAL: Use index-based matching to handle multiple markdown parts
		// Each part at index i corresponds to contentPartsData[i]
		for (let i = 0; i < this.contentParts.length; i++) {
			const part = this.contentParts[i];
			const partData = this.contentPartsData[i];

			if (!part.updateContent || !partData) {
				continue;
			}

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
				// Update the part with ITS OWN data (not first matching data)
				part.updateContent(updatedData);
				// Update contentPartsData to reflect finalization
				this.contentPartsData[i] = updatedData;
			} catch (error) {
				console.error('[MessagePage] Error updating content part during finalize:', error, {
					partKind: partData.kind,
					index: i,
					hasContent: !!(partData as any).content || !!(partData as any).value,
					contentLength: (partData as any).content ? (partData as any).content.length :
						((partData as any).value ? ((partData as any).value instanceof Array ? (partData as any).value.join('').length : (partData as any).value.length) : 0),
					errorMessage: error instanceof Error ? error.message : String(error)
				});
				// Don't re-throw - continue finalizing other parts
			}
		}

		// Phase indicators are now content parts, so they're handled automatically
	}

	/**
	 * Display error popup above composer
	 *
	 * This is the standard way to show error messages in VYBE Chat.
	 * All errors should use this method to ensure consistent UI.
	 *
	 * The popup will automatically:
	 * - Use composer background color (matches theme)
	 * - Set button variant based on count (single = primary/VYBE green, multiple = secondary)
	 * - Position above the composer input box
	 */
	public showError(message: string, code?: string, options?: {
		errorType?: 'network' | 'timeout' | 'bad_request' | 'crash' | 'unknown';
		canResume?: boolean;
		canRetry?: boolean;
		onResume?: () => void;
		onRetry?: () => void;
		onCancel?: () => void;
	}): void {
		// Check if composer is available
		if (!this.composer) {
			console.error('[MessagePage] Cannot show error: composer not available');
			return;
		}

		// Use the new composer warning popup (standard error display)
		const fullMessage = code ? `${message} (Code: ${code})` : message;

		console.log('[MessagePage] Showing error popup:', { message: fullMessage, errorType: options?.errorType, canResume: options?.canResume, canRetry: options?.canRetry });

		const buttons: Array<{ label: string; action: () => void; variant?: 'primary' | 'secondary' | 'tertiary' }> = [];

		// Add Resume button if recoverable
		if (options?.canResume && options?.onResume) {
			buttons.push({
				label: 'Resume',
				variant: 'primary',
				action: () => {
					this.composer.hideWarning();
					options.onResume?.();
				}
			});
		}

		// Add Try Again button if retry is possible
		if (options?.canRetry && options?.onRetry) {
			buttons.push({
				label: 'Try Again',
				variant: buttons.length === 0 ? 'primary' : 'secondary',
				action: () => {
					this.composer.hideWarning();
					options.onRetry?.();
				}
			});
		}

		// Add Cancel button
		if (options?.onCancel) {
			buttons.push({
				label: 'Cancel',
				variant: 'tertiary',
				action: () => {
					this.composer.hideWarning();
					options.onCancel?.();
				}
			});
		} else if (buttons.length === 0) {
			// Default: just a dismiss button if no actions available
			buttons.push({
				label: 'Dismiss',
				variant: 'tertiary',
				action: () => {
					this.composer.hideWarning();
				}
			});
		}

		// Determine title and icon based on error type
		let title = 'Error';
		let icon: 'error' | 'warning' | 'info' = 'error';

		if (options?.errorType === 'network') {
			title = 'Connection Error';
		} else if (options?.errorType === 'timeout') {
			title = 'Timeout Error';
		} else if (options?.errorType === 'bad_request') {
			title = 'Request Error';
		} else if (options?.errorType === 'crash') {
			title = 'Crash Recovery';
			icon = 'warning';
		}

		try {
		this.composer.showWarning({
				title,
			message: fullMessage,
				icon,
				showCloseButton: true,
				buttons,
				onClose: () => {
					// Popup was closed
					console.log('[MessagePage] Error popup closed');
				}
			});
			console.log('[MessagePage] Error popup shown successfully');
		} catch (error) {
			console.error('[MessagePage] Failed to show error popup:', error);
		}
	}

	/**
	 * Show recovery popup for incomplete tasks detected on startup.
	 */
	public showRecoveryPopup(task: {
		taskId: string;
		threadId: string;
		lastMessage: string;
		timestamp: number;
	}, options: {
		onResume?: () => void;
		onStartFresh?: () => void;
		onDismiss?: () => void;
	}): void {
		this.composer.showWarning({
			title: 'Incomplete Task Detected',
			message: 'A previous task was interrupted. You can resume from where it left off or start fresh.',
			icon: 'warning',
			showCloseButton: true,
			buttons: [
				{
					label: 'Resume',
					variant: 'primary',
					action: () => {
						this.composer.hideWarning();
						options.onResume?.();
					}
				},
				{
					label: 'Start Fresh',
					variant: 'secondary',
					action: () => {
						this.composer.hideWarning();
						options.onStartFresh?.();
					}
				},
				{
					label: 'Dismiss',
					variant: 'tertiary',
					action: () => {
						this.composer.hideWarning();
						options.onDismiss?.();
					}
				}
			],
			onClose: () => {
				options.onDismiss?.();
			}
		});
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
