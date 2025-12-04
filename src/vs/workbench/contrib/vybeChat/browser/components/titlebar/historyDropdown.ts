/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, clearNode, getWindow } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { VYBE_CHAT_NEW_CHAT_LABEL } from '../../../common/vybeChatConstants.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { quickInputForeground, quickInputListFocusBackground, pickerGroupBorder, pickerGroupForeground, widgetBorder } from '../../../../../../platform/theme/common/colorRegistry.js';

export interface ChatHistoryItem {
	id: string;
	title: string;
	timestamp: Date;
	isCurrent: boolean;
}

interface TimeSection {
	label: string;
	items: ChatHistoryItem[];
}

export interface RenameEvent {
	id: string;
	newTitle: string;
}

export class HistoryDropdown extends Disposable {
	private readonly _onChatSelect = this._register(new Emitter<string>());
	readonly onChatSelect = this._onChatSelect.event;

	private readonly _onChatRename = this._register(new Emitter<RenameEvent>());
	readonly onChatRename = this._onChatRename.event;

	private readonly _onChatDelete = this._register(new Emitter<string>());
	readonly onChatDelete = this._onChatDelete.event;

	private dropdownContainer: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private listContainer: HTMLElement | null = null;
	private scrollableElement: DomScrollableElement | null = null;
	private scrollWrapper: HTMLElement | null = null;
	private allItems: ChatHistoryItem[] = [];
	private currentHoveredItem: HTMLElement | null = null;
	private currentlyEditingItem: { itemId: string; titleElement: HTMLElement; editButton: HTMLElement; originalTitle: string; originalColor: string; saveFn: () => void; cancelFn: () => void } | null = null;
	private isPencilClickInProgress = false; // Flag to prevent blur from interfering with pencil click
	private isRenamingInProgress = false; // Flag to prevent dropdown from closing during rename

	// Expose dropdownContainer for external checks
	get isVisible(): boolean {
		return this.dropdownContainer !== null;
	}

	constructor(
		private anchorElement: HTMLElement,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
	}

	/**
	 * Update the anchor element reference (useful when DOM is rebuilt)
	 * If dropdown is already created, re-position it relative to the new anchor
	 */
	updateAnchorElement(newAnchor: HTMLElement): void {
		if (newAnchor && newAnchor.isConnected) {
			const anchorChanged = this.anchorElement !== newAnchor;
			this.anchorElement = newAnchor;

			// If dropdown is already created and anchor changed, re-position it
			if (anchorChanged && this.dropdownContainer) {
				this.repositionDropdown();
			}
		}
	}

	/**
	 * Reposition the dropdown relative to the current anchor element
	 */
	private repositionDropdown(): void {
		if (!this.dropdownContainer || !this.anchorElement || !this.anchorElement.isConnected) {
			return;
		}

		const targetWindow = getWindow(this.anchorElement);
		targetWindow.requestAnimationFrame(() => {
			if (!this.dropdownContainer || !this.anchorElement || !this.anchorElement.isConnected) {
				return;
			}

			const buttonRect = this.anchorElement.getBoundingClientRect();
			const gap = 6;
			const topPosition = buttonRect.bottom + gap;
			this.dropdownContainer.style.top = `${topPosition}px`;

			const leftPosition = buttonRect.right;
			this.dropdownContainer.style.left = `${leftPosition}px`;
			this.dropdownContainer.style.right = 'auto';
			this.dropdownContainer.style.transform = 'translateX(-100%)';

			// Handle edge cases (dropdown going off-screen)
			const minMargin = 8;
			const dropdownWidth = 340;
			const dropdownRightEdge = leftPosition;
			const dropdownLeftEdge = dropdownRightEdge - dropdownWidth;

			if (dropdownLeftEdge < minMargin) {
				// Dropdown would go off-screen, adjust to stay within bounds
				this.dropdownContainer.style.left = `${minMargin}px`;
				this.dropdownContainer.style.transform = 'none'; // Remove transform when using left margin
			}
		});
	}

	show(items: ChatHistoryItem[]): void {
		// Check if disposed before doing anything
		if (this._store.isDisposed) {
			return;
		}

		// Check if anchor element is still in DOM - if not, we can't show
		if (!this.anchorElement || !this.anchorElement.isConnected) {
			return;
		}

		this.allItems = items;
		// Only create dropdown if it doesn't exist, otherwise just update the items
		if (!this.dropdownContainer) {
			this.createDropdown();
		}

		// Only render items if dropdown container exists and we're not disposed
		if (this.dropdownContainer && !this._store.isDisposed) {
			this.renderItems(items);
		}
	}

	hide(): void {
		// Don't hide if we're in the middle of a rename operation
		// BUT allow hide if dropdown is disconnected from DOM (sidebar closed)
		if (this.isRenamingInProgress && this.dropdownContainer && this.dropdownContainer.isConnected) {
			// Only prevent hide if dropdown is still connected to DOM and renaming
			// If disconnected (sidebar closed), allow hide
			return;
		}

		// Check if anchor element is still in DOM
		if (this.anchorElement && !this.anchorElement.isConnected) {
			// Anchor is disconnected - force hide
			if (this.dropdownContainer) {
				if (this.dropdownContainer.parentNode) {
					this.dropdownContainer.parentNode.removeChild(this.dropdownContainer);
				}
				this.dropdownContainer.remove();
				this.dropdownContainer.style.display = 'none';
				this.dropdownContainer = null;
			}
			return;
		}

		if (this.dropdownContainer) {
			// Force remove from DOM and clear all references
			if (this.dropdownContainer.parentNode) {
				this.dropdownContainer.parentNode.removeChild(this.dropdownContainer);
			}
			// Also try remove() as fallback
			this.dropdownContainer.remove();
			// Clear all style properties to ensure it's completely gone
			this.dropdownContainer.style.display = 'none';
			this.dropdownContainer.style.visibility = 'hidden';
			this.dropdownContainer = null;
			this.scrollableElement = null;
			this.scrollWrapper = null;
		}
		// Note: We don't dispose here because the caller should dispose the dropdown
		// after all event listeners are done. This allows the dropdown to be reused
		// if needed (e.g., after rename to refresh the list).
	}

	private createDropdown(): void {
		// If dropdown already exists, don't recreate it (just update items)
		// This prevents repositioning issues when refreshing after rename
		if (this.dropdownContainer) {
			return;
		}

		// Get theme colors - use text edit header colors
		const theme = this.themeService.getColorTheme();
		const bgColor = this.isDarkTheme() ? '#212427' : '#eceff2';
		const borderColor = theme.getColor(widgetBorder)?.toString() || (this.isDarkTheme() ? '#383838' : '#d9d9d9');
		const textColor = theme.getColor(quickInputForeground)?.toString() || (this.isDarkTheme() ? '#cccccc' : '#333333');

		// Create dropdown container
		const targetWindow = getWindow(this.anchorElement);
		this.dropdownContainer = append(targetWindow.document.body, $('.history-dropdown'));
		this.dropdownContainer.style.boxSizing = 'border-box';
		this.dropdownContainer.style.padding = '0';
		this.dropdownContainer.style.borderRadius = '6px';
		this.dropdownContainer.style.backgroundColor = bgColor;
		this.dropdownContainer.style.border = 'none';
		this.dropdownContainer.style.alignItems = 'stretch';
		this.dropdownContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		this.dropdownContainer.style.fontSize = '12px';
		this.dropdownContainer.style.color = textColor;
		this.dropdownContainer.style.display = 'flex';
		this.dropdownContainer.style.flexDirection = 'column';
		this.dropdownContainer.style.gap = '0';
		this.dropdownContainer.style.position = 'fixed';
		this.dropdownContainer.style.visibility = 'visible';
		this.dropdownContainer.style.width = '340px';
		const isDarkTheme = this.isDarkTheme();
		this.dropdownContainer.style.boxShadow = isDarkTheme
			? 'rgba(0, 0, 0, 0.5) 0px 16px 23px 0px'
			: 'rgba(0, 0, 0, 0.1) 0px 16px 23px 0px';
		this.dropdownContainer.style.zIndex = '2548';
		this.dropdownContainer.style.transformOrigin = 'right top'; // Match Cursor's approach

		// Position dropdown below anchor with minimal gap and align right edges
		// Use repositionDropdown helper method
		this.repositionDropdown();

		// Inner wrapper
		const innerWrapper = append(this.dropdownContainer, $('.inner-wrapper'));
		innerWrapper.style.flex = '1 1 0%';
		innerWrapper.style.overflow = 'hidden';
		innerWrapper.style.display = 'flex';
		innerWrapper.style.height = '100%';
		innerWrapper.style.flexDirection = 'column';

		// Content container
		const contentContainer = append(innerWrapper, $('.content-container'));
		contentContainer.setAttribute('tabindex', '0');
		contentContainer.style.boxSizing = 'border-box';
		contentContainer.style.borderRadius = '6px';
		contentContainer.style.backgroundColor = bgColor;
		contentContainer.style.border = `1px solid ${borderColor}`;
		contentContainer.style.alignItems = 'stretch';
		contentContainer.style.fontSize = '12px';
		contentContainer.style.display = 'flex';
		contentContainer.style.flexDirection = 'column';
		contentContainer.style.gap = '2px';
		contentContainer.style.padding = '0';
		contentContainer.style.outline = 'none';
		contentContainer.style.pointerEvents = 'auto';

		// Search input container
		const searchContainer = append(contentContainer, $('.search-container'));
		searchContainer.style.display = 'flex';
		searchContainer.style.gap = '4px';
		searchContainer.style.alignItems = 'center';
		searchContainer.style.padding = '0 6px';
		searchContainer.style.border = 'none';
		searchContainer.style.boxSizing = 'border-box';
		searchContainer.style.outline = 'none';
		searchContainer.style.margin = '2px';

		// Search input
		this.searchInput = append(searchContainer, $('input.search-input')) as HTMLInputElement;
		this.searchInput.type = 'text';
		this.searchInput.placeholder = 'Search...';
		this.searchInput.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		this.searchInput.style.fontSize = '12px';
		this.searchInput.style.lineHeight = '15px';
		this.searchInput.style.borderRadius = '3px';
		this.searchInput.style.backgroundColor = 'transparent';
		this.searchInput.style.color = textColor;
		this.searchInput.style.padding = '3px 0';
		this.searchInput.style.flex = '1';
		this.searchInput.style.minWidth = '0';
		this.searchInput.style.border = 'none';
		this.searchInput.style.outline = 'none';
		this.searchInput.style.boxSizing = 'border-box';

		// Search input handler
		this._register(addDisposableListener(this.searchInput, 'input', () => {
			this.filterItems();
		}));

		// Wrapper for responsive height
		this.scrollWrapper = append(contentContainer, $('.scroll-wrapper'));
		this.scrollWrapper.style.maxHeight = '320px';
		this.scrollWrapper.style.width = '100%';

		// List container (no overflow - DomScrollableElement handles it)
		this.listContainer = $('.list-container');
		this.listContainer.style.display = 'flex';
		this.listContainer.style.flexDirection = 'column';
		this.listContainer.style.gap = '2px';
		this.listContainer.style.padding = '2px';
		this.listContainer.style.width = '100%';
		this.listContainer.style.boxSizing = 'border-box';

		// Create VS Code ScrollableElement (same as composer)
		this.scrollableElement = this._register(new DomScrollableElement(this.listContainer, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			useShadows: false,
			verticalScrollbarSize: 6,
			horizontalScrollbarSize: 6
		}));

		const scrollableDomNode = this.scrollableElement.getDomNode();
		scrollableDomNode.style.maxHeight = '320px';
		scrollableDomNode.style.width = '100%';
		this.scrollWrapper.appendChild(scrollableDomNode);

		// Click outside to close - but NOT when editing or renaming
		this._register(addDisposableListener(targetWindow.document, 'mousedown', (e) => {
			// Don't close if we're currently editing an item or renaming
			if (this.currentlyEditingItem || this.isRenamingInProgress) {
				return;
			}

			if (this.dropdownContainer && !this.dropdownContainer.contains(e.target as Node) && !this.anchorElement.contains(e.target as Node)) {
				this.hide();
				// Fire a custom event to notify that dropdown was hidden by click outside
				// This allows the caller to dispose event listeners
				// Note: We don't dispose the emitters here, just hide the UI
			}
		}));
	}

	private renderItems(items: ChatHistoryItem[], searchQuery: string = ''): void {
		if (!this.listContainer) {
			return;
		}

		// Check if disposed before rendering - prevents errors when container is re-registered
		if (this._store.isDisposed) {
			return;
		}

		clearNode(this.listContainer);

		// Group items by time sections
		const sections = this.groupByTime(items);

		// Get theme colors
		const theme = this.themeService.getColorTheme();
		// For section headers, use grey text instead of pickerGroup.foreground (which defaults to blue in dark themes)
		// VYBE Dark doesn't define pickerGroup.foreground, so we use grey to match VYBE design
		const isDarkTheme = this.isDarkTheme();
		const sectionTextColor = isDarkTheme
			? '#999999' // Grey for VYBE Dark section headers (matches the subtle grey design)
			: (theme.getColor(pickerGroupForeground)?.toString() || '#8B949E'); // Use theme color for light (VYBE Light defines it as #8B949E)
		const sectionBorderColor = theme.getColor(pickerGroupBorder)?.toString() || (isDarkTheme ? '#262626' : 'rgba(20, 20, 20, 0.07)');

		// Render each section
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];

			// Section wrapper
			const sectionWrapper = append(this.listContainer, $('.section-wrapper'));
			sectionWrapper.style.display = 'flex';
			sectionWrapper.style.flexDirection = 'column';
			sectionWrapper.style.gap = '2px';

			// Section header
			const sectionHeader = append(sectionWrapper, $('.section-header'));
			sectionHeader.textContent = section.label;
			sectionHeader.style.color = sectionTextColor;
			sectionHeader.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
			sectionHeader.style.fontSize = '11px';
			sectionHeader.style.opacity = '0.4';
			sectionHeader.style.padding = '0 6px';
			sectionHeader.style.lineHeight = '15px';

			// Section items
			const sectionItems = append(sectionWrapper, $('.section-items'));
			sectionItems.style.display = 'flex';
			sectionItems.style.flexDirection = 'column';
			sectionItems.style.gap = '2px';

			for (const item of section.items) {
				// Pass section label to know if it's "Today" and search query for highlighting
				this.renderItem(sectionItems, item, section.label === 'Today', searchQuery);
			}

			// Divider (except after last section)
			if (i < sections.length - 1) {
				const divider = append(this.listContainer, $('.composer-unified-context-menu-divider'));
				divider.style.height = '1px';
				divider.style.width = '100%';
				divider.style.backgroundColor = sectionBorderColor;
				divider.style.opacity = '0.8';
				divider.style.position = 'relative';
				divider.style.display = 'block';
			}
		}

		// Update scrollable element and adjust height dynamically
		this.updateScrollableHeight();
	}

	private renderItem(container: HTMLElement, item: ChatHistoryItem, isToday: boolean = false, searchQuery: string = ''): void {
		// Get theme colors
		const theme = this.themeService.getColorTheme();
		const textPrimary = theme.getColor(quickInputForeground)?.toString() || (this.isDarkTheme() ? '#cccccc' : '#333333');
		const hoverBg = theme.getColor(quickInputListFocusBackground)?.toString() || (this.isDarkTheme() ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)');
		// For secondary/tertiary colors, use opacity variations of primary
		const textSecondary = this.isDarkTheme() ? 'rgba(204, 204, 204, 0.6)' : 'rgba(51, 51, 51, 0.6)';
		const textTertiary = this.isDarkTheme() ? 'rgba(204, 204, 204, 0.4)' : 'rgba(51, 51, 51, 0.4)';

		// Item container
		const itemContainer = append(container, $('.history-item'));
		itemContainer.style.borderRadius = '4px';
		itemContainer.style.display = 'flex';
		itemContainer.style.flexDirection = 'column';
		itemContainer.style.padding = '0 6px 2px 6px';
		itemContainer.style.minWidth = '0';
		itemContainer.style.cursor = 'pointer';
		itemContainer.style.color = textPrimary;
		itemContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

		// Current chat gets background immediately when dropdown opens
		if (item.isCurrent) {
			itemContainer.style.backgroundColor = hoverBg;
			this.currentHoveredItem = itemContainer; // Track it
		} else {
			itemContainer.style.backgroundColor = 'transparent';
		}

		// Item content
		const itemContent = append(itemContainer, $('.item-content'));
		itemContent.style.display = 'flex';
		itemContent.style.justifyContent = 'space-between';
		itemContent.style.alignItems = 'center';
		itemContent.style.minWidth = '0';
		itemContent.style.width = '100%';
		itemContent.style.height = '16px';
		itemContent.style.gap = '6px';

		// Left side (icon + title + timestamp)
		const leftSide = append(itemContent, $('.left-side'));
		leftSide.style.display = 'flex';
		leftSide.style.alignItems = 'center';
		leftSide.style.gap = '6px';
		leftSide.style.minWidth = '0';
		leftSide.style.height = '16px';
		leftSide.style.width = '100%';

		// Chat icon
		const iconWrapper = append(leftSide, $('.icon-wrapper'));
		iconWrapper.style.flexShrink = '0';
		iconWrapper.style.display = 'flex';
		iconWrapper.style.alignItems = 'center';
		iconWrapper.style.justifyContent = 'center';
		iconWrapper.style.width = '14px';
		iconWrapper.style.height = '14px';

		const icon = append(iconWrapper, $('.codicon.codicon-comment'));
		icon.style.fontSize = '14px';
		icon.style.color = textSecondary;

		// Title and timestamp wrapper
		const titleWrapper = append(leftSide, $('.title-wrapper'));
		titleWrapper.style.display = 'flex';
		titleWrapper.style.width = '100%';
		titleWrapper.style.alignItems = 'center';
		titleWrapper.style.minWidth = '0';
		titleWrapper.style.gap = '6px';
		titleWrapper.style.height = '17px';

		// Title with search highlighting
		const title = append(titleWrapper, $('.title'));
		title.style.color = item.title === 'New Chat' ? textTertiary : textPrimary;
		title.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		title.style.fontSize = '12px';
		title.style.lineHeight = '17px';
		title.style.whiteSpace = 'nowrap';
		title.style.textOverflow = 'ellipsis';
		title.style.overflow = 'hidden';
		title.style.display = 'block';
		title.style.width = '100%';
		title.style.flex = '1';
		title.style.minWidth = '0';

		// Highlight search query in VYBE green (only text color, not background)
		if (searchQuery && item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
			const vybeGreen = '#3ecf8e'; // VYBE green color
			const lowerTitle = item.title.toLowerCase();
			const lowerQuery = searchQuery.toLowerCase();
			const startIndex = lowerTitle.indexOf(lowerQuery);

			if (startIndex !== -1) {
				const before = item.title.substring(0, startIndex);
				const match = item.title.substring(startIndex, startIndex + searchQuery.length);
				const after = item.title.substring(startIndex + searchQuery.length);

				// Create text nodes with highlighted portion
				if (before) {
					const beforeSpan = append(title, $('span'));
					beforeSpan.textContent = before;
				}

				const matchSpan = append(title, $('span'));
				matchSpan.textContent = match;
				matchSpan.style.color = vybeGreen; // Highlight with VYBE green text color

				if (after) {
					const afterSpan = append(title, $('span'));
					afterSpan.textContent = after;
				}
			} else {
				title.textContent = item.title;
			}
		} else {
			title.textContent = item.title;
		}

		// Timestamp or "Current" badge - only for Today section
		if (isToday) {
			const timestamp = append(titleWrapper, $('.timestamp'));
			timestamp.style.direction = 'rtl';
			timestamp.style.textOverflow = 'ellipsis';
			timestamp.style.overflow = 'hidden';
			timestamp.style.whiteSpace = 'nowrap';
			timestamp.style.color = textSecondary;
			timestamp.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
			timestamp.style.flexShrink = item.isCurrent ? '0' : '1';
			timestamp.style.opacity = item.isCurrent ? '0.6' : '0.4';
			timestamp.style.fontSize = '11px';
			timestamp.style.lineHeight = '16px';

			if (item.isCurrent) {
				timestamp.textContent = 'Current';
			} else {
				timestamp.textContent = this.formatTimestamp(item.timestamp);
			}
		}

		// Right side (edit/delete buttons - only show on hover)
		const rightSide = append(itemContent, $('.right-side'));
		rightSide.style.display = 'none'; // Hidden by default
		rightSide.style.alignItems = 'center';
		rightSide.style.gap = '6px';
		rightSide.style.height = '17px';
		rightSide.style.flexShrink = '0';

		const buttonWrapper = append(rightSide, $('.button-wrapper'));
		buttonWrapper.style.display = 'flex';
		buttonWrapper.style.gap = '4px';
		buttonWrapper.style.flexShrink = '0';

		// Edit button - starts as pencil, transforms to check when editing
		const editButton = append(buttonWrapper, $('.codicon.codicon-edit'));
		editButton.className = 'codicon codicon-edit'; // Start as pencil
		editButton.style.fontSize = '12px';
		editButton.style.color = textPrimary;
		editButton.style.padding = '2px';
		editButton.style.cursor = 'pointer';
		editButton.style.display = 'flex';
		editButton.style.alignItems = 'center';
		editButton.style.justifyContent = 'center';

		// Store reference to title element for checking edit state
		const titleElementRef = title;

		// Set flag on mousedown (fires before blur) to prevent blur from interfering
		if (!this._store.isDisposed) {
			this._register(addDisposableListener(editButton, 'mousedown', (e) => {
				e.stopPropagation();
				e.preventDefault();

				// Set flag immediately to prevent blur from firing
				this.isPencilClickInProgress = true;
			}));
		}

		if (!this._store.isDisposed) {
			this._register(addDisposableListener(editButton, 'click', (e) => {
				e.stopPropagation();
				e.preventDefault();

				// Check if already in edit state by checking if button is check icon
				const isEditing = editButton.classList.contains('codicon-check') ||
					titleElementRef.contentEditable === 'true' ||
					(this.currentlyEditingItem && this.currentlyEditingItem.itemId === item.id);

				if (isEditing) {
					// Already editing - SAVE the changes
					if (this.currentlyEditingItem && this.currentlyEditingItem.itemId === item.id) {
						if (this.currentlyEditingItem.saveFn) {
							this.currentlyEditingItem.saveFn();
						} else {
							titleElementRef.blur();
						}
					} else {
						titleElementRef.blur();
					}
				} else {
					// Not editing - enter edit state
					this.startRename(item, titleElementRef, editButton);
				}

				// Clear flag after a short delay
				setTimeout(() => {
					this.isPencilClickInProgress = false;
				}, 150);
			}));
		}

		// Delete button
		const deleteButton = append(buttonWrapper, $('.codicon.codicon-trash'));
		deleteButton.style.fontSize = '12px';
		deleteButton.style.color = textPrimary;
		deleteButton.style.padding = '2px';
		deleteButton.style.cursor = 'pointer';
		deleteButton.style.display = 'flex';
		deleteButton.style.alignItems = 'center';
		deleteButton.style.justifyContent = 'center';

		if (!this._store.isDisposed) {
			this._register(addDisposableListener(deleteButton, 'click', (e) => {
				e.stopPropagation();
				this.confirmDelete(item);
			}));
		}

		// Item click handler - prevent firing when in edit mode
		if (!this._store.isDisposed) {
			this._register(addDisposableListener(itemContainer, 'click', (e) => {
				// Don't trigger chat select if we're currently editing ANY item
				const editingItem = this.currentlyEditingItem;
				if (editingItem) {
					e.stopPropagation();
					e.preventDefault();
					return;
				}

				// Don't trigger chat select if clicking on the title element (which might be contentEditable)
				const target = e.target as HTMLElement;
				const isClickOnEditableTitle = target === title || target.closest('.title') === title;

				// If clicking on the editable title, don't select the chat
				if (isClickOnEditableTitle && title.contentEditable === 'true') {
					e.stopPropagation();
					e.preventDefault();
					return;
				}

				// Also don't select if clicking on edit/delete buttons
				if (target.closest('.button-wrapper') || target.closest('.right-side')) {
					e.stopPropagation();
					e.preventDefault();
					return;
				}

				if (!item.isCurrent) {
					this._onChatSelect.fire(item.id);
				}
			}));
		}

		// Hover effect - move background and show edit/delete buttons
		if (!this._store.isDisposed) {
			this._register(addDisposableListener(itemContainer, 'mouseenter', () => {
				// Remove background from previously hovered item
				if (this.currentHoveredItem && this.currentHoveredItem !== itemContainer) {
					this.currentHoveredItem.style.backgroundColor = 'transparent';
					// Hide buttons on previous item
					const prevRightSide = this.currentHoveredItem.querySelector('.right-side') as HTMLElement;
					if (prevRightSide) {
						prevRightSide.style.display = 'none';
					}
				}

				// Add background to current item
				itemContainer.style.backgroundColor = hoverBg;
				rightSide.style.display = 'flex'; // Show edit/delete buttons on hover

				// Track this as the current hovered item
				this.currentHoveredItem = itemContainer;
			}));
		}

		// Note: No mouseleave handler - background stays on last hovered item
	}

	private groupByTime(items: ChatHistoryItem[]): TimeSection[] {
		const now = new Date();
		const sections = new Map<string, ChatHistoryItem[]>();

		for (const item of items) {
			const diffMs = now.getTime() - item.timestamp.getTime();
			const diffHours = diffMs / (1000 * 60 * 60);
			const diffDays = diffMs / (1000 * 60 * 60 * 24);
			const diffWeeks = diffDays / 7;
			const diffMonths = diffDays / 30; // Approximate
			const diffYears = diffDays / 365; // Approximate

			let label: string;

			if (diffHours < 24) {
				label = 'Today';
			} else if (diffHours < 48) {
				label = 'Yesterday';
			} else if (diffDays < 3) {
				label = '2d ago';
			} else if (diffDays < 4) {
				label = '3d ago';
			} else if (diffDays < 5) {
				label = '4d ago';
			} else if (diffDays < 6) {
				label = '5d ago';
			} else if (diffDays < 7) {
				label = '6d ago';
			} else if (diffWeeks < 2) {
				label = '1w ago';
			} else if (diffWeeks < 3) {
				label = '2w ago';
			} else if (diffWeeks < 4) {
				label = '3w ago';
			} else if (diffMonths < 2) {
				label = '1mo ago';
			} else if (diffMonths < 3) {
				label = '2mo ago';
			} else if (diffMonths < 4) {
				label = '3mo ago';
			} else if (diffMonths < 5) {
				label = '4mo ago';
			} else if (diffMonths < 6) {
				label = '5mo ago';
			} else if (diffMonths < 7) {
				label = '6mo ago';
			} else if (diffMonths < 8) {
				label = '7mo ago';
			} else if (diffMonths < 9) {
				label = '8mo ago';
			} else if (diffMonths < 10) {
				label = '9mo ago';
			} else if (diffMonths < 11) {
				label = '10mo ago';
			} else if (diffMonths < 12) {
				label = '11mo ago';
			} else if (diffYears < 2) {
				label = '1yr ago';
			} else if (diffYears < 3) {
				label = '2yr ago';
			} else if (diffYears < 4) {
				label = '3yr ago';
			} else if (diffYears < 5) {
				label = '4yr ago';
			} else if (diffYears < 6) {
				label = '5yr ago';
			} else {
				const years = Math.floor(diffYears);
				label = `${years}yr ago`;
			}

			if (!sections.has(label)) {
				sections.set(label, []);
			}
			sections.get(label)!.push(item);
		}

		// Convert map to array of sections in chronological order
		const result: TimeSection[] = [];
		for (const [label, items] of sections) {
			result.push({ label, items });
		}

		return result;
	}

	private formatTimestamp(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

		// Only show time for today's chats
		// Format: 1m, 59m (up to 59 minutes), then 1h, 23h (up to 23 hours)
		if (diffMins < 60) {
			return `${diffMins}m`;
		} else if (diffHours < 24) {
			return `${diffHours}h`;
		} else {
			// After 23h, it goes to "Yesterday" section, no timestamp needed
			return '';
		}
	}

	private filterItems(): void {
		if (!this.searchInput || !this.listContainer) {
			return;
		}

		const query = this.searchInput.value.toLowerCase().trim();
		if (query === '') {
			this.renderItems(this.allItems);
		} else {
			const filtered = this.allItems.filter(item =>
				item.title.toLowerCase().includes(query)
			);

			if (filtered.length === 0) {
				// Show empty state
				this.renderEmptyState(query);
			} else {
				this.renderItems(filtered, query); // Pass query for highlighting
			}
		}
	}

	private renderEmptyState(searchQuery: string): void {
		if (!this.listContainer) {
			return;
		}

		clearNode(this.listContainer);

		const isDarkTheme = this.isDarkTheme();
		const textColor = isDarkTheme ? '#cccccc' : '#333333';

		const emptyState = append(this.listContainer, $('.empty-state'));
		emptyState.style.display = 'flex';
		emptyState.style.flexDirection = 'column';
		emptyState.style.alignItems = 'center';
		emptyState.style.justifyContent = 'center';
		emptyState.style.padding = '40px 20px';
		emptyState.style.color = textColor;
		emptyState.style.opacity = '0.6';
		emptyState.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		emptyState.style.fontSize = '12px';
		emptyState.style.textAlign = 'center';

		const message = append(emptyState, $('.empty-message'));
		message.textContent = `No Chats found matching: ${searchQuery}`;

		// Update scrollable element
		this.updateScrollableHeight();
	}

	private updateScrollableHeight(): void {
		if (!this.scrollableElement || !this.listContainer || !this.scrollWrapper) {
			return;
		}

		// Use setTimeout to let DOM settle and get accurate measurements
		setTimeout(() => {
			if (!this.scrollableElement || !this.listContainer || !this.scrollWrapper) {
				return;
			}

			// Remove height constraints temporarily to measure content
			this.listContainer.style.height = 'auto';
			this.listContainer.style.maxHeight = 'none';

			// Force a reflow to get accurate measurements
			void this.listContainer.offsetHeight;

			// Get the actual content height
			const contentHeight = this.listContainer.scrollHeight;
			const maxHeight = 320;
			const actualHeight = Math.min(contentHeight, maxHeight);

			// Set the listContainer height
			this.listContainer.style.height = `${actualHeight}px`;
			this.listContainer.style.maxHeight = `${actualHeight}px`;

			// Update the scrollable element's height
			const scrollableDomNode = this.scrollableElement.getDomNode();
			scrollableDomNode.style.height = `${actualHeight}px`;
			scrollableDomNode.style.maxHeight = `${actualHeight}px`;
			this.scrollWrapper.style.height = `${actualHeight}px`;

			// Scan to update scrollbar
			this.scrollableElement.scanDomNode();
		}, 0);
	}

	private startRename(item: ChatHistoryItem, titleElement: HTMLElement, editButton: HTMLElement): void {
		// If another item is being edited, cancel it first
		if (this.currentlyEditingItem && this.currentlyEditingItem.titleElement !== titleElement) {
			this.currentlyEditingItem.cancelFn();
		}

		// Store original title
		const originalTitle = item.title;

		// Store original edit button color
		const originalEditButtonColor = editButton.style.color;

		// Make title editable with NO visual change
		titleElement.contentEditable = 'true';
		titleElement.style.outline = 'none'; // Remove default focus outline
		titleElement.style.cursor = 'text';

		// If "New Chat", clear it
		if (item.title === 'New Chat') {
			titleElement.textContent = '';
		}

		// Focus and select all text
		titleElement.focus();
		const targetWindow = getWindow(titleElement);
		const range = targetWindow.document.createRange();
		range.selectNodeContents(titleElement);
		const selection = targetWindow.getSelection();
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}

		// Transform pencil icon to check icon in edit state (VYBE green)
		editButton.className = 'codicon codicon-check';
		editButton.style.color = '#3ecf8e'; // VYBE green

		// Store reference to this editing session
		this.currentlyEditingItem = {
			itemId: item.id,
			titleElement,
			editButton,
			originalTitle,
			originalColor: originalEditButtonColor,
			cancelFn: () => { }, // Will be set below
			saveFn: () => { } // Will be set below
		};

		// Cleanup function to remove all listeners
		let isEditing = true;

		const cleanup = () => {
			if (!isEditing) {
				return;
			}
			isEditing = false;

			titleElement.removeEventListener('keydown', keydownHandler);
			titleElement.removeEventListener('blur', blurHandler);
			titleElement.removeEventListener('click', titleClickHandler);
		};

		// Save function
		const save = () => {
			if (!isEditing) {
				return;
			}

			// IMPORTANT: Read text BEFORE cleaning up or changing contentEditable
			// This ensures we capture what the user actually typed
			// Try multiple methods to reliably extract text from contentEditable
			let text = '';

			// Method 1: innerText (most reliable for contentEditable - shows what user sees)
			text = titleElement.innerText || '';

			// Method 2: textContent (fallback)
			if (!text || text.trim() === '') {
				text = titleElement.textContent || '';
			}

			// Method 3: Read from all text nodes directly
			if (!text || text.trim() === '') {
				const textNodes: string[] = [];
				const walker = getWindow(titleElement).document.createTreeWalker(
					titleElement,
					NodeFilter.SHOW_TEXT,
					null
				);
				let node;
				while (node = walker.nextNode()) {
					if (node.textContent) {
						textNodes.push(node.textContent);
					}
				}
				text = textNodes.join('');
			}

			// Method 4: Use Range to get all text content
			if (!text || text.trim() === '') {
				const targetWindow = getWindow(titleElement);
				const range = targetWindow.document.createRange();
				range.selectNodeContents(titleElement);
				text = range.toString() || '';
			}

			let newTitle = text.trim();

			// Special handling for "New Chat" placeholder:
			// If original was "New Chat" and user typed something, always use the new text
			// Don't revert to "New Chat" if they typed something
			const wasNewChat = originalTitle === 'New Chat' || originalTitle === VYBE_CHAT_NEW_CHAT_LABEL;

			// If empty or just whitespace, keep the original title (don't allow empty names)
			// BUT: if it was "New Chat" and user typed something, we should have captured it above
			// If we still have empty, it means extraction failed - try one more time
			if ((!newTitle || newTitle === '') && !wasNewChat) {
				newTitle = originalTitle;
			} else if ((!newTitle || newTitle === '') && wasNewChat) {
				// This shouldn't happen if user typed, but if it does, keep "New Chat"
				newTitle = originalTitle;
			}

			// Cleanup listeners first
			cleanup();

			// Restore non-editable state (ALWAYS do this, even if no changes)
			titleElement.contentEditable = 'false';
			titleElement.style.cursor = 'pointer';

			// Transform check icon back to pencil icon
			editButton.className = 'codicon codicon-edit';
			editButton.style.color = originalEditButtonColor;

			// Clear currently editing reference
			if (this.currentlyEditingItem && this.currentlyEditingItem.titleElement === titleElement) {
				this.currentlyEditingItem = null;
			}

			// Fire the rename event if title changed OR if it was "New Chat" and we have a new title
			// This ensures we always save when renaming from "New Chat"
			const shouldRename = (newTitle !== originalTitle && newTitle.trim() !== '') ||
				(wasNewChat && newTitle.trim() !== '' && newTitle !== originalTitle);

			if (shouldRename) {
				// Set flag to prevent dropdown from closing during rename
				this.isRenamingInProgress = true;

				this._onChatRename.fire({ id: item.id, newTitle });
				item.title = newTitle;
				// Update displayed text to new title
				titleElement.textContent = newTitle;

				// Clear the flag after rename completes (the rename handler will update dropdown items)
				// Use a longer delay to ensure the rename handler has time to update the dropdown
				setTimeout(() => {
					this.isRenamingInProgress = false;
				}, 300);
			} else {
				// If no change, just restore the original title
				titleElement.textContent = originalTitle;
			}
		};

		// Cancel function
		const cancel = () => {
			if (!isEditing) {
				return;
			}

			// Cleanup listeners first
			cleanup();

			titleElement.contentEditable = 'false';
			titleElement.style.cursor = 'pointer';
			titleElement.textContent = originalTitle;

			// Transform check icon back to pencil icon
			editButton.className = 'codicon codicon-edit';
			editButton.style.color = originalEditButtonColor;

			// Clear currently editing reference
			if (this.currentlyEditingItem && this.currentlyEditingItem.titleElement === titleElement) {
				this.currentlyEditingItem = null;
			}
		};

		// Update the save and cancel function references in currentlyEditingItem
		if (this.currentlyEditingItem && this.currentlyEditingItem.itemId === item.id) {
			this.currentlyEditingItem.saveFn = save;
			this.currentlyEditingItem.cancelFn = cancel;
		}

		// Handle Enter to save
		const keydownHandler = (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				save();
				// Keep focus on the title element to prevent dropdown from closing
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				cancel();
			}
		};

		titleElement.addEventListener('keydown', keydownHandler);

		// Handle blur to save
		const blurHandler = () => {
			// Don't save if pencil click is in progress (user is canceling)
			// Check synchronously first (before any async operations)
			if (this.isPencilClickInProgress) {
				return;
			}

			// Small delay to ensure text is captured properly and to allow pencil click to register
			setTimeout(() => {
				// Double-check flag after delay
				if (this.isPencilClickInProgress) {
					return;
				}
				if (isEditing) {
					save();
				}
			}, 50);
		};

		titleElement.addEventListener('blur', blurHandler);

		// Prevent item click when clicking title during edit
		const titleClickHandler = (e: MouseEvent) => {
			e.stopPropagation();
		};
		titleElement.addEventListener('click', titleClickHandler);
	}

	private confirmDelete(item: ChatHistoryItem): void {
		const message = item.isCurrent
			? `Delete current chat "${item.title}"? This cannot be undone.`
			: `Delete "${item.title}"? This cannot be undone.`;

		// Use native confirm dialog for now (can be replaced with custom modal later)
		if (confirm(message)) {
			this._onChatDelete.fire(item.id);

			// Remove item from list
			const index = this.allItems.findIndex(i => i.id === item.id);
			if (index !== -1) {
				this.allItems.splice(index, 1);
				// Re-render
				if (this.searchInput && this.searchInput.value.trim()) {
					this.filterItems();
				} else {
					this.renderItems(this.allItems);
				}
			}
		}
	}

	private isDarkTheme(): boolean {
		const targetWindow = getWindow(this.anchorElement);
		const workbench = targetWindow.document.querySelector('.monaco-workbench');
		if (workbench) {
			return workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black');
		}
		return false;
	}
}
