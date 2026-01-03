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
import { addDisposableListener } from '../../../../base/browser/dom.js';
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
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ISpeechService } from '../../../contrib/speech/common/speechService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatRequestVariableEntry, IChatRequestFileEntry, IChatRequestStringVariableEntry } from '../../chat/common/chatVariableEntries.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData } from '../../../../platform/dnd/browser/dnd.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { DragAndDropObserver } from '../../../../base/browser/dom.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { basename, dirname, relativePath } from '../../../../base/common/resources.js';
import { IVybeChatMcpExecutionService } from '../common/vybeChatMcpExecutionService.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { StreamingEventHandler } from './streaming_event_handler.js';
import type { StreamingEvent } from '../common/streaming_event_types.js';

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
	private wheelCheckTimeout: any = null;

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
		@IVybeChatMcpExecutionService private readonly _mcpExecutionService: IVybeChatMcpExecutionService,
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
		(globalThis as any).__vybeComposer = this.composer;
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
			this._notificationService
		));
		this.messagePages.set(messageId, messagePage);

		// Scroll to show new message (smooth scroll within chat area only)
		requestAnimationFrame(() => {
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

		// Phase 4.1: Use MCP execution service instead of direct LLM call
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

			// Debug: Log model selection
			console.log('[VYBE Chat] Selected model ID:', selectedModelId || 'none (will fail)');
			console.log('[VYBE Chat] Model state:', modelState);

			// Generate taskId first (we'll use it for event subscription)
			const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

			// Subscribe to streaming events BEFORE starting the task
			let eventSubscription: IDisposable | null = null;
			let hasReceivedEvents = false;

			// Phase 7: Create StreamingEventHandler for normalized events
			const eventHandler = new StreamingEventHandler(messagePage, options.onContentUpdate);

			eventSubscription = this._mcpExecutionService.subscribeToTaskEvents(taskId, (event: any) => {
				hasReceivedEvents = true;
				console.log('[VYBE Chat] Received event:', event.type, event);

				try {
					// Type guard: ensure event matches StreamingEvent shape
					if (event && event.type && event.task_id === taskId) {
						eventHandler.handleEvent(event as StreamingEvent);
					} else {
						// Legacy event or malformed - ignore safely
						console.debug('[VYBE Chat] Ignoring legacy/malformed event:', event);
					}
				} catch (error) {
					console.error('[VYBE Chat] Error handling event:', error, event);
				}
			});

			// Start the task (non-blocking - events will stream in)
			const taskPromise = this._mcpExecutionService.solveTask({
				goal: message,
				repoId: workspaceFolder.uri.toString(),
				files: files.length > 0 ? files : undefined,
				mode: selectedMode,
				agentLevel: selectedLevel,
				taskId: taskId, // Pass taskId so events match
				modelId: selectedModelId
			});

			// Wait for task to complete (but events are already streaming)
			const result = await taskPromise;

			// Clean up event subscription
			if (eventSubscription) {
				eventSubscription.dispose();
				eventSubscription = null;
			}

			// Phase 7: Dispose event handler
			eventHandler.dispose();

			// If we received streaming events, content parts are already updated
			// CRITICAL: When streaming is active, IGNORE result completely to prevent JSON blob rendering
			if (hasReceivedEvents) {
				// Finalize streaming content parts
				// Phase 7: Content parts are already updated via StreamingEventHandler events
				// The handler will call messagePage.finalize() on assistant.final event
				// DO NOT render result.summary or result.content - events are the source of truth
				// Note: Finalization is handled by StreamingEventHandler via the assistant.final event
			} else {
				// No events received - fallback to old behavior (build from result)
				const newContentParts: any[] = [];

				// 1. Summary as markdown (always present, normalizer ensures this)
				newContentParts.push({
					kind: 'markdown',
					content: result.summary || 'Task completed',
					isStreaming: false
				});

			// 2. Plan rendering (mode-dependent)
			if (result.plan && result.plan.length > 0) {
				// Generate plan markdown content
				const planMarkdown = result.plan.map((step, index) => {
					const statusEmoji = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '⏳';
					const desc = step.description ? `\n${step.description}` : '';
					return `${statusEmoji} **${step.title}**${desc}`;
				}).join('\n\n');

				// Only use planDocument in plan mode
				if (selectedMode === 'plan') {
					const planTitle = `Plan: ${result.goal}`;
					const planSummary = `${result.plan.length} step${result.plan.length > 1 ? 's' : ''} planned`;

					newContentParts.push({
						kind: 'planDocument',
						id: `plan-${result.taskId}`,
						filename: `task-${result.taskId}.plan.md`,
						title: planTitle,
						summary: planSummary,
						content: `# ${planTitle}\n\n${planMarkdown}`,
						isExpanded: false,
						isStreaming: false
					});
				} else {
					// In agent/ask mode, render plan as regular markdown
					newContentParts.push({
						kind: 'markdown',
						content: `## Plan\n\n${planMarkdown}`,
						isStreaming: false
					});
				}
			}

			// 3. Artifacts as basic list (markdown for now)
			if (result.artifacts && result.artifacts.length > 0) {
				const artifactsMarkdown = `## Artifacts\n\n${result.artifacts.map((artifact, index) => {
					const typeLabel = artifact.type === 'diff' ? '🔀 Diff' :
					                 artifact.type === 'file' ? '📄 File' :
					                 artifact.type === 'command' ? '💻 Command' :
					                 '📝 Note';
					const pathInfo = artifact.path ? `\n**Path:** \`${artifact.path}\`` : '';
					const metadataInfo = artifact.metadata && Object.keys(artifact.metadata).length > 0
						? `\n**Metadata:** ${JSON.stringify(artifact.metadata, null, 2)}`
						: '';
					return `${typeLabel} **${artifact.type}**${pathInfo}${metadataInfo}`;
				}).join('\n\n')}`;

				newContentParts.push({
					kind: 'markdown',
					content: artifactsMarkdown,
					isStreaming: false
				});
			}

				// Update content parts (always has at least summary)
				messagePage.updateContentParts(newContentParts);
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
			this._notificationService.error(`MCP Execution Error: ${errorMessage}`);
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
		// Scroll to bottom
		if (this.chatArea) {
			this.chatArea.scrollTop = this.chatArea.scrollHeight;
		}
	}

	public scrollToShowLatestContent(): void {
		if (!this.chatArea || this.autoScrollDisabled) {
			return;
		}

		// Auto-scroll enabled: scroll to bottom to reveal new content
		requestAnimationFrame(() => {
			if (this.chatArea && !this.autoScrollDisabled) {
				this.chatArea.scrollTop = this.chatArea.scrollHeight;
			}
		});
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
