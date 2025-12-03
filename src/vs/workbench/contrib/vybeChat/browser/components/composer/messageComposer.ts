/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { $, append, addDisposableListener, getWindow } from '../../../../../../base/browser/dom.js';
import { AgentModeDropdown, type AgentMode } from './agentModeDropdown.js';
import { ModelDropdown, type ModelDropdownState } from './modelDropdown.js';

// Re-export types for external use
export type { AgentMode, ModelDropdownState };
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { ImageAttachments } from './imageAttachments.js';
import { FilesEditedToolbar } from './filesEditedToolbar.js';
import { ISpeechService } from '../../../../../../workbench/contrib/speech/common/speechService.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';

export class MessageComposer extends Disposable {
	private readonly _onSend = this._register(new Emitter<string>());
	readonly onSend: Event<string> = this._onSend.event;

	private readonly _onStop = this._register(new Emitter<void>());
	readonly onStop: Event<void> = this._onStop.event;

	private readonly _onAgentClick = this._register(new Emitter<void>());
	readonly onAgentClick: Event<void> = this._onAgentClick.event;

	private readonly _onModelClick = this._register(new Emitter<void>());
	readonly onModelClick: Event<void> = this._onModelClick.event;

	private readonly _onContextClick = this._register(new Emitter<void>());
	readonly onContextClick: Event<void> = this._onContextClick.event;

	private readonly _onUsageClick = this._register(new Emitter<void>());
	readonly onUsageClick: Event<void> = this._onUsageClick.event;

	private readonly _onImageClick = this._register(new Emitter<void>());
	readonly onImageClick: Event<void> = this._onImageClick.event;

	private readonly _onMicrophoneClick = this._register(new Emitter<void>());
	readonly onMicrophoneClick: Event<void> = this._onMicrophoneClick.event;

	private container: HTMLElement;
	private textInput: HTMLElement | null = null;
	private placeholderElement: HTMLElement | null = null;
	private selectedModel: string = 'composer-1';
	private isAutoEnabled: boolean = true;
	private autoLabelElement: HTMLElement | null = null;
	private maxBadge: HTMLElement | null = null;
	private contextButton: HTMLElement | null = null;
	private progressContainer: HTMLElement | null = null;

	// Elements that need theme updates
	private inputBox: HTMLElement | null = null;
	private progressCircleBg: SVGCircleElement | null = null;
	private agentDropdown: HTMLElement | null = null;

	// Dropdowns
	private agentModeDropdown: AgentModeDropdown | null = null;
	private currentAgentMode: AgentMode = 'agent';
	private modelDropdown: ModelDropdown | null = null;
	private modelState: ModelDropdownState = {
		isAutoEnabled: true,
		isMaxModeEnabled: false,
		selectedModelId: 'composer-1'
	};
	private autoDropdownElement: HTMLElement | null = null;

	// Image attachments (separate component)
	private imageAttachments: ImageAttachments | null = null;

	// Files edited toolbar (separate component)
	private filesEditedToolbar: FilesEditedToolbar | null = null;

	// Context pills toolbar
	private contextPillsToolbar: HTMLElement | null = null;
	private contextPillsContainer: HTMLElement | null = null;
	private contextPillsScrollable: DomScrollableElement | null = null; // Scrollable wrapper for pills
	private contextPills: Map<string, HTMLElement> = new Map(); // Map of pill ID to pill element
	private contextPillsData: Map<string, { type: 'file' | 'terminal' | 'doc'; name: string; path?: string; iconClasses?: string[] }> = new Map(); // Store pill data

	// Microphone/Speech recognition
	private isRecording: boolean = false;
	private speechCancellationTokenSource: CancellationTokenSource | null = null;
	private speechDisposables: DisposableStore | null = null;
	private sendButton: HTMLElement | null = null;
	private sendIcon: HTMLElement | null = null;
	private sendContainer: HTMLElement | null = null;

	// Bottom bar elements for transformation
	private bottomBar: HTMLElement | null = null;
	private leftSide: HTMLElement | null = null; // Agent, Model dropdowns
	private rightSide: HTMLElement | null = null; // Progress, Context, Image, Send buttons
	private voiceRecordingUI: HTMLElement | null = null; // Voice recording UI (waveform)
	private rightSideOriginalContent: HTMLElement[] = []; // Store original buttons to restore

	private openDropdownsDownward: boolean = false;
	private isReadonly: boolean = false;
	private readonlyClickHandler: (() => void) | null = null;
	private originalState: {
		content: string;
		pillsCount: number;
		imagesCount: number;
		agentMode: AgentMode;
		modelState: ModelDropdownState;
	} | null = null;
	private hasChanges: boolean = false;

	constructor(
		parent: HTMLElement,
		_speechService?: ISpeechService,
		openDropdownsDownward: boolean = false,
		startInReadonlyMode: boolean = false
	) {
		super();
		this.openDropdownsDownward = openDropdownsDownward;
		this.isReadonly = startInReadonlyMode;
		this.container = this.renderComposer();
		parent.appendChild(this.container);
		this.setupThemeObserver();
		this.injectIconFixStyles();

		// Update theme after a short delay to ensure body classes are set
		setTimeout(() => {
			this.updateTheme();
		}, 100);

		// If starting in readonly mode, apply readonly styling
		if (startInReadonlyMode) {
			this.applyReadonlyMode();
		}
	}

	private injectIconFixStyles(): void {
		const targetWindow = getWindow(this.container);
		// Check if style already exists
		if (targetWindow.document.getElementById('vybe-context-pill-icon-fix')) {
			return;
		}

		const style = targetWindow.document.createElement('style');
		style.id = 'vybe-context-pill-icon-fix';
		// Override VS Code defaults for file icons in pills - minimal overrides
		style.textContent = `
			.vybe-context-pill .show-file-icons .monaco-icon-label.height-override-important {
				padding: 0 !important;
				margin: 0 !important;
			}
			.vybe-context-pill .show-file-icons .monaco-icon-label.height-override-important::before {
				padding: 0 !important;
				padding-right: 0 !important;
				margin: 0 !important;
				background-size: 16px !important;
				background-position: center center !important;
			}
		`;
		targetWindow.document.head.appendChild(style);
	}

	private setupThemeObserver(): void {
		// Watch for theme changes on multiple elements
		const observer = new MutationObserver(() => {
			this.updateTheme();
		});

		// Watch document.body
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ['class']
		});

		// Also watch .monaco-workbench element if it exists
		const workbenchElement = document.querySelector('.monaco-workbench');
		if (workbenchElement) {
			observer.observe(workbenchElement, {
				attributes: true,
				attributeFilter: ['class']
			});
		}

		this._register({
			dispose: () => observer.disconnect()
		});
	}

	private updateTheme(): void {
		const isDarkTheme = this.isDarkTheme();

		// Update input box background and border
		if (this.inputBox) {
			// Use titleBar background for consistency across all UI elements
			const borderColor = isDarkTheme ? '#383838' : '#d9d9d9';
			this.inputBox.style.backgroundColor = 'var(--vscode-titleBar-activeBackground)';
			this.inputBox.style.borderColor = borderColor;
		}

		// Update progress circle background
		if (this.progressCircleBg) {
			this.progressCircleBg.setAttribute('stroke', isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)');
		}

		// Update agent dropdown background
		if (this.agentDropdown) {
			this.agentDropdown.style.backgroundColor = isDarkTheme ? '#272727' : 'rgba(0, 0, 0, 0.05)';
		}

		// Update send button (if we add theme-specific styling later)
		// Send button is always green, so no change needed for now
	}

	private isDarkTheme(): boolean {
		// Check multiple possible locations for theme info
		const workbenchElement = document.querySelector('.monaco-workbench');

		// Check body
		const isDark = document.body.classList.contains('vs-dark') ||
			document.body.classList.contains('hc-black') ||
			// Also check workbench element
			(workbenchElement?.classList.contains('vs-dark') ?? false) ||
			(workbenchElement?.classList.contains('hc-black') ?? false);

		return !!isDark;
	}

	private renderComposer(): HTMLElement {
		const isDarkTheme = this.isDarkTheme();

		// Outer container with padding
		const composerOuter = $('.vybe-ai-composer-outer');
		composerOuter.style.display = 'flex';
		composerOuter.style.flexDirection = 'column';
		composerOuter.style.margin = '0px 10px 10px';
		composerOuter.style.flexShrink = '0';
		composerOuter.style.position = 'relative'; // For absolute positioning of toolbar

		// Files edited toolbar (positioned absolutely at top of composer, inserted BEFORE inputBox)
		this.filesEditedToolbar = this._register(new FilesEditedToolbar(composerOuter));

		// Main input box container with VYBE theme-aware background
		this.inputBox = $('.vybe-ai-input-box');
		this.inputBox.style.position = 'relative';
		this.inputBox.style.borderRadius = '8px';
		// Dark mode: #1e1f21, Light mode: #f8f8f9
		this.inputBox.style.backgroundColor = isDarkTheme ? '#1e1f21' : '#f8f8f9';
		// Dark mode: #383838, Light mode: #d9d9d9
		this.inputBox.style.border = isDarkTheme
			? '1px solid #383838'
			: '1px solid #d9d9d9';
		this.inputBox.style.transition = 'box-shadow 100ms ease-in-out, border-color 100ms ease-in-out';
		this.inputBox.style.padding = '8px 8px 4px 8px'; // Top, Right, Bottom, Left - top padding increased to 8px
		this.inputBox.style.boxSizing = 'border-box';
		this.inputBox.style.display = 'flex';
		this.inputBox.style.flexDirection = 'column';
		this.inputBox.style.alignItems = 'stretch';
		this.inputBox.style.gap = '0px'; // No gap, use margin-top on bottom bar instead
		this.inputBox.style.zIndex = '1';
		this.inputBox.style.opacity = '1';
		this.inputBox.style.pointerEvents = 'auto';

		// Inner content wrapper
		const innerContent = $('.vybe-ai-input-inner');
		innerContent.style.display = 'flex';
		innerContent.style.flexDirection = 'column';
		innerContent.style.gap = '0px';
		innerContent.style.width = '100%';
		innerContent.style.boxSizing = 'border-box';
		innerContent.style.flex = 'unset';

		// Text input area
		const textInputArea = this.renderTextInput(isDarkTheme);
		innerContent.appendChild(textInputArea);

		// Image attachments toolbar (above context pills, hidden by default)
		this.imageAttachments = this._register(new ImageAttachments(innerContent));
		if (this.imageAttachments.toolbar) {
			innerContent.insertBefore(this.imageAttachments.toolbar, textInputArea);
		}
		// Set up change callback
		this.imageAttachments.setOnChangeCallback(() => {
			this.notifyImageChange();
		});

		// Context pills toolbar (hidden by default, shows when pills are added)
		// Insert it right before the text input, not as a separate section
		const pillsToolbar = this.renderContextPillsToolbar(isDarkTheme);
		innerContent.insertBefore(pillsToolbar, textInputArea);

		// Bottom bar (mode/model + action buttons)
		const bottomBar = this.renderBottomBar(isDarkTheme);
		innerContent.appendChild(bottomBar);

		this.inputBox.appendChild(innerContent);

		// Append toolbar first (if it exists)
		if (this.filesEditedToolbar && this.filesEditedToolbar.toolbar) {
			composerOuter.appendChild(this.filesEditedToolbar.toolbar);
		}

		// Then append inputBox (toolbar will appear above due to absolute positioning with bottom: 100%)
		composerOuter.appendChild(this.inputBox);

		return composerOuter;
	}

	private renderTextInput(isDarkTheme: boolean): HTMLElement {
		// Outer container for ScrollableElement
		const inputContainer = $('.vybe-ai-text-input-container');
		inputContainer.style.position = 'relative';
		inputContainer.style.width = '100%';
		inputContainer.style.minHeight = '20px';
		inputContainer.style.maxHeight = '200px';
		inputContainer.style.overflow = 'hidden'; // Prevent overflow
		inputContainer.style.overflowX = 'hidden'; // Explicitly prevent horizontal scroll
		// Don't set height here - let it be controlled by content

		// Content wrapper that will be scrollable
		const contentWrapper = $('.vybe-ai-text-input-content');
		contentWrapper.style.width = '100%';
		contentWrapper.style.minHeight = '20px';
		// Don't set height here - let it grow naturally with textInput
		contentWrapper.style.boxSizing = 'border-box';
		contentWrapper.style.overflowX = 'hidden'; // Prevent horizontal scroll from 200% grid

		// Grid wrapper (like Cursor's aislash-editor-grid)
		const gridWrapper = $('.vybe-ai-text-input-grid');
		gridWrapper.style.display = 'grid';
		gridWrapper.style.position = 'relative';
		gridWrapper.style.gridTemplateColumns = '1fr 1fr';
		gridWrapper.style.width = '200%'; // 200% width with placeholder at left: -100%
		gridWrapper.style.minHeight = '20px';
		gridWrapper.style.overflowX = 'hidden'; // Prevent horizontal scroll from grid
		// Don't set height here - let it grow naturally with textInput

		// Text input (column 1)
		const textInput = $('.vybe-ai-text-input');
		textInput.contentEditable = 'true';
		textInput.setAttribute('role', 'textbox');
		textInput.setAttribute('aria-label', 'Message input');
		textInput.style.gridArea = '1 / 1 / 1 / 1';
		textInput.style.resize = 'none';
		textInput.style.overflow = 'hidden';
		textInput.style.lineHeight = '1.5'; // 1.5 × 13px = 19.5px per line
		textInput.style.fontSize = '13px';
		textInput.style.color = 'var(--vscode-input-foreground)';
		textInput.style.backgroundColor = 'transparent';
		textInput.style.display = 'block'; // Ensure block display for proper line breaks
		textInput.style.outline = 'none';
		textInput.style.border = 'none';
		textInput.style.overflowWrap = 'break-word';
		textInput.style.wordBreak = 'break-word';
		textInput.style.padding = '0';
		textInput.style.margin = '0'; // Remove any default margin
		textInput.style.minHeight = '15px'; // At least one line
		textInput.style.height = 'auto'; // Grow with content
		textInput.style.userSelect = 'text';
		textInput.style.whiteSpace = 'pre-wrap';

		this.textInput = textInput;

		// Placeholder container (column 2)
		const placeholderContainer = $('.vybe-ai-text-input-placeholder-container');
		placeholderContainer.style.gridArea = '1 / 2 / 1 / 2';

		// Placeholder element
		const placeholder = $('.vybe-ai-text-input-placeholder');
		placeholder.textContent = this.getPlaceholderForMode(this.currentAgentMode);
		placeholder.style.position = 'relative';
		placeholder.style.top = '0';
		placeholder.style.left = '-100%';
		placeholder.style.padding = '0';
		placeholder.style.pointerEvents = 'none';
		placeholder.style.userSelect = 'none';
		placeholder.style.lineHeight = '1.5'; // 1.5 × 13px = 19.5px per line
		placeholder.style.fontSize = '13px';
		placeholder.style.color = 'var(--vscode-input-placeholderForeground)';
		placeholder.style.opacity = '0.5';

		// Store placeholder reference
		this.placeholderElement = placeholder;

		// Show/hide placeholder based on content
		this._register(addDisposableListener(textInput, 'input', () => {
			this.updatePlaceholderVisibility();
		}));


		// Initial state - show placeholder
		placeholder.style.display = 'block';

		// Assemble the structure
		placeholderContainer.appendChild(placeholder);
		gridWrapper.appendChild(textInput);
		gridWrapper.appendChild(placeholderContainer);
		contentWrapper.appendChild(gridWrapper);

		// Create VS Code ScrollableElement - ONLY vertical scrolling
		const scrollableElement = this._register(new DomScrollableElement(contentWrapper, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden, // Completely disable horizontal
			useShadows: false,
			verticalScrollbarSize: 6, // Thinner scrollbar (was 10)
			horizontalScrollbarSize: 0 // No horizontal scrollbar at all
		}));

		const scrollableDomNode = scrollableElement.getDomNode();
		scrollableDomNode.style.height = '100%';
		scrollableDomNode.style.maxHeight = '200px';
		scrollableDomNode.style.overflowX = 'hidden !important'; // Force prevent horizontal scroll
		inputContainer.appendChild(scrollableDomNode);

		// Ensure scrollable element never allows horizontal scrolling
		scrollableElement.setScrollDimensions({
			width: contentWrapper.offsetWidth,
			scrollWidth: contentWrapper.offsetWidth // Same as width = no horizontal scroll
		});

		// Update scrollable element when content changes
		this._register(addDisposableListener(textInput, 'input', () => {
			// Update content height
			const textHeight = textInput.scrollHeight;
			contentWrapper.style.height = Math.min(textHeight, 200) + 'px';
			inputContainer.style.height = Math.min(textHeight, 200) + 'px';

			// Lock horizontal dimensions BEFORE scanning (prevent detection of 200% grid)
			const containerWidth = inputContainer.offsetWidth;
			scrollableElement.setScrollDimensions({
				width: containerWidth,
				scrollWidth: containerWidth, // Same as width = no horizontal scroll
				height: Math.min(textHeight, 200),
				scrollHeight: textHeight
			});

			// Lock horizontal scroll position to 0 (prevent any horizontal movement)
			scrollableElement.setScrollPosition({ scrollLeft: 0 });
		}));

		// Lock horizontal scroll on any scroll event
		this._register(addDisposableListener(scrollableDomNode, 'scroll', (e) => {
			const target = e.target as HTMLElement;
			if (target.scrollLeft !== 0) {
				target.scrollLeft = 0; // Force back to 0
			}
		}));

		// Set initial height
		contentWrapper.style.height = '20px';
		inputContainer.style.height = '20px';

		return inputContainer;
	}

	private getPlaceholderForMode(mode: AgentMode): string {
		switch (mode) {
			case 'agent':
				return 'Tell me what you want — I\'ll take it from here.';
			case 'plan':
				return 'Start with an idea — I\'ll map out the plan before acting.';
			case 'ask':
				return 'What would you like to understand?';
			default:
				return 'Tell me what you want — I\'ll take it from here.';
		}
	}

	private updatePlaceholder(mode: AgentMode): void {
		if (this.placeholderElement) {
			const newPlaceholder = this.getPlaceholderForMode(mode);
			this.placeholderElement.textContent = newPlaceholder;
		}
	}

	private renderBottomBar(isDarkTheme: boolean): HTMLElement {
		// Main container - grid layout matching Cursor
		const bottomBar = $('.vybe-ai-bottom-bar');
		bottomBar.style.display = 'grid';
		bottomBar.style.gridTemplateColumns = '4fr 1fr';
		bottomBar.style.alignItems = 'center';
		bottomBar.style.height = '28px';
		bottomBar.style.boxSizing = 'border-box';
		bottomBar.style.flex = '1';
		bottomBar.style.justifyContent = 'space-between';
		bottomBar.style.width = '100%';
		bottomBar.style.marginTop = '9px'; // Gap between input area and bottom toolbar (matches Cursor's calc(1px + 0.5rem))

		this.bottomBar = bottomBar;

		// Left side: Mode and Model dropdowns
		const leftSide = $('.vybe-ai-bottom-left');
		leftSide.style.display = 'flex';
		leftSide.style.alignItems = 'center';
		leftSide.style.gap = '4px';
		leftSide.style.marginRight = '6px';
		leftSide.style.flexShrink = '1';
		leftSide.style.flexGrow = '0';
		leftSide.style.minWidth = '0';
		leftSide.style.height = '20px';
		leftSide.style.gridColumn = '1'; // Explicitly place in first grid column (4fr)

		// Agent dropdown (pill-shaped with background on hover)
		this.agentDropdown = $('.vybe-ai-agent-dropdown');
		this.agentDropdown.style.display = 'flex';
		this.agentDropdown.style.gap = '4px'; // Gap between "Agent" text and chevron
		this.agentDropdown.style.fontSize = '12px';
		this.agentDropdown.style.alignItems = 'center';
		this.agentDropdown.style.lineHeight = '24px';
		this.agentDropdown.style.minWidth = '0';
		this.agentDropdown.style.maxWidth = '100%';
		this.agentDropdown.style.padding = '3px 6px 3px 7px'; // Matching Cursor: 7px left, 6px right
		this.agentDropdown.style.borderRadius = '24px';
		this.agentDropdown.style.flexShrink = '0';
		this.agentDropdown.style.cursor = 'pointer';
		this.agentDropdown.style.border = 'none';
		// Default background - Dark: #272727, Light: rgba(0, 0, 0, 0.05)
		this.agentDropdown.style.backgroundColor = isDarkTheme
			? '#272727'
			: 'rgba(0, 0, 0, 0.05)';
		this.agentDropdown.style.transition = 'background-color 0.15s ease';

		// Agent inner content
		const agentInner = $('.vybe-ai-agent-inner');
		agentInner.style.display = 'flex';
		agentInner.style.alignItems = 'center';
		agentInner.style.gap = '4px';
		agentInner.style.minWidth = '0';
		agentInner.style.maxWidth = '100%';
		agentInner.style.overflow = 'hidden';

		// Gear icon
		const gearIcon = $('span.codicon.codicon-gear');
		gearIcon.style.fontSize = '14px';
		gearIcon.style.flexShrink = '0';
		gearIcon.style.width = '14px';
		gearIcon.style.height = '14px';
		gearIcon.style.display = 'flex';
		gearIcon.style.alignItems = 'center';
		gearIcon.style.justifyContent = 'center';
		gearIcon.style.opacity = '0.5';
		agentInner.appendChild(gearIcon);

		// Agent label with text
		const agentLabel = $('.vybe-ai-agent-label');
		agentLabel.style.minWidth = '0';
		agentLabel.style.maxWidth = '100%';
		agentLabel.style.overflow = 'hidden';
		agentLabel.style.textOverflow = 'ellipsis';
		agentLabel.style.whiteSpace = 'nowrap';
		agentLabel.style.lineHeight = '12px';
		agentLabel.style.display = 'flex';
		agentLabel.style.alignItems = 'baseline';
		agentLabel.style.gap = '4px';
		agentLabel.style.height = '13px';
		agentLabel.style.fontWeight = '400';

		const agentText = document.createElement('span');
		agentText.textContent = 'Agent';
		agentText.style.opacity = '0.8';
		agentText.style.maxWidth = '120px';
		agentText.style.overflow = 'hidden';
		agentText.style.height = '13px';
		agentText.style.textOverflow = 'ellipsis';
		agentText.style.whiteSpace = 'nowrap';
		agentText.style.minWidth = '0';
		agentText.style.transition = 'opacity 0.15s ease';
		agentLabel.appendChild(agentText);

		agentInner.appendChild(agentLabel);
		this.agentDropdown.appendChild(agentInner);

		// Agent chevron
		const agentChevron = $('span.codicon.codicon-chevron-up');
		agentChevron.style.fontSize = '10px';
		agentChevron.style.flexShrink = '0';
		agentChevron.style.opacity = '0.8';
		agentChevron.style.transition = 'opacity 0.15s ease';
		this.agentDropdown.appendChild(agentChevron);

		// Hover effect for Agent dropdown - highlight text (matching model button)
		this._register(
			addDisposableListener(this.agentDropdown, 'mouseenter', () => {
				agentText.style.opacity = '1';
				agentChevron.style.opacity = '1';
			})
		);
		this._register(
			addDisposableListener(this.agentDropdown, 'mouseleave', () => {
				agentText.style.opacity = '0.8';
				agentChevron.style.opacity = '0.8';
			})
		);

		this._register(
			addDisposableListener(this.agentDropdown, 'click', (e) => {
				e.stopPropagation();
				this.showAgentModeDropdown();
			})
		);

		leftSide.appendChild(this.agentDropdown);

		// Auto (Model) dropdown - simpler, no pill background
		this.autoDropdownElement = $('.vybe-ai-auto-dropdown');
		this.autoDropdownElement.style.display = 'flex';
		this.autoDropdownElement.style.gap = '4px';
		this.autoDropdownElement.style.fontSize = '12px';
		this.autoDropdownElement.style.alignItems = 'center';
		this.autoDropdownElement.style.lineHeight = '12px';
		this.autoDropdownElement.style.cursor = 'pointer';
		this.autoDropdownElement.style.minWidth = '0';
		this.autoDropdownElement.style.maxWidth = '100%';
		this.autoDropdownElement.style.padding = '2.5px 6px';
		this.autoDropdownElement.style.borderRadius = '23px';
		this.autoDropdownElement.style.border = 'none';
		this.autoDropdownElement.style.backgroundColor = 'transparent';
		this.autoDropdownElement.style.flexShrink = '1';
		this.autoDropdownElement.style.overflow = 'hidden';
		this.autoDropdownElement.style.transition = 'background-color 0.15s ease';

		// Auto inner
		const autoInner = $('.vybe-ai-auto-inner');
		autoInner.style.display = 'flex';
		autoInner.style.alignItems = 'center';
		autoInner.style.gap = '4px';
		autoInner.style.minWidth = '0';
		autoInner.style.maxWidth = '100%';
		autoInner.style.overflow = 'hidden';
		autoInner.style.flexShrink = '1';
		autoInner.style.flexGrow = '1';

		// Auto label
		const autoLabel = $('.vybe-ai-auto-label');
		autoLabel.style.minWidth = '0';
		autoLabel.style.textOverflow = 'ellipsis';
		autoLabel.style.whiteSpace = 'nowrap';
		autoLabel.style.lineHeight = '12px';
		autoLabel.style.display = 'flex';
		autoLabel.style.alignItems = 'center';
		autoLabel.style.gap = '4px';
		autoLabel.style.overflow = 'hidden';
		autoLabel.style.height = '16px';
		autoLabel.style.flexShrink = '1';
		autoLabel.style.flexGrow = '1';

		const autoText = document.createElement('span');
		// Show "Auto" if auto is enabled, otherwise show selected model name
		autoText.textContent = this.isAutoEnabled ? 'Auto' : this.selectedModel;
		autoText.style.whiteSpace = 'nowrap';
		autoText.style.overflow = 'hidden';
		autoText.style.textOverflow = 'ellipsis';
		autoText.style.lineHeight = 'normal';
		autoText.style.maxWidth = '100%';
		autoText.style.flex = '1 1 auto';
		autoText.style.minWidth = '0';
		autoText.style.paddingBottom = '1px';
		autoText.style.opacity = '0.6'; // Default opacity
		autoText.style.transition = 'opacity 0.15s ease';
		autoLabel.appendChild(autoText);

		// Store reference to update dynamically
		this.autoLabelElement = autoText;

		autoInner.appendChild(autoLabel);
		this.autoDropdownElement.appendChild(autoInner);

		// Auto chevron
		const autoChevron = $('span.codicon.codicon-chevron-up');
		autoChevron.style.fontSize = '10px';
		autoChevron.style.flexShrink = '0';
		autoChevron.style.opacity = '0.6'; // Default opacity
		autoChevron.style.transition = 'opacity 0.15s ease';
		this.autoDropdownElement.appendChild(autoChevron);

		// Hover effect for Auto dropdown - only highlight text (no background)
		this._register(
			addDisposableListener(this.autoDropdownElement, 'mouseenter', () => {
				autoText.style.opacity = '1';
				autoChevron.style.opacity = '1';
			})
		);
		this._register(
			addDisposableListener(this.autoDropdownElement, 'mouseleave', () => {
				autoText.style.opacity = '0.6';
				autoChevron.style.opacity = '0.6';
			})
		);

		this._register(
			addDisposableListener(this.autoDropdownElement, 'click', (e) => {
				e.stopPropagation();
				this.showModelDropdown();
			})
		);

		leftSide.appendChild(this.autoDropdownElement);
		bottomBar.appendChild(leftSide);

		this.leftSide = leftSide;

		// Right side: Action buttons - part of grid layout (NOT absolute)
		const rightSide = $('.button-container.composer-button-area');
		rightSide.style.display = 'flex';
		rightSide.style.alignItems = 'center';
		rightSide.style.gap = '4px';
		rightSide.style.justifyContent = 'flex-end';
		rightSide.style.height = '28px';
		rightSide.style.gridColumn = '2'; // Explicitly place in second grid column (1fr)

		// MAX badge (shown when MAX mode is enabled)
		this.maxBadge = $('div');
		this.maxBadge.className = 'max-badge';
		this.maxBadge.textContent = 'MAX';
		this.maxBadge.style.cssText = `
			display: ${this.modelState.isMaxModeEnabled ? 'flex' : 'none'};
			align-items: center;
			justify-content: center;
			font-size: 11px;
			font-weight: 600;
			color: #3ecf8e;
			padding: 0 4px;
			height: 20px;
			line-height: 20px;
		`;
		rightSide.appendChild(this.maxBadge);

		// Progress circle indicator (clickable)
		this.progressContainer = $('div');
		this.progressContainer.className = 'flex items-center';
		this.progressContainer.style.cursor = 'pointer'; // Make it clickable
		this.progressContainer.style.height = '20px';
		this.progressContainer.style.alignItems = 'center';
		this.progressContainer.style.justifyContent = 'center';
		this.progressContainer.style.display = 'flex';
		this.progressContainer.style.flexDirection = 'row';
		const progressContainer = this.progressContainer;

		const progressInner = $('div');
		progressInner.style.width = '20px';
		progressInner.style.height = '20px';
		progressInner.style.display = 'flex';
		progressInner.style.alignItems = 'center';
		progressInner.style.justifyContent = 'center';
		progressInner.style.paddingTop = '1px';
		progressInner.style.marginLeft = '1px';

		const progressSvgContainer = $('div');
		progressSvgContainer.style.display = 'inline-flex';
		progressSvgContainer.style.alignItems = 'center';
		progressSvgContainer.style.justifyContent = 'center';
		progressSvgContainer.style.width = '15px';
		progressSvgContainer.style.height = '15px';
		progressSvgContainer.style.position = 'relative';

		// Create SVG element
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.style.position = 'absolute';
		svg.setAttribute('width', '15');
		svg.setAttribute('height', '15');
		svg.setAttribute('viewBox', '0 0 15 15');

		// Background circle (full circle) - more visible color
		this.progressCircleBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		this.progressCircleBg.setAttribute('fill', 'none');
		this.progressCircleBg.setAttribute('cx', '7.5');
		this.progressCircleBg.setAttribute('cy', '7.5');
		this.progressCircleBg.setAttribute('r', '5.5');
		this.progressCircleBg.setAttribute('stroke', isDarkTheme ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)');
		this.progressCircleBg.setAttribute('stroke-width', '2');

		// Progress circle (partial circle showing progress) - VYBE green
		const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		progressCircle.setAttribute('fill', 'none');
		progressCircle.setAttribute('stroke-linecap', 'round');
		progressCircle.setAttribute('cx', '7.5');
		progressCircle.setAttribute('cy', '7.5');
		progressCircle.setAttribute('r', '5.5');
		progressCircle.setAttribute('stroke', '#3ecf8e'); // VYBE green for visibility
		progressCircle.setAttribute('stroke-width', '2');
		progressCircle.setAttribute('stroke-dasharray', '34.55751918948772');
		progressCircle.setAttribute('stroke-dashoffset', '8.614152824182781'); // ~75% progress
		progressCircle.setAttribute('transform', 'rotate(-90 7.5 7.5)');

		svg.appendChild(this.progressCircleBg);
		svg.appendChild(progressCircle);
		progressSvgContainer.appendChild(svg);
		progressInner.appendChild(progressSvgContainer);
		progressContainer.appendChild(progressInner);

		// Make it clickable - fires usage click event (for context usage stats)
		this._register(
			addDisposableListener(progressContainer, 'click', () => {
				this._onUsageClick.fire();
			})
		);

		rightSide.appendChild(progressContainer);

		// Context button (layers icon) - same styling as attach button
		const contextButtonWrapper = $('div');
		contextButtonWrapper.id = 'composer-bottom-add-context';

		this.contextButton = $('.anysphere-icon-button');
		this.contextButton.style.width = '20px';
		this.contextButton.style.height = '20px';
		this.contextButton.style.display = 'flex';
		this.contextButton.style.alignItems = 'center';
		this.contextButton.style.justifyContent = 'center';
		this.contextButton.style.cursor = 'pointer';
		this.contextButton.style.backgroundColor = 'transparent';
		this.contextButton.style.border = 'none';
		this.contextButton.style.flexShrink = '0';
		this.contextButton.style.opacity = '0.5'; // Default opacity

		const contextIcon = $('span.codicon.codicon-layers');
		contextIcon.style.fontSize = '16px';
		contextIcon.style.width = '16px';
		contextIcon.style.height = '16px';
		contextIcon.style.position = 'relative';
		contextIcon.style.top = '0.5px';
		contextIcon.style.fontWeight = '500'; // Slightly bold
		contextIcon.style.display = 'block';
		contextIcon.style.textAlign = 'center';
		contextIcon.style.lineHeight = '16px';
		this.contextButton.appendChild(contextIcon);
		contextButtonWrapper.appendChild(this.contextButton);

		this._register(
			addDisposableListener(this.contextButton, 'click', () => {
				this._onContextClick.fire();
			})
		);

		rightSide.appendChild(contextButtonWrapper);

		// Image/PDF attachment button (20x20, transparent)
		const imageButton = $('.anysphere-icon-button');
		imageButton.style.width = '20px';
		imageButton.style.height = '20px';
		imageButton.style.display = 'flex';
		imageButton.style.alignItems = 'center';
		imageButton.style.justifyContent = 'center';
		imageButton.style.cursor = 'pointer';
		imageButton.style.backgroundColor = 'transparent';
		imageButton.style.border = 'none';
		imageButton.style.flexShrink = '0';
		imageButton.style.marginLeft = '1px';
		imageButton.style.opacity = '0.5'; // Default opacity

		const imageIcon = $('span.codicon.codicon-attach');
		imageIcon.style.fontSize = '16px';
		imageIcon.style.width = '16px';
		imageIcon.style.height = '16px';
		imageIcon.style.position = 'relative';
		imageIcon.style.top = '0.5px';
		imageIcon.style.fontWeight = '500'; // Slightly bold
		imageIcon.style.display = 'block';
		imageIcon.style.textAlign = 'center';
		imageIcon.style.lineHeight = '16px';
		imageButton.appendChild(imageIcon);

		// Hidden file input for images and PDFs
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'image/*,.pdf';
		fileInput.multiple = true;
		fileInput.style.display = 'none';
		imageButton.appendChild(fileInput);

		this._register(
			addDisposableListener(imageButton, 'click', () => {
				fileInput.click(); // Open file picker
			})
		);

		// Handle file selection
		this._register(
			addDisposableListener(fileInput, 'change', (e) => {
				const files = (e.target as HTMLInputElement).files;
				if (files && this.imageAttachments) {
					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						if (file.type.startsWith('image/')) {
							this.imageAttachments.addImage(file);
						}
					}
				}
				// Reset input so same file can be selected again
				fileInput.value = '';
			})
		);

		rightSide.appendChild(imageButton);

		this.rightSide = rightSide;

		// Store references to buttons that need to be hidden during voice mode
		// Store them in order: progress, context, image (but not send button)
		// Note: Store after all buttons are appended to rightSide

		// Send/Stop button (20x20, in send-with-mode container)
		// This container must NEVER move - keep in flex flow but use flex properties to maintain position
		const sendContainer = $('.send-with-mode');
		sendContainer.style.position = 'relative';
		sendContainer.style.display = 'inline-block';
		sendContainer.style.width = '24px';
		sendContainer.style.height = '20px';
		sendContainer.style.flexShrink = '0'; // Never shrink
		sendContainer.style.flexGrow = '0'; // Never grow
		sendContainer.style.minWidth = '24px'; // Fixed minimum width
		sendContainer.style.maxWidth = '24px'; // Fixed maximum width

		const sendButton = $('.anysphere-icon-button');
		sendButton.setAttribute('data-outlined', 'true');
		sendButton.setAttribute('data-variant', 'background');
		sendButton.setAttribute('data-mode', 'agent');
		sendButton.setAttribute('data-stop-button', 'false'); // Will toggle to true when sending
		sendButton.setAttribute('data-recording', 'false'); // Track if recording
		sendButton.setAttribute('data-is-mic', 'true'); // Track if showing mic icon
		// Fixed dimensions - NEVER change these
		sendButton.style.width = '20px';
		sendButton.style.height = '20px';
		sendButton.style.minWidth = '20px';
		sendButton.style.maxWidth = '20px';
		sendButton.style.minHeight = '20px';
		sendButton.style.maxHeight = '20px';
		sendButton.style.display = 'flex';
		sendButton.style.alignItems = 'center';
		sendButton.style.justifyContent = 'center';
		sendButton.style.cursor = 'pointer';
		sendButton.style.border = 'none';
		sendButton.style.borderRadius = '50%'; // CIRCULAR
		sendButton.style.flexShrink = '0';
		sendButton.style.flexGrow = '0';
		sendButton.style.marginLeft = '4px';
		sendButton.style.position = 'relative';
		sendButton.style.opacity = '1';
		// Green circular background - VYBE green
		sendButton.style.backgroundColor = '#3ecf8e';

		const sendIcon = $('span.codicon.codicon-arrow-up'); // Start with arrow-up (speech feature disabled)
		sendIcon.style.fontSize = '16px';
		sendIcon.style.width = '16px';
		sendIcon.style.height = '16px';
		sendIcon.style.color = '#141414'; // Dark color for contrast on green
		sendIcon.style.display = 'flex';
		sendIcon.style.alignItems = 'center';
		sendIcon.style.justifyContent = 'center';
		sendButton.appendChild(sendIcon);
		sendContainer.appendChild(sendButton);

		// Store references
		this.sendButton = sendButton;
		this.sendIcon = sendIcon;
		this.sendContainer = sendContainer;

		// Store references to buttons that need to be hidden during voice mode
		// Store them after send button is added
		this.rightSideOriginalContent = [
			progressContainer,
			contextButtonWrapper,
			imageButton
		] as HTMLElement[];

		// Update icon based on input content
		if (this.textInput) {
			this._register(addDisposableListener(this.textInput, 'input', () => {
				this.updateSendButtonIcon();
			}));
		}

		this._register(
			addDisposableListener(sendButton, 'click', () => {
				const isStopButton = sendButton.getAttribute('data-stop-button') === 'true';
				if (isStopButton) {
					this._onStop.fire();
					// Switch back to send
					sendButton.setAttribute('data-stop-button', 'false');
					this.updateSendButtonIcon();
				} else {
					// Get message from input
					if (this.textInput) {
						// Use getTextWithLineBreaks to preserve line breaks
						const messageText = this.getTextWithLineBreaks(this.textInput).trim();
						if (messageText) {
							this._onSend.fire(messageText);
							// Clear input
							this.clearInput();
							// Switch to stop button
							sendButton.setAttribute('data-stop-button', 'true');
							sendIcon.className = 'codicon codicon-debug-stop';
						}
					}
				}
			})
		);

		rightSide.appendChild(sendContainer);

		// Append rightSide to bottomBar (part of grid, not absolute)
		bottomBar.appendChild(rightSide);

		return bottomBar;
	}

	clearInput(): void {
		if (this.textInput) {
			this.textInput.textContent = '';
			// Trigger input event to show placeholder
			const inputEvent = document.createEvent('Event');
			inputEvent.initEvent('input', true, false);
			this.textInput.dispatchEvent(inputEvent);
		}

		// Clear context pills
		this.contextPillsData.clear();
		if (this.contextPillsContainer) {
			while (this.contextPillsContainer.firstChild) {
				this.contextPillsContainer.removeChild(this.contextPillsContainer.firstChild);
			}
		}
		this.contextPills.clear();
		if (this.contextPillsToolbar) {
			this.contextPillsToolbar.style.display = 'none';
		}

		// Clear images
		if (this.imageAttachments) {
			this.imageAttachments.clear();
		}
	}

	/**
	 * Get text from contenteditable with line breaks preserved
	 * Converts <br> tags and block elements to \n
	 */
	private getTextWithLineBreaks(element: HTMLElement): string {
		let text = '';
		const nodes = element.childNodes;

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];

			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || '';
			} else if (node.nodeName === 'BR') {
				text += '\n';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				// For block elements like <p>, <div>, add newline before and after
				const elem = node as HTMLElement;
				const display = window.getComputedStyle(elem).display;
				if (display === 'block' && text && !text.endsWith('\n')) {
					text += '\n';
				}
				text += this.getTextWithLineBreaks(elem);
				if (display === 'block' && !text.endsWith('\n')) {
					text += '\n';
				}
			}
		}

		return text;
	}

	public switchToSendButton(): void {
		// Switch composer button back to send mode
		if (this.sendButton) {
			this.sendButton.setAttribute('data-stop-button', 'false');
			this.updateSendButtonIcon();
		}
	}

	public switchToStopButton(): void {
		// Switch composer button to stop mode
		if (this.sendButton && this.sendIcon) {
			this.sendButton.setAttribute('data-stop-button', 'true');
			this.sendIcon.className = 'codicon codicon-debug-stop';
		}
	}

	public setInputText(text: string): void {
		// Set the text input content with proper line break handling for contenteditable
		if (this.textInput) {

			// If in readonly mode, temporarily remove max-height constraint to allow proper measurement
			const wasReadonly = this.isReadonly;
			const textInputContainer = this.container.querySelector('.vybe-ai-text-input-container') as HTMLElement;
			const contentWrapper = this.container.querySelector('.vybe-ai-text-input-content') as HTMLElement;
			let originalMaxHeight: string | null = null;
			let originalContainerMaxHeight: string | null = null;

			if (wasReadonly && this.textInput) {
				originalMaxHeight = this.textInput.style.maxHeight;
				this.textInput.style.maxHeight = 'none';
				this.textInput.style.overflow = 'visible';

				if (textInputContainer) {
					originalContainerMaxHeight = textInputContainer.style.maxHeight;
					textInputContainer.style.maxHeight = 'none';
					textInputContainer.style.overflow = 'visible';
					// Remove any explicit height that was set
					textInputContainer.style.height = '';
				}

				if (contentWrapper) {
					// Remove any explicit height that was set
					contentWrapper.style.height = '';
				}
			}

			// Clear existing content safely (avoid TrustedHTML error)
			while (this.textInput.firstChild) {
				this.textInput.removeChild(this.textInput.firstChild);
			}

			// For contenteditable, we need to create proper DOM structure with <br> tags
			// Split by newlines and create text nodes with <br> elements
			const lines = text.split('\n');
			lines.forEach((line, index) => {
				// Create text node for the line
				const textNode = document.createTextNode(line);
				this.textInput!.appendChild(textNode);

				// Add <br> after each line except the last
				if (index < lines.length - 1) {
					const br = document.createElement('br');
					this.textInput!.appendChild(br);
				}
			});

			// Force multiple reflows to ensure height is calculated
			void this.textInput.offsetHeight;
			void this.textInput.scrollHeight;

			// Wait for next frame to ensure layout is complete
			requestAnimationFrame(() => {
				// Reapply readonly mode constraints if needed
				if (wasReadonly && this.textInput) {
					this.textInput.style.maxHeight = originalMaxHeight || '78px';
					this.textInput.style.overflow = 'hidden';

					if (textInputContainer) {
						textInputContainer.style.maxHeight = originalContainerMaxHeight || '78px';
						textInputContainer.style.overflow = 'hidden';
						// Don't set explicit height - let it grow naturally up to maxHeight
						textInputContainer.style.height = '';
						// Reapply mask-image fade effect
						textInputContainer.style.maskImage = 'linear-gradient(black 65%, transparent 100%)';
						textInputContainer.style.webkitMaskImage = 'linear-gradient(black 65%, transparent 100%)';
					}

					if (contentWrapper) {
						// Don't set explicit height - let it grow naturally
						contentWrapper.style.height = '';
					}
				}
			});

			// Trigger input event to update placeholder and button state
			const inputEvent = document.createEvent('Event');
			inputEvent.initEvent('input', true, false);
			this.textInput.dispatchEvent(inputEvent);

			// Focus the input only if not in readonly mode
			if (!this.isReadonly) {
				this.textInput.focus();
				// Move cursor to end
				const range = document.createRange();
				range.selectNodeContents(this.textInput);
				range.collapse(false);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
			}
		}
	}

	public setReadonly(readonly: boolean, onClickToEdit?: () => void): void {
		this.isReadonly = readonly;
		this.readonlyClickHandler = onClickToEdit || null;

		if (readonly) {
			// Capture original state when entering readonly mode
			this.captureOriginalState();
			this.hasChanges = false;
			this.applyReadonlyMode();
		} else {
			this.applyEditMode();
			// Start monitoring for changes
			this.setupChangeDetection();
		}
	}

	private captureOriginalState(): void {
		this.originalState = {
			content: this.textInput?.textContent || '',
			pillsCount: this.contextPillsData.size,
			imagesCount: this.imageAttachments?.getImages().length || 0,
			agentMode: this.currentAgentMode,
			modelState: { ...this.modelState }
		};
	}

	private setupChangeDetection(): void {
		// Monitor text input changes
		if (this.textInput) {
			this._register(addDisposableListener(this.textInput, 'input', () => {
				this.checkForChanges();
			}));
		}

		// Monitor pill changes (already happens when pills are added/removed)
		// Monitor image changes (already happens when images are added/removed)
		// We'll check on these events
	}

	private checkForChanges(): void {
		if (!this.originalState) {
			return;
		}

		const currentContent = this.textInput?.textContent || '';
		const currentPillsCount = this.contextPillsData.size;
		const currentImagesCount = this.imageAttachments?.getImages().length || 0;

		const hasContentChange = currentContent !== this.originalState.content;
		const hasPillsChange = currentPillsCount !== this.originalState.pillsCount;
		const hasImagesChange = currentImagesCount !== this.originalState.imagesCount;
		const hasAgentChange = this.currentAgentMode !== this.originalState.agentMode;
		const hasModelChange = JSON.stringify(this.modelState) !== JSON.stringify(this.originalState.modelState);

		const hadChanges = this.hasChanges;
		this.hasChanges = hasContentChange || hasPillsChange || hasImagesChange || hasAgentChange || hasModelChange;

		// If changes detected and we're showing stop button, switch to send
		if (this.hasChanges && !hadChanges) {
			this.switchToSendButton();
		}
	}

	public notifyPillChange(): void {
		// Called when pills are added/removed
		this.checkForChanges();
	}

	public notifyImageChange(): void {
		// Called when images are added/removed
		this.checkForChanges();
	}

	public notifyAgentModeChange(): void {
		// Called when agent mode changes
		this.checkForChanges();
	}

	public notifyModelChange(): void {
		// Called when model changes
		this.checkForChanges();
	}

	private applyReadonlyMode(): void {
		// Make input readonly
		if (this.textInput) {
			this.textInput.setAttribute('contenteditable', 'false');
			this.textInput.style.cursor = 'pointer';
			this.textInput.style.maxHeight = '78px'; // 4 lines max (19.5px line-height × 4 = 78px)
			this.textInput.style.overflow = 'hidden';
		}

		// Adjust inputBox padding for better vertical centering in readonly mode
		if (this.inputBox) {
			this.inputBox.style.padding = '6px 8px'; // Equal vertical padding for better centering
			this.inputBox.style.cursor = 'pointer'; // Make entire box clickable

			// Add click handler to entire inputBox (not just textInput)
			// This allows clicking anywhere - text area, empty space, pill/image bars
			if (this.readonlyClickHandler) {
				this._register(addDisposableListener(this.inputBox, 'click', (e) => {
					// Don't trigger if clicking on pill close buttons or image close buttons
					const target = e.target as HTMLElement;
					const isCloseButton = target.classList.contains('codicon-close') ||
						target.closest('[data-mention-remove="true"]') ||
						target.closest('.vybe-image-close-button');

					if (!isCloseButton && this.readonlyClickHandler) {
						this.readonlyClickHandler();
					}
				}));
			}
		}

		// Set max height on the text input container as well with mask-image fade
		const textInputContainer = this.container.querySelector('.vybe-ai-text-input-container') as HTMLElement;
		if (textInputContainer) {
			textInputContainer.style.maxHeight = '78px'; // 4 lines (19.5px × 4)
			textInputContainer.style.overflow = 'hidden';
			// Add mask-image fade effect (fade starts at 65% and goes to transparent at 100%)
			textInputContainer.style.maskImage = 'linear-gradient(black 65%, transparent 100%)';
			textInputContainer.style.webkitMaskImage = 'linear-gradient(black 65%, transparent 100%)';
		}

		// Reposition the existing send/stop button to bottom-right corner BEFORE hiding toolbar
		if (this.sendContainer && this.inputBox) {
			// Move sendContainer from bottomBar to inputBox
			if (this.sendContainer.parentNode) {
				this.sendContainer.parentNode.removeChild(this.sendContainer);
			}
			this.inputBox.appendChild(this.sendContainer);

			// Position absolutely in input box - bottom-right corner (same as in edit mode)
			this.sendContainer.style.position = 'absolute';
			this.sendContainer.style.bottom = '6px'; // Match the inputBox bottom padding
			this.sendContainer.style.right = '8px';
			this.sendContainer.style.top = 'auto'; // Remove top positioning
			this.sendContainer.style.transform = 'none'; // Remove vertical centering
			this.sendContainer.style.zIndex = '20';
			this.sendContainer.style.marginLeft = '0';

			// Make button show/hide on hover
			if (this.sendButton) {
				this.sendButton.style.opacity = '0';
				this.sendButton.style.transition = 'opacity 0.1s ease-in-out';
			}

			// Show on hover
			this._register(addDisposableListener(this.inputBox, 'mouseenter', () => {
				if (this.sendButton && this.isReadonly) {
					this.sendButton.style.opacity = '1';
				}
			}));

			this._register(addDisposableListener(this.inputBox, 'mouseleave', () => {
				if (this.sendButton && this.isReadonly) {
					this.sendButton.style.opacity = '0';
				}
			}));
		}

		// Hide bottom toolbar (Agent, Model, buttons)
		if (this.bottomBar) {
			this.bottomBar.style.display = 'none';
		}

		// Add fade gradient if content exceeds max height
		if (this.textInput && this.textInput.scrollHeight > 60) {
			const fadeOverlay = $('div');
			fadeOverlay.className = 'vybe-composer-fade-overlay';
			fadeOverlay.style.cssText = `
				position: absolute;
				bottom: 0;
				left: 0;
				right: 0;
				height: 15px;
				background: linear-gradient(to bottom, transparent, var(--vscode-input-background));
				pointer-events: none;
				z-index: 1;
			`;
			// Find the text input container and add fade
			const textInputContainer = this.textInput.parentElement;
			if (textInputContainer) {
				textInputContainer.style.position = 'relative';
				textInputContainer.appendChild(fadeOverlay);
			}
		}
	}

	private applyEditMode(): void {
		// Show bottom toolbar FIRST
		if (this.bottomBar) {
			this.bottomBar.style.display = 'flex';
		}

		// Restore original inputBox padding and cursor
		if (this.inputBox) {
			this.inputBox.style.padding = '8px 8px 4px 8px'; // Original padding with space for bottom toolbar
			this.inputBox.style.cursor = 'auto'; // Restore default cursor
		}

		// Move send/stop button back to bottom toolbar (rightSide)
		if (this.sendContainer && this.rightSide) {
			// Remove from inputBox
			if (this.sendContainer.parentNode) {
				this.sendContainer.parentNode.removeChild(this.sendContainer);
			}
			// Append back to rightSide
			this.rightSide.appendChild(this.sendContainer);

			// Restore original positioning
			this.sendContainer.style.position = 'relative';
			this.sendContainer.style.top = 'auto';
			this.sendContainer.style.right = 'auto';
			this.sendContainer.style.bottom = 'auto'; // Reset bottom positioning
			this.sendContainer.style.transform = 'none';
			this.sendContainer.style.zIndex = 'auto';
			this.sendContainer.style.marginLeft = '0'; // No margin - gap handles spacing

			// Restore normal opacity
			if (this.sendButton) {
				this.sendButton.style.opacity = '1';
				this.sendButton.style.transition = '';
			}
		}

		// Restore text input container max height for scrolling
		const textInputContainer = this.container.querySelector('.vybe-ai-text-input-container') as HTMLElement;
		if (textInputContainer) {
			textInputContainer.style.maxHeight = '200px';
			textInputContainer.style.overflow = 'hidden'; // DomScrollableElement handles scrolling
		}

		// Make input editable and scrollable
		if (this.textInput) {
			this.textInput.setAttribute('contenteditable', 'true');
			this.textInput.style.cursor = 'text';
			this.textInput.style.maxHeight = 'none'; // Remove max height limit
			this.textInput.style.overflow = 'visible'; // Let container handle overflow
			this.textInput.focus();

			// Move cursor to end
			const range = document.createRange();
			range.selectNodeContents(this.textInput);
			range.collapse(false);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		}

		// Remove fade overlay if exists
		const fadeOverlay = this.container.querySelector('.vybe-composer-fade-overlay');
		if (fadeOverlay && fadeOverlay.parentNode) {
			fadeOverlay.parentNode.removeChild(fadeOverlay);
		}
	}


	setStreaming(streaming: boolean): void {
		// Update button state if needed
	}

	private showAgentModeDropdown(): void {
		if (!this.agentDropdown) {
			return;
		}

		// Create dropdown if it doesn't exist
		if (!this.agentModeDropdown) {
			this.agentModeDropdown = this._register(new AgentModeDropdown(this.agentDropdown));

			// Listen for mode selection
			this._register(this.agentModeDropdown.onModeSelect(mode => {
				this.currentAgentMode = mode;
				this.updateAgentLabel(mode);
				this.updatePlaceholder(mode);
				this.notifyAgentModeChange();
			}));
		}

		// Show the dropdown (pass direction flag)
		this.agentModeDropdown.show(this.currentAgentMode, this.openDropdownsDownward);
	}

	private showModelDropdown(): void {
		if (!this.autoDropdownElement) {
			return;
		}

		// Create dropdown if it doesn't exist
		if (!this.modelDropdown) {
			this.modelDropdown = this._register(new ModelDropdown(this.autoDropdownElement));

			// Listen for state changes
			this._register(this.modelDropdown.onStateChange(state => {
				this.modelState = state;
				this.updateModelLabel();
				this.notifyModelChange();
			}));
		}

		// Show the dropdown (pass direction flag)
		this.modelDropdown.show(this.modelState, this.openDropdownsDownward);
	}

	private updateModelLabel(): void {
		if (!this.autoLabelElement) {
			return;
		}

		// Update label based on state
		if (this.modelState.isAutoEnabled) {
			this.autoLabelElement.textContent = 'Auto';
		} else {
			// Find the selected model and show its label
			const models = [
				{ id: 'composer-1', label: 'Composer 1' },
				{ id: 'opus-4.5', label: 'Opus 4.5' },
				{ id: 'sonnet-4.5', label: 'Sonnet 4.5' },
				{ id: 'gpt-5.1-codex-high', label: 'GPT-5.1 Codex High' },
				{ id: 'gpt-5.1', label: 'GPT-5.1' },
				{ id: 'gemini-3-pro', label: 'Gemini 3 Pro' }
			];
			const selectedModel = models.find(m => m.id === this.modelState.selectedModelId);
			this.autoLabelElement.textContent = selectedModel ? selectedModel.label : this.modelState.selectedModelId;
		}

		// Update MAX badge visibility
		if (this.maxBadge) {
			this.maxBadge.style.display = this.modelState.isMaxModeEnabled ? 'flex' : 'none';
		}
	}

	private updateAgentLabel(mode: AgentMode): void {
		// Update the agent dropdown label and icon to reflect the selected mode
		const labels: Record<AgentMode, string> = {
			'agent': 'Agent',
			'plan': 'Plan',
			'ask': 'Ask'
		};

		const icons: Record<AgentMode, string> = {
			'agent': 'codicon-gear',
			'plan': 'codicon-check-all',
			'ask': 'codicon-comment'
		};

		if (this.agentDropdown) {
			// Update icon
			const iconElement = this.agentDropdown.querySelector('.codicon') as HTMLElement;
			if (iconElement) {
				// Remove all codicon classes
				iconElement.className = iconElement.className.split(' ').filter(c => !c.startsWith('codicon-')).join(' ');
				// Add new icon class
				iconElement.classList.add(icons[mode]);
			}

			// Update text
			const textElement = this.agentDropdown.querySelector('span:not(.codicon)') as HTMLElement;
			if (textElement) {
				textElement.textContent = labels[mode];
			}
		}
	}

	public getContextButton(): HTMLElement | null {
		return this.contextButton;
	}

	public getProgressContainer(): HTMLElement | null {
		return this.progressContainer;
	}

	public getAgentMode(): AgentMode {
		return this.currentAgentMode;
	}

	public getModelState(): ModelDropdownState {
		return { ...this.modelState };
	}

	public getContextPillsData(): Array<{ id: string; type: 'file' | 'terminal' | 'doc'; name: string; path?: string; iconClasses?: string[] }> {
		// Return array of all context pills data
		const pills: Array<{ id: string; type: 'file' | 'terminal' | 'doc'; name: string; path?: string; iconClasses?: string[] }> = [];
		this.contextPillsData.forEach((data, id) => {
			pills.push({ id, ...data });
		});
		return pills;
	}

	public getImagesData(): Array<{ id: string; url: string; file?: File }> {
		// Get images from imageAttachments component
		if (this.imageAttachments) {
			return this.imageAttachments.getImages().map(img => ({
				id: img.id,
				url: img.url,
				file: img.file
			}));
		}
		return [];
	}

	public restoreContextPills(pills: Array<{ id: string; type: 'file' | 'terminal' | 'doc'; name: string; path?: string; iconClasses?: string[] }>): void {
		// Clear existing pills first to prevent duplicates
		this.contextPillsData.clear();
		if (this.contextPillsContainer) {
			while (this.contextPillsContainer.firstChild) {
				this.contextPillsContainer.removeChild(this.contextPillsContainer.firstChild);
			}
		}
		this.contextPills.clear();

		// Restore context pills
		pills.forEach(pill => {
			// Use the original pill ID if provided, otherwise generate new one
			const pillId = pill.id || `${pill.type}-${pill.name}-${Date.now()}`;
			// Store pill data with original ID
			this.contextPillsData.set(pillId, { type: pill.type, name: pill.name, path: pill.path, iconClasses: pill.iconClasses });
		});

		// Update pills display (will handle scrolling)
		this.updateContextPills();
	}

	public restoreImages(images: Array<{ id: string; url: string; file?: File }>): void {
		// Restore images to imageAttachments
		if (!this.imageAttachments || images.length === 0) {
			return;
		}

		// Clear existing images first
		this.imageAttachments.clear();

		// Restore each image
		images.forEach(image => {
			if (image.file) {
				// If we have the File object, use it directly
				this.imageAttachments!.addImage(image.file);
			} else if (image.url) {
				// If we only have URL (from same session), create a File-like object
				// Note: This only works for blob URLs from the same session
				// For cross-session persistence, we'd need to store base64 or re-upload
				fetch(image.url)
					.then(response => response.blob())
					.then(blob => {
						const file = new File([blob], `image-${image.id}.png`, { type: blob.type || 'image/png' });
						if (this.imageAttachments) {
							this.imageAttachments.addImage(file);
						}
					})
					.catch(err => {
						// Failed to restore image
					});
			}
		});
	}

	/**
	 * Add a file to the files edited toolbar
	 * @param fileId - Unique identifier for the file
	 * @param fileName - Display name of the file
	 * @param filePath - Full path to the file
	 * @param iconClasses - VS Code icon classes for the file
	 * @param additions - Number of lines added
	 * @param deletions - Number of lines deleted
	 */
	public addEditedFile(fileId: string, fileName: string, filePath: string, iconClasses: string[], additions: number, deletions: number): void {
		if (this.filesEditedToolbar) {
			this.filesEditedToolbar.addFile({
				id: fileId,
				name: fileName,
				path: filePath,
				iconClasses,
				additions,
				deletions
			});
		}
	}

	/**
	 * Clear all files from the files edited toolbar
	 */
	public clearEditedFiles(): void {
		if (this.filesEditedToolbar) {
			this.filesEditedToolbar.clearFiles();
		}
	}

	/**
	 * Test function: Show files edited toolbar with sample files
	 */
	public testFilesEdited(): void {
		// Add some test files with different icon classes
		this.addEditedFile(
			'test-file-1',
			'index.tsx',
			'/src/components/index.tsx',
			['file-icon', 'tsx-lang-file-icon'],
			45,
			12
		);
		this.addEditedFile(
			'test-file-2',
			'styles.css',
			'/src/styles/styles.css',
			['file-icon', 'css-lang-file-icon'],
			23,
			8
		);
		this.addEditedFile(
			'test-file-3',
			'utils.ts',
			'/src/utils/utils.ts',
			['file-icon', 'ts-lang-file-icon'],
			67,
			34
		);
		this.addEditedFile(
			'test-file-4',
			'README.md',
			'/README.md',
			['file-icon', 'md-lang-file-icon'],
			15,
			3
		);
	}

	/**
	 * Test function: Clear all files from toolbar
	 */
	public testClearFilesEdited(): void {
		this.clearEditedFiles();
	}

	/**
	 * Add a context pill to the toolbar
	 * @param type - 'file' | 'terminal' | 'doc'
	 * @param name - Display name
	 * @param path - File path (for files only)
	 * @param iconClasses - Icon classes for file icons (for files only)
	 */
	public insertContextPill(type: 'file' | 'terminal' | 'doc', name: string, path?: string, iconClasses?: string[]): void {
		if (!this.contextPillsContainer) {
			return;
		}

		const pillId = `${type}-${name}-${Date.now()}`;

		// Store pill data
		this.contextPillsData.set(pillId, { type, name, path, iconClasses });

		// Notify change detection
		this.notifyPillChange();

		// Show toolbar
		if (this.contextPillsToolbar) {
			this.contextPillsToolbar.style.display = 'flex';
			// Add smaller gap below pills toolbar (reduced from 4px)
			this.contextPillsToolbar.style.marginBottom = '2px';
		}

		// Update image toolbar margin if it exists (reduce gap if pills are present)
		if (this.imageAttachments && this.imageAttachments.toolbar) {
			this.imageAttachments.toolbar.style.marginBottom = '4px';
		}

		// Update pills (will handle overflow)
		this.updateContextPills();

		// Update image toolbar margin when pills are added
		if (this.imageAttachments) {
			this.imageAttachments.updateMargin();
		}

		// Update placeholder visibility
		this.updatePlaceholderVisibility();
	}

	private createPillElement(type: 'file' | 'terminal' | 'doc', name: string, path: string | undefined, iconClasses: string[] | undefined, pillId: string): HTMLElement {
		const pill = $('.vybe-context-pill');
		pill.setAttribute('data-id', pillId);
		// Reduced height, VYBE green, full name display
		pill.style.cssText = `
			display: flex;
			align-items: center;
			gap: 2px;
			padding: 2px 4px 2px 4px;
			height: 17.5px;
			line-height: 17.5px;
			box-sizing: border-box;
			border-radius: 4px;
			background-color: color-mix(in srgb, #3ecf8e 20%, transparent);
			font-size: 12px;
			color: var(--vscode-foreground);
			cursor: default;
			flex-shrink: 0;
			position: relative;
		`;

		// Icon container - use 16px for file icons (like context dropdown), 12px for codicons
		const iconContainer = append(pill, $('span'));
		const iconSize = type === 'file' ? 16 : 12;

		if (type === 'file') {
			iconContainer.className = 'show-file-icons';
		}

		iconContainer.style.cssText = `
			flex-shrink: 0;
			height: ${iconSize}px;
			width: ${iconSize}px;
			display: flex;
			align-items: center;
			justify-content: center;
			position: relative;
			overflow: visible;
			margin: 0;
			margin-left: ${type === 'file' ? '-2px' : '0'};
			margin-top: ${type === 'file' ? '-1px' : '0'};
			padding: 0;
		`;

		// Icon based on type
		let iconElement: HTMLElement;
		if (type === 'file') {
			// File icon - EXACTLY match context dropdown structure
			const iconWrapper = append(iconContainer, $('div'));
			iconWrapper.style.cssText = `
				position: relative;
				height: 100%;
				width: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
			`;

			iconElement = append(iconWrapper, $('div'));
			const classes = ['monaco-icon-label', 'file-icon'];
			if (iconClasses && iconClasses.length > 0) {
				classes.push(...iconClasses);
			}
			classes.push('height-override-important');
			iconElement.className = classes.join(' ');
			// Match context dropdown exactly - use 100% not fixed px, ensure display: flex
			iconElement.style.cssText = `
				height: 100%;
				width: 100%;
				display: flex;
			`;
		} else {
			// Terminal or doc icon - simple codicon
			iconElement = append(iconContainer, $(`span.codicon.${type === 'terminal' ? 'codicon-terminal' : 'codicon-book'}`));
			iconElement.style.cssText = `
				font-size: 12px;
				line-height: 12px;
				display: flex;
				align-items: center;
				justify-content: center;
			`;
		}

		// Close button - positioned absolutely over the icon, hidden by default
		const closeBtn = append(iconContainer, $('span.codicon.codicon-close'));
		closeBtn.style.cssText = `
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			font-size: 12px;
			line-height: 12px;
			cursor: pointer;
			display: none;
			width: 12px;
			height: 12px;
			z-index: 2;
		`;

		// Name - show full name, no truncation
		const nameSpan = append(pill, $('span'));
		nameSpan.textContent = name;
		nameSpan.style.cssText = `
			white-space: nowrap;
			flex-shrink: 0;
			font-size: 12px;
			line-height: 17.5px;
			display: flex;
			align-items: center;
		`;

		// Hover effect - show close button over icon, hide original icon
		this._register(addDisposableListener(pill, 'mouseenter', () => {
			iconElement.style.display = 'none';
			closeBtn.style.display = 'block';
		}));
		this._register(addDisposableListener(pill, 'mouseleave', () => {
			iconElement.style.display = type === 'file' ? 'block' : 'flex';
			closeBtn.style.display = 'none';
		}));

		// Remove on close click
		this._register(addDisposableListener(closeBtn, 'click', (e) => {
			e.stopPropagation();
			this.removeContextPill(pillId);
		}));

		return pill;
	}

	private removeContextPill(pillId: string): void {
		// Remove from both maps
		this.contextPillsData.delete(pillId);
		this.contextPills.delete(pillId);

		// Notify change detection
		this.notifyPillChange();

		// Update pills (will recalculate overflow)
		this.updateContextPills();

		// Hide toolbar if no pills left
		if (this.contextPillsData.size === 0 && this.contextPillsToolbar) {
			this.contextPillsToolbar.style.display = 'none';
			this.contextPillsToolbar.style.marginBottom = '0';
		}

		// Update image toolbar margin when pills are removed
		if (this.imageAttachments) {
			this.imageAttachments.updateMargin();
		}

		// Update placeholder visibility
		this.updatePlaceholderVisibility();
	}

	private updateContextPills(): void {
		if (!this.contextPillsContainer) {
			return;
		}

		// Clear existing pills
		while (this.contextPillsContainer.firstChild) {
			this.contextPillsContainer.removeChild(this.contextPillsContainer.firstChild);
		}
		this.contextPills.clear();

		// If no items, hide toolbar and return
		if (this.contextPillsData.size === 0) {
			if (this.contextPillsToolbar) {
				this.contextPillsToolbar.style.display = 'none';
			}
			return;
		}

		// Show toolbar
		if (this.contextPillsToolbar) {
			this.contextPillsToolbar.style.display = 'flex';
		}

		// Render all pills (no overflow logic - they will scroll)
		const itemsArray = Array.from(this.contextPillsData.entries());
		itemsArray.forEach(([pillId, data]) => {
			const pill = this.createPillElement(data.type, data.name, data.path, data.iconClasses, pillId);
			this.contextPillsContainer!.appendChild(pill);
			this.contextPills.set(pillId, pill);
		});

		// Update scrollable element to handle scrolling
		if (this.contextPillsScrollable) {
			setTimeout(() => {
				this.contextPillsScrollable?.scanDomNode();
			}, 0);
		}
	}

	// Overflow pill functionality removed - pills now scroll horizontally instead

	private updatePlaceholderVisibility(): void {
		if (!this.textInput || !this.placeholderElement) {
			return;
		}

		// Only hide placeholder when there's actual text in the input
		// Pills are in a separate toolbar, so they shouldn't affect placeholder visibility
		const hasText = (this.textInput.textContent?.trim().length ?? 0) > 0;
		this.placeholderElement.style.display = hasText ? 'none' : 'block';
	}

	private renderContextPillsToolbar(isDarkTheme: boolean): HTMLElement {
		// Match the mock panel design - integrated into composer, no divider, no extra padding
		const toolbar = $('.vybe-context-pills-toolbar');
		toolbar.style.cssText = `
			display: none;
			align-items: center;
			gap: 4px;
			flex-wrap: nowrap;
			min-height: 17.5px;
			overflow: visible;
			position: relative;
			justify-content: flex-start;
			width: 100%;
			box-sizing: border-box;
			padding: 2px 0;
			margin: 0;
		`;

		// Scrollable wrapper container
		const scrollableWrapper = append(toolbar, $('div'));
		scrollableWrapper.style.cssText = `
			width: 100%;
			overflow: hidden;
			height: 21px;
			flex: 1 1 auto;
			min-width: 0;
		`;

		// Pills container - will scroll horizontally if needed
		const container = $('div');
		container.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			flex-wrap: nowrap;
			min-width: 100%;
			position: relative;
			justify-content: flex-start;
			height: 21px;
		`;

		this.contextPillsContainer = container;

		// Create DomScrollableElement wrapper for horizontal scrolling
		this.contextPillsScrollable = this._register(new DomScrollableElement(container, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			useShadows: false,
			horizontalScrollbarSize: 6,
			verticalScrollbarSize: 6
		}));

		const scrollableDomNode = this.contextPillsScrollable.getDomNode();
		scrollableDomNode.style.cssText = `
			height: 100%;
			width: 100%;
		`;

		scrollableWrapper.appendChild(scrollableDomNode);

		// Add resize observer to update scrollable dimensions when container resizes
		if (typeof ResizeObserver !== 'undefined') {
			const resizeObserver = new ResizeObserver(() => {
				if (this.contextPillsScrollable && this.contextPillsContainer) {
					this.contextPillsScrollable.setScrollDimensions({
						width: this.contextPillsContainer.offsetWidth,
						scrollWidth: this.contextPillsContainer.scrollWidth
					});
					this.contextPillsScrollable.scanDomNode();
				}
			});
			resizeObserver.observe(container);
			this._register({ dispose: () => resizeObserver.disconnect() });
		}

		this.contextPillsToolbar = toolbar;
		return toolbar;
	}

	/**
	 * Update send button icon based on input state
	 */
	private updateSendButtonIcon(): void {
		if (!this.sendButton || !this.sendIcon) {
			return;
		}

		const isStopButton = this.sendButton.getAttribute('data-stop-button') === 'true';
		const isRecording = this.sendButton.getAttribute('data-recording') === 'true';

		if (isRecording || isStopButton) {
			// Don't change icon if recording or stop button
			return;
		}

		// Always show arrow-up icon (speech feature temporarily disabled)
		this.sendIcon.className = 'codicon codicon-arrow-up';
		this.sendButton.setAttribute('data-is-mic', 'false');
	}

	// Speech recognition is temporarily disabled
	// private async _startSpeechRecognition(): Promise<void> { ... }

	private stopSpeechRecognition(): void {
		// Cancel cancellation token (this will stop the session)
		const tokenSource = this.speechCancellationTokenSource;
		if (tokenSource) {
			try {
				tokenSource.cancel();
				tokenSource.dispose();
			} catch (e) {
				// Ignore errors
			}
			this.speechCancellationTokenSource = null;
		}

		// Dispose of session disposables
		const disposables = this.speechDisposables;
		if (disposables) {
			try {
				disposables.dispose();
			} catch (e) {
				// Ignore errors
			}
			this.speechDisposables = null;
		}

		this.isRecording = false;
		this.transformBottomBarToVoiceMode(false);
		this.updateSendButtonIcon();
	}

	/**
	 * Transform bottom bar to voice recording mode or back to normal
	 */
	private transformBottomBarToVoiceMode(showVoiceMode: boolean): void {
		if (!this.bottomBar || !this.leftSide || !this.rightSide) {
			return;
		}

		if (showVoiceMode) {
			// Hide left side (Agent, Model dropdowns) - use display none
			this.leftSide.style.display = 'none';

			// Hide buttons on right side (Progress, Context, Image) - use display none
			// The send button stays in flex flow, so it won't move
			this.rightSideOriginalContent.forEach(button => {
				if (button && button.parentElement === this.rightSide) {
					// Store original display style
					if (!(button as any).__originalDisplay) {
						(button as any).__originalDisplay = button.style.display || '';
					}
					button.style.display = 'none';
				}
			});

			// Create or show voice recording UI (waveform)
			if (!this.voiceRecordingUI) {
				this.createVoiceRecordingUI();
			}
			if (this.voiceRecordingUI && this.sendContainer && this.rightSide) {
				// Ensure we're inserting into the correct parent (rightSide in bottom toolbar)
				if (!this.rightSide.classList.contains('composer-button-area')) {
					return;
				}

				// Remove waveform from any existing parent
				if (this.voiceRecordingUI.parentElement) {
					this.voiceRecordingUI.parentElement.removeChild(this.voiceRecordingUI);
				}

				// Insert waveform into rightSide BEFORE sendContainer
				if (this.rightSide.contains(this.sendContainer)) {
					this.rightSide.insertBefore(this.voiceRecordingUI, this.sendContainer);
				} else {
					this.rightSide.appendChild(this.voiceRecordingUI);
				}

				this.voiceRecordingUI.style.display = 'flex';
			}

			// Transform send button to stop button (keep green, just change icon)
			// This is the SAME button - microphone -> send -> stop -> stop streaming
			// NO position changes - button stays in exact same place
			if (this.sendButton && this.sendIcon) {
				this.sendButton.setAttribute('data-recording', 'true');
				// Keep green background - VYBE green
				this.sendButton.style.backgroundColor = '#3ecf8e';
				this.sendIcon.className = 'codicon codicon-debug-stop';
				this.sendIcon.style.color = '#141414'; // Dark color for contrast on green
				// Ensure button doesn't move - no position/size changes
			}
		} else {
			// Hide voice recording UI - remove from DOM to prevent layout issues
			if (this.voiceRecordingUI && this.rightSide.contains(this.voiceRecordingUI)) {
				this.rightSide.removeChild(this.voiceRecordingUI);
			}

			// Show normal UI - restore left side and right side buttons
			this.leftSide.style.display = 'flex';

			// Restore buttons with their original display style
			this.rightSideOriginalContent.forEach(button => {
				if (button && (button as any).__originalDisplay !== undefined) {
					button.style.display = (button as any).__originalDisplay;
				} else if (button) {
					button.style.display = '';
				}
			});

			// Restore send button - this is the SAME button transforming back
			// NO position changes - button stays in exact same place
			if (this.sendButton && this.sendIcon) {
				this.sendButton.setAttribute('data-recording', 'false');
				// Keep green background
				this.sendButton.style.backgroundColor = '#3ecf8e';
				this.updateSendButtonIcon();
				// Ensure button doesn't move - no position/size changes
			}
		}
	}

	/**
	 * Create voice recording UI (waveform only)
	 */
	private createVoiceRecordingUI(): void {
		// Voice waveform container - simple, no extra containers
		const waveformContainer = $('div');
		waveformContainer.className = 'voice-waveform-container';
		waveformContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 2px;
			height: 20px;
			position: relative;
			flex-shrink: 0;
		`;

		// Create 5 waveform bars
		for (let i = 0; i < 5; i++) {
			const bar = append(waveformContainer, $('div'));
			bar.className = 'voice-waveform-bar-simple';
			bar.style.cssText = `
				width: 3px;
				height: 4px;
				background-color: #3ecf8e;
				border-radius: 2px;
				transition: height 0.1s ease;
			`;
			// Animate bars
			this.animateWaveformBar(bar);
		}

		this.voiceRecordingUI = waveformContainer;
	}

	/**
	 * Animate waveform bar
	 */
	private animateWaveformBar(bar: HTMLElement): void {
		const animate = () => {
			if (!this.isRecording) {
				bar.style.height = '4px';
				return;
			}
			// Random height between 8px and 16px
			const height = 8 + Math.random() * 8;
			bar.style.height = `${height}px`;
			setTimeout(animate, 100 + Math.random() * 100);
		};
		animate();
	}

	override dispose(): void {
		// Stop speech recognition if active
		this.stopSpeechRecognition();
		super.dispose();
	}

}

