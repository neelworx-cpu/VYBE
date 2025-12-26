/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE File Command Bar
 * File-level overlay widget that displays Keep/Undo/Review buttons for files with pending diffs.
 */

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { URI } from '../../../../../base/common/uri.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { IVybeDiffService } from '../../common/vybeDiffService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { $, append } from '../../../../../base/browser/dom.js';

/**
 * Overlay widget for displaying file-level command bar with Keep/Undo/Review buttons.
 */
export class VybeFileCommandBar extends Disposable implements IOverlayWidget {
	private static _idPool = 0;
	private readonly _id: string = `vybe-file-command-bar-${VybeFileCommandBar._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _outerWrapper: HTMLElement;
	private readonly _innerWrapper: HTMLElement;
	private readonly _promptBar: HTMLElement;
	private readonly _buttonContainer: HTMLElement;
	private readonly _diffCounter: HTMLElement;
	private readonly _fileCounter: HTMLElement;
	private readonly _keepButton: HTMLElement;
	private readonly _undoButton: HTMLElement;
	protected override readonly _store: DisposableStore;

	private _position: IOverlayWidgetPosition | undefined;
	private _uri: URI;
	private _currentDiffIndex: number = 0;
	private _totalDiffs: number = 0;
	private _currentFileIndex: number = 0;
	private _totalFiles: number = 0;
	private _visible: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		uri: URI,
		@IVybeEditService private readonly _editService: IVybeEditService,
		@IVybeDiffService private readonly _diffService: IVybeDiffService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._store = this._register(new DisposableStore());

		this._uri = uri;

		// Create root container
		this._domNode = document.createElement('div');
		this._domNode.className = 'aiFullFilePromptBarWidget';
		this._domNode.style.display = 'none';
		this._domNode.style.pointerEvents = 'none';

		// Create outer wrapper
		this._outerWrapper = document.createElement('div');
		this._domNode.appendChild(this._outerWrapper);

		// Create inner wrapper
		this._innerWrapper = document.createElement('div');
		this._outerWrapper.appendChild(this._innerWrapper);

		// Create prompt bar container
		this._promptBar = document.createElement('div');
		this._promptBar.className = 'pure-ai-prompt-bar';
		this._innerWrapper.appendChild(this._promptBar);

		// Create button container (first container with diff counter and buttons)
		this._buttonContainer = document.createElement('div');
		this._buttonContainer.className = 'pure-ai-prompt-bar flex items-center gap-[40px]';
		this._promptBar.appendChild(this._buttonContainer);

		// Create diff counter container
		this._diffCounter = document.createElement('div');
		this._diffCounter.className = 'flex items-center gap-1 ml-0.5 min-w-[72px]';
		this._diffCounter.setAttribute('tabindex', '0');
		this._diffCounter.style.outline = 'none';
		this._buttonContainer.appendChild(this._diffCounter);

		// Create chevron up button
		const chevronUp = document.createElement('div');
		chevronUp.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center opacity-40';
		const chevronUpIcon = $('span.codicon.codicon-chevron-up');
		chevronUpIcon.className = 'codicon codicon-chevron-up !text-[16px]';
		chevronUp.appendChild(chevronUpIcon);
		chevronUp.onclick = () => this._navigateToPreviousDiff();
		this._diffCounter.appendChild(chevronUp);

		// Create counter text
		const counterText = document.createElement('div');
		counterText.className = 'opacity-60';
		counterText.textContent = '1 / 1';
		this._diffCounter.appendChild(counterText);

		// Create chevron down button
		const chevronDown = document.createElement('div');
		chevronDown.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center opacity-40';
		const chevronDownIcon = $('span.codicon.codicon-chevron-down');
		chevronDownIcon.className = 'codicon codicon-chevron-down !text-[16px]';
		chevronDown.appendChild(chevronDownIcon);
		chevronDown.onclick = () => this._navigateToNextDiff();
		this._diffCounter.appendChild(chevronDown);

		// Create actions container
		const actionsContainer = document.createElement('div');
		actionsContainer.className = 'diff-review-trailing-actions';
		this._buttonContainer.appendChild(actionsContainer);

		const primaryActions = document.createElement('div');
		primaryActions.className = 'diff-review-primary-actions';
		actionsContainer.appendChild(primaryActions);

		// Create Undo All button
		this._undoButton = document.createElement('div');
		this._undoButton.className = 'anysphere-outline-button';
		this._undoButton.setAttribute('data-click-ready', 'true');
		const undoButtonContent = document.createElement('span');
		undoButtonContent.className = 'inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden';
		const undoButtonText = document.createElement('span');
		undoButtonText.className = 'truncate';
		undoButtonText.textContent = 'Undo All';
		const undoButtonKeybinding = document.createElement('span');
		undoButtonKeybinding.className = 'text-[10px] opacity-50 keybinding-font-settings shrink-0';
		undoButtonKeybinding.textContent = '⇧⌘⌫';
		append(undoButtonContent, undoButtonText, undoButtonKeybinding);
		this._undoButton.appendChild(undoButtonContent);
		this._undoButton.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._handleUndoAll();
		};
		primaryActions.appendChild(this._undoButton);

		// Create Keep All button
		this._keepButton = document.createElement('div');
		this._keepButton.className = 'anysphere-button';
		this._keepButton.setAttribute('data-click-ready', 'true');
		const keepButtonContent = document.createElement('span');
		keepButtonContent.className = 'inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden';
		const keepButtonText = document.createElement('span');
		keepButtonText.className = 'truncate';
		keepButtonText.textContent = 'Keep All';
		const keepButtonKeybinding = document.createElement('span');
		keepButtonKeybinding.className = 'text-[10px] opacity-50 keybinding-font-settings shrink-0';
		keepButtonKeybinding.textContent = '⌘⏎';
		append(keepButtonContent, keepButtonText, keepButtonKeybinding);
		this._keepButton.appendChild(keepButtonContent);
		this._keepButton.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._handleKeepAll();
		};
		primaryActions.appendChild(this._keepButton);

		// Create file counter container (second container)
		this._fileCounter = document.createElement('div');
		this._fileCounter.className = 'flex items-center gap-1';
		this._promptBar.appendChild(this._fileCounter);

		// Create chevron left button
		const chevronLeft = document.createElement('div');
		chevronLeft.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center opacity-40';
		const chevronLeftIcon = $('span.codicon.codicon-chevron-left');
		chevronLeftIcon.className = 'codicon codicon-chevron-left !text-[16px]';
		chevronLeft.appendChild(chevronLeftIcon);
		chevronLeft.onclick = () => this._navigateToPreviousFile();
		this._fileCounter.appendChild(chevronLeft);

		// Create file counter text
		const fileCounterText = document.createElement('div');
		fileCounterText.className = 'opacity-60';
		fileCounterText.textContent = '1 / 1 files';
		this._fileCounter.appendChild(fileCounterText);

		// Create chevron right button
		const chevronRight = document.createElement('div');
		chevronRight.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center opacity-40';
		const chevronRightIcon = $('span.codicon.codicon-chevron-right');
		chevronRightIcon.className = 'codicon codicon-chevron-right !text-[16px]';
		chevronRight.appendChild(chevronRightIcon);
		chevronRight.onclick = () => this._navigateToNextFile();
		this._fileCounter.appendChild(chevronRight);

		// Add widget to editor
		this._editor.addOverlayWidget(this);

		// Listen to edit service events
		this._store.add(this._editService.onDidChangeEditedFiles(() => {
			this._updateVisibility();
		}));

		this._store.add(this._editService.onDidAcceptFile(({ uri }) => {
			if (uri.toString() === this._uri.toString()) {
				this._updateVisibility();
			}
		}));

		this._store.add(this._editService.onDidRejectFile(({ uri }) => {
			if (uri.toString() === this._uri.toString()) {
				this._updateVisibility();
			}
		}));

		this._store.add(this._editService.onDidAcceptAll(() => {
			this._updateVisibility();
		}));

		this._store.add(this._editService.onDidRejectAll(() => {
			this._updateVisibility();
		}));

		// Initial layout
		this._layout();
		this._updateVisibility();
	}

	override dispose(): void {
		this._store.dispose();
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position ?? null;
	}

	/**
	 * Layout the widget at the bottom of the editor.
	 */
	private _layout(): void {
		try {
			const { height } = this._editor.getLayoutInfo();
			this._position = {
				stackOrdinal: 10,
				preference: {
					top: height - 52, // Position near bottom (12px from bottom + widget height)
					left: 0
				}
			};
			this._editor.layoutOverlayWidget(this);
		} catch (error) {
			this._logService.error('[VybeFileCommandBar] Error in layout', error);
		}
	}

	/**
	 * Update visibility based on whether file has pending diffs.
	 */
	private _updateVisibility(): void {
		try {
			const summary = this._editService.getEditedFile(this._uri);
			const hasPendingDiffs = summary?.hasPendingDiffs ?? false;

			if (hasPendingDiffs && !this._visible) {
				this._visible = true;
				this._domNode.style.display = 'block';
				this._domNode.style.pointerEvents = 'auto';
				this._updateCounters();
				this._layout();
			} else if (!hasPendingDiffs && this._visible) {
				this._visible = false;
				this._domNode.style.display = 'none';
				this._domNode.style.pointerEvents = 'none';
			} else if (hasPendingDiffs) {
				this._updateCounters();
			}
		} catch (error) {
			this._logService.error('[VybeFileCommandBar] Error updating visibility', error);
		}
	}

	/**
	 * Update diff and file counters.
	 * Counts only diffs that have visible widgets (not out-of-bounds or filtered out).
	 */
	private _updateCounters(): void {
		try {
			const summary = this._editService.getEditedFile(this._uri);
			if (summary) {
				// Count only diffs that have visible widgets/decorations
				// Get all pending diffs and filter to those that are actually visible
				const allDiffs = this._editService.getDiffsForFile(this._uri);
				const pendingDiffs = allDiffs.filter(d => d.state === 'pending' || d.state === 'streaming');

				// Filter to diffs that have valid ranges in the current model
				const model = this._editor.getModel();
				if (model) {
					const maxLine = model.getLineCount();
					const visibleDiffs = pendingDiffs.filter(diff => {
						// Check if the diff has a valid range in the current model
						if (diff.originalRange.isEmpty) {
							// Insertion: check if insert line is valid
							return diff.modifiedRange.startLineNumber <= maxLine + 1;
						} else {
							// Edit/deletion: check if original range is valid
							return diff.originalRange.startLineNumber <= maxLine;
						}
					});
					this._totalDiffs = visibleDiffs.length;
				} else {
					this._totalDiffs = summary.pendingDiffCount;
				}

				this._currentDiffIndex = Math.min(this._currentDiffIndex, this._totalDiffs);
				if (this._totalDiffs === 0) {
					this._currentDiffIndex = 0;
				} else {
					this._currentDiffIndex = Math.max(1, this._currentDiffIndex);
				}

				const counterText = this._diffCounter.querySelector('.opacity-60');
				if (counterText) {
					counterText.textContent = `${this._currentDiffIndex} / ${this._totalDiffs}`;
				}
			}

			const allFiles = this._editService.getEditedFiles();
			const filesWithPending = allFiles.filter(f => f.hasPendingDiffs);
			this._totalFiles = filesWithPending.length;
			const currentFileIndex = filesWithPending.findIndex(f => f.uri.toString() === this._uri.toString());
			this._currentFileIndex = currentFileIndex >= 0 ? currentFileIndex + 1 : 0;

			const fileCounterText = this._fileCounter.querySelector('.opacity-60');
			if (fileCounterText) {
				fileCounterText.textContent = `${this._currentFileIndex} / ${this._totalFiles} files`;
			}
		} catch (error) {
			this._logService.error('[VybeFileCommandBar] Error updating counters', error);
		}
	}

	/**
	 * Handle Keep All button click.
	 */
	private async _handleKeepAll(): Promise<void> {
		try {
			await this._editService.acceptFile(this._uri);
		} catch (error) {
			this._logService.error('[VybeFileCommandBar] Error accepting file', error);
		}
	}

	/**
	 * Handle Undo All button click.
	 */
	private async _handleUndoAll(): Promise<void> {
		try {
			await this._editService.rejectFile(this._uri);
		} catch (error) {
			this._logService.error('[VybeFileCommandBar] Error rejecting file', error);
		}
	}

	/**
	 * Navigate to next diff.
	 */
	private _navigateToNextDiff(): void {
		if (this._totalDiffs === 0) {
			return;
		}
		this._currentDiffIndex = (this._currentDiffIndex % this._totalDiffs) + 1;
		this._updateCounters();
		this._goToDiff(this._currentDiffIndex);
	}

	/**
	 * Navigate to previous diff.
	 */
	private _navigateToPreviousDiff(): void {
		if (this._totalDiffs === 0) {
			return;
		}
		this._currentDiffIndex = this._currentDiffIndex <= 1 ? this._totalDiffs : this._currentDiffIndex - 1;
		this._updateCounters();
		this._goToDiff(this._currentDiffIndex);
	}

	/**
	 * Navigate to next file.
	 */
	private _navigateToNextFile(): void {
		const allFiles = this._editService.getEditedFiles().filter(f => f.hasPendingDiffs);
		if (allFiles.length === 0) {
			return;
		}
		const nextIndex = (this._currentFileIndex % allFiles.length);
		// Note: File navigation would require editor service to open the file
		// For now, just update the counter
		this._currentFileIndex = nextIndex + 1;
		this._updateCounters();
	}

	/**
	 * Navigate to previous file.
	 */
	private _navigateToPreviousFile(): void {
		const allFiles = this._editService.getEditedFiles().filter(f => f.hasPendingDiffs);
		if (allFiles.length === 0) {
			return;
		}
		const prevIndex = this._currentFileIndex <= 2 ? allFiles.length - 1 : this._currentFileIndex - 2;
		// Note: File navigation would require editor service to open the file
		// For now, just update the counter
		this._currentFileIndex = prevIndex + 1;
		this._updateCounters();
	}

	/**
	 * Navigate to a specific diff by index.
	 */
	private _goToDiff(index: number): void {
		try {
			const diffAreas = this._diffService.getDiffAreasForUri(this._uri);
			if (diffAreas.length === 0) {
				return;
			}

			// Collect all pending diffs
			const pendingDiffs: Array<{ diff: any; lineNumber: number }> = [];
			for (const diffArea of diffAreas) {
				for (const diff of diffArea.diffs.values()) {
					if (diff.state === 'pending' || diff.state === 'streaming') {
						const lineNumber = diff.modifiedRange.startLineNumber;
						pendingDiffs.push({ diff, lineNumber });
					}
				}
			}

			// Sort by line number
			pendingDiffs.sort((a, b) => a.lineNumber - b.lineNumber);

			// Navigate to the diff at the specified index
			if (index > 0 && index <= pendingDiffs.length) {
				const targetDiff = pendingDiffs[index - 1];
				const model = this._editor.getModel();
				if (model) {
					const lineNumber = targetDiff.lineNumber;
					const position = new Position(lineNumber, 1);
					this._editor.setPosition(position);
					this._editor.revealLineInCenter(lineNumber);
				}
			}
		} catch (error) {
			this._logService.error('[VybeFileCommandBar] Error navigating to diff', error);
		}
	}
}

