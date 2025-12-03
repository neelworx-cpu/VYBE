/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, getWindow } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';

export interface EditedFile {
	id: string;
	name: string;
	path: string;
	iconClasses: string[];
	additions: number;
	deletions: number;
}

export class FilesEditedToolbar extends Disposable {
	public toolbar: HTMLElement | null = null;
	private isExpanded: boolean = false;
	private files: Map<string, EditedFile> = new Map();
	private fileListContainer: HTMLElement | null = null;
	private scrollableElement: DomScrollableElement | null = null;
	private scrollableWrapper: HTMLElement | null = null; // Wrapper that controls height
	private chevronIcon: HTMLElement | null = null;
	private filesCountText: HTMLElement | null = null;
	private contentContainer: HTMLElement | null = null;
	private toolbarContainer: HTMLElement | null = null;
	private actionButtons: HTMLElement[] = [];
	private actionButtonElements: HTMLElement[] = []; // Store button elements (not wrappers) for theme updates

	constructor(private parent: HTMLElement) {
		super();
		this.toolbar = this.renderToolbar();
		this.setupThemeObserver();
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

	private setupThemeObserver(): void {
		const targetWindow = getWindow(this.parent);

		// Watch for theme changes on multiple elements
		const observer = new MutationObserver(() => {
			this.updateToolbarTheme();
		});

		// Watch document.body
		observer.observe(targetWindow.document.body, {
			attributes: true,
			attributeFilter: ['class']
		});

		// Also watch .monaco-workbench element if it exists
		const workbenchElement = targetWindow.document.querySelector('.monaco-workbench');
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

	private updateToolbarTheme(): void {
		if (!this.toolbarContainer) {
			return;
		}

		const isDarkTheme = this.isDarkTheme();

		// Update toolbar container background and border
		// Match composer: Dark mode: #1e1f21, Light mode: #f8f8f9
		// Match composer border: Dark mode: #383838, Light mode: #d9d9d9
		this.toolbarContainer.style.cssText = `
			background: ${isDarkTheme ? '#1e1f21' : '#f8f8f9'};
			border-top: ${isDarkTheme ? '1px solid #383838' : '1px solid #d9d9d9'};
			border-right: ${isDarkTheme ? '1px solid #383838' : '1px solid #d9d9d9'};
			border-bottom: none;
			border-left: ${isDarkTheme ? '1px solid #383838' : '1px solid #d9d9d9'};
			border-top-left-radius: 8px;
			border-top-right-radius: 8px;
			opacity: 1;
			pointer-events: auto;
			position: relative;
			display: flex;
			flex-direction: column;
			height: auto;
			gap: 0px;
			transition: filter 0.3s ease-out;
			filter: none;
		`;

		// Update button colors
		this.updateButtonColors();
	}

	private updateButtonColors(): void {
		if (this.actionButtonElements.length === 0) {
			return; // Buttons not created yet
		}

		const isDarkTheme = this.isDarkTheme();

		// Text colors: gray by default (lower opacity), white/black on hover
		const defaultTextColor = isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(20, 20, 20, 0.7)';
		const hoverTextColor = isDarkTheme ? 'rgba(228, 228, 228, 1)' : 'rgba(20, 20, 20, 1)';

		// Update all action buttons
		this.actionButtonElements.forEach((button, index) => {
			if (!button) {
				return;
			}

			const isReviewButton = index === 2; // Review is the 3rd button (index 2)
			const isSecondary = button.getAttribute('data-is-secondary') === 'true';

			// Update data attributes for hover handlers to read
			button.setAttribute('data-default-color', defaultTextColor);
			button.setAttribute('data-hover-color', hoverTextColor);
			button.setAttribute('data-is-dark', isDarkTheme.toString());
			button.setAttribute('data-is-secondary', isSecondary.toString());

			// Update current text color
			button.style.color = defaultTextColor;

			// Update Review button background
			if (isReviewButton) {
				button.style.backgroundColor = isDarkTheme ? 'rgba(255, 255, 255, 0.12)' : 'rgba(20, 20, 20, 0.12)';
			} else {
				button.style.backgroundColor = 'transparent';
			}
		});
	}

	private renderToolbar(): HTMLElement {
		const targetWindow = getWindow(this.parent);

		// Outer positioning container - positioned at top of composer
		const outerContainer = $('div');
		outerContainer.style.cssText = `
			position: relative;
			height: 0px;
			z-index: 10;
		`;

		// Absolute positioned wrapper - attached to top of composer
		// bottom: 100% positions it above the composer (which is the next sibling)
		const absoluteWrapper = append(outerContainer, $('div'));
		absoluteWrapper.style.cssText = `
			position: absolute;
			bottom: 100%;
			left: 0px;
			right: 0px;
			padding: 0px 9px;
			visibility: visible;
			pointer-events: auto;
		`;

		// Main toolbar container - match composer's background and border
		this.toolbarContainer = append(absoluteWrapper, $('div'));
		this.toolbarContainer.id = 'composer-toolbar-section';
		this.toolbarContainer.className = 'hide-if-empty';
		this.updateToolbarTheme();

		// Header section
		const headerSection = append(this.toolbarContainer, $('div'));
		headerSection.style.cssText = `
			display: flex;
			align-items: center;
			width: 100%;
			height: 26px;
			justify-content: space-between;
		`;

		// Left side: Chevron + File count
		const leftGroup = append(headerSection, $('div'));
		leftGroup.className = 'group';
		leftGroup.style.cssText = `
			text-wrap: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			flex-grow: 1;
			flex-basis: 0px;
			display: inline-flex;
			align-items: center;
			flex-wrap: nowrap;
			gap: 6px;
			padding: 4px 8px;
			cursor: pointer;
			min-width: 120px;
		`;

		const chevronContainer = append(leftGroup, $('div'));
		chevronContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
		`;

		this.chevronIcon = append(chevronContainer, $('span.codicon.codicon-chevron-right'));
		this.chevronIcon.style.cssText = `
			color: var(--cursor-icon-secondary, var(--vscode-icon-foreground));
			font-size: 14px;
			flex-shrink: 0;
			transform: rotate(0deg);
			transition: transform 0.2s ease;
		`;

		const countContainer = append(chevronContainer, $('div'));
		countContainer.className = 'opacity-80 group-hover:opacity-100 transition-opacity duration-100';
		countContainer.style.cssText = `
			color: var(--vscode-input-placeholderForeground);
			margin: 0px;
			font-size: 12px;
			flex: 1 0 0px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
		`;

		this.filesCountText = append(countContainer, $('span'));
		this.filesCountText.className = 'cursor-pointer';
		this.filesCountText.textContent = '0 Files';
		this.filesCountText.style.cssText = `
			cursor: pointer;
		`;

		// Right side: Action buttons
		const rightContainer = append(headerSection, $('div'));
		rightContainer.style.cssText = `
			overflow: hidden;
			display: flex;
			justify-content: flex-end;
			align-items: center;
			position: relative;
		`;

		const buttonsContainer = append(rightContainer, $('div'));
		buttonsContainer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			justify-self: flex-end;
			flex-shrink: 0;
			position: relative;
			align-items: center;
			margin: 0px;
			padding: 4px;
			gap: 0px;
		`;

		// Keep All button
		const keepAllButton = this.createActionButton('Keep All', false);
		keepAllButton.style.marginLeft = '0px'; // No left margin for first button
		buttonsContainer.appendChild(keepAllButton);
		this.actionButtons.push(keepAllButton);

		// Undo All button - reduced spacing (0px instead of 4px, so gap is smaller)
		const undoAllButton = this.createActionButton('Undo All', false);
		undoAllButton.style.marginLeft = '0px'; // No margin - buttons will be adjacent
		buttonsContainer.appendChild(undoAllButton);
		this.actionButtons.push(undoAllButton);

		// Review button (secondary style with background) - normal spacing (4px gap from Undo All)
		const reviewButton = this.createActionButton('Review', true);
		reviewButton.style.marginLeft = '4px'; // 4px gap between Undo All and Review
		buttonsContainer.appendChild(reviewButton);
		this.actionButtons.push(reviewButton);

		// Update button colors now that all buttons are created
		this.updateButtonColors();

		// Content section (file list) - hidden by default
		this.contentContainer = append(this.toolbarContainer, $('div'));
		this.contentContainer.style.cssText = `
			padding: 0px 4px 2px 4px;
			contain: paint;
			display: none;
		`;

		// Scrollable file list container - height will be set dynamically
		this.scrollableWrapper = append(this.contentContainer, $('div'));
		this.scrollableWrapper.style.cssText = `
			overflow: hidden;
			min-height: 0px;
			max-height: 220px;
			position: relative;
		`;

		// File list container (this is the actual scrollable element)
		// This container should grow to its natural height (all files)
		// DomScrollableElement will handle the viewport constraint and scrolling
		// Use overflow-y: auto for scrolling, but hide native scrollbar with CSS
		this.fileListContainer = $('div');
		this.fileListContainer.className = 'composer-file-list';
		this.fileListContainer.style.cssText = `
			width: 100%;
			display: flex;
			flex-direction: column;
			padding-bottom: 2px;
			overflow-y: auto;
			overflow-x: hidden;
		`;

		// Hide native scrollbar (Mac OS scrollbar) while keeping scroll functionality
		// Webkit browsers (Chrome, Safari, Edge)
		this.fileListContainer.style.setProperty('scrollbar-width', 'none', 'important'); // Firefox
		this.fileListContainer.style.setProperty('-ms-overflow-style', 'none', 'important'); // IE/Edge
		// For webkit, we need to add a style element or use a class
		// targetWindow is already declared at the top of renderToolbar()
		const style = targetWindow.document.createElement('style');
		style.textContent = `
			.composer-file-list::-webkit-scrollbar {
				display: none;
				width: 0;
				height: 0;
			}
		`;
		targetWindow.document.head.appendChild(style);
		this._register({
			dispose: () => {
				if (targetWindow.document.head.contains(style)) {
					targetWindow.document.head.removeChild(style);
				}
			}
		});

		// Create scrollable element - wrap the fileListContainer
		// DomScrollableElement will handle the scrollbar UI and apply scrollTop to fileListContainer
		this.scrollableElement = this._register(new DomScrollableElement(this.fileListContainer, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			useShadows: false,
			verticalScrollbarSize: 6,
			horizontalScrollbarSize: 6
		}));

		const scrollableDomNode = this.scrollableElement.getDomNode();
		scrollableDomNode.style.cssText = `
			height: 100%;
			width: 100%;
			position: relative;
		`;

		// Append the scrollable element's DOM node (which contains scrollbars) to the wrapper
		this.scrollableWrapper.appendChild(scrollableDomNode);

		// Toggle expand/collapse on header click
		this._register(addDisposableListener(leftGroup, 'click', () => {
			this.toggleExpanded();
		}));

		// Initially hide toolbar (will show when files are added)
		outerContainer.style.display = 'none';

		return outerContainer;
	}

	private createActionButton(label: string, isSecondary: boolean): HTMLElement {
		const isDarkTheme = this.isDarkTheme();

		// Text colors: gray by default (lower opacity), white/black on hover
		const defaultTextColor = isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(20, 20, 20, 0.7)';
		const hoverTextColor = isDarkTheme ? 'rgba(228, 228, 228, 1)' : 'rgba(20, 20, 20, 1)';

		const buttonWrapper = $('div');
		buttonWrapper.style.cssText = `
			flex-shrink: 0;
			height: 100%;
			transition: none;
			opacity: 1;
			pointer-events: auto;
		`;

		const button = $('div');
		button.setAttribute('data-disabled', 'false');
		button.setAttribute('data-click-ready', 'true');
		button.setAttribute('data-is-secondary', isSecondary.toString());
		button.setAttribute('data-default-color', defaultTextColor);
		button.setAttribute('data-hover-color', hoverTextColor);
		button.setAttribute('data-is-dark', isDarkTheme.toString());

		// Base styles for all buttons
		button.style.cssText = `
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			line-height: 16px;
			box-sizing: border-box;
			min-height: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 4px;
			flex-shrink: 0;
			flex-wrap: nowrap;
			white-space: nowrap;
			cursor: pointer;
			user-select: none;
			padding: 0px 6px;
			border-radius: 4px;
			color: ${defaultTextColor};
			transition: background-color 0.1s ease, color 0.1s ease;
			position: relative;
		`;

		// Review button has background color
		if (isSecondary) {
			button.style.backgroundColor = isDarkTheme ? 'rgba(255, 255, 255, 0.12)' : 'rgba(20, 20, 20, 0.12)';
		} else {
			button.style.backgroundColor = 'transparent';
		}

		const span = append(button, $('span'));
		span.style.cssText = `
			display: inline-flex;
			align-items: baseline;
			gap: 2px;
			min-width: 0;
			overflow: hidden;
		`;

		const labelSpan = append(span, $('span'));
		labelSpan.className = 'truncate';
		labelSpan.textContent = label;
		labelSpan.style.cssText = `
			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		`;

		// Hover effects - read from data attributes so they update when theme changes
		this._register(addDisposableListener(button, 'mouseenter', () => {
			const hoverColor = button.getAttribute('data-hover-color') || hoverTextColor;
			const isDark = button.getAttribute('data-is-dark') === 'true';
			const isSec = button.getAttribute('data-is-secondary') === 'true';

			button.style.color = hoverColor;
			if (isSec) {
				// Slightly darker background on hover
				button.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(20, 20, 20, 0.18)';
			}
		}));

		this._register(addDisposableListener(button, 'mouseleave', () => {
			const defaultColor = button.getAttribute('data-default-color') || defaultTextColor;
			const isDark = button.getAttribute('data-is-dark') === 'true';
			const isSec = button.getAttribute('data-is-secondary') === 'true';

			button.style.color = defaultColor;
			if (isSec) {
				button.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(20, 20, 20, 0.12)';
			}
		}));

		buttonWrapper.appendChild(button);

		// Store button element reference for theme updates
		this.actionButtonElements.push(button);

		// Add click handlers
		this._register(addDisposableListener(button, 'click', (e) => {
			e.stopPropagation();
			// TODO: Implement action handlers
		}));

		return buttonWrapper;
	}

	private toggleExpanded(): void {
		this.isExpanded = !this.isExpanded;
		this.updateExpandedState();
	}

	private updateExpandedState(): void {
		if (!this.chevronIcon || !this.contentContainer) {
			return;
		}

		const targetWindow = getWindow(this.parent);

		if (this.isExpanded) {
			// Rotate chevron 90 degrees
			this.chevronIcon.style.transform = 'rotate(90deg)';
			// Show content
			this.contentContainer.style.display = 'block';
			// Update height when expanding
			this.updateScrollableHeight();
			// Update scrollable element after layout
			targetWindow.requestAnimationFrame(() => {
				if (this.scrollableElement) {
					this.scrollableElement.scanDomNode();
				}
			});
		} else {
			// Rotate chevron back
			this.chevronIcon.style.transform = 'rotate(0deg)';
			// Hide content
			this.contentContainer.style.display = 'none';
		}
	}

	public addFile(file: EditedFile): void {
		this.files.set(file.id, file);
		this.updateFiles();
	}

	public removeFile(fileId: string): void {
		this.files.delete(fileId);
		this.updateFiles();
	}

	public clearFiles(): void {
		this.files.clear();
		this.updateFiles();
	}

	private updateFiles(): void {
		if (!this.toolbar || !this.fileListContainer || !this.filesCountText) {
			return;
		}

		const fileCount = this.files.size;

		// Update count text
		this.filesCountText.textContent = `${fileCount} File${fileCount !== 1 ? 's' : ''}`;

		// Show/hide toolbar
		if (fileCount > 0) {
			this.toolbar.style.display = 'block';
		} else {
			this.toolbar.style.display = 'none';
			return;
		}

		// Clear existing file list
		if (this.fileListContainer) {
			while (this.fileListContainer.firstChild) {
				this.fileListContainer.removeChild(this.fileListContainer.firstChild);
			}
		}

		// Render file list items
		this.files.forEach((file) => {
			const fileItem = this.createFileListItem(file);
			if (this.fileListContainer) {
				this.fileListContainer.appendChild(fileItem);
			}
		});

		// Update height based on number of files
		this.updateScrollableHeight();

		// updateScrollableHeight() will handle setting scroll dimensions
		// Just ensure fileListContainer can grow naturally (no fixed height)
		if (this.fileListContainer) {
			this.fileListContainer.style.height = 'auto';
			this.fileListContainer.style.minHeight = 'auto';
			this.fileListContainer.style.maxHeight = 'none';
		}
	}

	private updateScrollableHeight(): void {
		if (!this.scrollableWrapper || !this.isExpanded) {
			return;
		}

		const targetWindow = getWindow(this.parent);
		const fileCount = this.files.size;
		if (fileCount === 0) {
			this.scrollableWrapper.style.height = '0px';
			return;
		}

		// Each file item is 20px height + 2px gap/spacing = 22px total
		const itemHeight = 22;
		// Maximum visible items before scrolling (10 items)
		const maxVisibleItems = 10;
		// Viewport height for 10 files: 10 * 22px = 220px
		// When there are 10 or fewer files, use the actual height needed
		const viewportHeight = fileCount > maxVisibleItems ? maxVisibleItems * itemHeight : fileCount * itemHeight;

		// Set viewport height explicitly - this is the visible area
		// Use exact pixel values to avoid subpixel rounding issues
		this.scrollableWrapper.style.height = `${viewportHeight}px`;
		this.scrollableWrapper.style.maxHeight = `${viewportHeight}px`;
		this.scrollableWrapper.style.minHeight = `${viewportHeight}px`;
		this.scrollableWrapper.style.overflow = 'hidden';

		// Set fileListContainer to have a fixed height (viewport) so it can scroll
		// The content inside will be taller, enabling scrolling
		// Keep overflow-y: auto for scrolling, native scrollbar is hidden via CSS
		if (this.fileListContainer) {
			this.fileListContainer.style.height = `${viewportHeight}px`;
			this.fileListContainer.style.maxHeight = `${viewportHeight}px`;
			this.fileListContainer.style.overflowY = 'auto';
			this.fileListContainer.style.overflowX = 'hidden';
		}

		// Update scrollable element dimensions after height is set
		if (this.scrollableElement && this.fileListContainer) {
			targetWindow.requestAnimationFrame(() => {
				targetWindow.requestAnimationFrame(() => {
					if (this.scrollableElement && this.fileListContainer && this.scrollableWrapper) {
						// Total content height = all files + padding-bottom (2px)
						const totalContentHeight = fileCount * itemHeight + 2;

						// Get actual viewport height from the wrapper
						const actualViewportHeight = this.scrollableWrapper.offsetHeight;

						// Get actual content height from the fileListContainer (after layout)
						// Force a layout recalculation
						void this.fileListContainer.offsetHeight;
						const actualContentHeight = this.fileListContainer.scrollHeight;

						// Ensure scroll dimensions are correct
						// height = viewport (200px for 10+ files, or actual height for fewer)
						// scrollHeight = total content (all files + padding)
						this.scrollableElement.setScrollDimensions({
							width: this.fileListContainer.clientWidth,
							scrollWidth: this.fileListContainer.scrollWidth,
							height: actualViewportHeight,
							scrollHeight: actualContentHeight > 0 ? actualContentHeight : totalContentHeight
						});

						// Don't call scanDomNode() as it will read from DOM and might override our dimensions
						// The scrollbar should now work correctly
					}
				});
			});
		}
	}

	private createFileListItem(file: EditedFile): HTMLElement {
		const item = $('div');
		item.className = 'composer-file-list-item';
		item.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 4px;
			cursor: pointer;
			border-radius: 4px;
			padding: 1px 4px;
			height: 20px;
			min-width: 0px;
		`;

		// Left side: Icon + Name + Stats
		const leftSide = append(item, $('div'));
		leftSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 2px;
			min-width: 0px;
			flex: 1 1 0%;
			overflow-x: hidden;
		`;

		// Icon container
		const iconContainer = append(leftSide, $('span'));
		iconContainer.style.cssText = `
			height: 12px;
			display: flex;
			align-items: center;
		`;

		const iconWrapper = append(iconContainer, $('div'));
		iconWrapper.className = 'show-file-icons';
		iconWrapper.style.cssText = `
			height: 16px;
		`;

		const iconInner = append(iconWrapper, $('div'));
		iconInner.style.cssText = `
			position: relative;
			height: 100%;
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		`;

		const iconElement = append(iconInner, $('div'));
		const iconClasses = ['monaco-icon-label', 'file-icon', 'height-override-important', ...file.iconClasses];
		iconElement.className = iconClasses.join(' ');
		iconElement.style.cssText = `
			height: 100%;
			width: 100%;
			display: flex;
		`;

		// Name + Stats container
		const nameContainer = append(leftSide, $('span'));
		nameContainer.style.cssText = `
			padding: 0px 2px;
			gap: 4px;
			display: flex;
			align-items: center;
			overflow-x: hidden;
			text-overflow: ellipsis;
		`;

		// File name
		const fileName = append(nameContainer, $('span'));
		fileName.textContent = file.name;
		fileName.style.cssText = `
			font-size: 12px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			line-height: 16px;
			color: var(--vscode-input-foreground);
		`;

		// Diff stats
		const statsContainer = append(nameContainer, $('span'));
		statsContainer.className = 'text-[10px] tabular-nums inline-flex gap-0.5';
		statsContainer.style.cssText = `
			line-height: 10px;
			font-size: 10px;
			display: inline-flex;
			gap: 0.5px;
			font-variant-numeric: tabular-nums;
		`;

		const statsInner = append(statsContainer, $('div'));
		statsInner.style.cssText = `
			display: flex;
			align-items: center;
			gap: 3px;
		`;

		// Additions
		const additionsSpan = append(statsInner, $('span'));
		additionsSpan.textContent = `+${file.additions}`;
		additionsSpan.style.cssText = `
			color: var(--vscode-gitDecoration-addedResourceForeground, var(--cursor-text-green-primary, #3ecf8e));
		`;

		// Deletions
		const deletionsSpan = append(statsInner, $('span'));
		deletionsSpan.textContent = `-${file.deletions}`;
		deletionsSpan.style.cssText = `
			color: var(--vscode-gitDecoration-deletedResourceForeground, var(--cursor-text-red-primary, #ff6b6b));
		`;

		// Right side: Action buttons (hidden by default, shown on hover)
		const rightSide = append(item, $('div'));
		rightSide.style.cssText = `
			transition: opacity 0.1s ease-in-out;
			align-items: center;
			padding-right: 2px;
			flex-shrink: 0;
			display: flex;
			opacity: 0;
		`;

		// X button (remove)
		const xButton = append(rightSide, $('div'));
		xButton.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center';
		xButton.style.cssText = `
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;

		const xIcon = append(xButton, $('span.codicon.codicon-close'));
		xIcon.className = 'codicon codicon-close';
		xIcon.style.cssText = `
			font-size: 16px;
			color: var(--vscode-icon-foreground, var(--vscode-foreground));
		`;

		// Check button (accept)
		const checkButton = append(rightSide, $('div'));
		checkButton.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center';
		checkButton.style.cssText = `
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;

		const checkIcon = append(checkButton, $('span.codicon.codicon-check'));
		checkIcon.className = 'codicon codicon-check';
		checkIcon.style.cssText = `
			font-size: 16px;
			color: var(--vscode-icon-foreground, var(--vscode-foreground));
		`;

		// Hover effect - show action buttons and background
		// Use slightly darker hover background for better visibility
		const isDarkTheme = this.isDarkTheme();
		const hoverBackground = isDarkTheme ? '#252728' : '#E5E5E5'; // Slightly darker than default

		this._register(addDisposableListener(item, 'mouseenter', () => {
			item.style.backgroundColor = hoverBackground;
			rightSide.style.opacity = '1';
		}));

		this._register(addDisposableListener(item, 'mouseleave', () => {
			item.style.backgroundColor = 'transparent';
			rightSide.style.opacity = '0';
		}));

		// Click handlers
		this._register(addDisposableListener(xButton, 'click', (e) => {
			e.stopPropagation();
			this.removeFile(file.id);
		}));

		this._register(addDisposableListener(checkButton, 'click', (e) => {
			e.stopPropagation();
			// TODO: Implement accept action
		}));

		return item;
	}
}

