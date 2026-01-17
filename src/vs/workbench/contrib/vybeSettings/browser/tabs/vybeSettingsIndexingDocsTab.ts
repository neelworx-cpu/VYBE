/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { toWorkspaceIdentifier, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IAnyWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import { IIndexService, IndexState, IndexStatus } from '../../../../services/indexing/common/indexService.js';
import { createSection, createCell } from '../vybeSettingsComponents.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import {
	CONFIG_CLOUD_INDEXING_ENABLED,
} from '../../../../services/indexing/common/indexingConfiguration.js';

// Local extension of IndexStatus used only by this UI.
// Backend may or may not provide these additional fields; they are all optional.
type ExtendedIndexStatus = IndexStatus & {
	// No additional fields for now; we keep this alias for clarity in the UI code.
};

function createHelpIcon(parent: HTMLElement, href: string): HTMLElement {
	const helpLink = DOM.append(parent, DOM.$('a.cursor-settings-help-icon'));
	helpLink.setAttribute('target', '_blank');
	helpLink.setAttribute('href', href);
	helpLink.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--cursor-icon-secondary);
		text-decoration: none;
		margin-left: 4px;
	`;

	const helpIcon = DOM.append(helpLink, DOM.$('span.codicon.codicon-question'));
	helpIcon.style.cssText = 'font-size: 14px;';

	return helpLink;
}

function createSecondaryButton(parent: HTMLElement, label: string): HTMLElement {
	const button = DOM.append(parent, DOM.$('div'));
	button.className = 'flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-secondary-button';
	button.setAttribute('data-click-ready', 'true');
	button.style.cssText = `
		font-size: 12px;
		line-height: 16px;
		box-sizing: border-box;
		min-height: 20px;
	`;

	const iconContainer = DOM.append(button, DOM.$('div'));
	iconContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 14px;';

	const plusIcon = DOM.append(iconContainer, DOM.$('span.codicon.codicon-plus'));
	plusIcon.className = 'codicon codicon-plus !text-[10px] opacity-70 !overflow-visible undefined';
	plusIcon.style.cssText = 'font-size: 10px; opacity: 0.7; overflow: visible;';

	const labelContainer = DOM.append(button, DOM.$('span.inline-flex.items-baseline.gap-[2px].min-w-0.overflow-hidden'));
	labelContainer.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';

	const labelSpan = DOM.append(labelContainer, DOM.$('span.truncate'));
	labelSpan.textContent = label;
	labelSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

	return button;
}

function createEmptyState(parent: HTMLElement, title: string, description: string, buttonLabel: string): HTMLElement {
	const emptyWrapper = DOM.append(parent, DOM.$('div.empty-state-wrapper'));
	emptyWrapper.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 24px;';

	const emptyContainer = DOM.append(emptyWrapper, DOM.$('div.empty-state-container'));
	emptyContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;';

	const emptyContent = DOM.append(emptyContainer, DOM.$('div.empty-state-content'));
	emptyContent.style.cssText = 'display: flex; flex-direction: column; gap: 4px; align-items: center;';

	const emptyTitle = DOM.append(emptyContent, DOM.$('p.empty-state-title'));
	emptyTitle.textContent = title;
	emptyTitle.style.cssText = `
		font-size: 14px;
		font-weight: 500;
		color: var(--vscode-foreground);
		margin: 0;
	`;

	const emptyDesc = DOM.append(emptyContent, DOM.$('p.empty-state-description'));
	emptyDesc.textContent = description;
	emptyDesc.style.cssText = `
		font-size: 12px;
		color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
		margin: 0;
	`;

	const emptyButton = DOM.append(emptyContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	emptyButton.textContent = buttonLabel;
	emptyButton.style.cssText = 'user-select: none; flex-shrink: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;';

	return emptyWrapper;
}

export function renderIndexingDocsTab(
	parent: HTMLElement,
	configurationService: IConfigurationService,
	workspaceContextService: IWorkspaceContextService,
	indexService: IIndexService,
	disposables: DisposableStore,
	commandService?: ICommandService
): void {
	// Get current workspace
	const workspace = workspaceContextService.getWorkspace();
	const workspaceIdentifier = toWorkspaceIdentifier(workspace);

	// Check if indexing is enabled (will be updated by toggle)
	let indexingEnabled = configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED) ?? false;

	// Use IAnyWorkspaceIdentifier - backend services handle both single-folder and workspace types
	// Don't convert single-folder to workspace format - this causes workspace key mismatches
	let indexingWorkspace: IAnyWorkspaceIdentifier | null = null;

	// Check if workspace has folders (either single folder or multi-root workspace)
	if (workspace.folders.length > 0) {
		if (isWorkspaceIdentifier(workspaceIdentifier) || isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
			// Pass workspace as-is - backend services compute canonical workspace keys correctly
			indexingWorkspace = workspaceIdentifier;
		}
	}

	const hasValidWorkspace = indexingWorkspace !== null && workspace.folders.length > 0;

	// Codebase section
	const codebaseSection = createSection(parent, 'Codebase');
	codebaseSection.id = 'cursor-settings-codebase-indexing';

	const codebaseSectionList = codebaseSection.querySelector('.cursor-settings-section-list') as HTMLElement;

	// Helper to fetch status with timeout - defined early so it can be used in config change listener
	const fetchStatusWithTimeout = async (workspace: IAnyWorkspaceIdentifier, timeoutMs: number = 5000): Promise<ExtendedIndexStatus | null> => {
		try {
			const statusPromise = (indexService as any).getStatus(workspace);
			const timeoutPromise = new Promise<null>((resolve) => {
				setTimeout(() => resolve(null), timeoutMs);
			});
			const status = await Promise.race([statusPromise, timeoutPromise]);
			return status as ExtendedIndexStatus | null;
		} catch (error) {
			// Return null on error - UI will show default state
			return null;
		}
	};

	// Enable Cloud Indexing toggle (first sub-section)
	const enableToggleSubSection = DOM.append(codebaseSectionList, DOM.$('.cursor-settings-sub-section'));
	const enableToggleCell = createCell(enableToggleSubSection, {
		label: 'Enable Cloud Indexing',
		description: 'Enable cloud-based codebase indexing for semantic search and retrieval.',
		action: {
			type: 'switch',
			checked: indexingEnabled
		}
	});

	// Wire up the toggle
	const enableToggleSwitch = enableToggleCell.querySelector('.solid-switch') as HTMLElement;
	if (enableToggleSwitch) {
		const updateToggleVisual = (checked: boolean) => {
			const bgFill = enableToggleSwitch.querySelector('.solid-switch-bg-fill') as HTMLElement;
			const knob = enableToggleSwitch.querySelector('.solid-switch-knob') as HTMLElement;
			if (bgFill && knob) {
				enableToggleSwitch.style.background = checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
				bgFill.style.opacity = checked ? '1' : '0';
				bgFill.style.width = checked ? '100%' : '0%';
				knob.style.left = checked ? 'calc(100% - 16px)' : '2px';
				enableToggleSwitch.setAttribute('data-checked', String(checked));
			}
		};

		disposables.add(addDisposableListener(enableToggleSwitch, EventType.CLICK, (e) => {
			e.stopPropagation();
			const current = configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED) ?? false;
			const newValue = !current;
			updateToggleVisual(newValue);
			configurationService.updateValue(CONFIG_CLOUD_INDEXING_ENABLED, newValue);
			// Refresh UI (will read updated value from config service)
			updateProgressUI(currentStatus);
		}));

		// Listen to config changes
		disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_CLOUD_INDEXING_ENABLED)) {
				const newValue = configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED) ?? false;
				updateToggleVisual(newValue);

				// If indexing was just enabled and we don't have a status yet, create a default one
				// This prevents the UI from getting stuck on "Loading..." while waiting for service creation
				if (newValue && hasValidWorkspace && indexingWorkspace && !currentStatus) {
					const defaultStatus: ExtendedIndexStatus = {
						workspace: indexingWorkspace as any,
						state: IndexState.Idle,
						totalFiles: 0,
						indexedFiles: 0,
						totalChunks: 0,
						embeddedChunks: 0,
						paused: false,
						modelDownloadState: 'ready',
					};
					currentStatus = defaultStatus;
					// Try to fetch real status in background
					setTimeout(async () => {
						const realStatus = await fetchStatusWithTimeout(indexingWorkspace!, 5000);
						if (realStatus) {
							currentStatus = realStatus;
							updateProgressUI(realStatus);
						}
					}, 200);
				}

				// Refresh UI (will read updated value from config service)
				updateProgressUI(currentStatus);
			}
		}));
	}

	// Second sub-section: Codebase Indexing with progress
	const indexingSubSection = DOM.append(codebaseSectionList, DOM.$('.cursor-settings-sub-section'));
	const indexingSubSectionList = DOM.append(indexingSubSection, DOM.$('.cursor-settings-sub-section-list'));
	indexingSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	// Codebase Indexing cell
	const indexingCell = DOM.append(indexingSubSectionList, DOM.$('.cursor-settings-cell.cursor-settings-cell-align-top'));
	indexingCell.style.cssText = `
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 12px;
		position: relative;
	`;

	const indexingCellContent = DOM.append(indexingCell, DOM.$('div'));
	indexingCellContent.style.cssText = `
		display: flex;
		align-items: flex-start;
		gap: 20px;
	`;

	const indexingLeading = DOM.append(indexingCellContent, DOM.$('.cursor-settings-cell-leading-items'));
	indexingLeading.style.cssText = 'display: flex; flex-direction: column; gap: 1px; flex: 1;';

	const indexingLabel = DOM.append(indexingLeading, DOM.$('p.cursor-settings-cell-label'));
	indexingLabel.style.cssText = `
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-foreground);
		line-height: 16px;
		display: flex;
		align-items: center;
	`;

	const indexingLabelText = DOM.append(indexingLabel, DOM.$('span'));
	indexingLabelText.textContent = 'Codebase Indexing';

	createHelpIcon(indexingLabel, 'https://cursor.com/docs/context/codebase-indexing');

	const indexingDesc = DOM.append(indexingLeading, DOM.$('div.cursor-settings-cell-description'));
	indexingDesc.style.cssText = `
		font-size: 12px;
		color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
		line-height: 16px;
	`;

	const descText1 = document.createTextNode('Embed codebase for improved contextual understanding and knowledge. Embeddings and metadata are stored in the cloud, but all code is stored locally.');
	indexingDesc.appendChild(descText1);

	const indexingTrailing = DOM.append(indexingCellContent, DOM.$('.cursor-settings-cell-trailing-items'));
	indexingTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

	// Status pill and vector indicator will be added to modelStatusContainer (left side) later
	const statusPill = DOM.$('div.indexing-status-pill');
	statusPill.style.cssText = `
		user-select: none;
		flex-shrink: 0;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		line-height: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)));
		color: var(--vscode-foreground);
		background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
		transition: all 0.2s ease;
	`;

	const statusPillIcon = DOM.append(statusPill, DOM.$('span.codicon'));
	statusPillIcon.style.cssText = 'font-size: 13px; display: inline-flex; align-items: center;';

	const statusPillText = DOM.append(statusPill, DOM.$('span'));
	statusPillText.textContent = 'Loading...';

	// Vector readiness indicator will be added to modelStatusContainer (left side) later
	const vectorIndicator = DOM.$('div.vector-indicator');
	vectorIndicator.style.cssText = `
		user-select: none;
		flex-shrink: 0;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		line-height: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)));
		color: var(--vscode-foreground);
		background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.05));
		transition: all 0.2s ease;
	`;
	const vectorIcon = DOM.append(vectorIndicator, DOM.$('span.codicon'));
	vectorIcon.style.cssText = 'font-size: 13px; display: inline-flex; align-items: center;';
	const vectorText = DOM.append(vectorIndicator, DOM.$('span'));
	vectorText.textContent = 'Loading...';
	vectorIndicator.title = 'Vector: Loading...';

	// Progress container (inside the same cell) - single progress bar like Cursor
	const progressContainer = DOM.append(indexingCell, DOM.$('div.indexing-progress'));
	progressContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-top: 8px;';

	// Single Indexing Progress Bar
	const progressBarContainer = DOM.append(progressContainer, DOM.$('div.indexing-progress-container'));
	progressBarContainer.setAttribute('role', 'progressbar');
	progressBarContainer.id = 'indexing-progress-container';
	progressBarContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

	const progressBar = DOM.append(progressBarContainer, DOM.$('div.indexing-progress-bar'));
	progressBar.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

	const progressLabelContainer = DOM.append(progressBar, DOM.$('div.indexing-progress-label-container'));
	progressLabelContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

	const progressValueLabel = DOM.append(progressLabelContainer, DOM.$('div.indexing-progress-value-label'));
	progressValueLabel.style.cssText = 'font-size: 12px; color: var(--vscode-foreground);';

	const progressTrack = DOM.append(progressBar, DOM.$('div.indexing-progress-track'));
	progressTrack.style.cssText = `
		width: 100%;
		height: 6px;
		background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
		border-radius: 3px;
		overflow: hidden;
		position: relative;
	`;

	const progressFill = DOM.append(progressTrack, DOM.$('div.indexing-progress-fill'));
	progressFill.style.cssText = `
		width: 0%;
		height: 100%;
		background-color: rgb(85, 165, 131);
		border-radius: 4px;
		transition: width 0.3s ease, background-color 0.3s ease;
	`;

	const progressDetails = DOM.append(progressBarContainer, DOM.$('div.indexing-progress-details'));
	progressDetails.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));';

	// Buttons footer - single row with all controls
	const progressFooter = DOM.append(progressContainer, DOM.$('div.indexing-progress-footer'));
	progressFooter.style.cssText = 'display: flex; gap: 8px; justify-content: space-between; align-items: center;';

	// Left side: Status pill and Vector indicator
	const leftStatusRow = DOM.append(progressFooter, DOM.$('div.left-status-row'));
	leftStatusRow.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 1; min-width: 0;';

	// Add status pill to left side
	DOM.append(leftStatusRow, statusPill);

	// Add vector indicator to left side
	DOM.append(leftStatusRow, vectorIndicator);

	// Right side: Toggle (Play/Pause), Sync, Delete buttons
	const rightButtonsRow = DOM.append(progressFooter, DOM.$('div.right-buttons-row'));
	rightButtonsRow.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

	// Button style shared by all buttons
	const buttonStyle = `
		user-select: none;
		flex-shrink: 0;
		padding: 3px 6px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 12px;
		line-height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.3));
		color: var(--vscode-foreground);
		background: transparent;
	`;

	// Toggle button (Play/Pause combined)
	const toggleButton = DOM.append(rightButtonsRow, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	toggleButton.style.cssText = buttonStyle;
	const toggleIcon = DOM.append(toggleButton, DOM.$('span.codicon.codicon-play'));
	toggleIcon.style.cssText = 'font-size: 12px;';
	toggleButton.title = 'Start indexing';
	toggleButton.setAttribute('aria-label', 'Start indexing');
	toggleButton.setAttribute('tabindex', '0');
	toggleButton.setAttribute('role', 'button');

	// Sync button
	const syncButtonContainer = DOM.append(rightButtonsRow, DOM.$('div'));
	syncButtonContainer.style.cssText = 'display: flex;';

	const syncButton = DOM.append(syncButtonContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	syncButton.style.cssText = `
		user-select: none;
		flex-shrink: 0;
		padding: 3px 6px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 12px;
		line-height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.3));
		color: var(--vscode-foreground);
		background: transparent;
	`;

	const syncIcon = DOM.append(syncButton, DOM.$('span.codicon.codicon-refresh'));
	syncIcon.style.cssText = 'font-size: 12px;';
	syncButton.title = 'Sync index';
	syncButton.setAttribute('aria-label', 'Sync index');
	syncButton.setAttribute('tabindex', '0');
	syncButton.setAttribute('role', 'button');

	// Delete Index button
	const deleteButtonContainer = DOM.append(rightButtonsRow, DOM.$('div'));
	deleteButtonContainer.style.cssText = 'display: flex;';

	const deleteButton = DOM.append(deleteButtonContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	deleteButton.style.cssText = syncButton.style.cssText;

	const deleteIcon = DOM.append(deleteButton, DOM.$('span.codicon.codicon-trash'));
	deleteIcon.style.cssText = 'font-size: 12px;';
	deleteButton.title = 'Delete index';
	deleteButton.setAttribute('aria-label', 'Delete index');
	deleteButton.setAttribute('tabindex', '0');
	deleteButton.setAttribute('role', 'button');


	// Store last formatted timestamp to avoid recalculation on every update
	let lastFormattedTimestamp: { time: number; formatted: string } | null = null;

	// Removed: File change feedback tracking and context preview UI elements

	// Function to update progress UI based on status
	const updateProgressUI = (status: ExtendedIndexStatus | null) => {
		// Get current indexing enabled state (may have changed via toggle)
		const currentIndexingEnabled = configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED) ?? false;

		// UI update (verbose logging removed)
		// Phase 12: Update status pill
		if (!hasValidWorkspace) {
			statusPillIcon.className = 'codicon codicon-folder';
			statusPillText.textContent = 'No Workspace';
			statusPill.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
			statusPill.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
			statusPill.style.color = 'var(--vscode-foreground)';
			statusPillIcon.style.color = 'var(--vscode-foreground)';
		} else if (!currentIndexingEnabled) {
			statusPillIcon.className = 'codicon codicon-circle-outline';
			statusPillText.textContent = 'Disabled';
			statusPill.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
			statusPill.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
			statusPill.style.color = 'var(--vscode-foreground)';
			statusPillIcon.style.color = 'var(--vscode-foreground)';
		} else if (!status) {
			statusPillIcon.className = 'codicon codicon-loading codicon-modifier-spin';
			statusPillText.textContent = 'Loading...';
			statusPill.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
			statusPill.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
			statusPill.style.color = 'var(--vscode-foreground)';
			statusPillIcon.style.color = 'var(--vscode-foreground)';
		} else {
			const state = status.state;
			if (status.paused) {
				statusPillIcon.className = 'codicon codicon-debug-pause';
				statusPillText.textContent = 'Paused';
				statusPill.style.backgroundColor = 'rgba(255, 200, 0, 0.25)';
				statusPill.style.borderColor = 'rgba(255, 200, 0, 0.4)';
				statusPill.style.color = 'var(--vscode-foreground)';
				statusPillIcon.style.color = 'var(--vscode-foreground)';
			} else if (status.rebuilding) {
				statusPillIcon.className = 'codicon codicon-loading codicon-modifier-spin';
				statusPillText.textContent = 'Rebuilding';
				statusPill.style.backgroundColor = 'rgba(0, 100, 255, 0.25)';
				statusPill.style.borderColor = 'rgba(0, 100, 255, 0.4)';
				statusPill.style.color = 'var(--vscode-foreground)';
				statusPillIcon.style.color = 'var(--vscode-foreground)';
			} else if (state === IndexState.Building || state === IndexState.Indexing) {
				statusPillIcon.className = 'codicon codicon-sync codicon-modifier-spin';
				statusPillText.textContent = 'Building';
				statusPill.style.backgroundColor = 'rgba(0, 100, 255, 0.25)';
				statusPill.style.borderColor = 'rgba(0, 100, 255, 0.4)';
				statusPill.style.color = 'var(--vscode-foreground)';
				statusPillIcon.style.color = 'var(--vscode-foreground)';
			} else if (state === IndexState.Ready) {
				statusPillIcon.className = 'codicon codicon-verified-filled';
				statusPillText.textContent = 'Ready';
				statusPill.style.backgroundColor = 'rgba(0, 200, 0, 0.2)';
				statusPill.style.borderColor = 'rgba(0, 200, 0, 0.4)';
				statusPill.style.color = 'rgb(0, 150, 0)';
				statusPillIcon.style.color = 'rgb(0, 150, 0)';
				statusPill.title = 'Index is ready and up to date';
			} else if (state === IndexState.Degraded || state === IndexState.Error) {
				statusPillIcon.className = 'codicon codicon-warning';
				statusPillText.textContent = state === IndexState.Degraded ? 'Degraded' : 'Error';
				statusPill.style.backgroundColor = 'rgba(255, 0, 0, 0.25)';
				statusPill.style.borderColor = 'rgba(255, 0, 0, 0.4)';
				statusPill.style.color = 'var(--vscode-foreground)';
				statusPillIcon.style.color = 'var(--vscode-foreground)';
			} else if (state === IndexState.Idle || state === IndexState.Uninitialized) {
				statusPillIcon.className = 'codicon codicon-circle-outline';
				statusPillText.textContent = 'Idle';
				statusPill.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
				statusPill.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
				statusPill.style.color = 'var(--vscode-foreground)';
				statusPillIcon.style.color = 'var(--vscode-foreground)';
			} else {
				statusPillIcon.className = 'codicon codicon-loading codicon-modifier-spin';
				statusPillText.textContent = 'Loading...';
				statusPill.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
				statusPill.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
				statusPill.style.color = 'var(--vscode-foreground)';
				statusPillIcon.style.color = 'var(--vscode-foreground)';
			}
		}

		// Phase 12: Update vector readiness indicator (cloud indexing uses Pinecone)
		if (hasValidWorkspace && currentIndexingEnabled) {
			if (status && status.state === IndexState.Ready) {
				vectorIcon.className = 'codicon codicon-cloud';
				vectorText.textContent = 'Pinecone';
				vectorIndicator.style.backgroundColor = 'rgba(85, 165, 255, 0.15)';
				vectorIndicator.style.borderColor = 'rgba(85, 165, 255, 0.4)';
				vectorIndicator.style.color = 'rgb(50, 130, 220)';
				vectorIcon.style.color = 'rgb(50, 130, 220)';
				vectorIndicator.title = 'Vector: Pinecone (Cloud)';
			} else if (status) {
				vectorIcon.className = 'codicon codicon-cloud';
				vectorText.textContent = 'Pinecone';
				vectorIndicator.style.backgroundColor = 'rgba(150, 150, 150, 0.15)';
				vectorIndicator.style.borderColor = 'rgba(150, 150, 150, 0.3)';
				vectorIndicator.style.color = 'rgb(120, 120, 120)';
				vectorIcon.style.color = 'rgb(120, 120, 120)';
				vectorIndicator.title = 'Vector: Pinecone (Indexing...)';
			} else {
				vectorIcon.className = 'codicon codicon-loading codicon-modifier-spin';
				vectorText.textContent = 'Loading...';
				vectorIndicator.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
				vectorIndicator.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
				vectorIndicator.style.color = 'var(--vscode-foreground)';
				vectorIcon.style.color = 'var(--vscode-foreground)';
				vectorIndicator.title = 'Vector: Loading...';
			}
		} else {
			vectorIcon.className = 'codicon codicon-cloud';
			vectorText.textContent = 'N/A';
			vectorIndicator.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
			vectorIndicator.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
			vectorIndicator.style.color = 'var(--vscode-foreground)';
			vectorIcon.style.color = 'var(--vscode-foreground)';
			vectorIndicator.title = 'Vector: Not available';
		}

		// Update toggle button (combined Play/Pause)
		if (status) {
			const isIndexing = status.state === IndexState.Building || status.state === IndexState.Indexing;
			const isPaused = status.paused;
			const isRebuilding = status.rebuilding;

			// Toggle button: shows pause icon when indexing, play icon when paused/idle
			if (isPaused) {
				toggleIcon.className = 'codicon codicon-play';
				toggleButton.title = 'Resume indexing';
				toggleButton.setAttribute('aria-label', 'Resume indexing');
				toggleButton.style.opacity = '1';
				toggleButton.style.pointerEvents = 'auto';
			} else if (isIndexing && !isRebuilding) {
				toggleIcon.className = 'codicon codicon-debug-pause';
				toggleButton.title = 'Pause indexing';
				toggleButton.setAttribute('aria-label', 'Pause indexing');
				toggleButton.style.opacity = '1';
				toggleButton.style.pointerEvents = 'auto';
			} else {
				// Idle or rebuilding - show play to start/resume
				toggleIcon.className = 'codicon codicon-play';
				toggleButton.title = 'Start indexing';
				toggleButton.setAttribute('aria-label', 'Start indexing');
				toggleButton.style.opacity = isRebuilding ? '0.5' : '1';
				toggleButton.style.pointerEvents = isRebuilding ? 'none' : 'auto';
			}
		} else {
			toggleIcon.className = 'codicon codicon-play';
			toggleButton.title = 'Start indexing';
			toggleButton.setAttribute('aria-label', 'Start indexing');
			toggleButton.style.opacity = '0.5';
			toggleButton.style.pointerEvents = 'none';
		}

		// Model status UI removed - cloud indexing doesn't need model download status

		if (!hasValidWorkspace || !currentIndexingEnabled) {
			// No workspace or indexing disabled
			progressValueLabel.textContent = 'Not indexed';
			progressFill.style.width = '0%';
			if (!hasValidWorkspace) {
				progressDetails.textContent = 'Open a workspace folder to start indexing.';
			} else {
				progressDetails.textContent = 'Enable cloud indexing to start indexing your codebase.';
			}
			progressBarContainer.setAttribute('aria-valuenow', '0');
			progressBarContainer.setAttribute('aria-valuetext', 'Not indexed');

			syncButton.style.opacity = '0.5';
			syncButton.style.pointerEvents = 'none';
			deleteButton.style.opacity = '0.5';
			deleteButton.style.pointerEvents = 'none';
			lastFormattedTimestamp = null;
			return;
		}

		// Indexing is enabled and workspace is valid
		if (!status) {
			// Status is null but indexing is enabled - show loading state
			progressValueLabel.textContent = 'Loading...';
			progressFill.style.width = '0%';
			progressDetails.textContent = 'Loading index status...';
			progressBarContainer.setAttribute('aria-valuenow', '0');
			progressBarContainer.setAttribute('aria-valuetext', 'Loading');

			syncButton.style.opacity = '0.5';
			syncButton.style.pointerEvents = 'none';
			deleteButton.style.opacity = '0.5';
			deleteButton.style.pointerEvents = 'none';
			lastFormattedTimestamp = null;
			return;
		}

		// Update model status (now that we know status exists)
		// Remove the duplicate check we added earlier since we handle it above

		const indexedFiles = status.indexedFiles ?? status.indexedFileCount ?? 0;
		// CRITICAL FIX: Handle case where totalFiles is 0 but indexedFiles > 0 (Windows-specific issue)
		// If totalFiles is undefined or 0, but we have indexed files, use indexedFiles as the total
		// This prevents showing 0% when we actually have files indexed (e.g., 81 files indexed but 0% shown)
		let totalFiles = status.totalFiles ?? 0;

		// Windows-specific fix: If totalFiles is 0 but we have indexed files, use indexedFiles as total
		// This handles the case where the database query returns 0 for totalFiles but files are actually indexed
		// This is a known issue on Windows where totalFiles might not be tracked correctly
		// Guard: only apply this fix when we are truly in a completed/ready state, otherwise it can
		// incorrectly show 100% for partial cloud indexes (e.g., after restart).
		if (totalFiles === 0 && indexedFiles > 0 && status.state === IndexState.Ready && !!status.lastFullScanTime) {
			// If totalFiles is 0 but we have indexed files, use indexedFiles as the total
			// This ensures percentage calculation works: 81/81 = 100% instead of 81/0 = undefined
			totalFiles = indexedFiles;
		}

		// Calculate indexing percentage (single progress bar like Cursor)
		// Shows decimals for smooth progress (0.1%, 1.2%, 99.9%, 100%)
		let percentage = 0;

		if (indexedFiles > 0) {
			if (totalFiles > 0) {
				const rawPercentage = (indexedFiles / totalFiles) * 100;
				// Round to 1 decimal place, allow up to 100% during any state
				percentage = Math.min(100, Math.max(0.1, Math.round(rawPercentage * 10) / 10));
			} else {
				// totalFiles is 0 but we have indexed files - show 100% (tracking issue)
				percentage = 100;
			}
		} else if (indexedFiles === 0 && totalFiles > 0) {
			// No files indexed yet, but we know the total - show 0%
			percentage = 0;
		} else {
			// No files indexed and no total - show 0%
			percentage = 0;
		}

		// Update progress bar
		progressFill.style.width = `${percentage}%`;
		progressBarContainer.setAttribute('aria-valuenow', String(percentage));
		progressBarContainer.setAttribute('aria-valuetext', `${percentage}%`);

		// Update structural indexing status
		switch (status.state) {
			case IndexState.Uninitialized:
			case IndexState.Idle:
				// CRITICAL FIX: Use calculated percentage if we have indexed files, don't hardcode 0%
				// This fixes Windows issue where state is Idle but files are indexed
				progressValueLabel.textContent = `${percentage}%`;
				progressFill.style.width = `${percentage}%`;
				// Reset to normal green when not paused
				progressFill.style.backgroundColor = 'rgb(85, 165, 131)'; // Green
				// After rebuild, show 0 files indexed (not stale totalFiles count)
				if (indexedFiles === 0 && totalFiles === 0) {
					progressDetails.textContent = 'Not indexed • Click Sync to start indexing.';
				} else if (indexedFiles === 0 && totalFiles > 0) {
					progressDetails.textContent = `0 files indexed of ${totalFiles.toLocaleString()} discovered • Click Sync to start indexing.`;
				} else {
					// Show actual counts if they exist (Windows fix: shows "81 files indexed" with correct percentage)
					progressDetails.textContent = `${indexedFiles.toLocaleString()} files indexed`;
				}
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
			case IndexState.Building:
			case IndexState.Indexing: {
				progressValueLabel.textContent = `${percentage}%`;
				const totalChunksIndexing = status.totalChunks ?? 0;

				// Check if paused - show different message and yellow progress bar
				if (status.paused) {
					let pausedText = `Indexing paused - ${indexedFiles.toLocaleString()} of ${totalFiles.toLocaleString()} files`;
					if (totalChunksIndexing > 0) {
						pausedText += ` (${totalChunksIndexing.toLocaleString()} chunks)`;
					}
					progressDetails.textContent = pausedText;
					// Make progress bar yellow when paused
					progressFill.style.backgroundColor = 'rgb(255, 200, 0)'; // Yellow
				} else if (status.state === IndexState.Building) {
					// Building phase (file discovery / warm-up)
					progressDetails.textContent = 'Starting indexing...';
					progressFill.style.backgroundColor = 'rgb(85, 165, 131)'; // Green
				} else {
					// Not paused - normal indexing state
					// If we're structurally complete (100% or indexedFiles >= totalFiles),
					// keep showing the "X files indexed" message instead of "Indexing X/Y"
					// to avoid the confusing "Indexing 17/17 files" state after completion.
					if (indexedFiles < totalFiles && percentage < 100) {
						let indexingText = `Indexing... ${indexedFiles.toLocaleString()} of ${totalFiles.toLocaleString()} files`;
						if (totalChunksIndexing > 0) {
							indexingText += ` (${totalChunksIndexing.toLocaleString()} chunks)`;
						}
						progressDetails.textContent = indexingText;
					} else {
						let completedText = `${indexedFiles.toLocaleString()} files indexed`;
						if (totalChunksIndexing > 0) {
							completedText += ` (${totalChunksIndexing.toLocaleString()} chunks)`;
						}
						progressDetails.textContent = completedText;
					}
					// Normal green progress bar
					progressFill.style.backgroundColor = 'rgb(85, 165, 131)'; // Green
				}
				syncButton.style.opacity = '0.5';
				syncButton.style.pointerEvents = 'none';
				break;
			}
			case IndexState.Degraded: {
				progressValueLabel.textContent = `${percentage}%`;
				progressFill.style.backgroundColor = 'rgb(255, 140, 0)'; // Orange
				const reason = status.degradedReason || status.lastErrorMessage || status.errorMessage || 'Indexing incomplete';
				if (totalFiles > 0) {
					progressDetails.textContent = `${reason} • ${indexedFiles.toLocaleString()} of ${totalFiles.toLocaleString()} files indexed`;
				} else {
					progressDetails.textContent = reason;
				}
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
			}
			case IndexState.Ready:
			case IndexState.Stale: {
				progressValueLabel.textContent = `${percentage}%`;
				progressFill.style.backgroundColor = 'rgb(85, 165, 131)'; // Green
				// Task C: Show files indexed, and optionally chunks (vectors) for completeness
				const totalChunks = status.totalChunks ?? 0;
				let detailsText = `${indexedFiles.toLocaleString()} files indexed`;
				if (totalChunks > 0) {
					detailsText += ` (${totalChunks.toLocaleString()} chunks)`;
				}
				progressDetails.textContent = detailsText;
				// Only show "Last synced" when indexing is truly complete (100% and Ready state)
				if (status.lastIndexedTime && status.state === IndexState.Ready && percentage === 100 && indexedFiles >= totalFiles) {
					// Only recalculate timestamp if lastIndexedTime actually changed
					const lastIndexed = new Date(status.lastIndexedTime);
					if (!lastFormattedTimestamp || lastFormattedTimestamp.time !== status.lastIndexedTime) {
						lastFormattedTimestamp = {
							time: status.lastIndexedTime,
							formatted: formatTimeAgo(lastIndexed)
						};
					}
					progressDetails.textContent += ` • Last synced ${lastFormattedTimestamp.formatted}`;
				}
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
			}
			case IndexState.Error:
				progressValueLabel.textContent = 'Error';
				progressDetails.textContent = status.errorMessage || 'An error occurred during indexing.';
				progressFill.style.width = '0%';
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
		}

		// Model download status removed - cloud indexing uses Voyage AI API (no local model)

		deleteButton.style.opacity = indexedFiles > 0 ? '1' : '0.5';
		deleteButton.style.pointerEvents = indexedFiles > 0 ? 'auto' : 'none';
	};

	// Helper function to format time ago
	const formatTimeAgo = (date: Date): string => {
		const now = Date.now();
		const diff = now - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		return `${days}d ago`;
	};

	// Load initial status - show loading state while fetching
	let currentStatus: ExtendedIndexStatus | null = null;
	if (hasValidWorkspace && indexingEnabled && indexingWorkspace) {
		// Show loading state immediately
		progressValueLabel.textContent = 'Loading...';
		progressDetails.textContent = 'Loading index status...';

		// Wait a brief moment for auto-index check to run, then get status
		// This prevents showing stale data (e.g., "1 file" from file watcher) before full scan completes
		setTimeout(async () => {
			const status = await fetchStatusWithTimeout(indexingWorkspace, 5000);
			if (status) {
				currentStatus = status;
				updateProgressUI(status);
			} else {
				// Timeout or error - show default idle state instead of stuck "Loading..."
				const defaultStatus: ExtendedIndexStatus = {
					workspace: indexingWorkspace as any,
					state: IndexState.Idle,
					totalFiles: 0,
					indexedFiles: 0,
					totalChunks: 0,
					embeddedChunks: 0,
					paused: false,
					modelDownloadState: 'ready',
				};
				currentStatus = defaultStatus;
				updateProgressUI(defaultStatus);
			}
		}, 150); // Wait 150ms for auto-index check to potentially start (it runs after 100ms)
	} else {
		updateProgressUI(null);
	}

	// Listen to status changes
	if (hasValidWorkspace && indexingEnabled && indexingWorkspace) {
		disposables.add(indexService.onDidChangeStatus((status) => {
			// Status event received (detailed counts logged in ext host)
			// Compare workspace using canonical keys to handle different representations
			// Both single-folder and workspace formats should match if they represent the same workspace
			let statusWorkspaceKey: string;
			if (isSingleFolderWorkspaceIdentifier(status.workspace)) {
				statusWorkspaceKey = status.workspace.uri.fsPath.replace(/[/\\]+$/, '').replace(/\\/g, '/');
			} else if (isWorkspaceIdentifier(status.workspace) && status.workspace.configPath) {
				const configPath = URI.isUri(status.workspace.configPath) ? status.workspace.configPath.fsPath : status.workspace.configPath;
				statusWorkspaceKey = configPath.replace(/[/\\]+$/, '').replace(/\\/g, '/');
			} else {
				statusWorkspaceKey = status.workspace.id;
			}

			let currentWorkspaceKey: string;
			if (isSingleFolderWorkspaceIdentifier(indexingWorkspace)) {
				currentWorkspaceKey = indexingWorkspace.uri.fsPath.replace(/[/\\]+$/, '').replace(/\\/g, '/');
			} else if (isWorkspaceIdentifier(indexingWorkspace) && indexingWorkspace.configPath) {
				const configPath = URI.isUri(indexingWorkspace.configPath) ? indexingWorkspace.configPath.fsPath : indexingWorkspace.configPath;
				currentWorkspaceKey = configPath.replace(/[/\\]+$/, '').replace(/\\/g, '/');
			} else {
				currentWorkspaceKey = indexingWorkspace.id;
			}

			// Update if workspace keys match (canonical comparison)
			if (statusWorkspaceKey === currentWorkspaceKey || (indexingWorkspace && status.workspace.id === indexingWorkspace.id)) {
				currentStatus = status;
				updateProgressUI(status);
			}
		}));

		// Poll for status updates (configurable, default 5s) - with timeout protection
		const pollIntervalMs = configurationService.getValue<number>('vybe.localIndexing.statusPollInterval') ?? 5000;
		const pollInterval = setInterval(async () => {
			const status = await fetchStatusWithTimeout(indexingWorkspace!, 3000); // Shorter timeout for polling
			if (status) {
				// Only update if values actually changed to prevent flickering
				// Compare all relevant fields to detect real changes
				// Use strict equality checks and ignore timestamp-only changes
				const hasChanged = !currentStatus ||
					currentStatus.embeddedChunks !== status.embeddedChunks ||
					currentStatus.totalChunks !== status.totalChunks ||
					currentStatus.embeddingPending !== status.embeddingPending ||
					currentStatus.embeddingInProgress !== status.embeddingInProgress ||
					currentStatus.embeddingActiveBatches !== status.embeddingActiveBatches ||
					currentStatus.state !== status.state ||
					currentStatus.indexedFiles !== status.indexedFiles ||
					currentStatus.totalFiles !== status.totalFiles ||
					currentStatus.modelDownloadState !== status.modelDownloadState ||
					currentStatus.modelDownloadProgress !== status.modelDownloadProgress ||
					currentStatus.modelDownloadMessage !== status.modelDownloadMessage;

				// Only update if values actually changed - don't update on timestamp-only changes
				// This prevents flickering when status is polled but nothing actually changed
				if (hasChanged) {
					currentStatus = status;
					updateProgressUI(status);
				}
			}
			// If status fetch fails/times out, keep current status (don't reset to loading)
		}, pollIntervalMs);

		disposables.add({ dispose: () => clearInterval(pollInterval) });
	}

	// Removed: Recent Indexing Activity section
	// Removed: Context Preview section (dev-only)

	// Wire up toggle button (combined Play/Pause) - calls service methods directly for instant action
	addDisposableListener(toggleButton, EventType.CLICK, async () => {
		if (!indexingWorkspace || !hasValidWorkspace || !indexingEnabled) {
			return;
		}

		try {
			// Check current state to determine action
			if (currentStatus?.paused) {
				// Currently paused - resume (no dialog for quick toggle)
				await indexService.resume(indexingWorkspace);
			} else if (currentStatus?.state === IndexState.Building || currentStatus?.state === IndexState.Indexing) {
				// Currently indexing - pause (no dialog for quick toggle)
				await indexService.pause(indexingWorkspace, 'User toggled pause');
			} else {
				// Idle/Ready - start indexing
				const tokenSource = new CancellationTokenSource();
				disposables.add(tokenSource);
				const anyIndexService = indexService as any;
				if (typeof anyIndexService.buildFullIndex === 'function') {
					await anyIndexService.buildFullIndex(indexingWorkspace, tokenSource.token);
				}
			}
		} catch (error) {
			// Ignore errors - status will be updated via events
		}
	});

	// Removed: Context preview event handler

	// Wire up Sync button
	let syncInProgress = false;
	const syncIconEl = syncButton.querySelector('.codicon') as HTMLElement;
	addDisposableListener(syncButton, EventType.CLICK, async () => {
		if (!hasValidWorkspace || !indexingEnabled || !indexingWorkspace || syncInProgress) {
			return;
		}

		syncInProgress = true;
		syncButton.style.opacity = '0.5';
		syncButton.style.pointerEvents = 'none';
		if (syncIconEl) {
			// Remove refresh icon and add loading spinner with spin modifier
			syncIconEl.classList.remove('codicon-refresh');
			syncIconEl.classList.add('codicon-loading', 'codicon-modifier-spin');
		}

		try {
			const tokenSource = new CancellationTokenSource();
			disposables.add(tokenSource);
			// Use incremental sync instead of full reindex
			// This will only index changed/new files, not all files
			// Add timeout to prevent hanging forever (5 minutes max)
			const anyIndexService = indexService as any;
			let syncPromise: Promise<any>;
			if (typeof anyIndexService.refreshIndex === 'function') {
				syncPromise = anyIndexService.refreshIndex(indexingWorkspace, tokenSource.token);
			} else if (typeof anyIndexService.buildFullIndex === 'function') {
				syncPromise = anyIndexService.buildFullIndex(indexingWorkspace, tokenSource.token);
			} else if (typeof anyIndexService.refreshPaths === 'function') {
				// Best-effort fallback for older IndexService versions
				syncPromise = anyIndexService.refreshPaths(indexingWorkspace, [], tokenSource.token);
			} else {
				syncPromise = Promise.resolve();
			}
			const timeoutPromise = new Promise<IndexStatus>((_, reject) => {
				setTimeout(() => {
					tokenSource.cancel();
					reject(new Error('Sync operation timed out after 5 minutes'));
				}, 5 * 60 * 1000); // 5 minutes
			});
			await Promise.race([syncPromise, timeoutPromise]);
		} catch (error) {
			// Refresh status to get current state
			try {
				const latestStatus = await (indexService as any).getStatus(indexingWorkspace!);
				updateProgressUI(latestStatus as ExtendedIndexStatus);
			} catch {
				updateProgressUI({
					workspace: indexingWorkspace as any,
					state: IndexState.Error,
					errorMessage: error instanceof Error ? error.message : 'Unknown error'
				} as ExtendedIndexStatus);
			}
		} finally {
			syncInProgress = false;
			if (syncIconEl) {
				// Remove loading spinner and restore refresh icon
				syncIconEl.classList.remove('codicon-loading', 'codicon-modifier-spin');
				syncIconEl.classList.add('codicon-refresh');
			}
			syncButton.style.opacity = '1';
			syncButton.style.pointerEvents = 'auto';
		}
	});

	// Wire up Delete Index button
	addDisposableListener(deleteButton, EventType.CLICK, async () => {
		if (!hasValidWorkspace || !indexingEnabled || !indexingWorkspace || !currentStatus || (currentStatus.indexedFiles ?? 0) === 0) {
			return;
		}

		// Show confirmation (for now, just proceed - can add dialog later)
		const confirmed = confirm('Are you sure you want to delete the index? This will remove all indexed data for this workspace.');
		if (!confirmed) {
			return;
		}

		deleteButton.style.opacity = '0.5';
		deleteButton.style.pointerEvents = 'none';

		try {
			const anyIndexService = indexService as any;
			if (typeof anyIndexService.deleteIndex === 'function') {
				// Delete all index data for this workspace when supported
				await anyIndexService.deleteIndex(indexingWorkspace);
				// Status will be updated via the onDidChangeStatus event
			} else {
				// Older backends may not support deleteIndex; treat as no-op
			}
		} catch (error) {
			updateProgressUI({
				workspace: indexingWorkspace as any,
				state: IndexState.Error,
				errorMessage: error instanceof Error ? error.message : 'Failed to delete index'
			} as ExtendedIndexStatus);
		} finally {
			deleteButton.style.opacity = '1';
			deleteButton.style.pointerEvents = 'auto';
		}
	});


	// Second sub-section: Index New Folders and Ignore Files
	const settingsSubSection = DOM.append(codebaseSectionList, DOM.$('.cursor-settings-sub-section'));
	const settingsSubSectionList = DOM.append(settingsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	settingsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	createCell(settingsSubSectionList, {
		label: 'Index New Folders',
		description: 'Automatically index any new folders with fewer than 50,000 files',
		action: { type: 'switch', checked: true }
	});

	// Ignore Files cell with Edit button
	const ignoreCell = createCell(settingsSubSectionList, {
		label: 'Ignore Files in .cursorignore',
		description: 'Files to exclude from indexing in addition to .gitignore. View included files.',
		action: null,
		hasDivider: true
	});

	// Update description to include link
	const ignoreDesc = ignoreCell.querySelector('.cursor-settings-cell-description') as HTMLElement;
	if (ignoreDesc) {
		DOM.clearNode(ignoreDesc);
		ignoreDesc.style.cssText = `
			font-size: 12px;
			color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
			line-height: 16px;
		`;

		const ignoreDescText1 = document.createTextNode('Files to exclude from indexing in addition to .gitignore. ');
		ignoreDesc.appendChild(ignoreDescText1);

		const viewLink = DOM.append(ignoreDesc, DOM.$('span.settings__item_link'));
		viewLink.textContent = 'View included files.';
		viewLink.style.cssText = 'cursor: pointer; text-decoration: underline; color: var(--vscode-textLink-foreground);';

		// Update trailing items to have Edit button
		const ignoreTrailing = ignoreCell.querySelector('.cursor-settings-cell-trailing-items') as HTMLElement;
		if (ignoreTrailing) {
			DOM.clearNode(ignoreTrailing);
			ignoreTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

			const editButtonContainer = DOM.append(ignoreTrailing, DOM.$('div'));
			editButtonContainer.style.cssText = 'display: flex;';

			const editButton = DOM.append(editButtonContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
			editButton.textContent = 'Edit';
			editButton.style.cssText = 'user-select: none; flex-shrink: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;';
		}
	}

	// Docs section
	const docsSection = createSection(parent, null);
	docsSection.id = 'cursor-settings-docs';

	const docsHeader = DOM.append(docsSection, DOM.$('.cursor-settings-section-header'));
	docsHeader.style.cssText = 'display: flex; align-items: flex-end; gap: 20px; padding: 0 8px;';

	const docsLeading = DOM.append(docsHeader, DOM.$('.cursor-settings-section-header-leading-items'));
	docsLeading.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

	const docsTitleRow = DOM.append(docsLeading, DOM.$('.cursor-settings-section-header-title-row'));
	docsTitleRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';

	const docsTitle = DOM.append(docsTitleRow, DOM.$('.cursor-settings-section-header-title'));
	docsTitle.textContent = 'Docs';
	docsTitle.style.cssText = `
		font-size: 12px;
		font-weight: 400;
		color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
		letter-spacing: 0.07px;
		line-height: 14px;
	`;

	const docsDesc = DOM.append(docsLeading, DOM.$('.cursor-settings-section-header-description'));
	docsDesc.textContent = 'Crawl and index custom resources and developer docs';
	docsDesc.style.cssText = `
		font-size: 12px;
		color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
		line-height: 16px;
	`;

	const docsTrailing = DOM.append(docsHeader, DOM.$('.cursor-settings-section-header-trailing-items'));
	docsTrailing.style.cssText = 'flex-shrink: 0;';

	// Replace Add Doc text button with icon-only button + tooltip
	const addDocBtn = createSecondaryButton(docsTrailing, '');
	const addDocIcon = addDocBtn.querySelector('.codicon');
	if (addDocIcon) {
		addDocIcon.classList.remove('codicon-plus');
		addDocIcon.classList.add('codicon-add');
	}
	const addDocLabel = addDocBtn.querySelector('span.truncate') as HTMLElement;
	if (addDocLabel) addDocLabel.textContent = '';
	addDocBtn.title = 'Add doc';
	addDocBtn.setAttribute('aria-label', 'Add doc');
	addDocBtn.setAttribute('tabindex', '0');
	addDocBtn.setAttribute('role', 'button');

	const docsSectionList = DOM.append(docsSection, DOM.$('.cursor-settings-section-list'));
	docsSectionList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

	const docsSubSection = DOM.append(docsSectionList, DOM.$('.cursor-settings-sub-section'));
	const docsSubSectionList = DOM.append(docsSubSection, DOM.$('.cursor-settings-sub-section-list'));
	docsSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	createEmptyState(docsSubSectionList, 'No Docs Added', 'Add documentation to use as context. You can also use @Add in Chat or while editing to add a doc.', 'Add Doc');

	// Simple “Export Diagnostics” entry at the bottom of the Docs card.
	const diagnosticsContainer = DOM.append(docsSubSectionList, DOM.$('div.cursor-settings-cell'));
	diagnosticsContainer.style.cssText = `
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px 12px 12px;
		border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.2)));
	`;

	// Convert export diagnostics to icon+tooltip and remove label text
	const diagnosticsLabel = DOM.append(diagnosticsContainer, DOM.$('span'));
	diagnosticsLabel.textContent = '';
	diagnosticsLabel.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.8));';

	const diagnosticsButton = DOM.append(diagnosticsContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	diagnosticsButton.style.cssText = `
		user-select: none;
		flex-shrink: 0;
		padding: 3px 6px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 12px;
		line-height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.3));
		color: var(--vscode-foreground);
		background: transparent;
	`;
	const diagnosticsIcon = DOM.append(diagnosticsButton, DOM.$('span.codicon codicon-save')) as HTMLElement;
	if (diagnosticsIcon) {
		diagnosticsIcon.className = 'codicon codicon-save';
		diagnosticsIcon.style.cssText = 'font-size: 12px;';
	}
	diagnosticsButton.title = 'Export index diagnostics';
	diagnosticsButton.setAttribute('aria-label', 'Export index diagnostics');
	diagnosticsButton.setAttribute('tabindex', '0');
	diagnosticsButton.setAttribute('role', 'button');

	addDisposableListener(diagnosticsButton, EventType.CLICK, async () => {
		if (!hasValidWorkspace || !indexingEnabled || !indexingWorkspace) {
			return;
		}

		const anyIndexService = indexService as any;
		if (typeof anyIndexService.getDiagnostics !== 'function') {
			return;
		}

		try {
			const diagnostics = await anyIndexService.getDiagnostics(indexingWorkspace);
			const json = JSON.stringify(diagnostics, null, 2);

			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				await navigator.clipboard.writeText(json);
				diagnosticsLabel.textContent = 'Diagnostics copied to clipboard';
				setTimeout(() => {
					diagnosticsLabel.textContent = 'Export Index Diagnostics (JSON)';
				}, 2500);
			} else {
				const blob = new Blob([json], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = 'vybe-index-diagnostics.json';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
			}
		} catch {
			// Ignore export failures; users can retry.
		}
	});

	// Local Indexing and Advanced Settings sections removed - using cloud indexing instead
}
