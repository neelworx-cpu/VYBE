/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { $, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { ITerminalInstance } from '../../../../../contrib/terminal/browser/terminal.js';
import { trackFocus, IFocusTracker } from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import './vybeTerminalPromptBar.css';

export class VybeTerminalPromptBarWidget extends Disposable {
	private _container: HTMLElement | null = null;
	private _hintBar: HTMLElement | null = null;
	private _composerInner: HTMLElement | null = null;
	private _isExpanded: boolean = false;
	private _textInput: HTMLElement | null = null;
	private _lightbulbButton: HTMLElement | null = null;
	private _lightbulbIcon: HTMLElement | null = null;
	private _focusTracker: IFocusTracker | null = null;
	private _sendButtonDisposable: any = null;
	private _isVisible: boolean = false;
	private _isQuickQuestionMode: boolean = false;
	private _quickAnswerRow: HTMLElement | null = null;
	private _quickAnswerContent: HTMLElement | null = null;
	private _sendButton: HTMLElement | null = null;
	private _isStreaming: boolean = false;
	private _pendingText: string = ''; // Buffer for incomplete markdown tokens

	// Events
	private readonly _onSend = this._register(new Emitter<{ message: string; isQuickQuestion: boolean }>());
	readonly onSend: Event<{ message: string; isQuickQuestion: boolean }> = this._onSend.event;

	private readonly _onStop = this._register(new Emitter<void>());
	readonly onStop: Event<void> = this._onStop.event;

	private isDarkTheme(): boolean {
		const workbenchElement = document.querySelector('.monaco-workbench');
		return document.body.classList.contains('vs-dark') ||
			document.body.classList.contains('hc-black') ||
			(workbenchElement?.classList.contains('vs-dark') ?? false) ||
			(workbenchElement?.classList.contains('hc-black') ?? false);
	}

	constructor(
		private readonly _terminalElement: HTMLElement, // terminal-wrapper
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: { raw: RawXtermTerminal }
	) {
		super();

		// Ensure terminal-wrapper has flex layout
		const terminalWrapper = this._terminalElement;
		if (terminalWrapper) {
			terminalWrapper.style.display = 'flex';
			terminalWrapper.style.flexDirection = 'column';
		}

		// Find or create xterm-wrapper
		let xtermWrapper = terminalWrapper.querySelector('.xterm-wrapper') as HTMLElement;
		if (!xtermWrapper) {
			// Find the direct child div of terminal-wrapper that contains .terminal.xterm
			const terminalXterm = terminalWrapper.querySelector('.terminal.xterm');
			if (terminalXterm) {
				let current: HTMLElement | null = terminalXterm.parentElement as HTMLElement;
				while (current && current !== terminalWrapper) {
					if (current.parentElement === terminalWrapper) {
						xtermWrapper = current;
						break;
					}
					current = current.parentElement as HTMLElement;
				}
			}
			// If we found it, add the class and set properties
			if (xtermWrapper) {
				if (!xtermWrapper.classList.contains('xterm-wrapper')) {
					xtermWrapper.classList.add('xterm-wrapper');
				}
			}
		}

		// Ensure xterm-wrapper has flex properties (takes available space) - match Cursor's exact style
		if (xtermWrapper) {
			xtermWrapper.style.flexGrow = '1';
			xtermWrapper.style.flexShrink = '1';
			xtermWrapper.style.minHeight = '0px';
			// No padding - flex layout handles spacing naturally
		}

		// Create prompt bar container
		this._createPromptBar();
	}

	private _createPromptBar(): void {
		const terminalWrapper = this._terminalElement;

		// Find xterm-wrapper - needed for layout calculations
		let xtermWrapper = terminalWrapper.querySelector('.xterm-wrapper') as HTMLElement;
		if (!xtermWrapper) {
			// Find the direct child div of terminal-wrapper that contains .terminal.xterm
			const terminalXterm = terminalWrapper.querySelector('.terminal.xterm');
			if (terminalXterm) {
				let current: HTMLElement | null = terminalXterm.parentElement as HTMLElement;
				while (current && current !== terminalWrapper) {
					if (current.parentElement === terminalWrapper) {
						xtermWrapper = current;
						break;
					}
					current = current.parentElement as HTMLElement;
				}
			}
		}

		// Main prompt-bar-container (always visible - hint bar is always shown)
		const promptBarContainer = $('div', { class: 'prompt-bar-container vybe-terminal-prompt-bar' });
		promptBarContainer.style.cssText = `
			display: block !important;
			position: relative !important;
			width: 100% !important;
			flex-shrink: 0 !important;
			flex-grow: 0 !important;
			flex-basis: auto !important;
			padding: 0 10px !important;
			box-sizing: border-box !important;
			top: auto !important;
			bottom: auto !important;
			left: auto !important;
			right: auto !important;
			z-index: 0 !important;
			transform: none !important;
			margin: 0 !important;
			order: 999;
			height: auto !important;
			background: transparent !important;
		`;

		// Hint bar (shown when composer is collapsed)
		this._hintBar = $('div', { class: 'prompt-bar-hint' });
		this._hintBar.style.cssText = `
			display: block;
			text-align: center;
			opacity: 1;
			color: var(--vscode-input-placeholderForeground);
			font-size: 10px;
			height: 20px;
			line-height: 20px;
			cursor: pointer;
			visibility: visible;
			background: transparent;
			border: none;
			border-radius: 0;
		`;
		const hintText = $('code');
		hintText.textContent = 'Vybe Agent';
		const hintText2 = document.createTextNode(' to run Agent • ⌘I to generate command');
		this._hintBar.appendChild(hintText);
		this._hintBar.appendChild(hintText2);
		this._register(addDisposableListener(this._hintBar, 'click', () => {
			this.expand();
		}));
		promptBarContainer.appendChild(this._hintBar);

		// Composer inner content (shown when expanded)
		const innerWrapper = $('div');
		innerWrapper.style.cssText = `
			height: 100%;
			width: 100%;
			display: none;
			visibility: hidden;
		`;
		this._composerInner = innerWrapper;

		const terminalPromptBarContainer = $('div', { class: 'terminal-prompt-bar-container' });
		terminalPromptBarContainer.style.cssText = `
			padding: 0 10px 10px 10px;
			display: flex;
			justify-content: center;
			width: 100%;
			box-sizing: border-box;
		`;

		// Main inner container - match main composer background
		const isDarkTheme = this.isDarkTheme();
		const terminalPromptBarInner = $('div', { class: 'terminal-prompt-bar-inner' });
		terminalPromptBarInner.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 0px;
			padding: 8px 8px 4px 8px;
			background-color: ${isDarkTheme ? '#212427' : '#eceff2'};
			border: ${isDarkTheme ? '1px solid #383838' : '1px solid #d9d9d9'};
			border-radius: 8px;
			box-sizing: border-box;
			width: 100%;
			max-width: 500px;
		`;

		// Inner content wrapper (like main composer)
		const innerContent = $('div');
		innerContent.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 0px;
			width: 100%;
			box-sizing: border-box;
		`;

		// Single line input row (input + buttons on same row)
		const inputRow = $('div', { class: 'terminal-prompt-bar-input-row' });
		inputRow.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
		`;

		// Input container (takes remaining space)
		const inputContainer = $('div', { class: 'terminal-prompt-bar-input' });
		inputContainer.style.cssText = `
			flex: 1;
			min-width: 0;
		`;

		// Text input - single line (contenteditable div like main composer)
		this._textInput = document.createElement('div');
		this._textInput.className = 'vybe-terminal-prompt-input';
		this._textInput.setAttribute('contenteditable', 'true');
		this._textInput.setAttribute('spellcheck', 'false');
		this._textInput.setAttribute('role', 'textbox');
		this._textInput.style.cssText = `
			width: 100%;
			min-height: 20px;
			max-height: 20px;
			overflow: hidden;
			line-height: 20px;
			font-family: inherit;
			font-size: 13px;
			color: var(--vscode-input-foreground);
			background-color: transparent;
			border: none;
			outline: none;
			box-sizing: border-box;
			padding: 0;
			white-space: nowrap;
			overflow-x: auto;
			overflow-y: hidden;
		`;
		this._textInput.setAttribute('data-placeholder', 'Command instructions');

		// Add placeholder styling
		const updatePlaceholder = () => {
			if (!this._textInput) return;
			if (this._textInput.textContent?.trim() === '') {
				this._textInput.setAttribute('data-placeholder', 'Command instructions');
			} else {
				this._textInput.removeAttribute('data-placeholder');
			}
		};
		this._register(addDisposableListener(this._textInput, 'input', updatePlaceholder));
		this._register(addDisposableListener(this._textInput, 'focus', updatePlaceholder));
		this._register(addDisposableListener(this._textInput, 'blur', updatePlaceholder));

		inputContainer.appendChild(this._textInput);
		inputRow.appendChild(inputContainer);

		// Quick answer row (shown when streaming answer)
		const quickAnswerRow = $('div', { class: 'terminal-prompt-bar-quick-answer-row' });
		quickAnswerRow.style.cssText = `
			display: none;
			padding: 8px 0 0 0;
			box-sizing: border-box;
		`;
		this._quickAnswerRow = quickAnswerRow;

		// Scrollable container for answer content
		const answerScrollContainer = $('div', { class: 'terminal-prompt-bar-answer-scroll' });
		answerScrollContainer.style.cssText = `
			max-height: 120px;
			overflow-y: auto;
			overflow-x: hidden;
			box-sizing: border-box;
		`;

		// Streaming text area with markdown support
		const quickAnswerContent = $('div', { class: 'terminal-prompt-bar-answer-content' });
		quickAnswerContent.style.cssText = `
			font-size: 13px;
			line-height: 1.5;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			white-space: pre-wrap;
			word-wrap: break-word;
			box-sizing: border-box;
		`;
		this._quickAnswerContent = quickAnswerContent;
		answerScrollContainer.appendChild(quickAnswerContent);
		quickAnswerRow.appendChild(answerScrollContainer);

		// Bottom row with close and send buttons - match main composer alignment
		const bottomRow = $('div', { class: 'terminal-prompt-bar-bottom-row' });
		bottomRow.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 4px;
			margin-top: 4px;
			margin-bottom: 4px;
			box-sizing: border-box;
		`;

		// Close button (matches context/image button styling from main composer)
		const closeButton = $('div', { class: 'anysphere-icon-button' });
		closeButton.style.cssText = `
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			background-color: transparent;
			border: none;
			flex-shrink: 0;
			opacity: 0.5;
		`;
		const closeIcon = $('span', { class: 'codicon codicon-x' });
		closeIcon.style.cssText = `
			font-size: 16px;
			width: 16px;
			height: 16px;
			position: relative;
			top: 0.5px;
			font-weight: 500;
			display: block;
			text-align: center;
			line-height: 16px;
			color: var(--vscode-icon-foreground);
		`;
		closeButton.appendChild(closeIcon);
		this._register(addDisposableListener(closeButton, 'click', () => {
			this.collapse();
		}));
		bottomRow.appendChild(closeButton);

		// Lightbulb button (between close and send)
		const lightbulbButton = $('div', { class: 'anysphere-icon-button' });
		lightbulbButton.style.cssText = `
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			background-color: transparent;
			border: none;
			flex-shrink: 0;
			opacity: 0.5;
		`;
		const lightbulbIcon = $('span', { class: 'codicon codicon-lightbulb' });
		lightbulbIcon.style.cssText = `
			font-size: 16px;
			width: 16px;
			height: 16px;
			position: relative;
			top: 0.5px;
			font-weight: 500;
			display: block;
			text-align: center;
			line-height: 16px;
			color: var(--vscode-icon-foreground);
		`;
		lightbulbButton.appendChild(lightbulbIcon);

		// Store references
		this._lightbulbButton = lightbulbButton;
		this._lightbulbIcon = lightbulbIcon;

		// Toggle quick question mode on click
		this._register(addDisposableListener(lightbulbButton, 'click', () => {
			this._isQuickQuestionMode = !this._isQuickQuestionMode;
			if (this._isQuickQuestionMode) {
				// Active: icon becomes VYBE green
				lightbulbIcon.style.color = '#3ecf8e';
				lightbulbButton.style.opacity = '1';
			} else {
				// Inactive: icon returns to default color, hide answer row if visible
				lightbulbIcon.style.color = 'var(--vscode-icon-foreground)';
				lightbulbButton.style.opacity = '0.5';
				this.hideQuickAnswer();
			}
		}));

		bottomRow.appendChild(lightbulbButton);

		// Send button - exact design from main composer
		const sendContainer = $('div', { class: 'send-with-mode' });
		sendContainer.style.cssText = `
			position: relative;
			display: inline-block;
			width: 24px;
			height: 20px;
			flex-shrink: 0;
			flex-grow: 0;
			min-width: 24px;
			max-width: 24px;
		`;

		const sendButton = $('div', { class: 'anysphere-icon-button' });
		sendButton.setAttribute('data-outlined', 'true');
		sendButton.setAttribute('data-variant', 'background');
		sendButton.setAttribute('data-mode', 'agent');
		sendButton.setAttribute('data-stop-button', 'false');
		sendButton.style.cssText = `
			width: 20px;
			height: 20px;
			min-width: 20px;
			max-width: 20px;
			min-height: 20px;
			max-height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			border: none;
			border-radius: 50%;
			flex-shrink: 0;
			flex-grow: 0;
			margin-left: 4px;
			position: relative;
			opacity: 1;
			background-color: #3ecf8e;
		`;
		const sendIcon = $('span', { class: 'codicon codicon-arrow-up' });
		sendIcon.style.cssText = `
			font-size: 16px;
			width: 16px;
			height: 16px;
			color: #141414;
			display: flex;
			align-items: center;
			justify-content: center;
		`;
		sendButton.appendChild(sendIcon);
		sendContainer.appendChild(sendButton);
		bottomRow.appendChild(sendContainer);

		// Store send button reference
		this._sendButton = sendButton;

		// Wire up send button click handler
		this._sendButtonDisposable = this._register(addDisposableListener(sendButton, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this._isStreaming) {
				// Stop streaming
				this._onStop.fire();
				this.setStreaming(false);
			} else {
				// Send message
				this.handleSend();
			}
		}));

		// Handle Enter key in input
		if (this._textInput) {
			this._register(addDisposableListener(this._textInput, 'keydown', (e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					this.handleSend();
				}
			}));
		}

		// Append to inner content
		innerContent.appendChild(inputRow);
		innerContent.appendChild(quickAnswerRow);
		innerContent.appendChild(bottomRow);
		terminalPromptBarInner.appendChild(innerContent);
		terminalPromptBarContainer.appendChild(terminalPromptBarInner);
		innerWrapper.appendChild(terminalPromptBarContainer);
		promptBarContainer.appendChild(innerWrapper);

		// Append to terminal-wrapper
		terminalWrapper.appendChild(promptBarContainer);
		this._container = promptBarContainer;

		// Store widget instance on terminal element for access by "Add to Chat" button and testing
		(this._terminalElement as any).__vybeTerminalPromptBarWidget = this;

		// Expose test method globally for console testing
		if (typeof window !== 'undefined') {
			(window as any).__testVybeTerminalPromptBar = (terminalElement?: HTMLElement) => {
				const widget = terminalElement
					? (terminalElement as any).__vybeTerminalPromptBarWidget
					: (document.querySelector('.terminal-wrapper') as any)?.__vybeTerminalPromptBarWidget;

				if (!widget) {
					console.log('No VYBE terminal prompt bar widget found. Make sure a terminal is open and the prompt bar is visible.');
					return null;
				}

				return {
					widget,
					// Test methods
					toggleLightbulb: () => {
						if (widget._lightbulbButton) {
							widget._lightbulbButton.click();
						}
					},
					showAnswer: () => widget.showQuickAnswer(),
					hideAnswer: () => widget.hideQuickAnswer(),
					appendText: (text: string) => widget.appendQuickAnswerText(text),
					testStreaming: () => {
						widget.showQuickAnswer();
						const testText = 'Here is a quick answer with `npm install` command and some `git status` too.';
						let index = 0;
						const interval = setInterval(() => {
							if (index < testText.length) {
								widget.appendQuickAnswerText(testText[index]);
								index++;
							} else {
								clearInterval(interval);
							}
						}, 50);
					},
					isQuickMode: () => widget.isQuickQuestionMode()
				};
			};
		}

		// Trigger terminal layout recalculation after prompt bar is added
		// This ensures the terminal recalculates its height accounting for the prompt bar
		// Use ResizeObserver to detect when xterm-wrapper height changes
		if (xtermWrapper && this._instance && this._instance.layout) {
			const updateLayout = () => {
				// Get xterm-wrapper's actual height (after flex shrinking for prompt bar)
				const xtermWrapperRect = xtermWrapper.getBoundingClientRect();
				const terminalWrapperRect = terminalWrapper.getBoundingClientRect();
				if (xtermWrapperRect.width > 0 && xtermWrapperRect.height > 0) {
					// Use xterm-wrapper's actual height, not terminal-wrapper's full height
					// This ensures terminal content stops at the top of the hint bar
					// The terminal's layout() method will use this height to calculate rows/cols
					this._instance.layout({ width: terminalWrapperRect.width, height: xtermWrapperRect.height });

					// Also ensure the xterm element itself is constrained to the wrapper's height
					// This prevents the terminal from rendering beyond the wrapper
					if (this._xterm?.raw?.element) {
						const xtermElement = this._xterm.raw.element;
						// Force the xterm element to match the xterm-wrapper's height exactly
						xtermElement.style.height = `${xtermWrapperRect.height}px`;
						xtermElement.style.maxHeight = `${xtermWrapperRect.height}px`;
						xtermElement.style.minHeight = `${xtermWrapperRect.height}px`;

						// Also constrain the scrollable element if it exists
						const scrollableElement = xtermElement.querySelector('.xterm-scrollable-element') as HTMLElement;
						if (scrollableElement) {
							scrollableElement.style.height = `${xtermWrapperRect.height}px`;
							scrollableElement.style.maxHeight = `${xtermWrapperRect.height}px`;
						}
					}
				}
			};

			// Observe both xterm-wrapper and terminal-wrapper for size changes
			const resizeObserver = new ResizeObserver(() => {
				updateLayout();
			});
			resizeObserver.observe(xtermWrapper);
			resizeObserver.observe(terminalWrapper);
			this._register({ dispose: () => resizeObserver.disconnect() });

			// Also trigger once after a delay to ensure initial layout
			setTimeout(() => {
				updateLayout();
			}, 100);

			// Trigger on next frame to ensure flex layout has calculated
			requestAnimationFrame(() => {
				updateLayout();
			});
		}

		// Focus tracker
		this._focusTracker = this._register(trackFocus(this._container));

		// Watch for VS Code trying to add positioning styles and override them
		if (this._container) {
			const styleObserver = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
						this._container!.style.setProperty('top', 'auto', 'important');
						this._container!.style.setProperty('bottom', 'auto', 'important');
						this._container!.style.setProperty('left', 'auto', 'important');
						this._container!.style.setProperty('right', 'auto', 'important');
						this._container!.style.setProperty('z-index', 'auto', 'important');
						this._container!.style.setProperty('position', 'relative', 'important');
						this._container!.style.setProperty('transform', 'none', 'important');
					}
				}
			});
			styleObserver.observe(this._container, {
				attributes: true,
				attributeFilter: ['style']
			});
			this._register({ dispose: () => styleObserver.disconnect() });
		}

		// Initially show hint bar (collapsed state)
		this.collapse();
	}

	reveal(): void {
		this._isVisible = true;
		if (this._container) {
			this._container.classList.remove('hide');
			this._container.style.display = 'block';
		}

		// Toggle between hint bar and full composer
		if (this._isExpanded) {
			this.collapse();
		} else {
			this.expand();
		}
	}

	hide(): void {
		this._isVisible = false;
		if (this._container) {
			this._container.classList.add('hide');
			this._container.style.display = 'none';
		}
	}

	expand(): void {
		this._isExpanded = true;
		if (this._hintBar) {
			this._hintBar.style.display = 'none';
			this._hintBar.style.visibility = 'hidden';
		}
		if (this._composerInner) {
			this._composerInner.style.display = 'block';
			this._composerInner.style.visibility = 'visible';
		}
		if (this._textInput) {
			this._textInput.focus();
		}
	}

	collapse(): void {
		this._isExpanded = false;
		if (this._hintBar) {
			this._hintBar.style.display = 'block';
			this._hintBar.style.visibility = 'visible';
		}
		if (this._composerInner) {
			this._composerInner.style.display = 'none';
			this._composerInner.style.visibility = 'hidden';
		}
	}

	focus(): void {
		if (this._isExpanded && this._textInput) {
			this._textInput.focus();
		}
	}

	hasFocus(): boolean {
		// IFocusTracker doesn't have hasFocus method, check if input has focus instead
		return this._textInput === document.activeElement;
	}

	insertContextPill(name: string, value: string): void {
		// TODO: Implement context pill insertion in prompt bar
		// For now, just focus the input and append the selection text
		if (this._textInput) {
			this.expand();
			const currentText = this._textInput.textContent || '';
			const prefix = currentText ? `${currentText}\n\n` : '';
			this._textInput.textContent = `${prefix}Terminal "${name}":\n${value}`;
			// Manually trigger input event for placeholder update
			this._textInput.dispatchEvent(new CustomEvent('input'));
			this._textInput.focus();
		}
	}

	isExpanded(): boolean {
		return this._isExpanded;
	}

	/**
	 * Show quick answer row and start streaming
	 */
	showQuickAnswer(): void {
		if (this._quickAnswerRow && this._isQuickQuestionMode) {
			this._quickAnswerRow.style.display = 'block';
			if (this._quickAnswerContent) {
				this._quickAnswerContent.textContent = '';
			}
		}
	}

	/**
	 * Hide quick answer row
	 */
	hideQuickAnswer(): void {
		if (this._quickAnswerRow) {
			this._quickAnswerRow.style.display = 'none';
			if (this._quickAnswerContent) {
				this._quickAnswerContent.textContent = '';
			}
		}
	}

	/**
	 * Append streaming text to quick answer with markdown inline code highlighting
	 */
	appendQuickAnswerText(text: string): void {
		if (!this._quickAnswerContent || !this._isQuickQuestionMode) {
			return;
		}

		// Show row if hidden
		if (this._quickAnswerRow) {
			this._quickAnswerRow.style.display = 'block';
		}

		// Parse markdown and append elements (no innerHTML - TrustedHTML compliant)
		this.appendMarkdownText(text);

		// Auto-scroll to bottom
		const scrollContainer = this._quickAnswerRow?.querySelector('.terminal-prompt-bar-answer-scroll') as HTMLElement;
		if (scrollContainer) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	}

	/**
	 * Append markdown text with inline code highlighting (TrustedHTML compliant)
	 */
	private appendMarkdownText(text: string): void {
		if (!this._quickAnswerContent) {
			return;
		}

		// Accumulate text to handle incomplete markdown tokens
		this._pendingText += text;

		// First, protect code blocks (triple backticks) by replacing them with placeholders
		const codeBlockPlaceholders: string[] = [];
		let processed = this._pendingText.replace(/```[\s\S]*?```/g, (match) => {
			const placeholder = `__CODEBLOCK_${codeBlockPlaceholders.length}__`;
			codeBlockPlaceholders.push(match);
			return placeholder;
		});

		// Process text and create DOM elements for inline code
		let currentIndex = 0;
		let lastProcessedIndex = 0;

		while (currentIndex < processed.length) {
			// Look for inline code pattern: `code`
			const inlineCodeMatch = processed.substring(currentIndex).match(/^`([^`\n]+)`/);

			if (inlineCodeMatch) {
				// Found complete inline code - create code element
				const codeElement = $('code');
				codeElement.textContent = inlineCodeMatch[1];
				this._quickAnswerContent.appendChild(codeElement);
				currentIndex += inlineCodeMatch[0].length;
				lastProcessedIndex = currentIndex;
			} else {
				// Regular text - find next inline code or end
				const nextCodeIndex = processed.indexOf('`', currentIndex);
				const nextNewlineIndex = processed.indexOf('\n', currentIndex);
				const nextSpecialIndex = nextCodeIndex !== -1 && nextNewlineIndex !== -1
					? Math.min(nextCodeIndex, nextNewlineIndex)
					: nextCodeIndex !== -1 ? nextCodeIndex
					: nextNewlineIndex !== -1 ? nextNewlineIndex
					: processed.length;

				if (nextSpecialIndex > currentIndex) {
					// Add text node
					const textContent = processed.substring(currentIndex, nextSpecialIndex);
					if (textContent) {
						this._quickAnswerContent.appendChild(document.createTextNode(textContent));
					}
					currentIndex = nextSpecialIndex;
					lastProcessedIndex = currentIndex;
				}

				// Handle newline
				if (currentIndex < processed.length && processed[currentIndex] === '\n') {
					this._quickAnswerContent.appendChild($('br'));
					currentIndex++;
					lastProcessedIndex = currentIndex;
				} else if (currentIndex >= processed.length) {
					break;
				} else {
					// Incomplete token (e.g., just ` without closing) - keep in buffer
					break;
				}
			}
		}

		// Update pending text - keep unprocessed portion
		this._pendingText = processed.substring(lastProcessedIndex);

		// Restore code blocks (for now, just append as text - could be enhanced later)
		if (this._quickAnswerContent) {
			codeBlockPlaceholders.forEach((block) => {
				const blockText = document.createTextNode(block);
				this._quickAnswerContent!.appendChild(blockText);
			});
		}
	}

	/**
	 * Check if quick question mode is active
	 */
	isQuickQuestionMode(): boolean {
		return this._isQuickQuestionMode;
	}

	/**
	 * Handle send button click or Enter key
	 */
	private handleSend(): void {
		if (!this._textInput) {
			return;
		}

		const message = this._textInput.textContent?.trim() || '';
		if (!message) {
			return;
		}

		// Fire send event with message and mode
		this._onSend.fire({
			message,
			isQuickQuestion: this._isQuickQuestionMode
		});

		// Clear input
		this._textInput.textContent = '';
		this._textInput.setAttribute('data-placeholder', 'Command instructions');

		// Switch to stop button if streaming
		if (this._isQuickQuestionMode) {
			this.setStreaming(true);
		}
	}

	/**
	 * Set streaming state (switches send button to stop button)
	 */
	setStreaming(isStreaming: boolean): void {
		this._isStreaming = isStreaming;
		if (this._sendButton) {
			if (isStreaming) {
				this._sendButton.setAttribute('data-stop-button', 'true');
				// Change icon to stop (square)
				const icon = this._sendButton.querySelector('span.codicon') as HTMLElement;
				if (icon) {
					icon.className = 'codicon codicon-debug-stop';
					icon.style.color = '#141414';
				}
			} else {
				this._sendButton.setAttribute('data-stop-button', 'false');
				// Change icon back to arrow-up
				const icon = this._sendButton.querySelector('span.codicon') as HTMLElement;
				if (icon) {
					icon.className = 'codicon codicon-arrow-up';
					icon.style.color = '#141414';
				}
			}
		}
	}

	/**
	 * Get current input text
	 */
	getInputText(): string {
		return this._textInput?.textContent?.trim() || '';
	}
}

