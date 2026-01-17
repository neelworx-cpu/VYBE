/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/vybeChat.css';
import './contentParts/media/vybeChatThinking.css';
import './contentParts/media/vybeChatMarkdown.css';
import './contentParts/media/vybeChatCodeBlock.css';
import './contentParts/media/vybeChatTextEdit.css';
// import './contentParts/media/vybeChatPlanDocument.css'; // TODO: Re-enable after rebuild
import './contentParts/media/vybeChatTerminal.css';
import './contentParts/media/vybeChatPhaseIndicator.css';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { addDisposableListener, DragAndDropObserver, getWindow, getActiveWindow } from '../../../../base/browser/dom.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { getSessionIdFromViewId, VYBE_CHAT_NEW_CHAT_LABEL } from '../common/vybeChatConstants.js';
import { MessageComposer } from './components/composer/messageComposer.js';
import { ContextDropdown } from './components/composer/contextDropdown.js';
import { UsageDropdown } from './components/composer/usageDropdown.js';
import { MessagePage, MessagePageOptions } from './components/chatArea/messagePage.js';
import type { IVybeChatTodoContent, IVybeChatTodoItemContent, IVybeChatToolContent } from './contentParts/vybeChatContentPart.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ISpeechService } from '../../../contrib/speech/common/speechService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatRequestVariableEntry, IChatRequestFileEntry, IChatRequestStringVariableEntry } from '../../chat/common/chatVariableEntries.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IFileService, FileKind } from '../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData } from '../../../../platform/dnd/browser/dnd.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { basename, dirname, relativePath } from '../../../../base/common/resources.js';
import { IVybeAgentService } from '../../vybeAgent/common/vybeAgentService.js';
import { IVybeLLMModelService } from '../../vybeLLM/common/vybeLLMModelService.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
// LangGraph native streaming - direct event handling

/**
 * VYBE Chat View Pane
 * Each instance represents a single chat session as a tab in the composite bar
 */
export class VybeChatViewPane extends ViewPane {

	private readonly sessionId: string | undefined;
	private composer: MessageComposer | null = null;
	private contextDropdown: ContextDropdown | null = null;
	private usageDropdown: UsageDropdown | null = null;
	private dragAndDropObserver: DragAndDropObserver | null = null;
	private isDragAndDropSetup: boolean = false;
	private chatArea: HTMLElement | null = null;
	private messagePages: Map<string, MessagePage> = new Map();
	private messageIndex: number = 0;
	private currentStreamingMessageId: string | null = null;
	private autoScrollDisabled: boolean = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private wheelCheckTimeout: any = null;

	// Track incomplete todos across message pages
	private incompleteTodos: IVybeChatTodoContent | null = null;

	/**
	 * Track todos for persistence across message pages.
	 * Called whenever content updates to check for incomplete todos.
	 */
	private trackTodosForPersistence(messagePage: MessagePage): void {
		// Check for incomplete todos in the current page
		const incompleteTodos = messagePage.getIncompleteTodos();
		if (incompleteTodos) {
			// Track incomplete todos - they will attach to next message page if still incomplete
			this.incompleteTodos = incompleteTodos;
		} else {
			// All todos completed - clear tracking
			this.incompleteTodos = null;
		}
	}

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ISpeechService private readonly _speechService: ISpeechService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IVybeAgentService private readonly _agentService: IVybeAgentService,
		@IVybeLLMModelService private readonly _llmModelService: IVybeLLMModelService,
	) {
		super(
			{
				...options,
				titleMenuId: MenuId.ViewTitle, // Each view gets its own actions container
			},
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService
		);

		// Extract session ID from view ID
		this.sessionId = getSessionIdFromViewId(this.id);

		// Set initial title to "New Chat" - will be replaced by AI-generated name
		if (this.sessionId) {
			this.updateTitle(VYBE_CHAT_NEW_CHAT_LABEL);
		}

		// Since each session is in its own container with mergeViewWithContainerWhenSingleView: true,
		// the header will be automatically hidden
	}

	/**
	 * Update the chat session title (called when AI generates a name or user renames)
	 */
	updateChatTitle(title: string): void {
		this.updateTitle(title);
		// TODO: Update the view descriptor name so it shows in the composite bar tab
	}

	/**
	 * Get the session ID for this chat view
	 */
	getSessionId(): string | undefined {
		return this.sessionId;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Set up container styling
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.height = '100%';
		container.style.overflow = 'hidden';

		// Expose pane instance for testing
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(container as any).__vybePane = this;

		// Chat messages area - scroll container with HIDDEN scrollbar
		this.chatArea = document.createElement('div');
		this.chatArea.className = 'vybe-chat-messages-area';
		this.chatArea.style.cssText = `
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 0;
			padding-bottom: 20px;
			box-sizing: border-box;
			width: 100%;
			scroll-behavior: smooth;
		`;
		container.appendChild(this.chatArea);

		// Track when user manually scrolls with wheel
		this._register(addDisposableListener(this.chatArea, 'wheel', (e) => {
			if (!this.chatArea) {
				return;
			}

			const deltaY = (e as WheelEvent).deltaY;

			// If scrolling UP (negative delta), disable auto-scroll immediately
			if (deltaY < 0) {
				if (!this.autoScrollDisabled) {
					console.log('[Scroll] User scrolled UP - auto-scroll disabled');
					this.autoScrollDisabled = true;
				}
			}

			// Clear any pending check
			if (this.wheelCheckTimeout) {
				clearTimeout(this.wheelCheckTimeout);
			}

			// After wheel events stop (200ms debounce), check if at bottom to re-enable
			this.wheelCheckTimeout = setTimeout(() => {
				if (!this.chatArea) {
					return;
				}

				const scrollTop = this.chatArea.scrollTop;
				const scrollHeight = this.chatArea.scrollHeight;
				const clientHeight = this.chatArea.clientHeight;
				const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

				// Only re-enable if truly at bottom
				if (distanceFromBottom < 50) {
					if (this.autoScrollDisabled) {
						console.log('[Scroll] User at bottom - auto-scroll re-enabled');
					}
					this.autoScrollDisabled = false;
				}
			}, 200);
		}));


		// Render composer at the bottom
		this.composer = this._register(this.instantiationService.createInstance(MessageComposer, container, this._speechService, false, false));

		// VYBE-PATCH-START: test-helpers
		// Expose composer globally for testing
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__vybeComposer = this.composer;
		// Helper function to test warning popup
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).testComposerWarning = (type: 'error' | 'warning' | 'info' = 'error') => {
			if (this.composer) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(this.composer as any).testWarning(type);
			} else {
				console.warn('Composer not available');
			}
		};
		// Test function for TODO component
		// Capture 'this' in closure so it works when called from console
		const self = this;

		// Test function for sticky TODO container (attached to human message)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__vybeTestStickyTODO = () => {
			// Get the last message page
			const pages = Array.from(self.messagePages.values());
			const lastPage = pages[pages.length - 1];

			if (!lastPage) {
				console.warn('No message page found. Send a message first.');
				return;
			}

			// Create incomplete todos (some pending, some in-progress, but not all completed)
			const testTodoData: IVybeChatTodoContent = {
				kind: 'todo',
				id: `test-sticky-todo-${Date.now()}`,
				items: [
					{
						id: 'todo-1',
						text: 'Create vybePromptConfig.ts with L1/L2/L3 budget tier definitions',
						status: 'completed',
						order: 1
					},
					{
						id: 'todo-2',
						text: 'Create vybeMiddlewareStack.ts with LangChain built-in and custom middleware',
						status: 'in-progress',
						order: 2
					},
					{
						id: 'todo-3',
						text: 'Create vybeDynamicPrompt.ts using dynamicSystemPromptMiddleware pattern',
						status: 'pending',
						order: 3
					},
					{
						id: 'todo-4',
						text: 'Update agentModeDropdown.ts descriptions and wire level to IPC',
						status: 'pending',
						order: 4
					}
				],
				isExpanded: true,
				isAttachedToHuman: true, // Set to true to test attachment
				currentRunningTodo: undefined
			};

			// Attach directly to human message (for testing)
			const part = lastPage.attachTodoToHumanMessage(testTodoData);
			if (part) {
				console.log('✅ TODO component attached to human message!', part);
				console.log('📋 This simulates what happens when incomplete todos persist to the next message page.');
			} else {
				console.error('❌ Failed to attach TODO component to human message');
			}
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__vybeTestTODO = () => {
			// Get the last message page (or current streaming one)
			const pages = Array.from(self.messagePages.values());
			const lastPage = pages[pages.length - 1];

			if (!lastPage) {
				console.warn('No message page found. Send a message first.');
				return;
			}

			// Create test todo data with at least 2 items
			const testTodoData: IVybeChatTodoContent = {
				kind: 'todo',
				id: `test-todo-${Date.now()}`,
				items: [
					{
						id: 'todo-1',
						text: 'Create vybePromptConfig.ts with L1/L2/L3 budget tier definitions',
						status: 'completed',
						order: 1
					},
					{
						id: 'todo-2',
						text: 'Create vybeMiddlewareStack.ts with LangChain built-in and custom middleware',
						status: 'in-progress',
						order: 2
					},
					{
						id: 'todo-3',
						text: 'Create vybeDynamicPrompt.ts using dynamicSystemPromptMiddleware pattern',
						status: 'pending',
						order: 3
					},
					{
						id: 'todo-4',
						text: 'Update agentModeDropdown.ts descriptions and wire level to IPC',
						status: 'pending',
						order: 4
					},
					{
						id: 'todo-5',
						text: 'Update vybeLangGraphService.ts with middleware stack and budget tracking',
						status: 'pending',
						order: 5
					},
					{
						id: 'todo-6',
						text: 'Add IPC channel for passing selected level from UI to agent',
						status: 'pending',
						order: 6
					}
				],
				isExpanded: true, // Start expanded
				isAttachedToHuman: false,
				currentRunningTodo: undefined // Set this to test "Running to-do" display
			};

			// Add to message page
			const part = lastPage.addContentPart(testTodoData);
			if (part) {
				console.log('✅ TODO component added successfully!', part);

				// Also add a test todo item indicator
				const testTodoItemData: IVybeChatTodoItemContent = {
					kind: 'todoItem',
					id: `test-todo-item-${Date.now()}`,
					toolCallId: `test-tool-call-${Date.now()}`,
					status: 'started',
					text: 'Create vybeMiddlewareStack.ts with LangChain built-in and custom middleware'
				};

				const itemPart = lastPage.addContentPart(testTodoItemData);
				if (itemPart) {
					console.log('✅ TODO item indicator added successfully!', itemPart);
				}
			} else {
				console.error('❌ Failed to add TODO component');
			}
		};
		// VYBE-PATCH-END: test-helpers

		// Set up drag and drop for the composer
		this.setupComposerDragAndDrop();

		// Set up composer event handlers
		this._register(this.composer.onSend(message => {
			void this.handleSendMessage(message);
		}));

		this._register(this.composer.onStop(() => {
			this.handleStopGeneration();
			// Composer automatically switches back to send button in its click handler
		}));

		// Context dropdown - create on demand when context button is clicked
		this._register(this.composer.onContextClick(() => {
			const contextButton = this.composer!.getContextButton();
			if (contextButton) {
				if (!this.contextDropdown) {
					this.contextDropdown = this._register(this.instantiationService.createInstance(
						ContextDropdown,
						contextButton
					));

					// Set up pill insert callback
					this.contextDropdown.setPillInsertCallback((type, name, path, iconClasses) => {
						if (this.composer) {
							this.composer.insertContextPill(type, name, path, iconClasses);
						}
					});
				}

				// Update current session files before showing
				if (this.composer) {
					const contextPills = this.composer.getContextPillsData();
					const workspace = this.workspaceContextService.getWorkspace();
					const workspaceRoot = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;

					const sessionFiles = contextPills
						.filter(pill => pill.type === 'file' && pill.path)
						.map(pill => {
							// Try to construct URI from path
							let uri: URI | undefined;
							try {
								if (pill.path && workspaceRoot) {
									// Path is relative to workspace root, construct full URI
									const fullPath = pill.path.endsWith('/') || pill.path.endsWith('\\')
										? `${pill.path}${pill.name}`
										: `${pill.path}/${pill.name}`;
									// Remove leading slash if present
									const cleanPath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
									uri = URI.joinPath(workspaceRoot, cleanPath);
								}
							} catch (e) {
								// Ignore URI construction errors
							}
							return {
								name: pill.name,
								path: pill.path || '',
								uri: uri
							};
						});
					this.contextDropdown.setCurrentSessionFiles(sessionFiles);
				}

				this.contextDropdown.show();
			}
		}));

		// Usage dropdown - create on demand when progress circle is clicked
		this._register(this.composer.onUsageClick(() => {
			const progressContainer = this.composer!.getProgressContainer();
			if (progressContainer) {
				if (!this.usageDropdown) {
					this.usageDropdown = this._register(this.instantiationService.createInstance(
						UsageDropdown,
						progressContainer
					));
				}
				// Pass current model state to usage dropdown
				const modelState = this.composer!.getModelState();
				this.usageDropdown.show(modelState);
			}
		}));
	}

	private async handleSendMessage(message: string): Promise<void> {
		// Don't reset todo tracking here - let it persist across message pages
		// The tracking will be updated as todos are completed via trackTodosForPersistence
		if (!this.chatArea || !message.trim()) {
			return;
		}

		// Create message page
		const messageId = `msg-${Date.now()}`;
		this.currentStreamingMessageId = messageId; // Track current streaming message

		// Capture full composer state (pills, images)
		const contextPills = this.composer ? this.composer.getContextPillsData() : [];
		const images = this.composer ? this.composer.getImagesData() : [];

		// Debug: Log pills data when sending message
		if (contextPills.length > 0) {
			console.log('[VYBE Chat] Sending message with pills:', contextPills.map(p => ({
				type: p.type,
				name: p.name,
				hasValue: !!p.value,
				valueLength: p.value?.length || 0
			})));
		}

		const options: MessagePageOptions = {
			messageId,
			messageIndex: this.messageIndex++,
			content: message,
			contextPills: contextPills,
			images: images,
			isStreaming: true, // Start in streaming state
			speechService: this._speechService,
			instantiationService: this.instantiationService,
			onStop: () => {
				// Stop streaming for this message
				const page = this.messagePages.get(messageId);
				if (page) {
					page.setStreaming(false);
				}
				// Clear current streaming message
				if (this.currentStreamingMessageId === messageId) {
					this.currentStreamingMessageId = null;
				}
				// Switch main composer back to send button
				if (this.composer) {
					this.composer.switchToSendButton();
				}
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onComposerSend: (content: string, pills: any[], images: any[], agentMode: any, modelState: any) => {
				// Update the message page with new content
				const page = this.messagePages.get(messageId);
				if (page) {
					page.updateContent(content, pills, images, agentMode, modelState);
				}
				// TODO: Send updated message to AI service
			},
			onContentUpdate: () => {
				// Smart scroll when content changes (streaming, new elements, etc.)
				this.scrollToShowLatestContent();

				// Track todos and todoItem parts for cross-page persistence
				this.trackTodosForPersistence(messagePage);
			}
		};

		const messagePage = this._register(new MessagePage(
			this.chatArea,
			options,
			this.markdownRendererService,
			this._modelService,
			this._languageService,
			this.instantiationService,
			this._clipboardService,
			this._editorService,
			this._fileService,
			this._notificationService,
			this.workspaceContextService
		));
		this.messagePages.set(messageId, messagePage);

		// Check if there are incomplete todos from previous page that need to be attached
		// Attach to human message in the next chat pair if todos are still incomplete
		if (this.incompleteTodos) {
			// Check if todos are still incomplete (not all completed)
			const incompleteCount = this.incompleteTodos.items.filter(item => item.status !== 'completed').length;
			if (incompleteCount > 0) {
				// Attach todos to the human message in this new page
				messagePage.attachTodoToHumanMessage(this.incompleteTodos);
				// Keep tracking - they're attached but we still need to track for next page if still incomplete
				// The tracking will be updated as todos are completed
			} else {
				// All completed - clear tracking
				this.incompleteTodos = null;
			}
		}

		// Scroll to show new message (smooth scroll within chat area only)
		const targetWindow = this.chatArea ? getWindow(this.chatArea) : getActiveWindow();
		targetWindow.requestAnimationFrame(() => {
			if (this.chatArea) {
				// Calculate the position of the message page within the chat area
				const messageElement = messagePage.getElement();
				const chatAreaRect = this.chatArea.getBoundingClientRect();
				const messageRect = messageElement.getBoundingClientRect();

				// Scroll chat area to bring message to the top
				const scrollOffset = messageRect.top - chatAreaRect.top + this.chatArea.scrollTop;
				this.chatArea.scrollTop = scrollOffset;
			}
		});

		// Convert context pills to AI service format
		await this.convertContextPillsToVariableEntries(contextPills);

		// Use LangGraph agent service
		// Get workspace folder for repoId
		const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
		if (!workspaceFolder) {
			this._notificationService.error('No workspace folder found. Please open a workspace.');
			return;
		}

		// Extract file paths from context pills
		const files: string[] = [];
		for (const pill of contextPills) {
			if (pill.type === 'file' && pill.path) {
				// Convert absolute path to relative path from workspace
				try {
					const fileUri = URI.parse(pill.path);
					const workspaceUri = workspaceFolder.uri;
					// Get relative path: if file is within workspace, get relative path
					if (workspaceUri.scheme === fileUri.scheme && workspaceUri.authority === fileUri.authority) {
						const relPath = relativePath(workspaceUri, fileUri);
						if (relPath) {
							files.push(relPath);
						}
					}
				} catch (error) {
					// Skip invalid URIs
				}
			}
		}

		// Set streaming state
		messagePage.setStreaming(true);

		try {
			// Get selected mode and level from composer (defaults if not available)
			const selectedMode = this.composer?.getAgentMode() || 'agent';
			const selectedLevel = this.composer?.getAgentLevel() || 'L2';
			const modelState = this.composer?.getModelState();
			const selectedModelId = modelState?.selectedModelId;

			// Generate taskId first (we'll use it for event subscription)
			const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

			// Subscribe to streaming events BEFORE starting the task
			let eventSubscription: IDisposable | null = null;
			let hasReceivedEvents = false;

			// Track when tool parts are created to ensure minimum display time for "Reading" state
			const toolCreationTimes = new Map<string, number>();
			const TOOL_MIN_DISPLAY_MS = 1500; // Minimum time to show "Reading" before transitioning to "Read" (1.5 seconds)

			// Track when tools complete to add delay before next tool call starts
			let lastToolCompletionTime = 0;
			const TOOL_COMPLETION_DELAY_MS = 500; // Delay after tool completes before next tool call can start (500ms)

			// Track tool parts by toolType:target to prevent duplicates
			// Key: "toolType:target", Value: toolId
			const toolPartsByTarget = new Map<string, string>();

			// LangGraph native streaming - direct event handling
			// Events: token, tool.result, complete
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			eventSubscription = this._agentService.onDidEmitEvent((event: any) => {
				const eventTaskId = event?.task_id || '';
				const taskIdMatches = eventTaskId === taskId || eventTaskId.startsWith(taskId) || taskId.startsWith(eventTaskId);

				if (!event?.type || !taskIdMatches) {
					return;
				}

				hasReceivedEvents = true;
				// Removed verbose logging

				switch (event.type) {
					case 'token': {
						// Handle token events - can contain text, thinking, or tool calls
						const payload = event.payload || {};

						// Removed verbose logging

						// Handle thinking content
						if (payload.thinking) {
							// Removed verbose logging
							// Remove phase indicator when content starts arriving
							messagePage.removePhaseIndicator();
							messagePage.appendThinkingChunk(payload.thinking);
							if (options.onContentUpdate) {
								options.onContentUpdate();
							}
						}

						// Handle text content
						if (payload.content) {
							// Removed verbose logging
							// Remove phase indicator when content starts arriving
							messagePage.removePhaseIndicator();
							messagePage.finalizeThinking();
							messagePage.appendText(payload.content);
							// CRITICAL: Trigger UI update after appending text
							if (options.onContentUpdate) {
								options.onContentUpdate();
							}
						}

						// Handle tool calls
						if (payload.tool_call) {
							const tc = payload.tool_call;
							const toolId = tc.id || `tool_${Date.now()}`;
							const toolName = tc.name || 'unknown';
							let toolArgs: Record<string, unknown> = {};
							try {
								toolArgs = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
							} catch (e) {
								console.warn('[VYBE Chat] Failed to parse tool args:', e);
							}

							// Removed verbose logging

							// Helper function to process the tool call
							const processToolCall = () => {
								// Finalize current markdown block before adding tool UI
								// This ensures markdown before and after tools are in separate groups
								messagePage.finalizeCurrentMarkdown();

								// Remove phase indicator when tool call starts
								messagePage.removePhaseIndicator();

								// Map tool name to unified tool type
								let toolType: 'read' | 'list' | 'grep' | 'search' | 'search_web' | 'todos' | null = null;
								let target = '';
								let filePath: string | undefined = undefined;
								let lineRange: { start: number; end: number } | undefined = undefined;

								if (toolName === 'read_file') {
									toolType = 'read';
									// Try multiple possible parameter names (check in order of likelihood)
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									const toolArgsAny = toolArgs as any;
									const fullFilePath = toolArgsAny?.target_file
										|| toolArgsAny?.path
										|| toolArgsAny?.file_path
										|| toolArgsAny?.file
										|| '';


									// Extract filename from path (handle both / and \ separators)
									if (fullFilePath) {
										// Remove leading/trailing slashes and split
										const cleanPath = fullFilePath.replace(/^[/\\]+|[/\\]+$/g, '');
										const pathParts = cleanPath.split(/[/\\]/);
										target = pathParts[pathParts.length - 1] || cleanPath || 'file';
										filePath = fullFilePath; // Store full path for opening files

										// If target is still empty or just "file", try to extract from full path differently
										if (!target || target === 'file' || target === fullFilePath) {
											// Try to get just the filename part
											const match = fullFilePath.match(/([^/\\]+)$/);
											if (match && match[1]) {
												target = match[1];
											} else {
												target = fullFilePath || 'file';
											}
										}
									} else {
										console.warn(`[VYBE Chat] ⚠️ No file path found in tool args for read_file. Full toolArgs:`, JSON.stringify(toolArgs));
										target = 'file'; // Fallback
									}

									// Extract line range if provided
									const startLine = toolArgsAny?.startLine ?? toolArgsAny?.offset;
									const endLine = toolArgsAny?.endLine ?? (toolArgsAny?.offset !== undefined && toolArgsAny?.limit !== undefined
										? toolArgsAny.offset + toolArgsAny.limit - 1
										: undefined);
									if (startLine !== undefined && endLine !== undefined) {
										lineRange = { start: startLine, end: endLine };
									}

									// Removed verbose logging

									// CRITICAL: If target is still empty or generic, log error
									if (!target || target === 'file') {
										console.error(`[VYBE Chat] ❌ Failed to extract filename! target="${target}", fullFilePath="${fullFilePath}", toolArgs:`, JSON.stringify(toolArgs));
									}
								} else if (toolName === 'list_dir') {
									toolType = 'list';
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									const toolArgsAny = toolArgs as any;
									target = toolArgsAny?.path || toolArgsAny?.target_directory || '.';
								} else if (toolName === 'grep') {
									toolType = 'grep';
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									target = (toolArgs as any)?.pattern || '';
								} else if (toolName === 'search' || toolName === 'codebase_search') {
									toolType = 'search';
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									const toolArgsAny = toolArgs as any;
									target = toolArgsAny?.query || toolArgsAny?.pattern || '';
								} else if (toolName === 'search_web' || toolName === 'web_search') {
									toolType = 'search_web';
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									target = (toolArgs as any)?.query || '';
								} else if (toolName === 'get_todos' || toolName === 'list_todos' || toolName === 'check_todos') {
									toolType = 'todos';
									target = 'todos';
								}

								// Create unified tool content part
								if (toolType) {
									// Removed verbose logging

									// Log if target is empty (for debugging)
									if (!target || target === 'file') {
										console.warn(`[VYBE Chat] ⚠️ Empty target for tool: ${toolName}, using fallback`);
									}

									// Check for duplicate tool parts with same toolType:target
									const targetKey = `${toolType}:${target}`;
									const existingToolId = toolPartsByTarget.get(targetKey);

									if (existingToolId) {
										// Duplicate detected - update existing part instead of creating new one
										console.log(`[VYBE Chat] 🔄 Duplicate tool detected: ${toolType} "${target}" (existing id: ${existingToolId}, new id: ${toolId})`);
										// Map the new toolId to the existing one for tool.result handling
										toolPartsByTarget.set(toolId, existingToolId);
									} else {
										// Create new tool part
										const toolContentData: IVybeChatToolContent = {
											kind: 'tool',
											id: toolId,
											toolType: toolType,
											target: target || 'file', // Fallback to 'file' if empty
											filePath: filePath, // Full path for opening files (read operations only)
											lineRange: lineRange,
											isStreaming: true
										};

										const part = messagePage.addContentPart(toolContentData, toolId);
										const partCreated = !!part;
										// Removed verbose logging

										if (!partCreated) {
											console.error(`[VYBE Chat] ⚠️ Failed to create tool part for: ${toolName} (id: ${toolId})`);
										} else {
											// Record creation time for minimum display duration
											toolCreationTimes.set(toolId, Date.now());
											// Track this tool part for duplicate detection
											toolPartsByTarget.set(targetKey, toolId);
											// Removed verbose logging
										}
									}
								} else {
									console.warn(`[VYBE Chat] Unknown tool name: ${toolName}, not creating UI component`);
								}
							};

							// Check if we need to delay before processing this tool call
							// This ensures previous tool UI is visible and AI has time to process results
							const timeSinceLastCompletion = Date.now() - lastToolCompletionTime;
							if (timeSinceLastCompletion < TOOL_COMPLETION_DELAY_MS) {
								const delay = TOOL_COMPLETION_DELAY_MS - timeSinceLastCompletion;
								setTimeout(processToolCall, delay);
							} else {
								// No delay needed, process immediately
								processToolCall();
							}
						}

						if (options.onContentUpdate) {
							options.onContentUpdate();
						}
						break;
					}

					case 'tool.result': {
						// Update tool content part to complete state
						let toolId = event.payload?.tool_id;
						const toolName = event.payload?.tool_name;
						const toolResult = event.payload?.result;
						// Removed verbose logging

						// Check if this toolId was mapped to an existing one (duplicate detection)
						const mappedToolId = toolPartsByTarget.get(toolId);
						if (mappedToolId && mappedToolId !== toolId) {
							console.log(`[VYBE Chat] 🔄 Using mapped tool ID: ${toolId} -> ${mappedToolId}`);
							toolId = mappedToolId;
						}

						// Detect errors from result string
						let toolError: { code: string; message: string } | undefined;
						if (typeof toolResult === 'string' && toolResult.trim().startsWith('Error:')) {
							const errorMessage = toolResult.trim().replace(/^Error:\s*/i, '');
							toolError = {
								code: 'TOOL_ERROR',
								message: errorMessage
							};
							console.log(`[VYBE Chat] ❌ Tool error detected: ${errorMessage}`);
						}

						// Parse results based on tool type (only if no error)
						let fileList: Array<{ name: string; type: 'file' | 'directory'; path: string }> | undefined;
						let searchResults: Array<{ file: string; path: string; lineRange?: { start: number; end: number } }> | undefined;
						let grepResults: Array<{ file: string; path: string; matchCount: number }> | undefined;
						let webSearchContent: string | undefined;
						let todoItems: Array<{ id: string; text: string; status: 'pending' | 'in-progress' | 'completed' }> | undefined;

						if (toolName === 'list_dir' && !toolError) {
							// Check if fileList is directly provided in payload
							if (event.payload?.fileList && Array.isArray(event.payload.fileList)) {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								fileList = event.payload.fileList.map((entry: any) => ({
									name: entry.name || '',
									type: entry.type === 'directory' ? 'directory' : 'file',
									path: entry.name || entry.path || ''
								}));
								console.log(`[VYBE Chat] 📁 Got ${fileList?.length ?? 0} files from fileList payload`);
							} else if (toolResult) {
								// Fallback: try to parse from result string
								try {
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									let parsed: any;
									if (typeof toolResult === 'string') {
										parsed = JSON.parse(toolResult);
									} else {
										parsed = toolResult;
									}

									// Handle array of DirectoryEntry objects
									if (Array.isArray(parsed)) {
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										fileList = parsed.map((entry: any) => ({
											name: entry.name || '',
											type: entry.type === 'directory' ? 'directory' : 'file',
											path: entry.name || entry.path || ''
										}));
										console.log(`[VYBE Chat] 📁 Parsed ${fileList.length} files from list_dir result`);
									}
								} catch (error) {
									console.warn(`[VYBE Chat] ⚠️ Failed to parse list_dir result:`, error, `Result: ${typeof toolResult === 'string' ? toolResult.substring(0, 200) : toolResult}`);
								}
							}
						}

						// Parse search results for codebase search
						if ((toolName === 'search' || toolName === 'codebase_search') && !toolError) {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							let parsedSearchResults: any[] = [];

							// Check if backend sent structured searchResults (preferred)
							if (event.payload?.searchResults && Array.isArray(event.payload.searchResults)) {
								parsedSearchResults = event.payload.searchResults;
								console.log(`[VYBE Chat] 🔍 ✅ Using backend searchResults: ${parsedSearchResults.length} results`);
							} else {
								try {
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									let parsed: any;
									if (typeof toolResult === 'string') {
										parsed = JSON.parse(toolResult);
									} else {
										parsed = toolResult;
									}

									if (parsed && parsed.results && Array.isArray(parsed.results)) {
										parsedSearchResults = parsed.results;
										console.log(`[VYBE Chat] 🔍 ✅ Parsed search results from JSON: ${parsedSearchResults.length} results`);
									}
								} catch (error) {
									console.warn(`[VYBE Chat] 🔍 ⚠️ Failed to parse codebase_search result:`, error);
								}
							}

							// Format results for UI
							if (parsedSearchResults.length > 0) {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								searchResults = parsedSearchResults.map((r: any) => ({
									file: r.file || r.path?.split('/').pop() || '',
									path: r.path || r.file || '',
									lineRange: r.lineRange ? {
										start: r.lineRange.start || r.lineRange.startLineNumber || 1,
										end: r.lineRange.end || r.lineRange.endLineNumber || r.lineRange.start || 1,
									} : undefined,
								}));
								console.log(`[VYBE Chat] 🔍 ✅ Formatted ${searchResults.length} search results for UI`);
							} else {
								searchResults = [];
								console.log(`[VYBE Chat] 🔍 ℹ️ No search results found`);
							}
						}

						// Parse grep results - check for structured data from backend first
						if (toolName === 'grep' && !toolError) {
							// Initialize to empty array - will be populated if parsing succeeds
							grepResults = [];

							console.log(`[VYBE Chat] 🔍 Parsing grep result:`, {
								hasPayloadGrepResults: !!event.payload?.grepResults,
								payloadGrepResultsLength: event.payload?.grepResults?.length,
								hasTotalMatches: event.payload?.totalMatches !== undefined,
								hasTruncated: event.payload?.truncated !== undefined,
								toolResultType: typeof toolResult,
								toolResultPreview: typeof toolResult === 'string' ? toolResult.substring(0, 200) : (toolResult ? 'object' : 'null')
							});

							// Check if backend sent structured grepResults (preferred - ALWAYS use this if available)
							if (event.payload?.grepResults && Array.isArray(event.payload.grepResults)) {
								// Validate array structure
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								const validResults = event.payload.grepResults.filter((r: any) =>
									r && typeof r === 'object' &&
									typeof r.file === 'string' &&
									typeof r.path === 'string' &&
									typeof r.matchCount === 'number'
								);

								if (validResults.length > 0) {
									grepResults = validResults;
									console.log(`[VYBE Chat] 🔍 ✅ Using backend grepResults: ${validResults.length} files (validated ${validResults.length}/${event.payload.grepResults.length})`);
								} else if (event.payload.grepResults.length === 0) {
									// Empty array is valid (no matches found)
									grepResults = [];
									console.log(`[VYBE Chat] 🔍 ℹ️ Backend returned empty grepResults (0 matches)`);
								} else {
									// Invalid structure - log warning but try to use it anyway
									console.warn(`[VYBE Chat] 🔍 ⚠️ Backend grepResults has invalid structure, attempting to use anyway`);
									grepResults = event.payload.grepResults;
								}
							} else if (typeof toolResult === 'string') {
								// Only parse string if backend didn't provide structured data
								// Try JSON parsing first (VS Code search service returns JSON)
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								let parsed: any = null;
								try {
									// Check if it looks like JSON
									if (toolResult.trim().startsWith('{') || toolResult.trim().startsWith('[')) {
										// Try to parse, but handle truncated JSON gracefully
										// If JSON is truncated, try to extract what we can
										let jsonStr = toolResult.trim();

										// If it's truncated JSON, try to close it properly
										if (jsonStr.startsWith('{') && !jsonStr.endsWith('}')) {
											// Try to find the last complete match object
											// Look for the pattern: }, (end of a match object)
											const lastCompleteMatch = jsonStr.lastIndexOf('},');
											if (lastCompleteMatch > 0) {
												// Extract up to the last complete match and close the array and object
												jsonStr = jsonStr.substring(0, lastCompleteMatch + 1) + ']}';
											} else if (jsonStr.includes('"matches":[')) {
												// At least try to close the matches array
												// Remove trailing comma if present
												jsonStr = jsonStr.replace(/,\s*$/, '') + ']}';
											}
										}

										parsed = JSON.parse(jsonStr);
										// Removed verbose logging
									}
								} catch (jsonError) {
									console.log(`[VYBE Chat] 🔍 JSON parse failed:`, jsonError);
									console.log(`[VYBE Chat] 🔍 Will try string format`);
								}

								if (parsed && parsed.matches && Array.isArray(parsed.matches)) {
									// Group matches by file and count
									const fileMap = new Map<string, number>();
									for (const match of parsed.matches) {
										const filePath = match.file || match.path || '';
										if (filePath) {
											fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
										}
									}

									if (fileMap.size > 0) {
										grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
											const pathParts = path.split(/[/\\]/);
											return {
												file: pathParts[pathParts.length - 1] || path,
												path: path,
												matchCount: count
											};
										});
										console.log(`[VYBE Chat] 🔍 ✅ Parsed ${grepResults.length} grep result files from JSON format`);
									} else if (parsed.matches.length === 0) {
										// Empty matches array - this is valid, not an error
										grepResults = [];
										console.log(`[VYBE Chat] 🔍 ℹ️ Grep returned 0 matches (empty matches array)`);
									} else {
										// Matches exist but no file paths found
										grepResults = [];
										console.warn(`[VYBE Chat] 🔍 ⚠️ Parsed JSON but couldn't extract file paths. Sample matches:`, parsed.matches?.slice(0, 3));
									}

									// Extract totalMatches and truncated from parsed result if not already set
									if (parsed.totalMatches !== undefined && !event.payload?.totalMatches) {
										event.payload = event.payload || {};
										event.payload.totalMatches = parsed.totalMatches;
									}
									if (parsed.truncated !== undefined && !event.payload?.truncated) {
										event.payload = event.payload || {};
										event.payload.truncated = parsed.truncated;
									}
								} else {
									// Fallback: Parse plain string format "file:line:content\nfile:line:content..."
									// This is the format returned by fileService.grep() (not VS Code search service)
									console.log(`[VYBE Chat] 🔍 Attempting to parse string format`);
									try {
										const lines = toolResult.split('\n').filter(line => line.trim());
										const fileMap = new Map<string, number>();

										for (const line of lines) {
											// Format: "file:line:content"
											const match = line.match(/^(.+?):(\d+):(.+)$/);
											if (match) {
												const filePath = match[1];
												fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
											}
										}

										if (fileMap.size > 0) {
											grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
												const pathParts = path.split(/[/\\]/);
												return {
													file: pathParts[pathParts.length - 1] || path,
													path: path,
													matchCount: count
												};
											});
											console.log(`[VYBE Chat] 🔍 ✅ Parsed ${grepResults.length} grep result files from string format:`, grepResults);
										}
									} catch (error) {
										const errorMsg = error instanceof Error ? error.message : String(error);
										console.warn(`[VYBE Chat] ⚠️ Failed to parse grep result from string:`, errorMsg);
										// Ensure grepResults is set even on error
										if (!grepResults || grepResults.length === 0) {
											grepResults = [];
										}
									}
								}

								// Final fallback: ensure grepResults is always an array
								if (!Array.isArray(grepResults)) {
									console.warn(`[VYBE Chat] 🔍 ⚠️ grepResults is not an array after parsing, setting to empty array`);
									grepResults = [];
								}
							} else if (toolResult && typeof toolResult === 'object') {
								// Already an object, check for matches
								const objResult = toolResult as any;
								console.log(`[VYBE Chat] 🔍 Parsing object result:`, {
									hasMatches: !!objResult.matches,
									matchCount: objResult.matches?.length || 0,
									totalMatches: objResult.totalMatches,
									truncated: objResult.truncated
								});

								if (objResult.matches && Array.isArray(objResult.matches)) {
									const fileMap = new Map<string, number>();
									for (const match of objResult.matches) {
										const filePath = match.file || match.path || '';
										if (filePath) {
											fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
										}
									}

									if (fileMap.size > 0) {
										grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
											const pathParts = path.split(/[/\\]/);
											return {
												file: pathParts[pathParts.length - 1] || path,
												path: path,
												matchCount: count
											};
										});
										console.log(`[VYBE Chat] 🔍 ✅ Parsed ${grepResults.length} grep result files from object format`);
									} else if (objResult.matches.length === 0) {
										grepResults = [];
										console.log(`[VYBE Chat] 🔍 ℹ️ Grep returned 0 matches (empty matches array from object)`);
									}

									// Extract totalMatches and truncated from object result if not already set
									if (objResult.totalMatches !== undefined && !event.payload?.totalMatches) {
										event.payload = event.payload || {};
										event.payload.totalMatches = objResult.totalMatches;
									}
									if (objResult.truncated !== undefined && !event.payload?.truncated) {
										event.payload = event.payload || {};
										event.payload.truncated = objResult.truncated;
									}
								}
							}

							// Ensure grepResults is always an array for grep tool calls
							if (!grepResults) {
								grepResults = [];
								console.log(`[VYBE Chat] 🔍 ℹ️ No grep results parsed, setting empty array`);
							}
						}

						// Parse web search content
						if ((toolName === 'search_web' || toolName === 'web_search') && !toolError) {
							if (typeof toolResult === 'string') {
								webSearchContent = toolResult;
							} else if (toolResult && typeof toolResult === 'object') {
								// Try to extract markdown content from result
								webSearchContent = (toolResult as any).content || (toolResult as any).markdown || JSON.stringify(toolResult, null, 2);
							}
							console.log(`[VYBE Chat] 🌐 Parsed web search content (${webSearchContent?.length || 0} chars)`);
						}

						// Parse todo items
						if ((toolName === 'get_todos' || toolName === 'list_todos' || toolName === 'check_todos') && !toolError) {
							try {
								let parsed: any;
								if (typeof toolResult === 'string') {
									parsed = JSON.parse(toolResult);
								} else {
									parsed = toolResult;
								}

								if (parsed.todos && Array.isArray(parsed.todos)) {
									todoItems = parsed.todos.map((t: any) => ({
										id: t.id || '',
										text: t.text || t.content || '',
										status: (t.status === 'in_progress' ? 'in-progress' : t.status) || 'pending'
									}));
									console.log(`[VYBE Chat] ✅ Parsed ${todoItems?.length || 0} todo items`);
								}
							} catch (error) {
								console.warn(`[VYBE Chat] ⚠️ Failed to parse todos result:`, error);
							}
						}

						// Helper to actually update the tool part
						const doUpdate = () => {
							if (toolId) {
								const updateData: any = {
									isStreaming: false
								};
								if (fileList) {
									updateData.fileList = fileList;
								}
								if (searchResults) {
									updateData.searchResults = searchResults;
								}
								// Always set grepResults (even if empty array) for grep tool calls
								if (toolName === 'grep') {
									// Ensure grepResults is always an array
									updateData.grepResults = Array.isArray(grepResults) ? grepResults : [];

									// Also pass totalMatches and truncated if available from backend
									if (event.payload?.totalMatches !== undefined && typeof event.payload.totalMatches === 'number') {
										updateData.totalMatches = event.payload.totalMatches;
									}
									if (event.payload?.truncated !== undefined && typeof event.payload.truncated === 'boolean') {
										updateData.truncated = event.payload.truncated;
									}

									console.log(`[VYBE Chat] 🔧 Passing ${updateData.grepResults.length} grep results to tool part (totalMatches: ${updateData.totalMatches || 'N/A'}, truncated: ${updateData.truncated || false})`);
									if (updateData.grepResults.length > 0) {
										console.log(`[VYBE Chat] 🔧 Sample grep results (first 5):`, updateData.grepResults.slice(0, 5).map((r: any) => `${r.file} (${r.matchCount})`).join(', '));
									}
								}
								if (webSearchContent) {
									updateData.webSearchContent = webSearchContent;
								}
								if (todoItems) {
									updateData.todoItems = todoItems;
								}
								if (toolError) {
									updateData.error = toolError;
								}

								const updated = messagePage.updateContentPartById(toolId, updateData);
								if (!updated) {
									// Debug: list all tool parts to see what IDs we have
									const toolParts = messagePage.getContentPartsData().filter(d => d.kind === 'tool');
									console.log(`[VYBE Chat] 🔧 Available tool parts:`, toolParts.map(t => (t as any).id));
								}
								// Clean up creation time tracking
								toolCreationTimes.delete(toolId);

								// Record completion time for sequencing next tool call
								lastToolCompletionTime = Date.now();
							}
							if (options.onContentUpdate) {
								options.onContentUpdate();
							}
						};

						// Check if we need to delay to ensure minimum display time
						if (toolId) {
							const creationTime = toolCreationTimes.get(toolId);
							if (creationTime) {
								const elapsed = Date.now() - creationTime;
								if (elapsed < TOOL_MIN_DISPLAY_MS) {
									// Delay the update to ensure "Reading" shows for minimum time
									const delay = TOOL_MIN_DISPLAY_MS - elapsed;
									console.log(`[VYBE Chat] 🔧 Delaying tool completion by ${delay}ms for visibility`);
									setTimeout(doUpdate, delay);
									break;
								}
							}
						}

						// No delay needed, update immediately
						doUpdate();
						break;
					}

					case 'agent.iteration': {
						// New loop iteration starting - finalize current markdown to ensure separation
						console.log('[VYBE Chat] New agent iteration - finalizing current markdown');
						messagePage.finalizeCurrentMarkdown();
						if (options.onContentUpdate) {
							options.onContentUpdate();
						}
						break;
					}

					case 'complete': {
						// Task complete - finalize the message
						messagePage.finalize();
						messagePage.setComplete();
						if (options.onContentUpdate) {
							options.onContentUpdate();
						}
						break;
					}

					case 'agent.phase': {
						// Handle agent phase changes - add/remove phase indicator as content part
						const phase = event.payload?.phase;

						if (phase === 'planning') {
							// Remove any existing phase indicators first (to prevent duplicates)
							messagePage.removePhaseIndicator();
							// Add phase indicator as content part when agent is planning
							messagePage.addContentPart({
								kind: 'phaseIndicator',
								id: `phase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
								phase: 'planning',
								isStreaming: true
							});
							if (options.onContentUpdate) {
								options.onContentUpdate();
							}
						} else {
							// Remove phase indicator when moving to next phase
							messagePage.removePhaseIndicator();
							if (options.onContentUpdate) {
								options.onContentUpdate();
							}
						}
						break;
					}

					case 'error': {
						// Handle errors
						const errorMessage = event.payload?.message || 'An error occurred';
						const errorCode = event.payload?.code;
						console.error('[VYBE Chat] Error event:', errorMessage, errorCode);
						// Remove phase indicator when error occurs
						messagePage.removePhaseIndicator();
						messagePage.showError(errorMessage, errorCode);
						messagePage.setComplete();
						if (options.onContentUpdate) {
							options.onContentUpdate();
						}
						break;
					}

					default: {
						// Unknown event type - log but don't crash
						console.warn('[VYBE Chat] Unhandled event type:', event.type);
						break;
					}
				}
			});

			// Start the task and wait for completion
			// Ensure API keys are set before starting the stream (for cloud providers)
			if (selectedModelId && (selectedModelId.startsWith('gemini') || selectedModelId.startsWith('gpt-') || selectedModelId.startsWith('claude'))) {
				try {
					// Refresh models will ensure API keys are fetched and set
					await this._llmModelService.refreshModels();
				} catch (error) {
					console.warn('[VYBE Chat] Failed to refresh models/ensure API keys:', error);
					// Continue anyway - the stream will fail with a clear error message
				}
			}

			// Start the task (returns immediately with taskId)
			await this._agentService.solveTask({
				goal: message,
				repoId: workspaceFolder.uri.toString(),
				files: files.length > 0 ? files : undefined,
				mode: selectedMode,
				agentLevel: selectedLevel,
				taskId: taskId,
				modelId: selectedModelId
			});

			// Wait for complete event instead of promise resolution
			// The solveTask promise resolves immediately, but we need events to complete
			await new Promise<void>((resolve) => {
				if (eventSubscription) {
					// Create a one-time listener for complete event
					const completeListener = this._agentService.onDidEmitEvent((event: any) => {
						if (event?.type === 'complete' && event?.task_id === taskId) {
							completeListener.dispose();
							resolve();
						}
					});
				} else {
					// Fallback: resolve after a delay if no subscription
					setTimeout(resolve, 10000);
				}
			});

			// Clean up event subscription AFTER task completes
			if (eventSubscription) {
				eventSubscription.dispose();
				eventSubscription = null;
			}

			// Note: Event handler disposed automatically when subscription is disposed

			// Content parts are already updated via direct event handling
			// Events are the source of truth - no need to render result object
			if (!hasReceivedEvents) {
				console.warn('[VYBE Chat] No streaming events received - this should not happen with LangGraph');
			}

			// Stop streaming state
			messagePage.setStreaming(false);
			this.currentStreamingMessageId = null;
			if (this.composer) {
				this.composer.switchToSendButton();
			}
			// Trigger scroll update
			if (options.onContentUpdate) {
				options.onContentUpdate();
			}
		} catch (error) {
			// Show error in markdown part
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorContentParts: any[] = [{
				kind: 'markdown',
				content: `**Error:** ${errorMessage}`,
				isStreaming: false
			}];
			messagePage.updateContentParts(errorContentParts);

			// Stop streaming state
			messagePage.setStreaming(false);
			this.currentStreamingMessageId = null;
			if (this.composer) {
				this.composer.switchToSendButton();
			}
			// Show notification
			this._notificationService.error(`Agent Error: ${errorMessage}`);
		}

		// Update onStop (Phase 4.1: no cancellation yet)
		const originalOnStop = options.onStop;
		options.onStop = () => {
			// Phase 4.1: Cancellation not implemented yet
			// Call original onStop
			if (originalOnStop) {
				originalOnStop();
			}
		};
	}

	/**
	 * Convert context pills from composer to IChatRequestVariableEntry format for AI service
	 */
	private async convertContextPillsToVariableEntries(
		pills: Array<{ id: string; type: 'file' | 'terminal' | 'doc'; name: string; path?: string; iconClasses?: string[]; value?: string }>
	): Promise<IChatRequestVariableEntry[]> {
		const variableEntries: IChatRequestVariableEntry[] = [];

		for (const pill of pills) {
			try {
				if (pill.type === 'file' && pill.path) {
					// File pill: convert to IChatRequestFileEntry
					// Path from contextDropdown is a directory path string (e.g., 'src/vs/workbench/...')
					// We need to construct the full file URI: file:///path/to/dir/filename
					// The pill.name contains the filename
					let fileUri: URI;
					try {
						// First try parsing as URI (in case it's already a URI string)
						fileUri = URI.parse(pill.path);
						// If it's not a file URI or has no scheme, reconstruct from path + name
						if (!fileUri.scheme || (fileUri.scheme !== 'file' && fileUri.scheme !== 'vscode-file')) {
							// Reconstruct: path is directory, name is filename
							const fullPath = pill.path.endsWith('/') || pill.path.endsWith('\\')
								? `${pill.path}${pill.name}`
								: `${pill.path}/${pill.name}`;
							fileUri = URI.file(fullPath.startsWith('/') ? fullPath : `/${fullPath}`);
						}
					} catch {
						// If URI.parse fails, construct from path + name
						const fullPath = pill.path.endsWith('/') || pill.path.endsWith('\\')
							? `${pill.path}${pill.name}`
							: `${pill.path}/${pill.name}`;
						fileUri = URI.file(fullPath.startsWith('/') ? fullPath : `/${fullPath}`);
					}

					// Check if file exists and get omitted state
					let omittedState = 0; // OmittedState.NotOmitted
					try {
						const stat = await this._fileService.resolve(fileUri);
						if (!stat.isFile) {
							continue; // Skip if not a file
						}
					} catch {
						omittedState = 2; // OmittedState.Full - file doesn't exist or can't be read
					}

					const fileEntry: IChatRequestFileEntry = {
						kind: 'file',
						id: pill.id,
						name: pill.name,
						fullName: pill.name,
						value: fileUri,
						omittedState,
						icon: pill.iconClasses ? ThemeIcon.fromId(pill.iconClasses[0] || Codicon.file.id) : ThemeIcon.fromId(Codicon.file.id),
					};
					variableEntries.push(fileEntry);
				} else if (pill.type === 'terminal' && pill.value) {
					// Terminal pill: convert to ITerminalVariableEntry or IChatRequestStringVariableEntry
					// For now, use string entry since we don't have command/output/exitCode
					// In the future, could enhance to use ITerminalVariableEntry if we track command execution
					const terminalUri = URI.parse(`terminal://${pill.name}`);

					const stringEntry: IChatRequestStringVariableEntry = {
						kind: 'string',
						id: pill.id,
						name: pill.name,
						fullName: pill.name,
						value: pill.value, // The terminal selection text
						uri: terminalUri,
						icon: ThemeIcon.fromId(Codicon.terminal.id),
						modelDescription: `Terminal selection from ${pill.name}: ${pill.value.substring(0, 100)}${pill.value.length > 100 ? '...' : ''}`,
					};
					variableEntries.push(stringEntry);
				} else if (pill.type === 'doc' && pill.value) {
					// Doc pill: treat as string entry (document content)
					const docUri = pill.path ? URI.parse(pill.path) : URI.parse(`doc://${pill.name}`);

					const docEntry: IChatRequestStringVariableEntry = {
						kind: 'string',
						id: pill.id,
						name: pill.name,
						fullName: pill.name,
						value: pill.value, // Document content
						uri: docUri,
						icon: ThemeIcon.fromId(Codicon.book.id),
						modelDescription: `Document: ${pill.name}`,
					};
					variableEntries.push(docEntry);
				}
			} catch (error) {
				console.error(`[VYBE Chat] Failed to convert context pill ${pill.id}:`, error);
				// Continue with other pills even if one fails
			}
		}

		return variableEntries;
	}

	private setupComposerDragAndDrop(): void {
		if (!this.composer) {
			return;
		}

		const inputBox = this.composer.getInputBox();
		if (!inputBox) {
			return;
		}

		// If already set up, don't create another observer (prevent duplicate listeners)
		if (this.isDragAndDropSetup && this.dragAndDropObserver) {
			return;
		}

		// Dispose existing observer if any (to prevent duplicate listeners)
		if (this.dragAndDropObserver) {
			this.dragAndDropObserver.dispose();
			this.dragAndDropObserver = null;
		}

		// Set up drag and drop observer on the input box
		this.dragAndDropObserver = new DragAndDropObserver(inputBox, {
			onDragOver: (e, dragDuration) => {
				if (this.isDragEventSupported(e)) {
					e.stopPropagation();
					e.preventDefault();
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'copy';
					}
				}
			},
			onDragLeave: (e) => {
				// Optional: Add visual feedback removal
			},
			onDrop: async (e) => {
				e.stopPropagation();
				e.preventDefault();

				await this.handleComposerDrop(e);
			},
		});
		this._register(this.dragAndDropObserver);
		this.isDragAndDropSetup = true;
	}

	private isDragEventSupported(e: DragEvent): boolean {
		// Check if the drag event contains files (from explorer, editor tabs, or external)
		return !!(containsDragType(e, CodeDataTransfers.EDITORS) ||
			containsDragType(e, CodeDataTransfers.FILES) ||
			containsDragType(e, DataTransfers.RESOURCES) ||
			containsDragType(e, DataTransfers.INTERNAL_URI_LIST) ||
			(e.dataTransfer?.files && e.dataTransfer.files.length > 0));
	}

	private async handleComposerDrop(e: DragEvent): Promise<void> {
		if (!this.composer || !e.dataTransfer) {
			return;
		}

		// Extract file URIs from drag event
		const fileUris: URI[] = [];

		// 1. Check for editor drag data (editor tabs)
		const editorDragData = extractEditorsDropData(e);
		for (const editor of editorDragData) {
			if (editor.resource && editor.resource.scheme === 'file') {
				fileUris.push(editor.resource);
			}
		}

		// 2. Check for CodeDataTransfers.FILES (explorer)
		const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
		if (rawCodeFiles) {
			try {
				const codeFiles: string[] = JSON.parse(rawCodeFiles);
				for (const codeFile of codeFiles) {
					fileUris.push(URI.file(codeFile));
				}
			} catch (error) {
				// Invalid transfer
			}
		}

		// 3. Check for DataTransfers.RESOURCES
		const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
		if (rawResources) {
			try {
				const resources: string[] = JSON.parse(rawResources);
				for (const resource of resources) {
					const uri = URI.parse(resource);
					if (uri.scheme === 'file') {
						fileUris.push(uri);
					}
				}
			} catch (error) {
				// Invalid transfer
			}
		}

		// 4. Check for native file transfer (external files and folders)
		if (e.dataTransfer.files) {
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				const file = e.dataTransfer.files[i];
				// Handle both files and directories
				if (file) {
					// Try to get path from file
					const path = (file as any).path;
					if (path) {
						fileUris.push(URI.file(path));
					}
				}
			}
		}

		// Remove duplicates
		const uniqueUris = new Set<string>();
		const uniqueFiles: URI[] = [];
		for (const uri of fileUris) {
			const uriString = uri.toString();
			if (!uniqueUris.has(uriString)) {
				uniqueUris.add(uriString);
				uniqueFiles.push(uri);
			}
		}

		// Convert URIs to context pills
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceRoot = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;

		// Batch resolve all files/folders at once to reduce async operations
		const resolvedFiles = await this._fileService.resolveAll(uniqueFiles.map(uri => ({ resource: uri })));

		for (let i = 0; i < uniqueFiles.length; i++) {
			const fileUri = uniqueFiles[i];
			const resolvedFile = resolvedFiles[i];

			try {
				// Check if file/folder exists and was resolved successfully
				if (!resolvedFile.success || !resolvedFile.stat) {
					continue; // Skip if resolution failed
				}

				const stat = resolvedFile.stat;

				// Get name and relative path
				const name = basename(fileUri);
				let relativePathStr = '';

				if (workspaceRoot) {
					const dirUri = stat.isDirectory ? fileUri : dirname(fileUri);
					const relPath = relativePath(workspaceRoot, dirUri);
					if (relPath) {
						relativePathStr = relPath;
					}
				} else {
					relativePathStr = (stat.isDirectory ? fileUri.fsPath : dirname(fileUri).fsPath) || '';
				}

				// Get icon classes (use FileKind.FOLDER for directories, FileKind.FILE for files)
				const fileKind = stat.isDirectory ? FileKind.FOLDER : FileKind.FILE;
				const iconClasses = getIconClasses(this._modelService, this._languageService, fileUri, fileKind);

				// Insert context pill (treat folders as files for now, but with folder icon)
				this.composer.insertContextPill('file', name, relativePathStr, iconClasses);
			} catch (error) {
				// File/folder doesn't exist or error reading - skip it
				console.error('[VYBE Chat] Error handling dropped file/folder:', error);
			}
		}
	}

	/**
	 * Smart auto-scroll: Only scrolls if new content extends beyond visible viewport.
	 * This keeps the latest content visible during streaming without unnecessary scrolling.
	 */
	public resetScrollState(): void {
		this.autoScrollDisabled = false;
		// Cancel any pending scroll updates
		if (this.scrollRafId !== null) {
			cancelAnimationFrame(this.scrollRafId);
			this.scrollRafId = null;
		}
		if (this.scrollTimeout !== null) {
			clearTimeout(this.scrollTimeout);
			this.scrollTimeout = null;
		}
		// Scroll to bottom
		if (this.chatArea) {
			this.chatArea.scrollTop = this.chatArea.scrollHeight;
		}
	}

	private scrollRafId: number | null = null; // Debounce rapid scroll updates
	private scrollTimeout: ReturnType<typeof setTimeout> | null = null; // Additional throttle for scroll updates

	public scrollToShowLatestContent(): void {
		if (!this.chatArea || this.autoScrollDisabled) {
			return;
		}

		// CRITICAL: Only scroll if new content extends beyond the current viewport
		// This prevents jumping when code blocks grow incrementally
		const scrollTop = this.chatArea.scrollTop;
		const scrollHeight = this.chatArea.scrollHeight;
		const clientHeight = this.chatArea.clientHeight;
		const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

		// Only scroll if content extends beyond viewport (with 10px threshold to prevent micro-scrolls)
		if (distanceFromBottom > 10) {
			// Cancel any pending scroll update
			const targetWindow = this.chatArea ? getWindow(this.chatArea) : getActiveWindow();
			if (this.scrollRafId !== null) {
				targetWindow.cancelAnimationFrame(this.scrollRafId);
			}
			if (this.scrollTimeout !== null) {
				clearTimeout(this.scrollTimeout);
			}

			// Throttle scroll updates: wait 50ms to batch rapid updates
			// This prevents jumping when code blocks grow character-by-character
			this.scrollTimeout = setTimeout(() => {
				// Schedule scroll update (batched via RAF)
				this.scrollRafId = targetWindow.requestAnimationFrame(() => {
					if (this.chatArea && !this.autoScrollDisabled) {
						const beforeScroll = this.chatArea.scrollTop;
						const newScrollHeight = this.chatArea.scrollHeight;
						const newClientHeight = this.chatArea.clientHeight;
						const newDistanceFromBottom = newScrollHeight - (beforeScroll + newClientHeight);

						// Only scroll if content still extends beyond viewport
						if (newDistanceFromBottom > 10) {
							this.chatArea.scrollTop = newScrollHeight;
							const afterScroll = this.chatArea.scrollTop;

							// DIAGNOSTIC: Log scroll jumps (only if significant)
							if (Math.abs(afterScroll - beforeScroll) > 100) {
								console.log('[Scroll] Large scroll jump', {
									before: beforeScroll,
									after: afterScroll,
									scrollHeight: newScrollHeight,
									jump: afterScroll - beforeScroll,
									distanceFromBottom: newDistanceFromBottom
								});
							}
						}
					}
					this.scrollRafId = null;
				});
				this.scrollTimeout = null;
			}, 50); // 50ms throttle to batch rapid updates
		}
	}

	private handleStopGeneration(): void {
		// Stop the currently streaming message
		if (this.currentStreamingMessageId) {
			const page = this.messagePages.get(this.currentStreamingMessageId);
			if (page) {
				page.setStreaming(false);
				this.currentStreamingMessageId = null;
			}
		}
		// TODO: Cancel actual AI service request when implemented
	}

	/**
	 * TEST FUNCTION: Render sample AI response with streaming simulation
	 * Usage in console: __vybeTestContentParts()
	 *
	 * Demonstrates:
	 * 1. Streaming thinking block with incremental text updates (loading spinner, expanded)
	 * 2. After streaming: Complete thinking (chevron, collapsed)
	 * 3. Show markdown response
	 */
	public testRenderContentParts(): void {
		// Get the last message page
		const lastPage = Array.from(this.messagePages.values()).pop();
		if (!lastPage) {
			return;
		}

		// Thinking content chunks - ACCUMULATING text (each chunk contains ALL previous text)
		let accumulatedText = '';
		const thinkingChunks: string[] = [];

		const sentences = [
			'Analyzing the codebase structure and architecture patterns. ',
			'Scanning for React components and their dependencies. ',
			'Found 127 TypeScript files with 15,432 lines of code. ',
			'Examining component hierarchy and data flow between MessageComposer and VybeChatViewPane. ',
			'MessagePage manages individual message-response pairs with content parts system. ',
			'Content parts system handles markdown, thinking blocks, and code blocks efficiently. ',
			'Checking type safety across the application for interface consistency. ',
			'Found potential type mismatch in IVybeChatContentPart interface implementations. ',
			'The updateContent method signature varies between different content part types. ',
			'VybeChatMarkdownPart expects IVybeChatMarkdownContent while VybeChatThinkingPart uses IVybeChatThinkingContent. ',
			'Reviewing lifecycle management and disposable patterns throughout the codebase. ',
			'All components properly extend Disposable base class for memory management. ',
			'Memory leaks prevented through consistent _register() calls for all event listeners. ',
			'DomScrollableElement instances are correctly disposed when components unmount. ',
			'Analyzing CSS styling and theme consistency across VYBE Dark and VYBE Light themes. ',
			'Padding adjusted from 18px to 6px for wider content area in AI responses. ',
			'Chevron icons now visible with 12px size and 0.55 opacity for better user experience. ',
			'Examining scrolling behavior and sticky positioning for smooth user interactions. ',
			'CSS position sticky works correctly for human messages during chat scrolling. ',
			'Removed scroll-snap-type for natural scrolling experience without forced snapping. ',
			'Z-index hierarchy properly maintained across message pages to prevent visual conflicts. ',
			'Reviewing streaming implementation and real-time updates for content parts. ',
			'Content parts system supports incremental rendering with efficient DOM updates. ',
			'Thinking blocks expand during streaming with loading spinner animation for feedback. ',
			'Auto-collapse to chevron when streaming completes to maintain clean interface. ',
			'Checking accessibility features and keyboard navigation throughout the interface. ',
			'Tab navigation works across all interactive elements including dropdowns and buttons. ',
			'ARIA roles properly assigned to scrollable containers for screen reader support. ',
			'Analyzing performance characteristics and optimization opportunities in rendering pipeline. ',
			'Markdown rendering uses VS Code IMarkdownRendererService for consistency and reliability. ',
			'DomScrollableElement provides efficient virtual scrolling for large content blocks. ',
			'Content part reuse prevents unnecessary re-renders through hasSameContent comparison checks. ',
			'Final review complete. Ready to provide comprehensive analysis and recommendations for the VYBE Chat architecture.'
		];

		// Build accumulating chunks
		sentences.forEach(sentence => {
			accumulatedText += sentence;
			thinkingChunks.push(accumulatedText);
		});

		// Phase 1: Start streaming thinking (expanded, showing spinner)
		let chunkIndex = 0;

		// Render initial thinking block (streaming, expanded)
		lastPage.renderContentParts([
			{
				kind: 'thinking' as const,
				value: thinkingChunks[0],
				duration: 0,
				isStreaming: true // Shows spinner, expanded
			}
		]);

		// Stream thinking content (update every 350ms for smoother streaming)
		const streamInterval = setInterval(() => {
			chunkIndex++;
			if (chunkIndex < thinkingChunks.length) {
				lastPage.renderContentParts([
					{
						kind: 'thinking' as const,
						value: thinkingChunks[chunkIndex],
						duration: 0,
						isStreaming: true // Still streaming
					}
				]);
			} else {
				clearInterval(streamInterval);

				// Phase 2: Complete thinking (collapsed, show chevron)
				setTimeout(() => {
					lastPage.renderContentParts([
						{
							kind: 'thinking' as const,
							value: thinkingChunks[thinkingChunks.length - 1],
							duration: thinkingChunks.length * 350, // Total duration
							isStreaming: false // Chevron, auto-collapsed
						},
						{
							kind: 'markdown' as const,
							content: `# H1: VYBE Chat Markdown Test

This demonstrates ALL markdown elements working correctly.

## H2: Text Formatting

Here's some **bold text**, *italic text*, and ***bold italic*** for testing.

Use \`inline code\` like this: \`console.log('Hello')\`

### H3: Lists

#### H4: Ordered List
1. First item
2. Second item
   1. Nested item 2.1
   2. Nested item 2.2
3. Third item

##### H5: Unordered List
- Feature A
- Feature B
  - Sub-feature B1
  - Sub-feature B2
- Feature C

###### H6: Mixed List
1. Numbered
   - Bullet inside
   - Another bullet
2. Back to numbers

### H3: Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Markdown | ✅ Done | HIGH |
| Thinking | ✅ Done | HIGH |
| Code Blocks | 🔴 Next | CRITICAL |

### H3: Links

Check out [VS Code API](https://code.visualstudio.com/api) for more info.

Open file: [vybeChatViewPane.ts](file:///Users/neel/VYBE/src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts)

### H3: Blockquotes

> **Note:** This is a blockquote showing important information.
>
> It can span multiple lines and paragraphs.

### H3: Horizontal Rules

Content above the rule.

---

Content below the rule.

---

## H2: Code Examples

Single line code block:

\`\`\`typescript
const greeting = 'Hello, World!';
\`\`\`

TypeScript function:

\`\`\`typescript
function hello() {
    return 'world';
}
\`\`\`

Python example:

\`\`\`python
def calculate_sum(a, b):
    return a + b

result = calculate_sum(5, 3)
print(f"Result: {result}")
\`\`\`

Plain text in code block:

\`\`\`
This is plain text without syntax highlighting.
Just monospace font.
You can copy it too!
\`\`\`

Prompt example:

\`\`\`prompt
You are a helpful coding assistant.
Always provide clear explanations.
Use examples when possible.
\`\`\`

## H2: Summary

✅ All markdown elements are now rendering correctly! Phase 1 complete! 🚀`
						},
						{
							kind: 'textEdit' as const,
							fileName: 'greet.ts',
							filePath: '/src/utils/greet.ts',
							originalContent: `function greet(name: string) {
    console.log('Hello, World!');
    return 'Done';
}`,
							modifiedContent: `function greet(name: string) {
    console.log(\`Hello, \${name}!\`);
    return \`Greeted \${name}\`;
}`,
							language: 'typescript',
							addedLines: 2,
							deletedLines: 2,
							isApplied: false
						}
					]);
				}, 200); // Small delay before showing final state
			}
		}, 350); // Update every 350ms for smoother streaming
	}
}

// Expose test functions globally
declare global {
	interface Window {
		__vybeTestContentParts?: () => void;
		__vybeTestFilesEdited?: () => void;
		__vybeTestSpacing?: () => void;
		__vybeTestPlanDocument?: () => void;
		__vybeTestQuestionnaire?: () => void;
	}
}

// Register test functions
if (typeof window !== 'undefined') {
	// Test function for content parts (markdown, thinking, etc.)
	(window as any).__vybeTestContentParts = function () {
		// Find any element with __vybePane attached
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				(el as any).__vybePane.testRenderContentParts();
				return;
			}
		}
	};

	// Test function for pending terminal
	// Test with a real command that will execute - SIMPLE VERSION
	// Test terminal with real command execution
	(window as any).__vybeTestTerminalPending = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// Test with simple commands that execute quickly
				(lastPage as any).renderContentParts([
					{
						kind: 'terminal' as const,
						command: 'pwd',
						output: '',
						phase: 'pending' as const,
						status: null,
						permission: 'Ask Every Time',
						isStreaming: false
					}
				]);

				return;
			}
		}
	};

	// Test with ls command
	(window as any).__vybeTestTerminalLs = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				(lastPage as any).renderContentParts([
					{
						kind: 'terminal' as const,
						command: 'ls -la',
						output: '',
						phase: 'pending' as const,
						status: null,
						permission: 'Ask Every Time',
						isStreaming: false
					}
				]);

				return;
			}
		}
	};

	// Test with git log command
	// Test terminal with git log (real execution)
	(window as any).__vybeTestTerminalGit = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				(lastPage as any).renderContentParts([
					{
						kind: 'terminal' as const,
						command: 'git log --oneline -5',
						output: '',
						phase: 'pending' as const,
						status: null,
						permission: 'Ask Every Time',
						isStreaming: false
					}
				]);

				return;
			}
		}
	};

	// Test terminal with ls command
	(window as any).__vybeTestTerminalLs = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				(lastPage as any).renderContentParts([
					{
						kind: 'terminal' as const,
						command: 'ls -la',
						output: '',
						phase: 'pending' as const,
						status: null,
						permission: 'Ask Every Time',
						isStreaming: false
					}
				]);

				return;
			}
		}
	};

	// Test smart terminal reuse: Short command (should reuse VYBE terminal)
	(window as any).__vybeTestTerminalReuse = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// First command - should create "VYBE" terminal
				(lastPage as any).renderContentParts([
					{
						kind: 'terminal' as const,
						command: 'pwd',
						output: '',
						phase: 'pending' as const,
						status: null,
						permission: 'Ask Every Time',
						isStreaming: false
					}
				]);

				// Wait a bit, then run second command - should reuse same terminal
				setTimeout(() => {
					const lastPage2 = Array.from((pane as any).messagePages.values()).pop();
					if (lastPage2) {
						(lastPage2 as any).renderContentParts([
							{
								kind: 'terminal' as const,
								command: 'ls -la',
								output: '',
								phase: 'pending' as const,
								status: null,
								permission: 'Ask Every Time',
								isStreaming: false
							}
						]);
					}
				}, 2000);

				return;
			}
		}
	};

	// Test smart terminal reuse: Long-running command (should create new terminal)
	(window as any).__vybeTestTerminalLongRunning = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// Long-running command - should create "VYBE {timestamp}" terminal
				(lastPage as any).renderContentParts([
					{
						kind: 'terminal' as const,
						command: 'npm run watch',
						output: '',
						phase: 'pending' as const,
						status: null,
						permission: 'Ask Every Time',
						isStreaming: false
					}
				]);

				return;
			}
		}
	};


	// Test function for spacing inspection
	(window as any).__vybeTestSpacing = function () {
		// Find any element with __vybePane attached
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// Render comprehensive spacing test
				(lastPage as any).renderContentParts([
					{
						kind: 'thinking' as const,
						value: 'Analyzing spacing and margins across all markdown elements for optimal readability and compact design.',
						duration: 2000,
						isStreaming: false
					},
					{
						kind: 'markdown' as const,
						content: `# H1 Heading - Largest
First paragraph after H1. Inspect the orange margin boxes above and below the H1 heading.

## H2 Heading - Second Level
Paragraph after H2. Check margins on this heading.

### H3 Heading - Third Level
Paragraph after H3. Inspect margins.

#### H4 Heading - Fourth Level
Paragraph after H4. Check spacing.

##### H5 Heading - Fifth Level
Paragraph after H5. Inspect margins.

###### H6 Heading - Smallest
Paragraph after H6. Check spacing.

## Multiple Paragraphs Test

This is the first paragraph. Inspect margins between paragraphs.

This is the second paragraph. Check the gap.

This is the third paragraph. Inspect all margins.

## Lists Test

Unordered list:
- First item
- Second item
- Third item

Ordered list:
1. First numbered item
2. Second numbered item
3. Third numbered item

Nested list:
- Parent item
  - Child item 1
  - Child item 2
- Another parent

## Code Test

Inline code: \`const x = 10;\` - inspect margins around this.

Code block - check margins:
\`\`\`typescript
function test() {
    return 'Check margins';
}
\`\`\`

## Table Test

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

Inspect table margins above and below.

## Blockquote Test

> This is a blockquote.
> Check spacing around it.

## Horizontal Rule Test

Above the line.

---

Below the line.

## Mixed Content Test

Regular paragraph before heading.

### Heading After Paragraph
Paragraph after heading. Check transition spacing.

- List after paragraph
- Second item

Final paragraph. Inspect all transitions.`
					}
				]);
				return;
			}
		}
	};

	// Test function for files edited toolbar
	(window as any).__vybeInspectPills = function () {
		// Try global composer first
		const composer = (globalThis as any).__vybeComposer;
		if (composer && composer.inspectPills) {
			composer.inspectPills();
			return;
		}

		// Fallback: search for pane
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
		let node: Node | null = walker.nextNode();
		while (node) {
			const pane = (node as any).__vybePane;
			if (pane && pane.composer && pane.composer.inspectPills) {
				pane.composer.inspectPills();
				return;
			}
			node = walker.nextNode();
		}

		console.warn('[VYBE] Could not find composer. Make sure VYBE chat view is open.');
	};

	(window as any).__vybeTestFilesEdited = function () {
		const composer = (globalThis as any).__vybeComposer;
		if (!composer) {
			return;
		}

		// Clear any existing files
		composer.clearEditedFiles();

		// Add sample files with different file types (15 files for accurate testing)
		const sampleFiles = [
			{
				id: 'file1',
				name: 'vybeChatViewPane.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 45,
				deletions: 12
			},
			{
				id: 'file2',
				name: 'messageComposer.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 128,
				deletions: 34
			},
			{
				id: 'file3',
				name: 'vybeChatThinkingPart.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 67,
				deletions: 23
			},
			{
				id: 'file4',
				name: 'README.md',
				path: 'src/vs/workbench/contrib/vybeChat/README.md',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'markdown-lang-file-icon'],
				additions: 22,
				deletions: 5
			},
			{
				id: 'file5',
				name: 'package.json',
				path: 'package.json',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'json-lang-file-icon'],
				additions: 8,
				deletions: 2
			},
			{
				id: 'file6',
				name: 'vybeChat.css',
				path: 'src/vs/workbench/contrib/vybeChat/browser/media/vybeChat.css',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'css-lang-file-icon'],
				additions: 156,
				deletions: 78
			},
			{
				id: 'file7',
				name: 'questionnaireToolbar.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/questionnaireToolbar.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 234,
				deletions: 12
			},
			{
				id: 'file8',
				name: 'filesEditedToolbar.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/filesEditedToolbar.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 189,
				deletions: 45
			},
			{
				id: 'file9',
				name: 'vybeChatPlanDocumentPart.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatPlanDocumentPart.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 456,
				deletions: 123
			},
			{
				id: 'file10',
				name: 'vybeChatMarkdown.css',
				path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/media/vybeChatMarkdown.css',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'css-lang-file-icon'],
				additions: 89,
				deletions: 34
			},
			{
				id: 'file11',
				name: 'tsconfig.json',
				path: 'tsconfig.json',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'json-lang-file-icon'],
				additions: 12,
				deletions: 3
			},
			{
				id: 'file12',
				name: 'webpack.config.js',
				path: 'webpack.config.js',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'javascript-lang-file-icon'],
				additions: 45,
				deletions: 12
			},
			{
				id: 'file13',
				name: 'CONTRIBUTING.md',
				path: 'CONTRIBUTING.md',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'markdown-lang-file-icon'],
				additions: 67,
				deletions: 8
			},
			{
				id: 'file14',
				name: 'vybeChatService.ts',
				path: 'src/vs/workbench/contrib/vybeChat/common/vybeChatService.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 234,
				deletions: 56
			},
			{
				id: 'file15',
				name: 'vybeChat.contribution.ts',
				path: 'src/vs/workbench/contrib/vybeChat/browser/contribution/vybeChat.contribution.ts',
				iconClasses: ['codicon', 'codicon-file', 'file-icon', 'typescript-lang-file-icon'],
				additions: 123,
				deletions: 23
			}
		];

		// Add files one by one with delay for visual effect
		sampleFiles.forEach((file, index) => {
			setTimeout(() => {
				composer.addEditedFile(
					file.id,
					file.name,
					file.path,
					file.iconClasses,
					file.additions,
					file.deletions
				);
			}, index * 300); // 300ms delay between each file
		});
	};

	// Comprehensive streaming test - shows all content parts with streaming
	(window as any).__vybeTestStreaming = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// Reset scroll state and position at bottom before starting
				pane.resetScrollState();

				// CONTENT DEFINITIONS
				const thought1 = 'Analyzing your request and scanning the codebase for relevant files. Identifying key components that need refactoring. Checking type definitions and interface consistency across modules. Examining the architecture patterns used in the project. Looking for opportunities to improve code quality and maintainability. Reviewing best practices and design patterns. Preparing comprehensive analysis with specific recommendations. This will take a moment to ensure accuracy and completeness of the suggestions I provide.';

				const markdown1 = `# Code Analysis Complete

I've thoroughly analyzed your codebase and identified several areas for improvement. Here's what I found:

## Key Findings

| Component | Issues Found | Priority |
|-----------|--------------|----------|
| UserManager | Type safety | HIGH |
| Auth | Error handling | MEDIUM |
| API | Validation | HIGH |

### Recommendations

1. **Add TypeScript interfaces** for better type safety
2. **Implement proper error handling** with try-catch blocks
3. **Add input validation** to prevent security issues
4. **Use dependency injection** for better testability

Check out the [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) for more information.

Let me start implementing these changes:`;

				const thought2 = 'Preparing the authentication middleware implementation. Considering security best practices for JWT token handling. Planning proper error handling for expired and invalid tokens. Designing role-based access control system.';

				const codeBlock1 = `// Authentication middleware implementation
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JWTPayload {
    userId: string;
    email: string;
    role: 'admin' | 'user';
}

export class AuthMiddleware {
    private secret: string;

    constructor(secret: string) {
        this.secret = secret;
    }

    verifyToken = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).json({ error: 'No token' });
            }

            const decoded = jwt.verify(token, this.secret) as JWTPayload;
            (req as any).user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ error: 'Invalid token' });
        }
    };
}`;

				const terminalCommand = 'cd /Users/neel/VYBE && npm run build && npm test -- --coverage';
				const terminalOutput = `> vybe@1.0.0 build
> tsc && webpack --mode production

Compiled successfully!
Build completed in 2.34s

> vybe@1.0.0 test
> jest --coverage

 PASS  src/auth/__tests__/AuthMiddleware.test.ts
 PASS  src/user/__tests__/UserManager.test.ts
 PASS  src/database/__tests__/DatabaseManager.test.ts

Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
Snapshots:   0 total
Time:        3.892 s
Ran all test suites.

Coverage summary:
  Statements   : 94.2% ( 245/260 )
  Branches     : 88.5% ( 92/104 )
  Functions    : 95.1% ( 77/81 )
  Lines        : 94.8% ( 238/251 )

All tests passed! ✓`;

				const textEdit1Original = `class UserManager {
    private users = [];

    addUser(user) {
        this.users.push(user);
    }
}`;

				const textEdit1Modified = `interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    createdAt: Date;
}

interface UserManagerConfig {
    maxUsers: number;
    enableCache: boolean;
}

class UserManager {
    private users: Map<string, User>;
    private config: UserManagerConfig;
    private cache: Map<string, User>;

    constructor(config: UserManagerConfig) {
        this.users = new Map();
        this.config = config;
        this.cache = new Map();
    }

    addUser(user: User): boolean {
        if (this.users.size >= this.config.maxUsers) {
            throw new Error('Max users reached');
        }

        this.users.set(user.id, user);

        if (this.config.enableCache) {
            this.cache.set(user.id, user);
        }

        return true;
    }

    getUser(id: string): User | undefined {
        if (this.config.enableCache && this.cache.has(id)) {
            return this.cache.get(id);
        }

        const user = this.users.get(id);

        if (user && this.config.enableCache) {
            this.cache.set(id, user);
        }

        return user;
    }

    updateUser(id: string, updates: Partial<User>): boolean {
        const user = this.users.get(id);
        if (!user) return false;

        const updated = { ...user, ...updates };
        this.users.set(id, updated);

        if (this.config.enableCache) {
            this.cache.set(id, updated);
        }

        return true;
    }

    deleteUser(id: string): boolean {
        const deleted = this.users.delete(id);
        if (deleted && this.config.enableCache) {
            this.cache.delete(id);
        }
        return deleted;
    }

    getAllUsers(): User[] {
        return Array.from(this.users.values());
    }

    clearCache(): void {
        this.cache.clear();
    }
}`;

				const thought3 = 'Excellent progress! Now preparing database integration layer with proper connection pooling and error recovery mechanisms.';

				const textEdit2Modified = `import { Pool, QueryResult } from 'pg';

interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number;
}

export class DatabaseManager {
    private pool: Pool;

    constructor(config: DatabaseConfig) {
        this.pool = new Pool(config);
        this.setupErrorHandlers();
    }

    private setupErrorHandlers(): void {
        this.pool.on('error', (err) => {
            console.error('Unexpected database error:', err);
        });
    }

    async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
        const client = await this.pool.connect();
        try {
            const result = await client.query<T>(text, params);
            return result;
        } catch (error) {
            console.error('Query error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}`;

				const markdownSummary = `# Implementation Complete!

## Summary of Changes

I've successfully implemented the following improvements:

### 1. Authentication System
- JWT-based authentication middleware
- Role-based access control
- Proper error handling

### 2. User Management
- Type-safe User interface
- Configuration-based UserManager
- Caching system for performance
- Full CRUD operations

### 3. Database Layer
- Connection pooling with pg
- Transaction support
- Error recovery mechanisms

## Next Steps

You can now:
1. Run the application with \`npm start\`
2. Test the authentication endpoints
3. Verify user management operations
4. Check database connectivity

All changes are ready to commit! 🎉`;

				// PHASE 1: Thinking block (15s)
				(lastPage as any).renderContentParts([
					{
						kind: 'thinking' as const,
						value: thought1,
						duration: 0,
						isStreaming: true
					}
				]);
				pane.scrollToShowLatestContent(); // Scroll to show thinking block

				const t1Time = thought1.length * 15 + 500;

				// PHASE 2: Complete thinking, stream markdown
				setTimeout(() => {
					(lastPage as any).renderContentParts([
						{
							kind: 'thinking' as const,
							value: thought1,
							duration: t1Time,
							isStreaming: false
						},
						{
							kind: 'markdown' as const,
							content: markdown1,
							isStreaming: true
						}
					]);
					pane.scrollToShowLatestContent(); // Scroll to show markdown

					const m1Time = markdown1.length * 15 + 500;

					// PHASE 3: Complete markdown, stream thought2
					setTimeout(() => {
						(lastPage as any).renderContentParts([
							{
								kind: 'thinking' as const,
								value: thought1,
								duration: t1Time,
								isStreaming: false
							},
							{
								kind: 'markdown' as const,
								content: markdown1,
								isStreaming: false
							},
							{
								kind: 'thinking' as const,
								value: thought2,
								duration: 0,
								isStreaming: true
							}
						]);
						pane.scrollToShowLatestContent(); // Scroll to show thought2

						const t2Time = thought2.length * 15 + 500;

						// PHASE 4: Complete thought2, stream code block
						setTimeout(() => {
							(lastPage as any).renderContentParts([
								{
									kind: 'thinking' as const,
									value: thought1,
									duration: t1Time,
									isStreaming: false
								},
								{
									kind: 'markdown' as const,
									content: markdown1,
									isStreaming: false
								},
								{
									kind: 'thinking' as const,
									value: thought2,
									duration: t2Time,
									isStreaming: false
								},
								{
									kind: 'codeBlock' as const,
									language: 'typescript',
									code: codeBlock1,
									isStreaming: true
								}
							]);
							pane.scrollToShowLatestContent(); // Scroll to show code block

							const cb1Time = codeBlock1.split('\n').length * 70 + 500;

							// PHASE 5: Complete code, stream terminal
							setTimeout(() => {
								(lastPage as any).renderContentParts([
									{
										kind: 'thinking' as const,
										value: thought1,
										duration: t1Time,
										isStreaming: false
									},
									{
										kind: 'markdown' as const,
										content: markdown1,
										isStreaming: false
									},
									{
										kind: 'thinking' as const,
										value: thought2,
										duration: t2Time,
										isStreaming: false
									},
									{
										kind: 'codeBlock' as const,
										language: 'typescript',
										code: codeBlock1,
										isStreaming: false
									},
									{
										kind: 'terminal' as const,
										command: terminalCommand,
										output: terminalOutput,
										phase: 'running' as const,
										status: null,
										permission: 'Ask Every Time',
										isStreaming: true
									}
								]);
								pane.scrollToShowLatestContent(); // Scroll to show terminal

								const terminalTime = terminalOutput.split('\n').length * 100 + 500;

								// PHASE 6: Complete terminal, stream text edit (100 lines)
								setTimeout(() => {
									(lastPage as any).renderContentParts([
										{
											kind: 'thinking' as const,
											value: thought1,
											duration: t1Time,
											isStreaming: false
										},
										{
											kind: 'markdown' as const,
											content: markdown1,
											isStreaming: false
										},
										{
											kind: 'thinking' as const,
											value: thought2,
											duration: t2Time,
											isStreaming: false
										},
										{
											kind: 'codeBlock' as const,
											language: 'typescript',
											code: codeBlock1,
											isStreaming: false
										},
										{
											kind: 'terminal' as const,
											command: terminalCommand,
											output: terminalOutput,
											phase: 'completed' as const,
											status: 'success' as const,
											permission: 'Ask Every Time',
											isStreaming: false
										},
										{
											kind: 'textEdit' as const,
											fileName: 'userManager.ts',
											filePath: '/src/userManager.ts',
											originalContent: textEdit1Original,
											modifiedContent: textEdit1Modified,
											streamingContent: textEdit1Modified,
											language: 'typescript',
											addedLines: 78,
											deletedLines: 6,
											isApplied: false,
											isLoading: true,
											isStreaming: true
										}
									]);
									pane.scrollToShowLatestContent(); // Scroll to show text edit 1

									const te1Time = textEdit1Modified.split('\n').length * 70 + 1000;

									// PHASE 7: Complete text edit, show thought3
									setTimeout(() => {
										(lastPage as any).renderContentParts([
											{
												kind: 'thinking' as const,
												value: thought1,
												duration: t1Time,
												isStreaming: false
											},
											{
												kind: 'markdown' as const,
												content: markdown1,
												isStreaming: false
											},
											{
												kind: 'thinking' as const,
												value: thought2,
												duration: t2Time,
												isStreaming: false
											},
											{
												kind: 'codeBlock' as const,
												language: 'typescript',
												code: codeBlock1,
												isStreaming: false
											},
											{
												kind: 'terminal' as const,
												command: terminalCommand,
												output: terminalOutput,
												phase: 'completed' as const,
												status: 'success' as const,
												permission: 'Ask Every Time',
												isStreaming: false
											},
											{
												kind: 'textEdit' as const,
												fileName: 'userManager.ts',
												filePath: '/src/userManager.ts',
												originalContent: textEdit1Original,
												modifiedContent: textEdit1Modified,
												language: 'typescript',
												addedLines: 78,
												deletedLines: 6,
												isApplied: false,
												isLoading: false,
												isStreaming: false
											},
											{
												kind: 'thinking' as const,
												value: thought3,
												duration: 0,
												isStreaming: true
											}
										]);
										pane.scrollToShowLatestContent(); // Scroll to show thought3

										const t3Time = thought3.length * 15 + 500;

										// PHASE 8: Complete thought3, stream text edit 2
										setTimeout(() => {
											(lastPage as any).renderContentParts([
												{
													kind: 'thinking' as const,
													value: thought1,
													duration: t1Time,
													isStreaming: false
												},
												{
													kind: 'markdown' as const,
													content: markdown1,
													isStreaming: false
												},
												{
													kind: 'thinking' as const,
													value: thought2,
													duration: t2Time,
													isStreaming: false
												},
												{
													kind: 'codeBlock' as const,
													language: 'typescript',
													code: codeBlock1,
													isStreaming: false
												},
												{
													kind: 'terminal' as const,
													command: terminalCommand,
													output: terminalOutput,
													phase: 'completed' as const,
													status: 'success' as const,
													permission: 'Ask Every Time',
													isStreaming: false
												},
												{
													kind: 'textEdit' as const,
													fileName: 'userManager.ts',
													filePath: '/src/userManager.ts',
													originalContent: textEdit1Original,
													modifiedContent: textEdit1Modified,
													language: 'typescript',
													addedLines: 78,
													deletedLines: 6,
													isApplied: false,
													isLoading: false,
													isStreaming: false
												},
												{
													kind: 'thinking' as const,
													value: thought3,
													duration: t3Time,
													isStreaming: false
												},
												{
													kind: 'textEdit' as const,
													fileName: 'database.ts',
													filePath: '/src/database.ts',
													originalContent: '',
													modifiedContent: textEdit2Modified,
													streamingContent: textEdit2Modified,
													language: 'typescript',
													addedLines: 58,
													deletedLines: 0,
													isApplied: false,
													isLoading: true,
													isStreaming: true
												}
											]);
											pane.scrollToShowLatestContent(); // Scroll to show text edit 2

											const te2Time = textEdit2Modified.split('\n').length * 70 + 1000;

											// PHASE 9: Complete text edit 2, show summary markdown
											setTimeout(() => {
												(lastPage as any).renderContentParts([
													{
														kind: 'thinking' as const,
														value: thought1,
														duration: t1Time,
														isStreaming: false
													},
													{
														kind: 'markdown' as const,
														content: markdown1,
														isStreaming: false
													},
													{
														kind: 'thinking' as const,
														value: thought2,
														duration: t2Time,
														isStreaming: false
													},
													{
														kind: 'codeBlock' as const,
														language: 'typescript',
														code: codeBlock1,
														isStreaming: false
													},
													{
														kind: 'terminal' as const,
														command: terminalCommand,
														output: terminalOutput,
														phase: 'completed' as const,
														status: 'success' as const,
														permission: 'Ask Every Time',
														isStreaming: false
													},
													{
														kind: 'textEdit' as const,
														fileName: 'userManager.ts',
														filePath: '/src/userManager.ts',
														originalContent: textEdit1Original,
														modifiedContent: textEdit1Modified,
														language: 'typescript',
														addedLines: 78,
														deletedLines: 6,
														isApplied: false,
														isLoading: false,
														isStreaming: false
													},
													{
														kind: 'thinking' as const,
														value: thought3,
														duration: t3Time,
														isStreaming: false
													},
													{
														kind: 'textEdit' as const,
														fileName: 'database.ts',
														filePath: '/src/database.ts',
														originalContent: '',
														modifiedContent: textEdit2Modified,
														language: 'typescript',
														addedLines: 58,
														deletedLines: 0,
														isApplied: false,
														isLoading: false,
														isStreaming: false
													},
													{
														kind: 'markdown' as const,
														content: markdownSummary,
														isStreaming: true
													}
												]);
												pane.scrollToShowLatestContent(); // Scroll to show summary
											}, te2Time);
										}, t3Time);
									}, te1Time);
								}, terminalTime);
							}, cb1Time);
						}, t2Time);
					}, m1Time);
				}, t1Time);

				return;
			}
		}
	};

	// Test function for new content parts: Read, Searched, Explored
	(window as any).__vybeTestNewContentParts = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// Reset scroll state
				pane.resetScrollState();

				// Test: 2 reads → markdown → read/search/read (should group last 3 into explored)

				// Read 1: Reading (streaming) -> Read (complete)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'readingFiles',
						files: [
							{
								name: 'vybeChatThinkingPart.ts',
								path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
								lineRange: { start: 1, end: 100 }
							}
						],
						isStreaming: true
					});
					pane.scrollToShowLatestContent();
				}, 500);

				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatThinkingPart.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
									lineRange: { start: 1, end: 100 }
								}
							],
							isStreaming: false
						}
					]);
				}, 1500);

				// Read 2: Reading (streaming) -> Read (complete)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'readingFiles',
						files: [
							{
								name: 'messageComposer.ts',
								path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts',
								lineRange: { start: 50, end: 150 }
							}
						],
						isStreaming: true
					});
					pane.scrollToShowLatestContent();
				}, 2000);

				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatThinkingPart.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
									lineRange: { start: 1, end: 100 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'messageComposer.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts',
									lineRange: { start: 50, end: 150 }
								}
							],
							isStreaming: false
						}
					]);
				}, 3000);

				// Markdown (breaks grouping)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'markdown',
						content: 'I found the relevant code sections. Let me analyze them further.',
						isStreaming: false
					});
					pane.scrollToShowLatestContent();
				}, 3500);

				// Read 3: Reading (streaming) -> Read (complete)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'readingFiles',
						files: [
							{
								name: 'vybeChatViewPane.ts',
								path: 'src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts',
								lineRange: { start: 200, end: 300 }
							}
						],
						isStreaming: true
					});
					pane.scrollToShowLatestContent();
				}, 4000);

				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatThinkingPart.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
									lineRange: { start: 1, end: 100 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'messageComposer.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts',
									lineRange: { start: 50, end: 150 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'markdown',
							content: 'I found the relevant code sections. Let me analyze them further.',
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatViewPane.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts',
									lineRange: { start: 200, end: 300 }
								}
							],
							isStreaming: false
						}
					]);
				}, 5000);

				// Search 1: Searching (streaming) -> Searched (complete) - web search (no files)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'searched',
						query: 'how to implement file grouping in VS Code',
						files: [],
						isStreaming: true
					});
					pane.scrollToShowLatestContent();
				}, 5500);

				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatThinkingPart.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
									lineRange: { start: 1, end: 100 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'messageComposer.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts',
									lineRange: { start: 50, end: 150 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'markdown',
							content: 'I found the relevant code sections. Let me analyze them further.',
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatViewPane.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts',
									lineRange: { start: 200, end: 300 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'searched',
							query: 'how to implement file grouping in VS Code',
							files: [],
							isStreaming: false
						}
					]);
					pane.scrollToShowLatestContent();
				}, 6500);

				// Read 4: Reading (streaming) -> Read (complete) - Should trigger grouping (3+ consecutive after markdown)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'readingFiles',
						files: [
							{
								name: 'contextDropdown.ts',
								path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/contextDropdown.ts',
								lineRange: { start: 50, end: 150 }
							}
						],
						isStreaming: true
					});
					pane.scrollToShowLatestContent();
				}, 7000);

				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatThinkingPart.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatThinkingPart.ts',
									lineRange: { start: 1, end: 100 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'messageComposer.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts',
									lineRange: { start: 50, end: 150 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'markdown',
							content: 'I found the relevant code sections. Let me analyze them further.',
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'vybeChatViewPane.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts',
									lineRange: { start: 200, end: 300 }
								}
							],
							isStreaming: false
						},
						{
							kind: 'searched',
							query: 'how to implement file grouping in VS Code',
							files: [],
							isStreaming: false
						},
						{
							kind: 'readingFiles',
							files: [
								{
									name: 'contextDropdown.ts',
									path: 'src/vs/workbench/contrib/vybeChat/browser/components/composer/contextDropdown.ts',
									lineRange: { start: 50, end: 150 }
								}
							],
							isStreaming: false
						}
					]);
					pane.scrollToShowLatestContent();
				}, 8000);

				return;
			}
		}
	};

	// Test function for plan document content part
	(window as any).__vybeTestPlanDocument = function () {
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop() as MessagePage | undefined;
				if (!lastPage) {
					return;
				}

				// Reset scroll state
				pane.resetScrollState();

				// Use unique ID for this plan document
				const planId = `plan-${Date.now()}`;
				const planContent = `## Current Status

✅ **Already Implemented:**

- MCP server registration in \`src/vs/workbench/contrib/vybeChat/browser/contribution/vybeMcpServer.contribution.ts\`
- Environment variable passing (WORKSPACE_ROOT, SUPABASE_URL, SUPABASE_KEY, etc.)
- Server path configuration with defaults
- Tool auto-discovery via \`McpLanguageModelToolContribution\`

## Missing Components

### 1. Repo ID Generation Service

**File**: \`src/vs/workbench/contrib/vybeChat/common/vybeMcpRepoIdService.ts\`

Create a service that generates stable \`repo_id\` values from workspace roots. This is required by most VYBE-MCP cloud tools (e.g., \`search_codebase\`, \`vybe_solve_task\`).

**Implementation:**

- Use workspace folder URI to generate stable hash (similar to \`getWorkspaceIdentifier\` in \`src/vs/platform/workspaces/node/workspaces.ts\`)
- Cache repo_id per workspace
- Expose via \`IVybeMcpRepoIdService\` interface

**Usage:** Tools that need \`repo_id\` will call this service to get the current workspace's repo_id.

### 2. Session Management Integration

**File**: \`src/vs/workbench/contrib/vybeChat/common/vybeMcpSessionService.ts\`

Track MCP sessions and maintain continuity across chat interactions. The \`vybe_session_solve\` tool requires \`session_id\` to maintain conversation context.

**Implementation:**

- Map IDE chat session IDs to MCP session IDs
- Store mapping in workspace storage
- Provide \`getOrCreateMcpSessionId(chatSessionId: string): Promise<string>\`
- Integrate with existing chat session management

**Integration Points:**

- Hook into \`ChatModel\` session creation
- Pass \`session_id\` when calling \`vybe_session_solve\` tool
- Use \`list_sessions\` and \`get_session\` tools to show session history

### 3. Event Streaming Client (SSE)

**File**: \`src/vs/workbench/contrib/vybeChat/common/vybeMcpEventStreamService.ts\`

Implement SSE client for real-time task progress updates from the \`subscribe_events\` tool.

**Implementation:**

- Create \`EventSource\` connection to MCP server SSE endpoint
- Parse and emit events: \`agent_step_start\`, \`agent_step_complete\`, \`task_complete\`, \`patch_generated\`, \`test_result\`
- Integrate with chat UI to show progress indicators
- Handle connection lifecycle (connect on task start, disconnect on completion)

**Event Types to Handle:**

- \`agent_step_start\` / \`agent_step_complete\` - Show agent progress
- \`task_complete\` / \`task_failed\` - Task completion status
- \`patch_generated\` - New patch available for approval
- \`test_result\` - Test execution results

### 4. Panel Envelope Renderer

**Files**:
- \`src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatPanelEnvelopePart.ts\`
- \`src/vs/workbench/contrib/vybeChat/browser/components/panelEnvelope/panelEnvelopeRenderer.ts\`

Render Panel Envelope responses from \`vybe_solve_task\` and \`vybe_session_solve\` tools. The envelope contains patches, test results, and metadata.

**Components to Build:**

- **Patch Viewer**: Display pending/applied patches in diff view
- **Test Results Display**: Show test execution output
- **Metadata Panel**: Display execution stats (files touched, patches generated, etc.)
- **Approval UI**: Buttons to approve/reject pending patches

**Integration:**

- Detect Panel Envelope in tool results
- Create \`VybeChatPanelEnvelopePart\` content part
- Register in \`VybeChatViewPane\` content parts registry

### 5. Approval Workflow Integration

**File**: \`src/vs/workbench/contrib/vybeChat/browser/components/panelEnvelope/patchApprovalWorkflow.ts\`

Implement UI and logic for approving/rejecting patches generated by MCP tools.

**Implementation:**

- Show pending patches in diff view
- Provide approve/reject buttons
- Call \`apply_patch\` tool with approval when user accepts
- Track approval state per patch
- Show applied patches as completed changes

**Note:** The MCP server fixes mentioned in the analysis document should ensure proper approval gate enforcement.

### 6. Tool Parameter Injection

**File**: \`src/vs/workbench/contrib/vybeChat/common/vybeMcpToolParameterInjector.ts\`

Automatically inject \`repo_id\` and \`session_id\` into tool calls that require them, so the AI doesn't need to provide these parameters explicitly.

**Implementation:**

- Intercept tool invocations via \`ILanguageModelToolsService\`
- Detect tools that need \`repo_id\` or \`session_id\`
- Inject parameters before execution
- Use \`IVybeMcpRepoIdService\` and \`IVybeMcpSessionService\`

**Tools Requiring Injection:**

- \`repo_id\`: \`search_codebase\`, \`vybe_solve_task\`, \`vybe_session_solve\`, \`get_context_for_task\`, etc.
- \`session_id\`: \`vybe_session_solve\`, \`get_session\`, \`list_session_entries\`

## Implementation Order

1. **Repo ID Service** - Foundation for other features
2. **Session Management** - Enables session continuity
3. **Tool Parameter Injection** - Makes tools easier to use
4. **Panel Envelope Renderer** - Core UI for MCP results
5. **Approval Workflow** - Complete the patch workflow
6. **Event Streaming** - Real-time updates (can be done in parallel)

## Configuration

Add VS Code settings for:

- \`vybe.mcp.repoId\` - Override auto-generated repo_id (optional)
- \`vybe.mcp.enableEventStreaming\` - Toggle SSE updates (default: true)
- \`vybe.mcp.autoApprovePatches\` - Auto-approve patches (default: false)

## Testing Strategy

1. **Unit Tests**: Repo ID generation, session mapping
2. **Integration Tests**: Tool parameter injection, envelope parsing
3. **Manual Testing**: Full workflow from chat → tool call → envelope display → approval

## Files to Create

- \`src/vs/workbench/contrib/vybeChat/common/vybeMcpRepoIdService.ts\`
- \`src/vs/workbench/contrib/vybeChat/common/vybeMcpSessionService.ts\`
- \`src/vs/workbench/contrib/vybeChat/common/vybeMcpEventStreamService.ts\`
- \`src/vs/workbench/contrib/vybeChat/common/vybeMcpToolParameterInjector.ts\`
- \`src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatPanelEnvelopePart.ts\`
- \`src/vs/workbench/contrib/vybeChat/browser/components/panelEnvelope/panelEnvelopeRenderer.ts\`
- \`src/vs/workbench/contrib/vybeChat/browser/components/panelEnvelope/patchApprovalWorkflow.ts\`

## Files to Modify

- \`src/vs/workbench/contrib/vybeChat/browser/contribution/vybeChat.contribution.ts\` - Register new services
- \`src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts\` - Register panel envelope content part
- \`src/vs/workbench/contrib/vybeChat/common/vybeChatService.ts\` (if exists) - Integrate services

## Dependencies

- Existing MCP infrastructure (already in place)
- Chat session management (already exists)
- Workspace context service (already available)
- File service for storage (already available)`;

				// Step 1: Start streaming (collapsed, summary streams)
				setTimeout(() => {
					lastPage.addContentPart({
						kind: 'planDocument',
						id: planId,
						filename: 'complete-mcp-integration.plan.md',
						title: 'Complete VYBE-MCP Integration Plan',
						summary: 'Complete the VYBE-MCP server integration by adding repo_id generation, session management, event streaming, panel envelope rendering, and approval workflows to make all MCP tools fully functional in the IDE. This plan covers 6 major components: Repo ID Service, Session Management, Event Streaming, Panel Envelope Renderer, Approval Workflow, and Tool Parameter Injection.',
						content: `# Complete VYBE-MCP Integration Plan\n\n${planContent}`,
						isExpanded: false,
						isStreaming: true,
						modelState: {
							isAutoEnabled: true,
							isMaxModeEnabled: false,
							selectedModelId: 'composer-1'
						}
					});
					pane.scrollToShowLatestContent();
				}, 500);

				// Step 2: Complete streaming (still collapsed, summary visible)
				// Wait longer to let streaming animation complete naturally
				// Calculate approximate time: content length * 15ms per char + buffer
				const contentLength = `# Complete VYBE-MCP Integration Plan\n\n${planContent}`.length;
				const estimatedStreamTime = contentLength * 15; // 15ms per character
				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'planDocument',
							id: planId,
							filename: 'complete-mcp-integration.plan.md',
							title: 'Complete VYBE-MCP Integration Plan',
							summary: 'Complete the VYBE-MCP server integration by adding repo_id generation, session management, event streaming, panel envelope rendering, and approval workflows to make all MCP tools fully functional in the IDE. This plan covers 6 major components: Repo ID Service, Session Management, Event Streaming, Panel Envelope Renderer, Approval Workflow, and Tool Parameter Injection.',
							content: `# Complete VYBE-MCP Integration Plan\n\n${planContent}`,
							isExpanded: false,
							isStreaming: false,
							modelState: {
								isAutoEnabled: true,
								isMaxModeEnabled: false,
								selectedModelId: 'composer-1'
							}
						}
					]);
					pane.scrollToShowLatestContent();
				}, 500 + estimatedStreamTime + 500); // Start delay + stream time + buffer

				// Step 3: Expand to show full plan (summary + full content)
				setTimeout(() => {
					lastPage.updateContentParts([
						{
							kind: 'planDocument',
							id: planId,
							filename: 'complete-mcp-integration.plan.md',
							title: 'Complete VYBE-MCP Integration Plan',
							summary: 'Complete the VYBE-MCP server integration by adding repo_id generation, session management, event streaming, panel envelope rendering, and approval workflows to make all MCP tools fully functional in the IDE. This plan covers 6 major components: Repo ID Service, Session Management, Event Streaming, Panel Envelope Renderer, Approval Workflow, and Tool Parameter Injection.',
							content: `# Complete VYBE-MCP Integration Plan\n\n${planContent}`,
							isExpanded: true,
							isStreaming: false,
							modelState: {
								isAutoEnabled: true,
								isMaxModeEnabled: false,
								selectedModelId: 'composer-1'
							}
						}
					]);
					pane.scrollToShowLatestContent();
				}, 4500);

				return;
			}
		}
	};

	// Test function for questionnaire toolbar
	(window as any).__vybeTestQuestionnaire = function () {
		const composer = (globalThis as any).__vybeComposer;
		if (!composer) {
			console.warn('Composer not found. Make sure the chat pane is initialized.');
			return;
		}

		// Sample questions for testing
		const questions = [
			{
				id: 'q1',
				text: 'What is the scope of this integration? Should I implement all components (repo_id, sessions, event streaming, panel envelopes, approval workflow) or focus on specific ones first?',
				options: [
					{ id: 'q1-a', label: 'All components - complete integration', letter: 'A' },
					{ id: 'q1-b', label: 'Core only - repo_id, sessions, basic envelope rendering', letter: 'B' },
					{ id: 'q1-c', label: 'Let me specify priorities', letter: 'C' }
				]
			},
			{
				id: 'q2',
				text: 'Do you have Supabase configured and ready? This affects which tools will work (cloud plane tools require Supabase).',
				options: [
					{ id: 'q2-a', label: 'Yes, Supabase is configured', letter: 'A' },
					{ id: 'q2-b', label: 'No, focus on local tools only for now', letter: 'B' },
					{ id: 'q2-c', label: 'Will configure later, but include Supabase features', letter: 'C' }
				]
			},
			{
				id: 'q3',
				text: 'How should patch approval work? Should patches require explicit approval or auto-apply?',
				options: [
					{ id: 'q3-a', label: 'Explicit approval required (show UI, user clicks approve)', letter: 'A' },
					{ id: 'q3-b', label: 'Auto-apply patches (no approval UI needed)', letter: 'B' },
					{ id: 'q3-c', label: 'Configurable via settings (default: require approval)', letter: 'C' }
				]
			}
		];

		// Set up callbacks
		composer.setQuestionnaireCallbacks(
			() => {
				console.log('Skip clicked');
				composer.clearQuestionnaire();
			},
			() => {
				console.log('Continue clicked');
				// Get selected answers
				const selectedAnswers: { [questionId: string]: string } = {};
				questions.forEach(q => {
					// This would need to be tracked, but for now just log
					console.log(`Question ${q.id} selected option would be retrieved here`);
				});
				console.log('Selected answers:', selectedAnswers);
				composer.clearQuestionnaire();
			},
			(questionId: string, optionId: string) => {
				console.log(`Question ${questionId} - Option ${optionId} selected`);
			}
		);

		// Set questions to display
		composer.setQuestionnaireQuestions(questions);
		console.log('Questionnaire toolbar displayed with', questions.length, 'questions');
	};
}
