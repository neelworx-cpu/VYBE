/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../../common/contributions.js';
import { ITerminalService } from '../../../../contrib/terminal/browser/terminal.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { $, addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { IViewDescriptorService } from '../../../../common/views.js';

/**
 * Workbench contribution that adds a floating "Add to Chat" button
 * when text is selected in a terminal, styled like the terminal block's Run button
 */
class TerminalSelectionButtonContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.terminalSelectionButton';

	private button: HTMLElement | null = null;
	private currentInstance: any = null;
	private selectionListener: any = null;
	private updatePositionTimeout: any = null;
	private currentTerminalInstance: any = null; // Store reference to terminal instance for getting current name
	private currentTerminalElement: HTMLElement | null = null; // Store reference to terminal DOM element for positioning
	private inlineComposerVisibilityListener: any = null;

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		// Listen for terminal instance changes
		this._register(this.terminalService.onDidChangeActiveInstance(() => {
			this.currentTerminalInstance = null; // Clear reference when instance changes
			this.setupTerminalListeners();
		}));

		// Setup listeners for existing terminals
		this.setupTerminalListeners();
	}

	private setupTerminalListeners(): void {
		// Clean up previous listener
		if (this.selectionListener) {
			this.selectionListener.dispose();
			this.selectionListener = null;
		}

		const activeInstance = this.terminalService.activeInstance;
		if (!activeInstance) {
			this.hideButton();
			this.currentTerminalInstance = null;
			return;
		}

		// Get xterm terminal
		const xterm = (activeInstance as any).xterm;
		if (!xterm || !xterm.raw) {
			this.hideButton();
			return;
		}

		this.currentInstance = activeInstance;
		this.currentTerminalInstance = activeInstance; // Store for getting current name on click

		// Listen to selection changes
		// xterm.js fires selection events when selection changes
		const rawXterm = xterm.raw;

		// Use a polling approach since xterm doesn't expose selection events directly
		// Check selection more frequently (every 50ms) to follow selection better
		let lastSelection: string | null = null;
		let lastSelectionRange: any = null;
		const checkSelection = () => {
			if (!this.currentInstance || this.currentInstance !== this.terminalService.activeInstance) {
				this.hideButton();
				return;
			}

			const selection = rawXterm.getSelection();
			// @ts-ignore
			const selectionManager = rawXterm._selectionManager;
			const currentRange = selectionManager ? {
				start: selectionManager.selectionStart,
				end: selectionManager.selectionEnd
			} : null;

			if (selection && selection.length > 0) {
				// Check if selection text or range changed
				const selectionChanged = selection !== lastSelection ||
					!currentRange ||
					!lastSelectionRange ||
					currentRange.start?.x !== lastSelectionRange.start?.x ||
					currentRange.start?.y !== lastSelectionRange.start?.y ||
					currentRange.end?.x !== lastSelectionRange.end?.x ||
					currentRange.end?.y !== lastSelectionRange.end?.y;

				if (selectionChanged) {
					lastSelection = selection;
					lastSelectionRange = currentRange;
					this.showButton(activeInstance, xterm);
				} else {
					// Selection unchanged, just update position (in case terminal scrolled)
					this.updateButtonPosition(xterm);
				}
			} else {
				lastSelection = null;
				lastSelectionRange = null;
				this.hideButton();
			}
		};

		const interval = setInterval(checkSelection, 50); // Check more frequently
		this.selectionListener = {
			dispose: () => {
				clearInterval(interval);
				this.hideButton();
			}
		};

		// Also listen to mouseup and mousemove to immediately check selection
		const mouseUpListener = addDisposableListener(getWindow(undefined), 'mouseup', () => {
			setTimeout(checkSelection, 10);
		});

		const mouseMoveListener = addDisposableListener(getWindow(undefined), 'mousemove', (e) => {
			// Only check if mouse is over terminal
			if (e.target && (e.target as HTMLElement).closest('.terminal-instance, .xterm')) {
				checkSelection();
			}
		});

		this.selectionListener = {
			dispose: () => {
				clearInterval(interval);
				mouseUpListener.dispose();
				mouseMoveListener.dispose();
				this.hideButton();
			}
		};
	}

	private showButton(instance: any, xterm: any): void {
		if (!this.button) {
			this.createButton();
		}

		if (!this.button) {
			return;
		}

		// Don't store terminal name here - get it fresh on click since it can change
		// Just store a reference to the instance and terminal element
		this.currentTerminalInstance = instance;

		// Store terminal element for positioning
		const terminalElement = xterm.raw?.element;
		if (terminalElement) {
			this.currentTerminalElement = terminalElement;

			// Listen for inline composer visibility changes
			if (!this.inlineComposerVisibilityListener) {
				this.inlineComposerVisibilityListener = (e: CustomEvent) => {
					if (e.detail?.terminalElement === terminalElement) {
						// Inline composer visibility changed, update button position
						setTimeout(() => this.updateButtonPosition(xterm), 0);
					}
				};
				getWindow(undefined).addEventListener('vybe-terminal-inline-composer-visibility-changed', this.inlineComposerVisibilityListener as EventListener);
			}
		}

		// Get selection text
		const rawXterm = xterm.raw;
		const selection = rawXterm.getSelection();
		if (!selection) {
			this.hideButton();
			return;
		}

		// Store selection text for button click (terminal name will be fetched fresh on click)
		this.button.dataset.selection = selection;

		// Update button position
		this.updateButtonPosition(xterm);

		// Show button
		this.button.style.display = 'flex';
		this.button.style.flexDirection = 'row';
	}

	private updateButtonPosition(xterm: any): void {
		if (!this.button) {
			return;
		}

		// Clear any pending timeout
		if (this.updatePositionTimeout) {
			clearTimeout(this.updatePositionTimeout);
		}

		// Use requestAnimationFrame for smooth positioning
		this.updatePositionTimeout = setTimeout(() => {
			if (!this.button || !xterm) {
				return;
			}

			const rawXterm = xterm.raw;
			const terminalElement = rawXterm.element;
			if (!terminalElement) {
				return;
			}

			// Get selection manager
			// @ts-ignore - xterm.js internal API
			const selectionManager = rawXterm._selectionManager;
			let buttonTop = 0;
			let buttonRight = 0;

			if (selectionManager && selectionManager.selectionStart && selectionManager.selectionEnd) {
				// @ts-ignore
				const selectionStart = selectionManager.selectionStart;
				// @ts-ignore
				const selectionEnd = selectionManager.selectionEnd;

				// Get buffer and calculate line indices
				const buffer = rawXterm.buffer.active;
				const bufferBase = buffer.baseY;
				const endLineIndex = selectionEnd.y - bufferBase;

				// Find the line element in the terminal DOM
				const lineElements = terminalElement.querySelectorAll('.xterm-rows > div');

				if (lineElements[endLineIndex] && endLineIndex >= 0) {
					const lineElement = lineElements[endLineIndex] as HTMLElement;
					const lineRect = lineElement.getBoundingClientRect();
					const terminalRect = terminalElement.getBoundingClientRect();

					// Calculate character width
					const charWidth = lineRect.width / rawXterm.cols;

					// Calculate selection end position in pixels
					const selectionEndX = selectionEnd.x * charWidth;

					// Position button relative to terminal element's viewport
					// This ensures it stays in place when inline composer pushes terminal up
					const selectionRight = lineRect.left + selectionEndX;
					const buttonWidth = 110; // Approximate button width
					const maxRight = terminalRect.right - 20; // Leave space for scrollbar
					const desiredRight = selectionRight + buttonWidth + 4; // 4px gap after selection
					const finalRight = Math.min(desiredRight, maxRight);

					// Position: 2px right from selection end, 8px down from line
					buttonTop = lineRect.top + 8; // 8px down from selection line
					buttonRight = getWindow(undefined).innerWidth - finalRight - 2; // 2px right from selection end
				} else {
					// Fallback: use terminal top-right
					const rect = terminalElement.getBoundingClientRect();
					buttonTop = rect.top; // At terminal top
					buttonRight = getWindow(undefined).innerWidth - rect.right + 20 - 2; // 2px right
				}
			} else {
				// No selection: hide button (shouldn't reach here, but fallback)
				const rect = terminalElement.getBoundingClientRect();
				buttonTop = rect.top;
				buttonRight = getWindow(undefined).innerWidth - rect.right + 20 - 2;
			}

			// Apply position - use fixed positioning but calculate relative to terminal viewport
			// This ensures the button moves with the terminal when inline composer opens
			this.button.style.position = 'fixed';
			this.button.style.top = `${buttonTop}px`;
			this.button.style.right = `${buttonRight}px`;
			this.button.style.zIndex = '10001'; // Higher than inline composer (10000)
		}, 0);
	}

	private createButton(): void {
		if (this.button) {
			return;
		}

		this.button = $('div', {
			class: 'vybe-terminal-selection-button composer-run-button',
			style: `
				display: none;
				position: fixed;
				flex-direction: row;
				align-items: center;
				justify-content: center;
				gap: 4px;
				padding: 0 6px;
				min-height: 20px;
				background: #3ecf8e !important;
				color: white;
				border-radius: 4px;
				cursor: pointer;
				user-select: none;
				transition: background-color 0.15s ease;
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
				z-index: 10000;
				white-space: nowrap;
				font-size: 12px;
				line-height: 16px;
				font-weight: 500;
				font-family: -apple-system, "system-ui", sans-serif;
			`
		});

		// Add hover effect
		this.button.addEventListener('mouseenter', () => {
			if (this.button) {
				this.button.style.background = '#35b87d';
			}
		});

		this.button.addEventListener('mouseleave', () => {
			if (this.button) {
				this.button.style.background = '#3ecf8e';
			}
		});

		// Add click handler
		this._register(addDisposableListener(this.button, 'click', () => {
			this.handleButtonClick();
		}));

		// Add text
		const text = $('span');
		text.textContent = 'Add to Chat';
		text.style.cssText = 'color: white; font-size: 12px; line-height: 16px; font-family: -apple-system, "system-ui", sans-serif;';
		this.button.appendChild(text);

		// Append to body
		document.body.appendChild(this.button);
	}

	private async handleButtonClick(): Promise<void> {
		if (!this.button) {
			return;
		}

		// Get current terminal name from instance (it may have changed since selection was made)
		// Try multiple properties in order of preference: title, processName, name, shellLaunchConfig.name
		let terminalName = 'zsh'; // fallback
		if (this.currentTerminalInstance) {
			// title is the most up-to-date (changes with commands like git, npm, etc.)
			terminalName = this.currentTerminalInstance.title ||
				this.currentTerminalInstance.processName ||
				this.currentTerminalInstance.name ||
				this.currentTerminalInstance.shellLaunchConfig?.name ||
				'zsh';

			// Clean up the title - it might have extra info, just get the process name part
			// Terminal titles can be like "git" or "zsh" or "VYBE" - take the first word
			if (terminalName && terminalName.trim()) {
				const parts = terminalName.trim().split(/\s+/);
				terminalName = parts[0];
			}
		}

		// Get selection text (stored when button was shown)
		const selection = this.button.dataset.selection || '';

		// Format pill name: just the terminal name (e.g., "git", "zsh", "VYBE")
		const pillName = terminalName;

		// First, check if terminal prompt bar is open and expanded for this terminal
		// If so, add to prompt bar instead of main chat view
		if (this.currentTerminalElement) {
			const promptBarWidget = (this.currentTerminalElement as any).__vybeTerminalPromptBarWidget;
			if (promptBarWidget && promptBarWidget.isExpanded && promptBarWidget.isExpanded()) {
				console.log('[Terminal Selection] Found prompt bar, inserting pill:', pillName);
				promptBarWidget.insertContextPill(pillName, selection);
				this.hideButton();
				return;
			}
		}

		// Find VYBE chat view pane (main chat)
		// First try: find via DOM (most reliable)
		let vybeChatView: any = null;

		// Search all elements - look for the container that has __vybePane
		// The container is the one with the chat area, not necessarily the one with the ID
		const allContainers = document.querySelectorAll('.monaco-workbench .part.sidebar .content, .monaco-workbench .part.panel .content');
		for (const container of allContainers) {
			const pane = (container as any).__vybePane;
			if (pane && pane.composer) {
				vybeChatView = pane;
				break;
			}
		}

		// Second try: search by ID pattern
		if (!vybeChatView) {
			const allElements = document.querySelectorAll('[id*="vybeChat"], [id*="VybeChat"]');
			for (const el of allElements) {
				const pane = (el as any).__vybePane;
				if (pane && pane.composer) {
					vybeChatView = pane;
					break;
				}
			}
		}

		// Third try: search the entire document for any element with __vybePane
		if (!vybeChatView) {
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
			let node: Node | null = walker.nextNode();
			while (node) {
				const pane = (node as any).__vybePane;
				if (pane && pane.composer) {
					vybeChatView = pane;
					break;
				}
				node = walker.nextNode();
			}
		}

		// Fourth try: use views service
		if (!vybeChatView) {
			try {
				// Get all view containers
				const containers = this.viewDescriptorService.getViewContainersByLocation(0);
				for (const container of containers) {
					if (container.id?.includes('vybeChat') || container.id?.includes('VybeChat')) {
						const containerModel = this.viewDescriptorService.getViewContainerModel(container);
						if (containerModel) {
							const viewItems = containerModel.allViewDescriptors;
							for (const viewItem of viewItems) {
								if (viewItem.id?.includes('vybeChat') || viewItem.id?.includes('VybeChat')) {
									const view = await this.viewsService.openView(viewItem.id, true);
									if (view) {
										// Check if it has composer directly or via __vybePane
										if ((view as any).composer) {
											vybeChatView = view;
											break;
										}
										// Try to find the DOM element for this view
										const viewElement = document.querySelector(`[id="${viewItem.id}"]`);
										if (viewElement) {
											const pane = (viewElement as any).__vybePane;
											if (pane && pane.composer) {
												vybeChatView = pane;
												break;
											}
										}
									}
								}
							}
						}
						if (vybeChatView) {
							break;
						}
					}
				}
			} catch (e) {
				console.error('[Terminal Selection] Error finding VYBE chat view:', e);
			}
		}

		// Insert context pill with selection text (like VS Code does)
		if (vybeChatView && vybeChatView.composer) {
			try {
				console.log('[Terminal Selection] Found VYBE chat view, inserting pill:', pillName);
				vybeChatView.composer.insertContextPill('terminal', pillName, undefined, undefined, selection);

				// Focus the composer
				if (vybeChatView.composer.textInput) {
					vybeChatView.composer.textInput.focus();
				}
				console.log('[Terminal Selection] Pill inserted successfully');
			} catch (e) {
				console.error('[Terminal Selection] Error inserting pill:', e);
			}
		} else {
			console.warn('[Terminal Selection] Could not find VYBE chat view or composer');
			console.log('[Terminal Selection] Debug: vybeChatView =', vybeChatView);
			console.log('[Terminal Selection] Debug: composer =', vybeChatView?.composer);

			// Try to find and log all potential panes
			const allPanes: any[] = [];
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
			let node: Node | null = walker.nextNode();
			while (node) {
				const pane = (node as any).__vybePane;
				if (pane) {
					allPanes.push({ element: node, pane, hasComposer: !!pane.composer });
				}
				node = walker.nextNode();
			}
			console.log('[Terminal Selection] Found panes:', allPanes);
		}

		// Hide button after click
		this.hideButton();
	}

	private hideButton(): void {
		if (this.button) {
			this.button.style.display = 'none';
		}
	}

	override dispose(): void {
		if (this.selectionListener) {
			this.selectionListener.dispose();
			this.selectionListener = null;
		}

		if (this.updatePositionTimeout) {
			clearTimeout(this.updatePositionTimeout);
			this.updatePositionTimeout = null;
		}

		if (this.inlineComposerVisibilityListener) {
			getWindow(undefined).removeEventListener('vybe-terminal-inline-composer-visibility-changed', this.inlineComposerVisibilityListener as EventListener);
			this.inlineComposerVisibilityListener = null;
		}

		if (this.button) {
			this.button.remove();
			this.button = null;
		}

		this.currentTerminalElement = null;
		this.currentTerminalInstance = null;

		super.dispose();
	}
}

// Register the contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	TerminalSelectionButtonContribution,
	LifecyclePhase.Restored
);

