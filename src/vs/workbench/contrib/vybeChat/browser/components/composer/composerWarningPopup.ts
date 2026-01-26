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
		// Same detection as MessageComposer so theme switch matches (body + workbench)
		const body = document.body;
		const workbench = document.querySelector('.monaco-workbench');
		return !!(
			body.classList.contains('vs-dark') ||
			body.classList.contains('vscode-dark') ||
			body.classList.contains('hc-black') ||
			workbench?.classList.contains('vs-dark') ||
			workbench?.classList.contains('hc-black')
		);
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
		// Fallback: same as AI input box in messageComposer (Vybe light/dark)
		return this.isDarkTheme() ? '#212427' : '#eceff2';
	}

	private getComposerBorder(): string {
		// Get the actual computed border from the input box so popup matches exactly
		const inputBox = this.getInputBox();
		if (inputBox) {
			const s = window.getComputedStyle(inputBox);
			const w = s.borderWidth;
			const style = s.borderStyle;
			const color = s.borderColor;
			if (w && style && color && style !== 'none') {
				return `${w} ${style} ${color}`;
			}
		}
		// Fallback: same as AI input box in messageComposer (Vybe light/dark)
		return this.isDarkTheme() ? '1px solid #383838' : '1px solid #d9d9d9';
	}

	private isElementInViewport(element: HTMLElement): boolean {
		const rect = element.getBoundingClientRect();
		return (
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
			rect.right <= (window.innerWidth || document.documentElement.clientWidth)
		);
	}

	/**
	 * Show a warning/error/info popup above the composer
	 */
	public show(options: ComposerWarningOptions): void {
		// Remove existing popup if any
		this.hide();

		// Create popup element - part of composer family: same border, background, font as input box
		this.popupElement = $('.composer-warning-popup');
		this.popupElement.setAttribute('tabindex', '-1');
		this.popupElement.className = 'composer-warning-popup';
		// Position as part of composer: absolute, full width of parent, above composer
		this.popupElement.style.position = 'absolute';
		this.popupElement.style.left = '0';
		this.popupElement.style.right = '0';
		this.popupElement.style.bottom = '100%';
		this.popupElement.style.marginBottom = '4px';
		this.popupElement.style.zIndex = '11';
		this.popupElement.style.display = 'flex';
		this.popupElement.style.flexDirection = 'column';
		this.popupElement.style.padding = '8px';
		// Same border radius as AI input box (8px)
		this.popupElement.style.borderRadius = '8px';
		this.popupElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
		// Match AI input box exactly: copy computed background and border from .vybe-ai-input-box
		this.popupElement.style.backgroundColor = this.getComposerBackgroundColor();
		this.popupElement.style.border = this.getComposerBorder();
		this.popupElement.style.fontFamily = 'var(--vscode-font-family)';
		this.popupElement.style.fontSize = 'var(--vscode-font-size)';
		this.popupElement.style.color = 'var(--vscode-foreground)';

		// Header row: title (left) | close button (right) only
		const headerRow = $('.composer-warning-popup-header');
		headerRow.style.display = 'flex';
		headerRow.style.gap = '8px';
		headerRow.style.alignItems = 'center';
		headerRow.style.width = '100%';
		headerRow.style.marginBottom = '6px';
		headerRow.style.minHeight = '0';

		// Title (left)
		const title = $('.composer-error-title');
		title.className = 'composer-error-title';
		title.textContent = options.title;
		title.style.fontSize = '12px';
		title.style.fontWeight = '500';
		title.style.lineHeight = '1.4';
		title.style.flex = '1';
		title.style.minWidth = '0';
		title.style.color = 'var(--vscode-foreground)';
		headerRow.appendChild(title);

		if (options.showCloseButton !== false) {
			const closeButton = $('button.composer-warning-popup-close-button');
			closeButton.setAttribute('type', 'button');
			closeButton.setAttribute('aria-label', 'Close');
			closeButton.className = 'composer-warning-popup-close-button codicon-button';
			closeButton.style.width = '22px';
			closeButton.style.height = '22px';
			closeButton.style.minWidth = '22px';
			closeButton.style.cursor = 'pointer';
			closeButton.style.display = 'flex';
			closeButton.style.alignItems = 'center';
			closeButton.style.justifyContent = 'center';
			closeButton.style.flexShrink = '0';
			closeButton.style.border = 'none';
			closeButton.style.background = 'transparent';
			closeButton.style.color = 'var(--vscode-foreground)';
			closeButton.style.opacity = '1';

			const closeIcon = $('span.codicon.codicon-close');
			closeIcon.className = 'codicon codicon-close';
			closeIcon.style.fontSize = '16px';
			closeIcon.style.color = 'inherit';
			closeButton.appendChild(closeIcon);

			this._register(addDisposableListener(closeButton, 'click', () => {
				this.hide();
				if (options.onClose) {
					options.onClose();
				}
			}));

			headerRow.appendChild(closeButton);
		}

		// Details row: same row — description (left, wraps if long) + Try Again / other buttons (bottom-right)
		const detailsRow = $('.composer-warning-popup-details');
		detailsRow.style.display = 'flex';
		detailsRow.style.flexDirection = 'row';
		detailsRow.style.gap = '8px';
		detailsRow.style.alignItems = 'flex-end';
		detailsRow.style.width = '100%';
		detailsRow.style.minWidth = '0';

		// Description (left, takes remaining space, wraps)
		const messageBlock = $('.composer-warning-popup-message');
		messageBlock.style.flex = '1';
		messageBlock.style.fontSize = '12px';
		messageBlock.style.userSelect = 'text';
		messageBlock.style.color = 'var(--vscode-foreground)';
		messageBlock.style.minWidth = '0';
		messageBlock.style.wordWrap = 'break-word';

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
		messageBlock.appendChild(messageContainer);

		detailsRow.appendChild(messageBlock);

		// Buttons on same row (right side): Try Again, Resume, etc.
		const nonTertiaryButtons = options.buttons ? options.buttons.filter(b => b.variant !== 'tertiary') : [];
		if (nonTertiaryButtons.length > 0) {
			const isDarkTheme = this.isDarkTheme();
			const isSingleAction = nonTertiaryButtons.length === 1;
			const buttonGroup = $('div');
			buttonGroup.style.display = 'flex';
			buttonGroup.style.gap = '6px';
			buttonGroup.style.alignItems = 'center';
			buttonGroup.style.flexShrink = '0';

			nonTertiaryButtons.forEach((button) => {
				// Use button's variant when provided so e.g. Try Again can match solo primary style
				const finalVariant = button.variant ?? (isSingleAction ? 'primary' : 'secondary');
				const buttonElement = this.createButton({ ...button, variant: finalVariant }, isDarkTheme);
				buttonGroup.appendChild(buttonElement);
			});

			detailsRow.appendChild(buttonGroup);
		}

		// Assemble popup: header row + details row (description + buttons)
		this.popupElement.appendChild(headerRow);
		this.popupElement.appendChild(detailsRow);

		// Ensure parent has position: relative so absolute popup is positioned relative to it
		const parentStyle = window.getComputedStyle(this.parentElement);
		if (parentStyle.position === 'static') {
			this.parentElement.style.position = 'relative';
		}

		// Append as first child so it sits above the input in DOM and draws above it; width follows parent (left/right 0)
		if (this.parentElement.firstChild) {
			this.parentElement.insertBefore(this.popupElement, this.parentElement.firstChild);
		} else {
			this.parentElement.appendChild(this.popupElement);
		}
		this.isVisible = true;

		// If popup would be above viewport, scroll it into view
		requestAnimationFrame(() => {
			if (this.popupElement && !this.isElementInViewport(this.popupElement)) {
				this.popupElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
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
	 * Update popup position (e.g. after resize). With absolute positioning in parent, width follows automatically; optionally scroll into view.
	 */
	public updatePosition(): void {
		if (!this.popupElement || !this.isVisible) {
			return;
		}
		if (!this.isElementInViewport(this.popupElement)) {
			this.popupElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
		}
	}

	/**
	 * Re-apply theme-dependent styles (background, border) when theme changes so the popup matches the composer in light/dark.
	 * Uses the same logic and values as MessageComposer.updateTheme() for the input box so we stay in sync without depending on getComputedStyle timing.
	 */
	public updateTheme(): void {
		if (!this.popupElement || !this.isVisible) {
			return;
		}
		const isDark = this.isDarkTheme();
		this.popupElement.style.backgroundColor = 'var(--vscode-titleBar-activeBackground)';
		this.popupElement.style.border = isDark ? '1px solid #383838' : '1px solid #d9d9d9';
	}

	/**
	 * Check if popup is currently visible
	 */
	public get visible(): boolean {
		return this.isVisible;
	}
}

