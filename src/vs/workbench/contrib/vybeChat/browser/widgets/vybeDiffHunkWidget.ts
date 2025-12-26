/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Diff Hunk Widget
 * Per-diff overlay widget that displays Accept/Reject buttons for individual diffs.
 */

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { Diff, DiffState } from '../../common/vybeEditTypes.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { $ } from '../../../../../base/browser/dom.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';

/**
 * Overlay widget for displaying Accept/Reject buttons for a single diff.
 */
export class VybeDiffHunkWidget extends Disposable implements IOverlayWidget {
	private static _idPool = 0;
	private readonly _id: string = `vybe-diff-hunk-widget-${VybeDiffHunkWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _outerContainer: HTMLElement;
	private readonly _hoverContainer: HTMLElement;
	private readonly _acceptButton: HTMLElement;
	private readonly _rejectButton: HTMLElement;
	protected override readonly _store: DisposableStore;

	private _position: IOverlayWidgetPosition | undefined;
	private _lastStartLineNumber: number | undefined;
	private _removed: boolean = false;
	private _visible: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _diff: Diff,
		@IVybeEditService private readonly _editService: IVybeEditService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._store = this._register(new DisposableStore());

		// Create root container
		this._domNode = document.createElement('div');
		this._domNode.className = 'acceptRejectPartialEditOverlay';
		this._domNode.style.display = 'none';
		this._domNode.style.pointerEvents = 'none';

		// Create outer container
		this._outerContainer = document.createElement('div');
		this._outerContainer.className = 'inline-diff-outer-container';
		this._domNode.appendChild(this._outerContainer);

		// Create hover container (button bar)
		this._hoverContainer = document.createElement('div');
		this._hoverContainer.className = 'inline-diff-hover-container';
		this._outerContainer.appendChild(this._hoverContainer);

		// Create Accept button
		this._acceptButton = $('button.hoverButton.partialHoverButton', { 'data-click-ready': 'true' });
		const acceptButtonContent = document.createElement('span');
		acceptButtonContent.className = 'inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden';
		const acceptButtonText = document.createElement('span');
		acceptButtonText.textContent = 'Keep';
		const acceptButtonKeybinding = document.createElement('span');
		acceptButtonKeybinding.className = 'text-[10px] opacity-50 keybinding-font-settings shrink-0';
		acceptButtonKeybinding.textContent = '⌘Y';
		acceptButtonContent.appendChild(acceptButtonText);
		acceptButtonContent.appendChild(acceptButtonKeybinding);
		this._acceptButton.appendChild(acceptButtonContent);
		this._acceptButton.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._handleAccept();
		};
		this._hoverContainer.appendChild(this._acceptButton);

		// Create Reject button
		this._rejectButton = $('button.hoverButton.partialHoverButton.secondary-button', { 'data-click-ready': 'true' });
		const rejectButtonContent = document.createElement('span');
		rejectButtonContent.className = 'inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden';
		const rejectButtonText = document.createElement('span');
		rejectButtonText.textContent = 'Undo';
		const rejectButtonKeybinding = document.createElement('span');
		rejectButtonKeybinding.className = 'text-[10px] opacity-50 keybinding-font-settings shrink-0';
		rejectButtonKeybinding.textContent = '⌘N';
		rejectButtonContent.appendChild(rejectButtonText);
		rejectButtonContent.appendChild(rejectButtonKeybinding);
		this._rejectButton.appendChild(rejectButtonContent);
		this._rejectButton.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._handleReject();
		};
		this._hoverContainer.appendChild(this._rejectButton);

		// Add widget to editor
		this._editor.addOverlayWidget(this);

		// Listen to diff state changes
		this._store.add(this._editService.onDidAcceptDiff(({ diffId }) => {
			if (diffId === this._diff.diffId) {
				this._updateVisibility();
			}
		}));

		this._store.add(this._editService.onDidRejectDiff(({ diffId }) => {
			if (diffId === this._diff.diffId) {
				this._updateVisibility();
			}
		}));

		// Listen to scroll/layout changes for repositioning
		this._store.add(this._editor.onDidScrollChange(() => {
			if (this._lastStartLineNumber !== undefined && this._visible) {
				this.layout(this._lastStartLineNumber);
			}
		}));

		this._store.add(this._editor.onDidLayoutChange(() => {
			if (this._lastStartLineNumber !== undefined && this._visible) {
				this.layout(this._lastStartLineNumber);
			}
		}));
	}

	override dispose(): void {
		this._store.dispose();
		this._editor.removeOverlayWidget(this);
		this._removed = true;
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
	 * Layout the widget BELOW the diff background (at the end of the decoration range).
	 * Uses Void's robust positioning logic but positions at end line + 1 line height for consistency.
	 * @param decorationStartLine The start line from the decoration (used to find end line)
	 */
	layout(decorationStartLine: number): void {
		try {
			const layoutInfo = this._editor.getLayoutInfo();
			const scrollTop = this._editor.getScrollTop();
			const model = this._editor.getModel();
			if (!model) {
				return;
			}

			// ROBUST POSITIONING: Position at END of decoration range + 1 line height (below the diff background)
			// This ensures buttons always appear below the diff, not over it
			const isInsertion = this._diff.originalRange.isEmpty;
			const isDeletion = this._diff.modifiedRange.isEmpty;

			let endLine: number;

			if (isDeletion) {
				// For deletions: decoration is at modifiedRange.startLineNumber (single line)
				// Position below that line
				endLine = Math.min(this._diff.modifiedRange.startLineNumber, model.getLineCount());
			} else if (isInsertion) {
				// For insertions: decoration spans modifiedRange.startLineNumber to endLineNumberExclusive - 1
				// Position below the last line of the insertion
				endLine = Math.min(this._diff.modifiedRange.endLineNumberExclusive - 1, model.getLineCount());
			} else {
				// For edits: decoration spans modifiedRange (full range)
				// Position below the last line of the edit
				endLine = Math.min(this._diff.modifiedRange.endLineNumberExclusive - 1, model.getLineCount());
			}

			// Clamp end line to model bounds
			const clampedEndLine = Math.max(1, Math.min(endLine, model.getLineCount()));
			const lineHeight = this._editor.getOption(EditorOption.lineHeight);

			// Calculate top position: end line top + 1 line height (position below the diff)
			const lineTop = this._editor.getTopForLineNumber(clampedEndLine);
			const widgetTop = lineTop + lineHeight - scrollTop; // +1 line height to position below

			// Calculate widget width (need to measure it)
			const widgetWidth = this._domNode.offsetWidth || 150; // Fallback width

			// Position at right edge (matching Void's robust horizontal positioning)
			// Void: leftPx = layoutInfo.width - minimapWidth - verticalScrollbarWidth - buttonWidth
			const minimapWidth = layoutInfo.minimap.minimapWidth;
			const verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
			const widgetLeft = layoutInfo.width - minimapWidth - verticalScrollbarWidth - widgetWidth;

			this._position = {
				stackOrdinal: 1,
				preference: {
					top: widgetTop,
					left: widgetLeft
				}
			};

			if (this._removed) {
				this._removed = false;
				this._editor.addOverlayWidget(this);
			} else {
				this._editor.layoutOverlayWidget(this);
			}

			// Store the end line for scroll updates
			this._lastStartLineNumber = clampedEndLine;
		} catch (error) {
			this._logService.error('[VybeDiffHunkWidget] Error in layout', error);
		}
	}

	/**
	 * Show or hide the widget.
	 */
	toggle(show: boolean): void {
		if (this._visible === show) {
			return;
		}

		this._visible = show;

		if (show) {
			// Only show if diff is still pending or streaming
			if (this._diff.state === DiffState.Pending || this._diff.state === DiffState.Streaming) {
				this._domNode.style.display = 'block';
				this._domNode.style.pointerEvents = 'auto';
				if (this._lastStartLineNumber !== undefined) {
					this.layout(this._lastStartLineNumber);
				}
			}
		} else {
			this._domNode.style.display = 'none';
			this._domNode.style.pointerEvents = 'none';
		}
	}

	/**
	 * Remove the widget from the editor (but keep it for potential reuse).
	 */
	remove(): void {
		this._editor.removeOverlayWidget(this);
		this._removed = true;
		this._visible = false;
		this._domNode.style.display = 'none';
	}

	/**
	 * Update the widget for a new diff (used when diff changes during streaming).
	 */
	update(diff: Diff): void {
		// Update internal diff reference
		(this as any)._diff = diff;
		this._updateVisibility();
	}

	/**
	 * Handle Accept button click.
	 */
	private async _handleAccept(): Promise<void> {
		try {
			// CRITICAL: Check if diff still exists before accepting
			// After recomputation, diffs are deleted and recreated with new IDs
			// If this widget has a stale diff, the operation will fail
			// In that case, the widget should have been disposed and recreated
			// But we check here as a safety guard
			const diff = this._editService.getDiffsForFile(this._diff.uri).find(d => d.diffId === this._diff.diffId);
			if (!diff) {
				this._logService.warn(`[VybeDiffHunkWidget] Diff ${this._diff.diffId.substring(0, 8)} no longer exists, widget is stale`);
				// Widget is stale, dispose it
				this.dispose();
				return;
			}
			await this._editService.acceptDiff(this._diff.diffId);
		} catch (error) {
			this._logService.error('[VybeDiffHunkWidget] Error accepting diff', error);
		}
	}

	/**
	 * Handle Reject button click.
	 */
	private async _handleReject(): Promise<void> {
		try {
			// CRITICAL: Check if diff still exists before rejecting
			// After recomputation, diffs are deleted and recreated with new IDs
			// If this widget has a stale diff, the operation will fail
			// In that case, the widget should have been disposed and recreated
			// But we check here as a safety guard
			const diff = this._editService.getDiffsForFile(this._diff.uri).find(d => d.diffId === this._diff.diffId);
			if (!diff) {
				this._logService.warn(`[VybeDiffHunkWidget] Diff ${this._diff.diffId.substring(0, 8)} no longer exists, widget is stale`);
				// Widget is stale, dispose it
				this.dispose();
				return;
			}
			await this._editService.rejectDiff(this._diff.diffId);
		} catch (error) {
			this._logService.error('[VybeDiffHunkWidget] Error rejecting diff', error);
		}
	}

	/**
	 * Update visibility based on diff state.
	 */
	private _updateVisibility(): void {
		if (this._diff.state === DiffState.Accepted || this._diff.state === DiffState.Rejected) {
			this.toggle(false);
			this.remove();
		}
	}

	/**
	 * Get the start line number for this widget.
	 */
	getStartLineNumber(): number | undefined {
		return this._lastStartLineNumber;
	}

	/**
	 * Check if the widget is currently visible.
	 */
	isVisible(): boolean {
		return this._visible;
	}
}

