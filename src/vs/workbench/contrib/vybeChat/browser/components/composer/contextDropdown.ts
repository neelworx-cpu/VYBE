/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, getWindow, clearNode } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { isDarkTheme } from '../../utils/themeUtils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { getIconClasses } from '../../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { relativePath, basename, dirname } from '../../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ITerminalService, ITerminalInstance } from '../../../../../contrib/terminal/browser/terminal.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { EditorsOrder } from '../../../../../../workbench/common/editor.js';
import { EditorResourceAccessor } from '../../../../../../workbench/common/editor.js';

type ViewType = 'initial' | 'files' | 'docs' | 'terminals';

type ContextPillInsertCallback = (type: 'file' | 'terminal' | 'doc', name: string, path?: string, iconClasses?: string[]) => void;

export class ContextDropdown extends Disposable {
	private dropdownElement: HTMLElement | null = null;
	private innerContainer: HTMLElement | null = null;
	private searchContainer: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private backArrow: HTMLElement | null = null;
	private scrollableContainer: HTMLElement | null = null;
	private scrollableElement: DomScrollableElement | null = null;
	private contentWrapper: HTMLElement | null = null;
	private currentView: ViewType = 'initial';
	private previousView: ViewType = 'initial';
	private onPillInsert?: ContextPillInsertCallback;
	private currentSessionFiles: Array<{ name: string; path: string; uri?: URI }> = [];
	private searchQuery: string = '';
	private cachedRecentFiles: Array<{ name: string; path: string; uri: URI }> = [];
	private cachedFiles: Array<{ name: string; path: string; uri?: URI; isFile: boolean; fromSession: boolean }> = [];
	private cachedTerminals: Array<{ name: string; instance: ITerminalInstance; isSelected: boolean }> = [];
	private cachedDocs: Array<{ name: string; source: string; isSelected?: boolean; isAdd?: boolean }> = [];
	private searchTimeout: any = null;

	constructor(
		private anchorElement: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	public setPillInsertCallback(callback: ContextPillInsertCallback): void {
		this.onPillInsert = callback;
	}

	public setCurrentSessionFiles(files: Array<{ name: string; path: string; uri?: URI }>): void {
		this.currentSessionFiles = files;
	}

	public show(openDownward: boolean = false): void {
		// Remove existing dropdown if any (toggle behavior)
		if (this.dropdownElement) {
			this.hide();
			return;
		}

		this.currentView = 'initial';
		this.previousView = 'initial';
		this.createDropdown(openDownward);
	}

	private createDropdown(openDownward: boolean = false): void {
		// Detect theme
		const isDark = isDarkTheme(this.themeService, this.anchorElement);

		// Theme colors - use text edit header colors
		const bgColor = isDark ? '#212427' : '#eceff2';
		const borderColor = isDark ? '#383838' : '#d9d9d9';
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';

		// Outer container - transparent, matches model/agent dropdowns
		this.dropdownElement = append(getWindow(this.anchorElement).document.body, $('#vybe-context-dropdown'));
		this.dropdownElement.className = 'context-dropdown'; // Add class for CSS targeting
		this.dropdownElement.style.cssText = `
			box-sizing: border-box;
			padding: 0px;
			border-radius: 6px;
			background: transparent;
			border: none;
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 10px;
			display: flex;
			flex-direction: column;
			gap: 0px;
			position: fixed;
			visibility: visible;
			width: 240px;
			transform-origin: right bottom;
			box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.12);
			z-index: 2548;
		`;

		// Position dropdown - right edge aligned with button
		const rect = this.anchorElement.getBoundingClientRect();
		const dropdownWidth = 240;
		if (openDownward) {
			// Open downward (for sticky message at top)
			this.dropdownElement.style.top = `${rect.bottom + 3}px`;
			this.dropdownElement.style.left = `${rect.right - dropdownWidth}px`;
			this.dropdownElement.style.transform = 'none';
		} else {
			// Open upward (for bottom composer)
			this.dropdownElement.style.top = `${rect.top - 3}px`;
			this.dropdownElement.style.left = `${rect.right - dropdownWidth}px`;
			this.dropdownElement.style.transform = 'translateY(-100%)';
		}

		// Inner container - actual background and border
		this.innerContainer = append(this.dropdownElement, $('div'));
		this.innerContainer.setAttribute('tabindex', '0');
		this.innerContainer.style.cssText = `
			box-sizing: border-box;
			border-radius: 6px;
			background-color: ${bgColor};
			border: 1px solid ${borderColor};
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 0px;
			outline: none;
			pointer-events: auto;
			color: ${textColor};
			overflow: hidden;
		`;

		// Search input container
		this.searchContainer = append(this.innerContainer, $('div'));
		this.searchContainer.style.cssText = `
			display: flex;
			gap: 4px;
			align-items: center;
			padding: 0px 6px;
			border: none;
			box-sizing: border-box;
			outline: none;
			margin: 2px;
		`;

		// Back arrow (hidden initially, matches provided HTML exactly)
		this.backArrow = append(this.searchContainer, $('span'));
		this.backArrow.className = 'text-dropdown-foreground flex-shrink-0 codicon codicon-arrow-left cursor-pointer';
		this.backArrow.style.cssText = `
			display: block;
			flex-shrink: 0;
			font-size: 12px;
			line-height: 12px;
			width: 12px;
			height: 12px;
			margin-right: 0;
			opacity: 0.3;
			cursor: pointer;
			text-align: center;
			font-family: codicon;
		`;

		this._register(addDisposableListener(this.backArrow, 'click', () => {
			this.currentView = 'initial';
			this.renderContent();
		}));

		// Search input (matches provided HTML)
		this.searchInput = append(this.searchContainer, $('input')) as HTMLInputElement;
		this.searchInput.setAttribute('placeholder', 'Add files, folders, docs...');
		this.searchInput.className = 'text-input-foreground';
		this.searchInput.style.cssText = `
			font-size: 12px;
			line-height: 15px;
			border-radius: 3px;
			background: transparent;
			color: ${textColor};
			padding: 3px 0;
			flex: 1;
			min-width: 0;
			border: none;
			outline: none;
			box-sizing: border-box;
			font-family: -apple-system, "system-ui", sans-serif;
		`;

		// Add search input event listener with debouncing
		this._register(addDisposableListener(this.searchInput, 'input', (e: Event) => {
			const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
			this.searchQuery = query;

			// Debounce search to avoid excessive re-renders
			if (this.searchTimeout) {
				clearTimeout(this.searchTimeout);
			}

			this.searchTimeout = setTimeout(() => {
				this.handleSearch();
			}, 150); // 150ms debounce
		}));

		// Content wrapper (will be wrapped by DomScrollableElement)
		// This element will be inside scrollableDomNode and can grow beyond its height
		this.contentWrapper = $('div');
		this.contentWrapper.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 2px;
			box-sizing: border-box;
			width: 100%;
			height: auto;
			min-height: 0;
		`;

		// Create VS Code ScrollableElement (native scrollbar)
		this.scrollableElement = this._register(new DomScrollableElement(this.contentWrapper, {
			vertical: ScrollbarVisibility.Visible, // Always visible when scrolling is needed
			horizontal: ScrollbarVisibility.Hidden,
			useShadows: false,
			verticalScrollbarSize: 6, // Same as composer
			horizontalScrollbarSize: 6
		}));

		const scrollableDomNode = this.scrollableElement.getDomNode();
		scrollableDomNode.style.boxSizing = 'border-box';
		scrollableDomNode.style.width = '100%';
		scrollableDomNode.style.maxHeight = '280px'; // Only maxHeight initially, like history dropdown
		scrollableDomNode.className = 'monaco-scrollable-element context-dropdown-scrollable'; // Add class for CSS targeting

		// Container for the scrollable element - overflow visible so scrollbar isn't clipped
		this.scrollableContainer = append(this.innerContainer, $('div'));
		this.scrollableContainer.style.boxSizing = 'border-box';
		this.scrollableContainer.style.width = '100%';
		this.scrollableContainer.style.overflow = 'visible'; // Allow scrollbar to be visible
		this.scrollableContainer.appendChild(scrollableDomNode);

		// Render initial content
		this.renderContent();

		// Close dropdown when clicking outside
		const closeHandler = (e: MouseEvent) => {
			if (
				!this.dropdownElement?.contains(e.target as Node) &&
				!this.anchorElement.contains(e.target as Node)
			) {
				this.hide();
				getWindow(this.anchorElement).document.removeEventListener('click', closeHandler);
			}
		};

		setTimeout(() => {
			getWindow(this.anchorElement).document.addEventListener('click', closeHandler);
		}, 0);
	}

	private handleSearch(): void {
		// Don't change view when searching - just re-render with filter
		// The search query is already set in the input event handler
		// and will be read from the input in renderContent()
		this.renderContent();
	}

	private renderContent(): void {
		if (!this.contentWrapper || !this.searchInput || !this.backArrow || !this.scrollableContainer) {
			return;
		}

		// Check if view has changed - only clear search when switching views
		const viewChanged = this.currentView !== this.previousView;
		if (viewChanged) {
			// Clear search when switching views
			if (this.searchInput) {
				this.searchInput.value = '';
				this.searchQuery = '';
			}
			this.previousView = this.currentView;
		} else {
			// Get current search query from input (preserve user's typing)
			this.searchQuery = this.searchInput.value.trim().toLowerCase();
		}

		clearNode(this.contentWrapper);

		// Set maxHeight constraints BEFORE rendering content (like history dropdown)
		if (this.scrollableElement) {
			const scrollableDomNode = this.scrollableElement.getDomNode();

			if (this.currentView === 'files' || this.currentView === 'docs') {
				scrollableDomNode.style.maxHeight = '280px';
			} else if (this.currentView === 'terminals') {
				scrollableDomNode.style.maxHeight = '155px';
			}
			// Height will be set after content renders
		}

		// Update search placeholder and back arrow visibility

		if (this.currentView === 'initial') {
			this.searchInput.setAttribute('placeholder', 'Add files, folders, docs...');
			this.backArrow.style.display = 'none';
		} else if (this.currentView === 'files') {
			this.searchInput.setAttribute('placeholder', 'Search files and folders...');
			this.backArrow.style.display = 'block'; // Match reference - display: block
		} else if (this.currentView === 'docs') {
			this.searchInput.setAttribute('placeholder', 'Search documentation...');
			this.backArrow.style.display = 'block'; // Match reference - display: block
		} else if (this.currentView === 'terminals') {
			this.searchInput.setAttribute('placeholder', 'Search terminals...');
			this.backArrow.style.display = 'block'; // Match reference - display: block
		}

		// Render content
		if (this.currentView === 'initial') {
			this.renderInitialView();
			// Update height immediately for initial view
			this.updateHeightAfterRender();
		} else if (this.currentView === 'files') {
			// For async files view, update height after it completes
			void this.renderFilesView().then(() => {
				this.updateHeightAfterRender();
			});
		} else if (this.currentView === 'docs') {
			this.renderDocsView();
			this.updateHeightAfterRender();
		} else if (this.currentView === 'terminals') {
			this.renderTerminalsView();
			this.updateHeightAfterRender();
		}
	}

	private updateHeightAfterRender(): void {
		// Update height and scrollbar AFTER content is rendered (exactly like history dropdown)
		setTimeout(() => {
			if (!this.scrollableElement || !this.contentWrapper) {
				return;
			}

			// Remove height constraints temporarily to measure content
			this.contentWrapper.style.height = 'auto';
			this.contentWrapper.style.maxHeight = 'none';

			// Force a reflow to get accurate measurements
			void this.contentWrapper.offsetHeight;

			// Get the actual content height
			const contentHeight = this.contentWrapper.scrollHeight;
			const maxHeight = (this.currentView === 'terminals') ? 155 :
			                 (this.currentView === 'initial') ? contentHeight : 280;
			const actualHeight = Math.min(contentHeight, maxHeight);

			// Set the contentWrapper height (exactly like history dropdown sets listContainer height)
			this.contentWrapper.style.height = `${actualHeight}px`;
			this.contentWrapper.style.maxHeight = `${actualHeight}px`;

			// Update the scrollable element's height
			const scrollableDomNode = this.scrollableElement.getDomNode();
			scrollableDomNode.style.height = `${actualHeight}px`;
			scrollableDomNode.style.maxHeight = `${actualHeight}px`;

			// Force reflow after setting heights
			void scrollableDomNode.offsetHeight;
			void this.contentWrapper.offsetHeight;

			// Scan to update scrollbar - this updates scroll dimensions and triggers scrollbar visibility
			this.scrollableElement.scanDomNode();

			// Ensure scrollbar is rendered (may need a small delay for DOM to settle)
			setTimeout(() => {
				if (this.scrollableElement) {
					this.scrollableElement.scanDomNode();
				}
			}, 10);
		}, 0);
	}

	private renderInitialView(): void {
		if (!this.contentWrapper) {
			return;
		}

		const isDark = isDarkTheme(this.themeService, this.anchorElement);
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';
		const borderColor = isDark ? '#383838' : '#d9d9d9';

		// Recent files section
		const recentSection = append(this.contentWrapper, $('div'));
		recentSection.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
		`;

		// Get real recently used editors (MRU - Most Recently Used)
		const recentEditors = this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: false });

		// Filter to only file editors and get their resources
		let recentFiles: Array<{ name: string; path: string; uri: URI }> = [];
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceRoot = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;

		for (const editorIdentifier of recentEditors.slice(0, 5)) { // Limit to 5 most recent
			const resource = EditorResourceAccessor.getOriginalUri(editorIdentifier.editor);
			if (resource && URI.isUri(resource) && resource.scheme === 'file') {
				const fileName = basename(resource);
				let relativePathStr = '';

				if (workspaceRoot) {
					const dirUri = dirname(resource);
					const relPath = relativePath(workspaceRoot, dirUri);
					if (relPath) {
						relativePathStr = relPath;
					}
				} else {
					relativePathStr = dirname(resource).fsPath || '';
				}

				recentFiles.push({
					name: fileName,
					path: relativePathStr,
					uri: resource
				});
			}
		}

		// Cache recent files
		this.cachedRecentFiles = recentFiles;

		// Filter by search query if present (filename only)
		if (this.searchQuery) {
			recentFiles = recentFiles.filter(file =>
				file.name.toLowerCase().includes(this.searchQuery)
			);
		}

		if (recentFiles.length === 0) {
			const emptyMessage = append(recentSection, $('div'));
			emptyMessage.textContent = this.searchQuery ? 'No files match your search' : 'No recent files';
			emptyMessage.style.cssText = `
				color: ${textColor};
				font-size: 11px;
				opacity: 0.6;
				padding: 8px 6px;
				text-align: center;
			`;
		} else {
			recentFiles.forEach((file) => {
				const fileItem = this.createFileItem(file, isDark, textColor, borderColor, false);
				recentSection.appendChild(fileItem);
			});
		}

		// Divider
		const divider = append(this.contentWrapper, $('div'));
		divider.style.cssText = `
			height: 1px;
			width: 100%;
			background-color: ${borderColor};
			opacity: 0.8;
		`;

		// Options section
		const optionsSection = append(this.contentWrapper, $('div'));
		optionsSection.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
		`;

		// Options items (removed Branch and Browser)
		const options = [
			{ label: 'Files & Folders', icon: 'codicon-files', hasChevron: true, view: 'files' as ViewType },
			{ label: 'Docs', icon: 'codicon-book', hasChevron: true, view: 'docs' as ViewType },
			{ label: 'Terminals', icon: 'codicon-terminal', hasChevron: true, view: 'terminals' as ViewType }
		];

		options.forEach(option => {
			const optionItem = this.createOptionItem(option, isDark, textColor);
			optionsSection.appendChild(optionItem);
		});
	}

	private async renderFilesView(): Promise<void> {
		if (!this.contentWrapper) {
			return;
		}

		const isDark = isDarkTheme(this.themeService, this.anchorElement);
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';
		const borderColor = isDark ? '#383838' : '#d9d9d9';

		// Section header
		const header = append(this.contentWrapper, $('div'));
		header.textContent = 'Files & Folders';
		header.style.cssText = `
			color: ${textColor};
			font-size: 11px;
			opacity: 0.4;
			padding: 0 6px;
			line-height: 15px;
		`;

		// Files list
		const filesList = append(this.contentWrapper, $('div'));
		filesList.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
		`;

		// Get workspace folders
		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.folders.length === 0) {
			const emptyMessage = append(filesList, $('div'));
			emptyMessage.textContent = 'No workspace folder open';
			emptyMessage.style.cssText = `
				color: ${textColor};
				font-size: 11px;
				opacity: 0.6;
				padding: 8px 6px;
				text-align: center;
			`;
			return;
		}

		// Show loading state
		const loadingMessage = append(filesList, $('div'));
		loadingMessage.textContent = 'Loading files...';
		loadingMessage.style.cssText = `
			color: ${textColor};
			font-size: 11px;
			opacity: 0.6;
			padding: 8px 6px;
			text-align: center;
		`;

		try {
			// Clear loading message
			clearNode(filesList);

			// Get workspace root first (needed for path calculations)
			const workspaceRoot = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;

			// Get files from current session (context pills)
			const sessionFiles = this.currentSessionFiles.map(file => {
				// If we have a URI, extract the relative path properly
				let filePath = file.path;
				if (file.uri && workspaceRoot) {
					const dirUri = dirname(file.uri);
					const relPath = relativePath(workspaceRoot, dirUri);
					if (relPath) {
						filePath = relPath;
					}
				}
				return {
					name: file.name,
					path: filePath,
					uri: file.uri,
					isFile: true,
					fromSession: true
				};
			});

			// Get recently opened files from editor history (excluding files already in session)
			const recentEditors = this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: false });
			const recentFiles: Array<{ name: string; path: string; uri?: URI; isFile: boolean; fromSession: boolean }> = [];
			const sessionFileUris = new Set(sessionFiles.map(f => f.uri?.toString()).filter(Boolean));

			for (const editorIdentifier of recentEditors) {
				const resource = EditorResourceAccessor.getOriginalUri(editorIdentifier.editor);
				if (resource && URI.isUri(resource) && resource.scheme === 'file') {
					// Skip if already in session files
					if (sessionFileUris.has(resource.toString())) {
						continue;
					}

					const fileName = basename(resource);
					let relativePathStr = '';

					if (workspaceRoot) {
						const dirUri = dirname(resource);
						const relPath = relativePath(workspaceRoot, dirUri);
						if (relPath) {
							relativePathStr = relPath;
						}
					} else {
						relativePathStr = dirname(resource).fsPath || '';
					}

					recentFiles.push({
						name: fileName,
						path: relativePathStr,
						uri: resource,
						isFile: true,
						fromSession: false
					});
				}
			}

			// Combine session files and recent files
			const allFiles = [...sessionFiles, ...recentFiles];

			if (allFiles.length === 0) {
				const emptyMessage = append(filesList, $('div'));
				emptyMessage.textContent = this.searchQuery ? 'No files match your search' : 'No files found';
				emptyMessage.style.cssText = `
					color: ${textColor};
					font-size: 11px;
					opacity: 0.6;
					padding: 8px 6px;
					text-align: center;
				`;
				return;
			}

			// Sort: session files first, then recent files, both alphabetically
			allFiles.sort((a, b) => {
				if (a.fromSession !== b.fromSession) {
					return a.fromSession ? -1 : 1; // Session files first
				}
				return a.name.localeCompare(b.name);
			});

			// Cache files
			this.cachedFiles = allFiles;

			// Filter by search query if present (filename only)
			let filteredFiles = allFiles;
			if (this.searchQuery) {
				filteredFiles = allFiles.filter(item =>
					item.name.toLowerCase().includes(this.searchQuery)
				);
			}

			// Check if filtered results are empty
			if (filteredFiles.length === 0) {
				const emptyMessage = append(filesList, $('div'));
				emptyMessage.textContent = 'No files match your search';
				emptyMessage.style.cssText = `
					color: ${textColor};
					font-size: 11px;
					opacity: 0.6;
					padding: 8px 6px;
					text-align: center;
				`;
			} else {
				// Render files (limit to 50 for performance)
				const displayFiles = filteredFiles.slice(0, 50);
				displayFiles.forEach(item => {
					const fileItem = this.createFileOrFolderItem(item, isDark, textColor, borderColor);
					filesList.appendChild(fileItem);
				});

				if (filteredFiles.length > 50) {
					const moreMessage = append(filesList, $('div'));
					moreMessage.textContent = `... and ${filteredFiles.length - 50} more files`;
					moreMessage.style.cssText = `
						color: ${textColor};
						font-size: 11px;
						opacity: 0.5;
						padding: 4px 6px;
						text-align: center;
						font-style: italic;
					`;
				}
			}
		} catch (error) {
			clearNode(filesList);
			const errorMessage = append(filesList, $('div'));
			errorMessage.textContent = 'Error loading files';
			errorMessage.style.cssText = `
				color: ${textColor};
				font-size: 11px;
				opacity: 0.6;
				padding: 8px 6px;
				text-align: center;
			`;
			console.error('[VYBE Context Dropdown] Error loading files:', error);
		}
	}

	/**
	 * Recursively get files from a directory
	 */
	private async getFilesRecursive(rootUri: URI, maxDepth: number, currentDepth: number = 0): Promise<Array<{ name: string; path: string; isFile: boolean }>> {
		if (currentDepth >= maxDepth) {
			return [];
		}

		const files: Array<{ name: string; path: string; isFile: boolean }> = [];

		try {
			const stat = await this.fileService.resolve(rootUri);
			if (!stat.isDirectory) {
				return [];
			}

			// Get relative path from workspace root
			const workspace = this.workspaceContextService.getWorkspace();
			if (workspace.folders.length === 0) {
				return [];
			}

			const workspaceRoot = workspace.folders[0].uri;
			const relativePathStr = relativePath(workspaceRoot, rootUri) || '';

			// Add current directory if not root
			if (relativePathStr && currentDepth > 0) {
				files.push({
					name: basename(rootUri),
					path: relativePathStr,
					isFile: false
				});
			}

			// Process children
			if (stat.children) {
				for (const child of stat.children) {
					if (child.isFile) {
						// Get directory path (parent of file)
						const childDir = dirname(child.resource);
						const dirRelativePath = relativePath(workspaceRoot, childDir) || '';
						// Remove leading slash if present
						const dirPath = dirRelativePath.replace(/^\//, '');

						files.push({
							name: basename(child.resource),
							path: dirPath,
							isFile: true
						});
					} else if (child.isDirectory && currentDepth < maxDepth - 1) {
						// Recursively get files from subdirectories
						const subFiles = await this.getFilesRecursive(child.resource, maxDepth, currentDepth + 1);
						files.push(...subFiles);
					}
				}
			}
		} catch (error) {
			console.error(`[VYBE Context Dropdown] Error reading directory ${rootUri.toString()}:`, error);
		}

		return files;
	}

	private renderDocsView(): void {
		if (!this.contentWrapper) {
			return;
		}

		const isDark = isDarkTheme(this.themeService, this.anchorElement);
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';

		// Section header
		const header = append(this.contentWrapper, $('div'));
		header.textContent = 'Docs';
		header.style.cssText = `
			color: ${textColor};
			font-size: 11px;
			opacity: 0.4;
			padding: 0 6px;
			line-height: 15px;
		`;

		// Docs list
		const docsList = append(this.contentWrapper, $('div'));
		docsList.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
		`;

		// Mock docs
		const allDocs = [
			{ name: 'VS Code API', source: 'Official', isSelected: true },
			{ name: 'TypeScript', source: 'Official' },
			{ name: 'React', source: 'Official' },
			{ name: 'Node.js', source: 'Official' },
			{ name: 'Express', source: 'Official' },
			{ name: 'MongoDB', source: 'Official' },
			{ name: 'PostgreSQL', source: 'Official' },
			{ name: 'Docker', source: 'Official' },
			{ name: 'Kubernetes', source: 'Official' },
			{ name: 'AWS SDK', source: 'Official' },
			{ name: 'Add new doc', source: '', isAdd: true }
		];

		// Cache docs
		this.cachedDocs = allDocs;

		// Filter by search query if present
		let docs = allDocs;
		if (this.searchQuery) {
			docs = allDocs.filter(doc =>
				doc.name.toLowerCase().includes(this.searchQuery) ||
				doc.source.toLowerCase().includes(this.searchQuery)
			);
		}

		if (docs.length === 0) {
			const emptyMessage = append(docsList, $('div'));
			emptyMessage.textContent = 'No docs match your search';
			emptyMessage.style.cssText = `
				color: ${textColor};
				font-size: 11px;
				opacity: 0.6;
				padding: 8px 6px;
				text-align: center;
			`;
		} else {
			docs.forEach(doc => {
				const docItem = this.createDocItem(doc, isDark, textColor);
				docsList.appendChild(docItem);
			});
		}
	}

	private renderTerminalsView(): void {
		if (!this.contentWrapper) {
			return;
		}

		const isDark = isDarkTheme(this.themeService, this.anchorElement);
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';

		// Section header
		const header = append(this.contentWrapper, $('div'));
		header.textContent = 'Terminals';
		header.style.cssText = `
			color: ${textColor};
			font-size: 11px;
			opacity: 0.4;
			padding: 0 6px;
			line-height: 15px;
		`;

		// Terminals list
		const terminalsList = append(this.contentWrapper, $('div'));
		terminalsList.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
		`;

		// Get real terminal instances
		const terminalInstances = this.terminalService.instances;

		if (terminalInstances.length === 0) {
			const emptyMessage = append(terminalsList, $('div'));
			emptyMessage.textContent = 'No terminals open';
			emptyMessage.style.cssText = `
				color: ${textColor};
				font-size: 11px;
				opacity: 0.6;
				padding: 8px 6px;
				text-align: center;
			`;
			return;
		}

		// Convert terminal instances to display format
		let terminals = terminalInstances.map((instance: ITerminalInstance, index: number) => {
			// Get terminal name (title, process name, or fallback)
			const name = instance.title || instance.processName || `Terminal ${index + 1}`;
			return {
				name,
				instance,
				isSelected: index === 0 // First terminal is selected by default
			};
		});

		// Cache terminals
		this.cachedTerminals = terminals;

		// Filter by search query if present
		if (this.searchQuery) {
			terminals = terminals.filter(terminal =>
				terminal.name.toLowerCase().includes(this.searchQuery)
			);
		}

		if (terminals.length === 0 && this.searchQuery) {
			const emptyMessage = append(terminalsList, $('div'));
			emptyMessage.textContent = 'No terminals match your search';
			emptyMessage.style.cssText = `
				color: ${textColor};
				font-size: 11px;
				opacity: 0.6;
				padding: 8px 6px;
				text-align: center;
			`;
			return;
		}

		terminals.forEach((terminal: { name: string; instance: ITerminalInstance; isSelected: boolean }) => {
			const terminalItem = this.createTerminalItem(terminal, isDark, textColor);
			terminalsList.appendChild(terminalItem);
		});
	}

	private createFileItem(file: { name: string; path: string }, isDark: boolean, textColor: string, borderColor: string, isSelected: boolean = false): HTMLElement {
		const fileItem = $('div');
		fileItem.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			padding: 2px 6px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			overflow: hidden;
		`;

		// Content row with fixed height and gap
		const contentRow = append(fileItem, $('div'));
		contentRow.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		if (isSelected) {
			fileItem.style.backgroundColor = hoverBg;
		}

		// Icon container with VS Code file icons
		const iconContainer = append(contentRow, $('span'));
		iconContainer.className = 'show-file-icons';
		iconContainer.style.cssText = `
			flex-shrink: 0;
			height: 16px;
			width: 16px;
			display: flex;
			align-items: center;
			justify-content: center;
			margin-left: -2px;
		`;

		// Create URI from file path or use provided URI
		const fileUri = (file as any).uri || URI.file(`/${file.path}/${file.name}`);
		const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);

		const iconWrapper = append(iconContainer, $('div'));
		iconWrapper.style.cssText = `
			position: relative;
			height: 100%;
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		`;

		const iconDiv = append(iconWrapper, $('div'));
		iconDiv.className = `monaco-icon-label file-icon ${iconClasses.join(' ')} height-override-important`;
		iconDiv.style.cssText = `
			height: 100%;
			width: 100%;
		`;

		// File name and path container
		const nameContainer = append(contentRow, $('div'));
		nameContainer.style.cssText = `
			display: flex;
			flex: 1;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 16px;
			overflow: hidden;
			line-height: 16px;
		`;

		const fileName = append(nameContainer, $('div'));
		fileName.style.cssText = `
			max-width: 100%;
			color: ${textColor};
		`;

		const fileNameSpan = append(fileName, $('span'));
		fileNameSpan.textContent = file.name;
		fileNameSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		const filePath = append(nameContainer, $('span'));
		filePath.textContent = file.path;
		const pathColor = isDark ? 'rgba(204, 204, 204, 0.6)' : 'rgba(102, 102, 102, 0.6)';
		filePath.style.cssText = `
			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
			color: ${pathColor};
			flex-shrink: 1;
			opacity: ${isSelected ? '0.6' : '0.4'};
			font-size: 11px;
			line-height: 16px;
			direction: rtl;
			display: flex;
			align-items: center;
		`;

		// Hover effect - no fixed hover for selected items
		this._register(addDisposableListener(fileItem, 'mouseenter', () => {
			fileItem.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(fileItem, 'mouseleave', () => {
			fileItem.style.backgroundColor = 'transparent';
		}));

		this._register(addDisposableListener(fileItem, 'click', () => {
			if (this.onPillInsert) {
				const fileUri = URI.file(`/${file.path}/${file.name}`);
				const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);
				this.onPillInsert('file', file.name, file.path, iconClasses);
			}
			this.hide();
		}));

		return fileItem;
	}

	private createFileOrFolderItem(item: { name: string; path: string; isFile: boolean; isSelected?: boolean; uri?: URI }, isDark: boolean, textColor: string, borderColor: string): HTMLElement {
		const fileItem = $('div');
		fileItem.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			padding: 2px 6px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			overflow: hidden;
		`;

		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		if (item.isSelected) {
			fileItem.style.backgroundColor = hoverBg;
		}

		// Content row with fixed height and gap
		const contentRow = append(fileItem, $('div'));
		contentRow.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Icon container with VS Code file icons (for files)
		const iconContainer = append(contentRow, $('span'));
		if (item.isFile) {
			iconContainer.className = 'show-file-icons';
			iconContainer.style.cssText = `
				flex-shrink: 0;
				height: 16px;
				width: 16px;
				display: flex;
				align-items: center;
				justify-content: center;
				margin-left: -2px;
			`;

			// Use URI if available, otherwise construct from path
			const fileUri = item.uri || URI.file(`/${item.path}/${item.name}`);
			const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);

			const iconWrapper = append(iconContainer, $('div'));
			iconWrapper.style.cssText = `
				position: relative;
				height: 100%;
				width: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
			`;

			const iconDiv = append(iconWrapper, $('div'));
			iconDiv.className = `monaco-icon-label file-icon ${iconClasses.join(' ')} height-override-important`;
			iconDiv.style.cssText = `
				height: 100%;
				width: 100%;
			`;
		} else {
			// Folder icon
			iconContainer.style.cssText = `
				flex-shrink: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 14px;
				line-height: 16px;
				margin-left: -2px;
				color: ${textColor};
				width: 16px;
				height: 16px;
			`;

			const icon = append(iconContainer, $('i.codicon.codicon-folder'));
			icon.style.cssText = `
				height: 100%;
				width: 100%;
			`;
		}

		// Name and path container
		const nameContainer = append(contentRow, $('div'));
		nameContainer.style.cssText = `
			display: flex;
			flex: 1;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 16px;
			overflow: hidden;
		`;

		const nameDiv = append(nameContainer, $('div'));
		nameDiv.style.cssText = `
			max-width: 100%;
			color: ${textColor};
		`;

		const nameSpan = append(nameDiv, $('span'));
		nameSpan.textContent = item.name;
		nameSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		const pathSpan = append(nameContainer, $('span'));
		pathSpan.textContent = item.path;
		const pathColor = isDark ? 'rgba(204, 204, 204, 0.6)' : 'rgba(102, 102, 102, 0.6)';
		pathSpan.style.cssText = `
			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
			color: ${pathColor};
			flex-shrink: 1;
			opacity: ${item.isSelected ? '0.6' : '0.4'};
			font-size: 11px;
			line-height: 16px;
			direction: rtl;
		`;

		// Hover effect
		this._register(addDisposableListener(fileItem, 'mouseenter', () => {
			fileItem.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(fileItem, 'mouseleave', () => {
			if (!item.isSelected) {
				fileItem.style.backgroundColor = 'transparent';
			} else {
				fileItem.style.backgroundColor = hoverBg;
			}
		}));

		this._register(addDisposableListener(fileItem, 'click', () => {
			if (item.isFile && this.onPillInsert) {
				// Use URI if available (from session files or recent files), otherwise construct from path
				const fileUri = item.uri || URI.file(`/${item.path}/${item.name}`);
				const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);
				// Use path from item (already calculated relative path)
				this.onPillInsert('file', item.name, item.path, iconClasses);
			}
			this.hide();
		}));

		return fileItem;
	}

	private createDocItem(doc: { name: string; source: string; isSelected?: boolean; isAdd?: boolean }, isDark: boolean, textColor: string): HTMLElement {
		const docItem = $('div');
		docItem.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			gap: 6px;
			padding: 2px 6px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			overflow: hidden;
		`;

		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		if (doc.isSelected) {
			docItem.style.backgroundColor = hoverBg;
		}

		// Content row with fixed height and gap
		const contentRow = append(docItem, $('div'));
		contentRow.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Icon and name
		const leftSide = append(contentRow, $('div'));
		leftSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			height: 16px;
			flex: 1;
			overflow: hidden;
		`;

		const icon = append(leftSide, $('span'));
		icon.style.cssText = `
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: start;
			font-size: 14px;
			line-height: 16px;
			margin-right: 0;
			color: ${textColor};
			width: 14px;
			height: 14px;
		`;

		append(icon, $(`i.codicon.${doc.isAdd ? 'codicon-add' : 'codicon-book'}`));

		const nameContainer = append(leftSide, $('div'));
		nameContainer.style.cssText = `
			display: flex;
			flex: 1;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 16px;
			overflow: hidden;
		`;

		const nameDiv = append(nameContainer, $('div'));
		nameDiv.style.cssText = `
			max-width: 100%;
			color: ${textColor};
		`;

		const nameSpan = append(nameDiv, $('span'));
		nameSpan.textContent = doc.name;
		nameSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		if (doc.source) {
			const sourceSpan = append(nameContainer, $('span'));
			sourceSpan.textContent = doc.source;
			const sourceColor = isDark ? 'rgba(204, 204, 204, 0.6)' : 'rgba(102, 102, 102, 0.6)';
			sourceSpan.style.cssText = `
				text-overflow: ellipsis;
				overflow: hidden;
				white-space: nowrap;
				color: ${sourceColor};
				flex-shrink: 1;
				opacity: ${doc.isSelected ? '0.6' : '0.4'};
				font-size: 11px;
				line-height: 16px;
				direction: rtl;
			`;
		}

		// Hover effect
		this._register(addDisposableListener(docItem, 'mouseenter', () => {
			docItem.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(docItem, 'mouseleave', () => {
			if (!doc.isSelected) {
				docItem.style.backgroundColor = 'transparent';
			} else {
				docItem.style.backgroundColor = hoverBg;
			}
		}));

		this._register(addDisposableListener(docItem, 'click', () => {
			if (!doc.isAdd && this.onPillInsert) {
				this.onPillInsert('doc', doc.name);
			}
			this.hide();
		}));

		return docItem;
	}

	private createTerminalItem(terminal: { name: string; instance?: ITerminalInstance; isSelected?: boolean; isAdd?: boolean }, isDark: boolean, textColor: string): HTMLElement {
		const terminalItem = $('div');
		terminalItem.style.cssText = `
			display: flex;
			flex-direction: column;
			min-width: 0;
			width: 100%;
			padding: 2px 6px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			overflow: hidden;
		`;

		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		if (terminal.isSelected) {
			terminalItem.style.backgroundColor = hoverBg;
		}

		// Content row with fixed height and gap
		const contentRow = append(terminalItem, $('div'));
		contentRow.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Icon and name
		const leftSide = append(contentRow, $('div'));
		leftSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			height: 16px;
			flex: 1;
			overflow: hidden;
		`;

		const icon = append(leftSide, $('span'));
		icon.style.cssText = `
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: start;
			font-size: 14px;
			line-height: 16px;
			color: ${textColor};
			width: 14px;
			height: 14px;
		`;

		append(icon, $(`i.codicon.${terminal.isAdd ? 'codicon-plus' : 'codicon-terminal'}`));

		const nameContainer = append(leftSide, $('div'));
		nameContainer.style.cssText = `
			display: flex;
			flex: 1;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 16px;
			overflow: hidden;
		`;

		const nameDiv = append(nameContainer, $('div'));
		nameDiv.style.cssText = `
			max-width: 100%;
			color: ${textColor};
		`;

		const nameSpan = append(nameDiv, $('span'));
		nameSpan.textContent = terminal.name;
		nameSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		// Hover effect
		this._register(addDisposableListener(terminalItem, 'mouseenter', () => {
			terminalItem.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(terminalItem, 'mouseleave', () => {
			if (!terminal.isSelected) {
				terminalItem.style.backgroundColor = 'transparent';
			} else {
				terminalItem.style.backgroundColor = hoverBg;
			}
		}));

		this._register(addDisposableListener(terminalItem, 'click', () => {
			if (!terminal.isAdd && this.onPillInsert) {
				this.onPillInsert('terminal', terminal.name);
			}
			this.hide();
		}));

		return terminalItem;
	}

	private createOptionItem(option: { label: string; icon: string; hasChevron: boolean; view: ViewType }, isDark: boolean, textColor: string): HTMLElement {
		const optionItem = $('div');
		optionItem.style.cssText = `
			display: flex;
			flex-direction: column;
			min-width: 0;
			width: 100%;
			padding: 2px 6px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			overflow: hidden;
		`;

		// Content row with fixed height and gap
		const contentRow = append(optionItem, $('div'));
		contentRow.style.cssText = `
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
			height: 16px;
			gap: 6px;
		`;

		// Left side: icon and label
		const leftSide = append(contentRow, $('div'));
		leftSide.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			height: 16px;
			flex: 1;
			overflow: hidden;
		`;

		const icon = append(leftSide, $('span'));
		icon.style.cssText = `
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: start;
			font-size: 14px;
			line-height: 16px;
			color: ${textColor};
		`;

		append(icon, $(`i.codicon.${option.icon}`));

		const labelContainer = append(leftSide, $('div'));
		labelContainer.style.cssText = `
			display: flex;
			flex: 1;
			align-items: center;
			min-width: 0;
			gap: 6px;
			height: 16px;
			overflow: hidden;
		`;

		const label = append(labelContainer, $('div'));
		label.style.cssText = `
			max-width: 100%;
			color: ${textColor};
		`;

		const labelSpan = append(label, $('span'));
		labelSpan.textContent = option.label;
		labelSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: block;
			width: 100%;
		`;

		// Right side: chevron
		if (option.hasChevron) {
			const rightSide = append(contentRow, $('div'));
			rightSide.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: flex-end;
				height: 16px;
				flex-shrink: 0;
				padding-left: 4px;
			`;

			const chevron = append(rightSide, $('span'));
			chevron.className = 'codicon codicon-chevron-right';
			chevron.style.cssText = `
				color: ${textColor};
				font-size: 8px;
				flex-shrink: 0;
				opacity: 0.3;
			`;
		}

		// Hover effect
		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		this._register(addDisposableListener(optionItem, 'mouseenter', () => {
			optionItem.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(optionItem, 'mouseleave', () => {
			optionItem.style.backgroundColor = 'transparent';
		}));

		// Click handler - transform dropdown (prevent default close)
		this._register(addDisposableListener(optionItem, 'click', (e) => {
			e.stopPropagation();
			this.currentView = option.view;
			this.renderContent();
		}));

		return optionItem;
	}

	public hide(): void {
		// Clear search timeout
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
			this.searchTimeout = null;
		}

		// Clear search query
		this.searchQuery = '';
		if (this.dropdownElement) {
			this.dropdownElement.remove();
			this.dropdownElement = null;
			this.innerContainer = null;
			this.searchContainer = null;
			this.searchInput = null;
			this.backArrow = null;
			this.scrollableContainer = null;
			this.scrollableElement = null;
			this.contentWrapper = null;
			this.currentView = 'initial';
		}
	}

	public isVisible(): boolean {
		return this.dropdownElement !== null;
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}

