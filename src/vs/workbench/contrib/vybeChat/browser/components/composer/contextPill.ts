/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';

export type ContextPillType = 'file' | 'terminal' | 'doc';

export class ContextPill extends Disposable {
	private normalizeTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private textInput: HTMLElement,
		private placeholderElement: HTMLElement | null
	) {
		super();
		// Normalize structure on initialization
		this.normalizeContentEditable();

		// Listen for input events to normalize structure after typing
		this._register(addDisposableListener(this.textInput, 'input', () => {
			// Debounce normalization to avoid performance issues
			if (this.normalizeTimeout) {
				clearTimeout(this.normalizeTimeout);
			}
			this.normalizeTimeout = setTimeout(() => {
				this.normalizeContentEditable();
			}, 0);
		}));
	}

	override dispose(): void {
		if (this.normalizeTimeout) {
			clearTimeout(this.normalizeTimeout);
			this.normalizeTimeout = null;
		}
		super.dispose();
	}

	/**
	 * Normalize contenteditable structure to ensure it has a proper paragraph container
	 * This prevents contenteditable from creating block elements that break the layout
	 */
	private normalizeContentEditable(): void {
		if (!this.textInput) {
			return;
		}

		// If empty, ensure we have a <p> tag
		if (!this.textInput.firstChild || (this.textInput.firstChild.nodeType === Node.TEXT_NODE && !this.textInput.textContent?.trim())) {
			// Remove all children
			while (this.textInput.firstChild) {
				this.textInput.removeChild(this.textInput.firstChild);
			}
			// Create a paragraph
			const p = this.textInput.ownerDocument.createElement('p');
			this.textInput.appendChild(p);
		} else {
			// Check if first child is a paragraph, if not, wrap content
			const firstChild = this.textInput.firstChild;
			if (firstChild.nodeType === Node.ELEMENT_NODE && (firstChild as HTMLElement).tagName === 'P') {
				// Already has paragraph, good
				return;
			} else {
				// Wrap all content in a paragraph
				const p = this.textInput.ownerDocument.createElement('p');
				while (this.textInput.firstChild) {
					p.appendChild(this.textInput.firstChild);
				}
				this.textInput.appendChild(p);
			}
		}
	}

	/**
	 * Insert a context pill at the current cursor position
	 * @param type - 'file' | 'terminal' | 'doc'
	 * @param name - Display name
	 * @param path - File path (for files only)
	 * @param iconClasses - Icon classes for file icons (for files only)
	 */
	public updatePlaceholderVisibility(): void {
		if (!this.textInput || !this.placeholderElement) {
			return;
		}

		// Get all text nodes (excluding mention text)
		const mentions = this.textInput.querySelectorAll('.mention');
		let textContent = '';

		// Walk through all child nodes
		const walker = this.textInput.ownerDocument.createTreeWalker(
			this.textInput,
			NodeFilter.SHOW_TEXT,
			null
		);

		let node;
		while (node = walker.nextNode()) {
			// Check if this text node is inside a mention
			let isInsideMention = false;
			for (const mention of mentions) {
				if (mention.contains(node)) {
					isInsideMention = true;
					break;
				}
			}
			if (!isInsideMention) {
				textContent += node.textContent || '';
			}
		}

		// Check if there's any actual text content (excluding mention text)
		const hasText = textContent.trim().length > 0;
		const hasMentions = mentions.length > 0;

		// Hide placeholder if there's any content (text or pills)
		const isEmpty = !hasText && !hasMentions;
		this.placeholderElement.style.display = isEmpty ? 'block' : 'none';
	}

	public insertPill(type: ContextPillType, name: string, path?: string, iconClasses?: string[]): void {
		if (!this.textInput) {
			return;
		}

		const targetWindow = this.textInput.ownerDocument.defaultView;
		if (!targetWindow) {
			return;
		}

		// Normalize contenteditable structure - ensure it has a proper container
		this.normalizeContentEditable();

		const selection = targetWindow.getSelection();
		if (!selection) {
			return;
		}

		let range: Range;
		if (selection.rangeCount === 0) {
			// No selection, insert at end or beginning
			range = this.textInput.ownerDocument.createRange();
			// Find the first text node or create a paragraph
			const firstChild = this.textInput.firstChild;
			if (firstChild && firstChild.nodeType === Node.ELEMENT_NODE && (firstChild as HTMLElement).tagName === 'P') {
				// Insert into existing paragraph
				const p = firstChild as HTMLElement;
				if (p.lastChild) {
					range.setStartAfter(p.lastChild);
				} else {
					range.setStart(p, 0);
				}
				range.collapse(true);
			} else if (this.textInput.textContent && this.textInput.textContent.trim().length > 0) {
				// Insert at end
				range.selectNodeContents(this.textInput);
				range.collapse(false);
			} else {
				// Insert at beginning
				range.setStart(this.textInput, 0);
				range.collapse(true);
			}
			selection.removeAllRanges();
			selection.addRange(range);
		} else {
			range = selection.getRangeAt(0);
			// Ensure range is within a proper container
			let container = range.commonAncestorContainer;
			if (container.nodeType === Node.TEXT_NODE) {
				container = container.parentNode!;
			}
			// If we're not in a paragraph, find or create one
			if (container !== this.textInput && (container as HTMLElement).tagName !== 'P' && (container as HTMLElement).tagName !== 'DIV') {
				// Find the paragraph or create one
				let p = this.textInput.querySelector('p');
				if (!p) {
					p = this.textInput.ownerDocument.createElement('p');
					this.textInput.appendChild(p);
				}
				range.setStart(p, 0);
				range.collapse(true);
			}
		}

		// Create space before pill
		const spaceBefore = this.textInput.ownerDocument.createTextNode(' ');
		range.insertNode(spaceBefore);
		range.setStartAfter(spaceBefore);

		// Create mention element - match reference structure exactly
		const mention = this.textInput.ownerDocument.createElement('span');
		mention.className = 'mention';
		if (type === 'file') {
			mention.className += ' mention-clickable';
		}
		mention.setAttribute('contenteditable', 'false');
		mention.setAttribute('data-mention-name', name);
		mention.setAttribute('data-mention-key', Date.now().toString());
		mention.setAttribute('data-typeahead-type', type);
		mention.setAttribute('data-lexical-text', 'true');
		// Match reference: background color and cursor only, no other inline styles
		mention.style.backgroundColor = 'color-mix(in srgb, #3ecf8e 20%, transparent)';
		mention.style.cursor = type === 'file' ? 'pointer' : 'default';

		// Prevent the pill from being edited or broken apart
		this._register(addDisposableListener(mention, 'mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Place cursor after the pill
			if (this.textInput) {
				const targetWindow = this.textInput.ownerDocument.defaultView;
				if (targetWindow) {
					const range = this.textInput.ownerDocument.createRange();
					range.setStartAfter(mention);
					range.collapse(true);
					const sel = targetWindow.getSelection();
					if (sel) {
						sel.removeAllRanges();
						sel.addRange(range);
					}
				}
			}
		}));

		// Create wrapper - match reference structure (no inline styles)
		const wrapper = append(mention, $('span'));
		wrapper.className = type === 'file' ? 'show-file-icons' : 'mention-codicon-wrapper';
		wrapper.setAttribute('contenteditable', 'false');

		if (type === 'file' && path) {
			// File with icon - match reference structure exactly
			const fileWrapper = append(wrapper, $('span'));
			fileWrapper.className = 'mention-file-wrapper';
			fileWrapper.setAttribute('contenteditable', 'false');

			// Icon container
			const iconContainer = append(fileWrapper, $('span'));
			iconContainer.className = 'mention-file-icon-container';
			iconContainer.setAttribute('contenteditable', 'false');

			// File icon - match reference structure exactly
			const iconDiv = append(iconContainer, $('span'));
			// Build class list matching reference: monaco-icon-label + mention-file-icon + theme + height-override + file-icon + all icon classes
			let iconClassList = 'monaco-icon-label mention-file-icon mention-file-icon-theme height-override-important file-icon';
			if (iconClasses && iconClasses.length > 0) {
				// Add all icon classes from getIconClasses (e.g., browser-name-dir-icon, layout.ts-name-file-icon, ts-ext-file-icon, etc.)
				iconClassList += ' ' + iconClasses.join(' ');
			}
			iconDiv.className = iconClassList;
			iconDiv.setAttribute('contenteditable', 'false');

			// Text span - simple, no inline styles
			const nameSpan = append(fileWrapper, $('span'));
			nameSpan.textContent = name;
			nameSpan.setAttribute('contenteditable', 'false');

			// Close icon - sibling of text (matches reference structure)
			const closeIcon = append(fileWrapper, $('i'));
			closeIcon.className = 'codicon codicon-close';
			closeIcon.setAttribute('data-mention-remove', 'true');
			closeIcon.setAttribute('contenteditable', 'false');
		} else {
			// Terminal or Doc with codicon
			const iconContainer = append(wrapper, $('span'));
			iconContainer.className = 'mention-codicon-icon-container';
			iconContainer.setAttribute('contenteditable', 'false');

			const icon = append(iconContainer, $('i'));
			icon.className = `codicon ${type === 'terminal' ? 'codicon-terminal' : 'codicon-book'}`;
			icon.setAttribute('contenteditable', 'false');

			const nameSpan = append(wrapper, $('span'));
			nameSpan.textContent = name;
			nameSpan.setAttribute('contenteditable', 'false');

			// Close icon - sibling (matches reference structure)
			const closeIcon = append(wrapper, $('i'));
			closeIcon.className = 'codicon codicon-close';
			closeIcon.setAttribute('data-mention-remove', 'true');
			closeIcon.setAttribute('contenteditable', 'false');
		}

		// Insert mention
		range.insertNode(mention);
		range.setStartAfter(mention);

		// Create space after pill
		const spaceAfter = this.textInput.ownerDocument.createTextNode(' ');
		range.insertNode(spaceAfter);
		range.setStartAfter(spaceAfter);
		range.collapse(true);

		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}

		// Normalize structure after insertion to prevent block breaks
		this.normalizeContentEditable();

		// Add hover effect to show close icon
		this.setupHover(mention);

		// Add click handler to remove
		const closeIcon = mention.querySelector('[data-mention-remove="true"]') as HTMLElement;
		if (closeIcon) {
			this._register(addDisposableListener(closeIcon, 'click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.removePill(mention);
			}));
		}

		// Prevent any text editing inside the pill
		this._register(addDisposableListener(mention, 'keydown', (e) => {
			// Handle arrow keys and backspace to move cursor around pill
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				e.stopPropagation();

				const targetWindow = this.textInput.ownerDocument.defaultView;
				if (!targetWindow) {
					return;
				}

				const selection = targetWindow.getSelection();
				if (!selection) {
					return;
				}

				const range = this.textInput.ownerDocument.createRange();
				if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
					// Move cursor before the pill
					range.setStartBefore(mention);
					range.collapse(true);
				} else {
					// Move cursor after the pill
					range.setStartAfter(mention);
					range.collapse(true);
				}
				selection.removeAllRanges();
				selection.addRange(range);
			} else {
				e.preventDefault();
				e.stopPropagation();
			}
		}));

		this._register(addDisposableListener(mention, 'input', (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));

		// Prevent focus on the pill
		this._register(addDisposableListener(mention, 'focus', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Move cursor after the pill
			if (this.textInput) {
				const targetWindow = this.textInput.ownerDocument.defaultView;
				if (targetWindow) {
					const range = this.textInput.ownerDocument.createRange();
					range.setStartAfter(mention);
					range.collapse(true);
					const sel = targetWindow.getSelection();
					if (sel) {
						sel.removeAllRanges();
						sel.addRange(range);
					}
				}
			}
		}));

		// Update placeholder visibility
		this.updatePlaceholderVisibility();

		// Focus the input
		this.textInput.focus();
	}

	private setupHover(mention: HTMLElement): void {
		// CSS handles the hover effect - no JavaScript needed
		// This method is kept for potential future enhancements
	}

	private removePill(mention: HTMLElement): void {
		if (!this.textInput) {
			return;
		}

		// Remove spaces around the pill
		const prevSibling = mention.previousSibling;
		const nextSibling = mention.nextSibling;

		// Remove the mention
		mention.remove();

		// Remove adjacent spaces if they exist
		if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE && prevSibling.textContent === ' ') {
			prevSibling.remove();
		}
		if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent === ' ') {
			nextSibling.remove();
		}

		// Update placeholder visibility
		this.updatePlaceholderVisibility();

		// Focus the input
		this.textInput.focus();
	}

}


