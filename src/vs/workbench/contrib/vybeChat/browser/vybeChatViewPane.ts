/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/vybeChat.css';
import './contentParts/media/vybeChatThinking.css';
import './contentParts/media/vybeChatMarkdown.css';
import './contentParts/media/vybeChatCodeBlock.css';
import './contentParts/media/vybeChatTextEdit.css';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
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

/**
 * VYBE Chat View Pane
 * Each instance represents a single chat session as a tab in the composite bar
 */
export class VybeChatViewPane extends ViewPane {

	private readonly sessionId: string | undefined;
	private composer: MessageComposer | null = null;
	private contextDropdown: ContextDropdown | null = null;
	private usageDropdown: UsageDropdown | null = null;
	private chatArea: HTMLElement | null = null;
	private messagePages: Map<string, MessagePage> = new Map();
	private messageIndex: number = 0;
	private currentStreamingMessageId: string | null = null;

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

		// Render composer at the bottom
		this.composer = this._register(new MessageComposer(container, this._speechService));

		// VYBE-PATCH-START: test-helpers
		// Expose composer globally for testing
		(globalThis as any).__vybeComposer = this.composer;
		// VYBE-PATCH-END: test-helpers

		// Set up composer event handlers
		this._register(this.composer.onSend(message => {
			this.handleSendMessage(message);
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

	private handleSendMessage(message: string): void {
		if (!this.chatArea || !message.trim()) {
			return;
		}

		// Create message page
		const messageId = `msg-${Date.now()}`;
		this.currentStreamingMessageId = messageId; // Track current streaming message

		// Capture full composer state (pills, images)
		const contextPills = this.composer ? this.composer.getContextPillsData() : [];
		const images = this.composer ? this.composer.getImagesData() : [];

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
			}
		};

		const messagePage = this._register(new MessagePage(
			this.chatArea,
			options,
			this.markdownRendererService,
			this._modelService,
			this._languageService,
			this.instantiationService,
			this._clipboardService
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

		// TODO: Send message to AI service and start streaming
		// For now, message stays in streaming state until stop button is clicked
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

	// Test function for spacing inspection
	(window as any).__vybeTestSpacing = function () {
		// Find any element with __vybePane attached
		const allElements = document.querySelectorAll('*');
		for (const el of allElements) {
			if ((el as any).__vybePane) {
				const pane = (el as any).__vybePane as VybeChatViewPane;
				const lastPage = Array.from((pane as any).messagePages.values()).pop();
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
	(window as any).__vybeTestFilesEdited = function () {
		const composer = (globalThis as any).__vybeComposer;
		if (!composer) {
			return;
		}

		// Clear any existing files
		composer.clearEditedFiles();

		// Add sample files with different file types
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
}
