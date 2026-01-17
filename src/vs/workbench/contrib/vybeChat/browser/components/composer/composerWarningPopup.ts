/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { $, addDisposableListener } from '../../../../../../base/browser/dom.js';

export interface ComposerWarningButton {
	label: string;
	action: () => void;
	variant?: 'primary' | 'secondary' | 'tertiary';
	keybinding?: string;
}

export interface ComposerWarningOptions {
	title: string;
	message: string;
	icon?: 'warning' | 'error' | 'info';
	showCloseButton?: boolean;
	buttons?: ComposerWarningButton[];
	onClose?: () => void;
}

export class ComposerWarningPopup extends Disposable {
	private popupElement: HTMLElement | null = null;
	private parentElement: HTMLElement;
	private isVisible: boolean = false;

	constructor(parentElement: HTMLElement) {
		super();
		this.parentElement = parentElement;
	}

	private getInputBox(): HTMLElement | null {
		// Find the input box element within the parent wrapper
		return this.parentElement.querySelector('.vybe-ai-input-box') as HTMLElement | null;
	}

	private isDarkTheme(): boolean {
		// Check body classes first
		const body = document.body;
		if (body.classList.contains('vs-dark') || body.classList.contains('vscode-dark')) {
			return true;
		}
		// Also check by background color brightness
		const inputBox = this.getInputBox();
		if (inputBox) {
			const computedBg = window.getComputedStyle(inputBox).backgroundColor;
			const rgbMatch = computedBg.match(/\d+/g);
			if (rgbMatch && rgbMatch.length >= 3) {
				const r = parseInt(rgbMatch[0]);
				const g = parseInt(rgbMatch[1]);
				const b = parseInt(rgbMatch[2]);
				const avg = (r + g + b) / 3;
				return avg < 128; // Dark if average is less than 128
			}
		}
		return false;
	}

	private getComposerBackgroundColor(): string {
		// Get the actual computed background color from the input box
		const inputBox = this.getInputBox();
		if (inputBox) {
			const computedBg = window.getComputedStyle(inputBox).backgroundColor;
			// If it's a valid color, use it
			if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
				return computedBg;
			}
		}
		// Fallback: check theme and use hardcoded values
		return this.isDarkTheme() ? '#212427' : '#eceff2';
	}

	/**
	 * Show a warning/error/info popup above the composer
	 */
	public show(options: ComposerWarningOptions): void {
		// Remove existing popup if any
		this.hide();

		// Get the actual computed background color from the input box
		const composerBg = this.getComposerBackgroundColor();

		// Get input box for positioning
		const inputBox = this.getInputBox();
		const inputBoxRect = inputBox ? inputBox.getBoundingClientRect() : null;
		const parentRect = this.parentElement.getBoundingClientRect();

		// Create popup element
		this.popupElement = $('.composer-warning-popup');
		this.popupElement.setAttribute('tabindex', '-1');
		this.popupElement.className = 'flex flex-col border-[var(--vscode-dropdown-border)] border border-solid absolute z-[11] p-2 rounded-lg shadow-md fade-in-fast bottom-full composer-warning-popup';
		this.popupElement.style.marginBottom = '4px';
		this.popupElement.style.backgroundColor = composerBg;
		this.popupElement.style.gap = '0';

		// Position exactly aligned with input box (accounting for wrapper)
		if (inputBoxRect && parentRect) {
			// Calculate offset from parent to input box
			const leftOffset = inputBoxRect.left - parentRect.left;
			const rightOffset = parentRect.right - inputBoxRect.right;
			this.popupElement.style.left = `${leftOffset}px`;
			this.popupElement.style.right = `${rightOffset}px`;
		} else {
			// Fallback: align with parent
			this.popupElement.style.left = '0';
			this.popupElement.style.right = '0';
		}

		// Header row - title on left, close button on far right
		const headerRow = $('.flex.gap-1.5.items-start.flex-wrap');
		headerRow.style.display = 'flex';
		headerRow.style.gap = '6px';
		headerRow.style.alignItems = 'center';
		headerRow.style.flexWrap = 'nowrap';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.width = '100%';
		headerRow.style.marginBottom = '6px';

		// Title
		const title = $('.composer-error-title');
		title.className = 'composer-error-title';
		title.textContent = options.title;
		title.style.fontSize = '12px';
		title.style.fontWeight = '500';
		title.style.lineHeight = '15.6px';
		title.style.flex = '1';
		title.style.minWidth = '0';

		// Close button
		if (options.showCloseButton !== false) {
			const closeButton = $('.composer-warning-popup-close-button');
			closeButton.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center h-[14px] w-[16px] p-0 composer-warning-popup-close-button';
			closeButton.style.width = '20px';
			closeButton.style.height = '20px';
			closeButton.style.cursor = 'pointer';
			closeButton.style.opacity = '0.5';
			closeButton.style.display = 'flex';
			closeButton.style.alignItems = 'center';
			closeButton.style.justifyContent = 'center';
			closeButton.style.flexShrink = '0';
			closeButton.style.marginLeft = 'auto';

			const closeIcon = $('span');
			closeIcon.className = 'codicon codicon-close';
			closeIcon.style.fontSize = '15px';
			closeButton.appendChild(closeIcon);

			this._register(addDisposableListener(closeButton, 'click', () => {
				this.hide();
				if (options.onClose) {
					options.onClose();
				}
			}));

			headerRow.appendChild(title);
			headerRow.appendChild(closeButton);
		} else {
			headerRow.appendChild(title);
		}

		// Message row
		const messageRow = $('.text-[12px].select-text');
		messageRow.style.fontSize = '12px';
		messageRow.style.userSelect = 'text';
		messageRow.style.color = 'var(--vscode-foreground)';
		messageRow.style.minWidth = '0';
		messageRow.style.marginBottom = '6px';

		const messageContainer = $('.composer-warning-message-with-title');
		messageContainer.style.opacity = '0.8';
		messageContainer.style.marginBottom = '0';

		const markdownContainer = $('span');
		markdownContainer.className = 'anysphere-markdown-container-root text-[12px] select-text';
		markdownContainer.style.color = 'var(--vscode-foreground)';
		markdownContainer.style.userSelect = 'text';
		markdownContainer.style.fontSize = '12px';
		markdownContainer.style.marginBottom = '0';

		const markdownSection = $('section');
		markdownSection.className = 'markdown-section my-0';
		markdownSection.setAttribute('data-markdown-raw', options.message);
		markdownSection.setAttribute('data-section-index', '0');
		markdownSection.style.marginBottom = '0';

		const messageSpan = $('span');
		messageSpan.textContent = options.message;
		markdownSection.appendChild(messageSpan);
		markdownContainer.appendChild(markdownSection);
		messageContainer.appendChild(markdownContainer);
		messageRow.appendChild(messageContainer);

		// Control row (buttons)
		let controlRow: HTMLElement | null = null;
		if (options.buttons && options.buttons.length > 0) {
			controlRow = $('.composer-warning-popup-control-row');
			controlRow.className = 'composer-warning-popup-control-row flex gap-1.5 justify-between items-center flex-row';
			controlRow.style.display = 'flex';
			controlRow.style.gap = '6px';
			controlRow.style.justifyContent = 'space-between';
			controlRow.style.alignItems = 'center';
			controlRow.style.flexDirection = 'row';
			controlRow.style.paddingTop = '0';
			controlRow.style.paddingLeft = '0';

			// Count non-tertiary buttons to determine variant
			// If only one non-tertiary button = primary, if two+ = secondary
			const nonTertiaryButtons = options.buttons.filter(b => b.variant !== 'tertiary');
			const nonTertiaryCount = nonTertiaryButtons.length;
			const isSingleNonTertiary = nonTertiaryCount === 1;

			// Left side buttons (tertiary) - can shrink/truncate
			const leftButtons = $('.flex.gap-1.5.items-center');
			leftButtons.style.display = 'flex';
			leftButtons.style.gap = '6px';
			leftButtons.style.alignItems = 'center';
			leftButtons.style.paddingLeft = '0';
			leftButtons.style.flex = '1';
			leftButtons.style.minWidth = '0'; // Allow shrinking below content size
			leftButtons.style.overflow = 'hidden'; // Hide overflow

			// Right side buttons (primary/secondary) - must not shrink
			const rightButtons = $('.flex.gap-1.5.items-center');
			rightButtons.style.display = 'flex';
			rightButtons.style.gap = '6px';
			rightButtons.style.alignItems = 'center';
			rightButtons.style.flexShrink = '0'; // Prevent shrinking

			// Detect theme for button styling
			const isDarkTheme = this.isDarkTheme();

			options.buttons.forEach((button) => {
				// Determine final variant
				let finalVariant = button.variant;
				if (button.variant === 'tertiary') {
					// Keep tertiary as is
					finalVariant = 'tertiary';
				} else if (isSingleNonTertiary) {
					// Single non-tertiary button = primary
					finalVariant = 'primary';
				} else {
					// Multiple non-tertiary buttons = secondary
					finalVariant = 'secondary';
				}

				const buttonElement = this.createButton({
					...button,
					variant: finalVariant
				}, isDarkTheme);

				if (button.variant === 'tertiary') {
					leftButtons.appendChild(buttonElement);
				} else {
					rightButtons.appendChild(buttonElement);
				}
			});

			controlRow.appendChild(leftButtons);
			controlRow.appendChild(rightButtons);
		}

		// Assemble popup
		this.popupElement.appendChild(headerRow);
		this.popupElement.appendChild(messageRow);
		if (controlRow) {
			this.popupElement.appendChild(controlRow);
		}

		// Append to parent (should be the input box wrapper)
		this.parentElement.appendChild(this.popupElement);
		this.isVisible = true;

		// Add fade-in animation
		requestAnimationFrame(() => {
			if (this.popupElement) {
				this.popupElement.classList.add('fade-in-fast');
			}
		});
	}

	private createButton(button: ComposerWarningButton, isDarkTheme: boolean): HTMLElement {
		const buttonElement = $('div');
		buttonElement.setAttribute('data-click-ready', 'true');
		buttonElement.style.fontSize = '12px';
		buttonElement.style.lineHeight = '16px';
		buttonElement.style.boxSizing = 'border-box';
		buttonElement.style.minHeight = '20px';
		buttonElement.style.display = 'flex';
		buttonElement.style.flexWrap = 'nowrap';
		buttonElement.style.alignItems = 'center';
		buttonElement.style.justifyContent = 'center';
		buttonElement.style.gap = '4px';
		buttonElement.style.paddingLeft = '6px';
		buttonElement.style.paddingRight = '6px';
		buttonElement.style.borderRadius = '4px';
		buttonElement.style.cursor = 'pointer';
		buttonElement.style.whiteSpace = 'nowrap';
		buttonElement.style.flexShrink = '0';
		buttonElement.style.height = 'fit-content';

		// Apply variant styles
		if (button.variant === 'tertiary') {
			buttonElement.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap anysphere-text-button h-fit composer-warning-button composer-warning-button-tertiary';
			// Use same color as markdown row (var(--vscode-foreground))
			buttonElement.style.color = 'var(--vscode-foreground)';
			buttonElement.style.backgroundColor = 'transparent';
			buttonElement.style.border = 'none';
			buttonElement.style.paddingLeft = '0';
			buttonElement.style.flexShrink = '1'; // Allow tertiary buttons to shrink
			buttonElement.style.minWidth = '0'; // Allow shrinking below content size
			buttonElement.style.overflow = 'hidden'; // Hide overflow
		} else if (button.variant === 'primary') {
			// Primary button = VYBE green (#3ecf8e)
			buttonElement.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-primary-button h-fit composer-warning-button';
			buttonElement.style.backgroundColor = '#3ecf8e';
			buttonElement.style.color = isDarkTheme ? '#ffffff' : '#000000';
		} else {
			// Secondary button = editor background color
			buttonElement.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-secondary-button h-fit composer-warning-button';
			buttonElement.style.backgroundColor = 'var(--vscode-editor-background)';
			buttonElement.style.color = 'var(--vscode-foreground)';
		}

		const innerSpan = $('span');
		innerSpan.style.display = 'inline-flex';
		innerSpan.style.alignItems = 'baseline';
		innerSpan.style.gap = '2px';
		innerSpan.style.minWidth = '0';
		innerSpan.style.overflow = 'hidden';

		const truncateSpan = $('span');
		truncateSpan.style.overflow = 'hidden';
		truncateSpan.style.textOverflow = 'ellipsis';
		truncateSpan.style.whiteSpace = 'nowrap';
		truncateSpan.style.minWidth = '0'; // Allow truncation
		truncateSpan.style.flexShrink = '1'; // Allow shrinking

		const textSpan = $('span');
		textSpan.className = 'composer-warning-button-text';
		textSpan.textContent = button.label;
		truncateSpan.appendChild(textSpan);
		innerSpan.appendChild(truncateSpan);

		// Add keybinding if provided
		if (button.keybinding) {
			const keybindingSpan = $('span');
			keybindingSpan.className = 'text-[10px] opacity-50 keybinding-font-settings shrink-0';
			keybindingSpan.style.fontSize = '10px';
			keybindingSpan.style.opacity = '0.5';
			keybindingSpan.style.marginLeft = '2px';
			keybindingSpan.textContent = button.keybinding;
			innerSpan.appendChild(keybindingSpan);
		}

		buttonElement.appendChild(innerSpan);

		this._register(addDisposableListener(buttonElement, 'click', () => {
			button.action();
		}));

		return buttonElement;
	}

	/**
	 * Hide the popup
	 */
	public hide(): void {
		if (this.popupElement && this.popupElement.parentNode) {
			this.popupElement.parentNode.removeChild(this.popupElement);
		}
		this.popupElement = null;
		this.isVisible = false;
	}

	/**
	 * Check if popup is currently visible
	 */
	public get visible(): boolean {
		return this.isVisible;
	}
}

