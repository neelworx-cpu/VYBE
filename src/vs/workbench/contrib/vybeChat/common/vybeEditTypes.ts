/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Edit System - Core Type Definitions
 * Defines the foundational types for AI edit-transaction, diff, and checkpoint system.
 */

import { URI } from '../../../../base/common/uri.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { ICodeEditor, IOverlayWidget, IViewZone } from '../../../../editor/browser/editorBrowser.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';

/**
 * State of an individual diff change.
 */
export const enum DiffState {
	Pending = 'pending',
	Streaming = 'streaming',
	Accepted = 'accepted',
	Rejected = 'rejected'
}

/**
 * State of an edit transaction lifecycle.
 * DiffState tracks individual diff changes, while EditTransactionState tracks the overall transaction lifecycle.
 */
export const enum EditTransactionState {
	Pending = 'pending',
	Streaming = 'streaming',
	Completed = 'completed',
	Accepted = 'accepted',
	Rejected = 'rejected'
}

/**
 * A single line-level change within a DiffArea.
 */
export interface Diff {
	/** Unique identifier for this diff */
	readonly diffId: string;
	/** Parent DiffArea identifier */
	readonly diffAreaId: string;
	/** File URI this diff applies to */
	readonly uri: URI;
	/** Original code range in the baseline */
	readonly originalRange: LineRange;
	/** Modified code range in the current model */
	readonly modifiedRange: LineRange;
	/** Original code content */
	readonly originalCode: string;
	/** Modified code content */
	readonly modifiedCode: string;
	/** Current state of this diff */
	readonly state: DiffState;
	/** Optional stream request ID for streaming diffs */
	readonly streamRequestId?: string;
}

/**
 * A logical group of diffs in a file.
 * Represents a region of code with AI-generated changes.
 */
export interface DiffArea {
	/** Unique identifier for this diff area */
	readonly diffAreaId: string;
	/** File URI this diff area applies to */
	readonly uri: URI;
	/** All diffs in this area, keyed by diffId */
	readonly diffs: Map<string, Diff>;
	/** Immutable baseline snapshot at transaction start */
	readonly originalSnapshot: string;
	/** Timestamp when this diff area was created */
	readonly createdAt: number;
}

/**
 * Editor-attached visualization state for a DiffArea.
 * Manages decorations, overlay widgets, and view zones for displaying diffs in the editor.
 */
export interface DiffZone {
	/** Associated DiffArea identifier */
	readonly diffAreaId: string;
	/** Editor instance this zone is attached to */
	readonly editor: ICodeEditor;
	/** Decoration collection for visual highlights */
	readonly decorations: IEditorDecorationsCollection;
	/** Optional overlay widget for accept/reject controls */
	readonly overlayWidget?: IOverlayWidget;
	/** Optional view zones for showing original code in deleted regions */
	readonly viewZones?: IViewZone[];
	/** Whether this zone is currently streaming */
	readonly isStreaming: boolean;
	/** Optional stream request ID */
	readonly streamRequestId?: string;
}

/**
 * Snapshot for undo/redo across multiple files.
 * Enables checkpoint-based navigation through edit history.
 */
export interface Checkpoint {
	/** Unique identifier for this checkpoint */
	readonly checkpointId: string;
	/** Epoch number for ordering checkpoints */
	readonly epoch: number;
	/** Human-readable label */
	readonly label: string;
	/** File content snapshots at checkpoint time, keyed by URI */
	readonly fileSnapshots: Map<URI, string>;
	/** Creation timestamp */
	readonly timestamp: number;
	/** Optional description */
	readonly description?: string;
}

/**
 * Aggregated summary of edits for a single file.
 * Provides session-level statistics for UI consumption.
 */
export interface VybeEditedFileSummary {
	/** File URI */
	readonly uri: URI;
	/** Total number of lines added across all diffs */
	readonly addedLines: number;
	/** Total number of lines removed across all diffs */
	readonly removedLines: number;
	/** Total number of diffs in this file */
	readonly diffCount: number;
	/** Number of diffs in pending state */
	readonly pendingDiffCount: number;
	/** Number of diffs in streaming state */
	readonly streamingDiffCount: number;
	/** Number of diffs in accepted state */
	readonly acceptedDiffCount: number;
	/** Number of diffs in rejected state */
	readonly rejectedDiffCount: number;
	/** Whether this file has any pending diffs */
	readonly hasPendingDiffs: boolean;
	/** Whether this file has any streaming diffs */
	readonly hasStreamingDiffs: boolean;
	/** Timestamp of most recent diff change (creation or state update) */
	readonly lastModified: number;
}

