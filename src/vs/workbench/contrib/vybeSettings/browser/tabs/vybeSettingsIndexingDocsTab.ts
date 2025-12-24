/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { toWorkspaceIdentifier, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IAnyWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import { IIndexService, IndexState, IndexStatus } from '../../../../services/indexing/common/indexService.js';
import { createSection, createCell, createCellWithNumberInput } from '../vybeSettingsComponents.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import {
	CONFIG_ENABLE_LOCAL_INDEXING,
	CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH,
	CONFIG_ENABLE_LOCAL_INDEX_WATCHER,
	CONFIG_ENABLE_LOCAL_EMBEDDINGS,
	CONFIG_MAX_CONCURRENT_JOBS,
	CONFIG_INDEX_BATCH_SIZE,
	CONFIG_INDEX_DEBOUNCE_MS,
	CONFIG_INDEX_STORAGE_PATH,
	CONFIG_EMBEDDING_MODEL,
	CONFIG_EMBEDDING_BATCH_SIZE,
	CONFIG_SEARCH_TOP_K,
	CONFIG_LEXICAL_ROW_LIMIT
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

	// Check if indexing is enabled
	const indexingEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;

	// Use IAnyWorkspaceIdentifier - backend services handle both single-folder and workspace types
	// Don't convert single-folder to workspace format - this causes workspace key mismatches
	let indexingWorkspace: IAnyWorkspaceIdentifier | null = null;
	if (isWorkspaceIdentifier(workspaceIdentifier) || isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
		// Pass workspace as-is - backend services compute canonical workspace keys correctly
		indexingWorkspace = workspaceIdentifier;
	}

	const hasValidWorkspace = indexingWorkspace !== null;

	// Codebase section
	const codebaseSection = createSection(parent, 'Codebase');
	codebaseSection.id = 'cursor-settings-codebase-indexing';

	const codebaseSectionList = codebaseSection.querySelector('.cursor-settings-section-list') as HTMLElement;

	// First sub-section: Codebase Indexing with progress
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

	const descText1 = document.createTextNode('Index your codebase for improved contextual understanding. All data is stored locally.');
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

	// Phase 12: Error banner (initially hidden)
	const errorBanner = DOM.append(indexingCell, DOM.$('div.indexing-error-banner'));
	errorBanner.style.cssText = `
		display: none;
		padding: 10px 12px;
		margin-bottom: 12px;
		border-radius: 6px;
		background-color: rgba(255, 0, 0, 0.1);
		border-left: 3px solid rgba(255, 0, 0, 0.5);
		color: var(--vscode-errorForeground);
		font-size: 12px;
	`;
	const errorBannerText = DOM.append(errorBanner, DOM.$('div'));
	errorBannerText.style.cssText = 'margin-bottom: 4px;';
	const errorBannerDismiss = DOM.append(errorBanner, DOM.$('button'));
	errorBannerDismiss.textContent = 'Dismiss';
	errorBannerDismiss.style.cssText = `
		margin-top: 4px;
		padding: 2px 6px;
		font-size: 11px;
		cursor: pointer;
		border: 1px solid rgba(255, 0, 0, 0.3);
		border-radius: 4px;
		background: transparent;
		color: var(--vscode-errorForeground);
	`;
	let errorBannerCollapsed = false;
	addDisposableListener(errorBannerDismiss, EventType.CLICK, () => {
		errorBannerCollapsed = !errorBannerCollapsed;
		if (errorBannerCollapsed) {
			errorBanner.style.display = 'none';
		}
	});

	// Progress container (inside the same cell) - now with two progress bars
	const progressContainer = DOM.append(indexingCell, DOM.$('div.indexing-progress'));
	progressContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px; margin-top: 8px;';

	// Structural Indexing Progress Bar
	const structuralProgressContainer = DOM.append(progressContainer, DOM.$('div.indexing-progress-container'));
	structuralProgressContainer.setAttribute('role', 'progressbar');
	structuralProgressContainer.id = 'structural-indexing-progress-container';
	structuralProgressContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

	const structuralProgressBar = DOM.append(structuralProgressContainer, DOM.$('div.indexing-progress-bar'));
	structuralProgressBar.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

	const structuralProgressLabelContainer = DOM.append(structuralProgressBar, DOM.$('div.indexing-progress-label-container'));
	structuralProgressLabelContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

	const structuralProgressTitle = DOM.append(structuralProgressLabelContainer, DOM.$('div.indexing-progress-title'));
	structuralProgressTitle.textContent = 'Structural Indexing';
	structuralProgressTitle.style.cssText = 'font-size: 12px; font-weight: 500; color: var(--vscode-foreground);';

	const structuralProgressValueLabel = DOM.append(structuralProgressLabelContainer, DOM.$('div.indexing-progress-value-label'));
	structuralProgressValueLabel.style.cssText = 'font-size: 12px; color: var(--vscode-foreground);';

	const structuralProgressTrack = DOM.append(structuralProgressBar, DOM.$('div.indexing-progress-track'));
	structuralProgressTrack.style.cssText = `
		width: 100%;
		height: 8px;
		background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
		border-radius: 4px;
		overflow: hidden;
		position: relative;
	`;

	const structuralProgressFill = DOM.append(structuralProgressTrack, DOM.$('div.indexing-progress-fill'));
	structuralProgressFill.style.cssText = `
		width: 0%;
		height: 100%;
		background-color: rgb(85, 165, 131);
		border-radius: 4px;
		transition: width 0.3s ease;
	`;

	const structuralProgressDetails = DOM.append(structuralProgressContainer, DOM.$('div.indexing-progress-details'));
	structuralProgressDetails.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));';

	// Semantic Indexing (Embeddings) Progress Bar
	const embeddingProgressContainer = DOM.append(progressContainer, DOM.$('div.indexing-progress-container'));
	embeddingProgressContainer.setAttribute('role', 'progressbar');
	embeddingProgressContainer.id = 'embedding-indexing-progress-container';
	embeddingProgressContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

	const embeddingProgressBar = DOM.append(embeddingProgressContainer, DOM.$('div.indexing-progress-bar'));
	embeddingProgressBar.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

	const embeddingProgressLabelContainer = DOM.append(embeddingProgressBar, DOM.$('div.indexing-progress-label-container'));
	embeddingProgressLabelContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

	const embeddingProgressTitle = DOM.append(embeddingProgressLabelContainer, DOM.$('div.indexing-progress-title'));
	embeddingProgressTitle.textContent = 'Semantic Indexing (Embeddings)';
	embeddingProgressTitle.style.cssText = 'font-size: 12px; font-weight: 500; color: var(--vscode-foreground);';

	const embeddingProgressValueLabel = DOM.append(embeddingProgressLabelContainer, DOM.$('div.indexing-progress-value-label'));
	embeddingProgressValueLabel.style.cssText = 'font-size: 12px; color: var(--vscode-foreground);';

	const embeddingProgressTrack = DOM.append(embeddingProgressBar, DOM.$('div.indexing-progress-track'));
	embeddingProgressTrack.style.cssText = `
		width: 100%;
		height: 8px;
		background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
		border-radius: 4px;
		overflow: hidden;
		position: relative;
	`;

	const embeddingProgressFill = DOM.append(embeddingProgressTrack, DOM.$('div.indexing-progress-fill'));
	embeddingProgressFill.style.cssText = `
		width: 0%;
		height: 100%;
		background-color: rgb(85, 165, 131);
		border-radius: 4px;
		transition: width 0.3s ease;
	`;

	const embeddingProgressDetails = DOM.append(embeddingProgressContainer, DOM.$('div.indexing-progress-details'));
	embeddingProgressDetails.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));';

	// Pause/Resume/Rebuild buttons will be moved to buttonContainer (right side) later
	const pauseButton = DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small');
	pauseButton.style.cssText = `
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
	const pauseIcon = DOM.append(pauseButton, DOM.$('span.codicon.codicon-debug-pause'));
	pauseIcon.style.cssText = 'font-size: 12px;';
	pauseButton.title = 'Pause Indexing';
	pauseButton.setAttribute('aria-label', 'Pause Indexing');

	// Buttons footer - two rows
	const progressFooter = DOM.append(progressContainer, DOM.$('div.indexing-progress-footer'));
	progressFooter.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

	// Row 1: Status pill, Vector indicator on LEFT | Pause, Resume, Rebuild on RIGHT
	const row1 = DOM.append(progressFooter, DOM.$('div.indexing-footer-row'));
	row1.style.cssText = 'display: flex; gap: 8px; justify-content: space-between; align-items: center;';

	// Left side: Status pill and Vector indicator
	const leftStatusRow1 = DOM.append(row1, DOM.$('div.left-status-row1'));
	leftStatusRow1.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 1; min-width: 0;';

	// Add status pill to left side
	DOM.append(leftStatusRow1, statusPill);

	// Add vector indicator to left side
	DOM.append(leftStatusRow1, vectorIndicator);

	// Right side: Pause, Resume, Rebuild buttons
	const rightButtonsRow1 = DOM.append(row1, DOM.$('div.right-buttons-row1'));
	rightButtonsRow1.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

	// Add pause/resume/rebuild buttons to right side
	DOM.append(rightButtonsRow1, pauseButton);

	const resumeButton = DOM.append(rightButtonsRow1, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	resumeButton.style.cssText = pauseButton.style.cssText;
	const resumeIcon = DOM.append(resumeButton, DOM.$('span.codicon.codicon-play'));
	resumeIcon.style.cssText = 'font-size: 12px;';
	resumeButton.title = 'Resume Indexing';
	resumeButton.setAttribute('aria-label', 'Resume Indexing');

	const rebuildButton = DOM.append(rightButtonsRow1, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	rebuildButton.style.cssText = pauseButton.style.cssText;
	const rebuildIcon = DOM.append(rebuildButton, DOM.$('span.codicon.codicon-build'));
	rebuildIcon.style.cssText = 'font-size: 12px;';
	rebuildButton.title = 'Rebuild Index';
	rebuildButton.setAttribute('aria-label', 'Rebuild Index');

	// Divider line (between row 1 and row 2)
	const divider = DOM.append(progressFooter, DOM.$('.cursor-settings-cell-divider'));
	divider.style.cssText = `
		position: relative;
		width: 100%;
		height: 1px;
		background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.15));
	`;

	// Row 2: Model status on LEFT | Sync, Delete Index on RIGHT
	const row2 = DOM.append(progressFooter, DOM.$('div.indexing-footer-row'));
	row2.style.cssText = 'display: flex; gap: 8px; justify-content: space-between; align-items: center;';

	// Left side: Model status
	const leftStatusRow2 = DOM.append(row2, DOM.$('div.left-status-row2'));
	leftStatusRow2.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 1; min-width: 0;';

	// Model download status message (shown on the left of buttons) - styled like sync button
	const modelStatusContainer = DOM.append(leftStatusRow2, DOM.$('div.model-status-container'));
	modelStatusContainer.style.cssText = `
		display: flex;
		align-items: center;
		padding: 3px 6px;
		font-size: 12px;
		line-height: 16px;
		color: var(--vscode-foreground);
		min-width: 0;
		flex-shrink: 1;
		gap: 4px;
		border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.3));
		border-radius: 5px;
		background: transparent;
	`;

	// Text comes first (on the left)
	const modelStatusText = DOM.append(modelStatusContainer, DOM.$('span.model-status-text'));
	modelStatusText.style.cssText = 'line-height: 16px;';

	// Circular progress indicator container (replaces icon when downloading)
	// Size matches codicon (16px) to prevent height changes
	const modelStatusProgressCircle = DOM.append(modelStatusContainer, DOM.$('div.model-status-progress-circle'));
	modelStatusProgressCircle.style.cssText = `
		width: 16px;
		height: 16px;
		position: relative;
		display: none;
		flex-shrink: 0;
	`;

	// SVG for circular progress - use proper SVG namespace, size matches codicon
	const progressSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	progressSvg.setAttribute('width', '16');
	progressSvg.setAttribute('height', '16');
	progressSvg.style.cssText = 'transform: rotate(-90deg);';
	modelStatusProgressCircle.appendChild(progressSvg);

	// Background circle (radius 6 for 16px SVG, leaving 2px margin)
	const progressBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	progressBg.setAttribute('cx', '8');
	progressBg.setAttribute('cy', '8');
	progressBg.setAttribute('r', '6');
	progressBg.setAttribute('fill', 'none');
	progressBg.setAttribute('stroke', 'rgba(128, 128, 128, 0.3)');
	progressBg.setAttribute('stroke-width', '1.5');
	progressSvg.appendChild(progressBg);

	// Progress circle
	const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	progressCircle.setAttribute('cx', '8');
	progressCircle.setAttribute('cy', '8');
	progressCircle.setAttribute('r', '6');
	progressCircle.setAttribute('fill', 'none');
	progressCircle.setAttribute('stroke', 'var(--vscode-foreground)');
	progressCircle.setAttribute('stroke-width', '1.5');
	progressCircle.setAttribute('stroke-linecap', 'round');
	const circumference = 2 * Math.PI * 6; // ≈ 37.7
	progressCircle.setAttribute('stroke-dasharray', `0 ${circumference}`);
	progressCircle.setAttribute('stroke-dashoffset', '0');
	progressCircle.style.cssText = 'transition: stroke-dasharray 0.3s ease;';
	progressSvg.appendChild(progressCircle);

	const modelStatusIcon = DOM.append(modelStatusContainer, DOM.$('span.codicon'));
	modelStatusIcon.style.cssText = 'flex-shrink: 0; font-size: 16px; line-height: 16px;';

	// Blinking green light for "ready" state
	const modelStatusGreenLight = DOM.append(modelStatusContainer, DOM.$('div.model-status-green-light'));
	modelStatusGreenLight.style.cssText = `
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: rgb(85, 165, 131);
		flex-shrink: 0;
		display: none;
		animation: blink-green 2s ease-in-out infinite;
	`;

	// Add CSS animation for blinking
	const style = document.createElement('style');
	style.textContent = `
		@keyframes blink-green {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.3; }
		}
	`;
	document.head.appendChild(style);

	// Right side: Sync and Delete Index buttons (for row 2)
	// row2 and leftStatusRow2 were already created above, just add the buttons here
	const rightButtonsRow2 = DOM.append(row2, DOM.$('div.right-buttons-row2'));
	rightButtonsRow2.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

	// Sync button
	const syncButtonContainer = DOM.append(rightButtonsRow2, DOM.$('div'));
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
	syncButton.title = 'Sync Index';
	syncButton.setAttribute('aria-label', 'Sync Index');

	// Delete Index button
	const deleteButtonContainer = DOM.append(rightButtonsRow2, DOM.$('div'));
	deleteButtonContainer.style.cssText = 'display: flex;';

	const deleteButton = DOM.append(deleteButtonContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	deleteButton.style.cssText = syncButton.style.cssText;

	const deleteIcon = DOM.append(deleteButton, DOM.$('span.codicon.codicon-trash'));
	deleteIcon.style.cssText = 'font-size: 12px;';
	deleteButton.title = 'Delete Index';
	deleteButton.setAttribute('aria-label', 'Delete Index');


	// Store last formatted timestamp to avoid recalculation on every update
	let lastFormattedTimestamp: { time: number; formatted: string } | null = null;

	// Removed: File change feedback tracking and context preview UI elements

	// Function to update progress UI based on status
	const updateProgressUI = (status: ExtendedIndexStatus | null) => {
		// UI update (verbose logging removed)
		// Phase 12: Update status pill
		if (!status || !hasValidWorkspace || !indexingEnabled) {
			statusPillIcon.className = 'codicon codicon-folder';
			statusPillText.textContent = 'No Workspace';
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

		// Phase 12: Update vector readiness indicator
		if (status && status.retrievalMode) {
			if (status.retrievalMode === 'sqlite-vector' && status.vectorIndexReady) {
				vectorIcon.className = 'codicon codicon-zap';
				vectorText.textContent = 'sqlite-vector';
				vectorIndicator.style.backgroundColor = 'rgba(85, 165, 255, 0.15)';
				vectorIndicator.style.borderColor = 'rgba(85, 165, 255, 0.4)';
				vectorIndicator.style.color = 'rgb(50, 130, 220)';
				vectorIcon.style.color = 'rgb(50, 130, 220)';
				vectorIndicator.title = 'Vector: sqlite-vector (Fast)';
			} else {
				// TS fallback is the default and works fine - it's just slower than sqlite-vector
				vectorIcon.className = 'codicon codicon-zap';
				vectorText.textContent = 'TS';
				vectorIndicator.style.backgroundColor = 'rgba(150, 150, 150, 0.15)';
				vectorIndicator.style.borderColor = 'rgba(150, 150, 150, 0.3)';
				vectorIndicator.style.color = 'rgb(120, 120, 120)';
				vectorIcon.style.color = 'rgb(120, 120, 120)';
				vectorIndicator.title = 'Vector: TypeScript (Fallback)';
			}
		} else {
			vectorIcon.className = 'codicon codicon-loading codicon-modifier-spin';
			vectorText.textContent = 'Loading...';
			vectorIndicator.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))';
			vectorIndicator.style.borderColor = 'var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)))';
			vectorIndicator.style.color = 'var(--vscode-foreground)';
			vectorIcon.style.color = 'var(--vscode-foreground)';
			vectorIndicator.title = 'Vector: Loading...';
		}

		// Phase 12: Update error banner
		if (status && (status.state === IndexState.Degraded || status.state === IndexState.Error) && !errorBannerCollapsed) {
			const errorMsg = status.degradedReason || status.lastErrorMessage || status.errorMessage || 'An error occurred';
			errorBannerText.textContent = errorMsg;
			errorBanner.style.display = 'block';
		} else {
			errorBanner.style.display = 'none';
		}

		// Phase 12: Update control buttons
		if (status) {
			const canPause = (status.state === IndexState.Ready || status.state === IndexState.Building) && !status.paused && !status.rebuilding;
			const canResume = status.paused && !status.rebuilding;
			const canRebuild = !status.rebuilding;

			pauseButton.style.opacity = canPause ? '1' : '0.5';
			pauseButton.style.pointerEvents = canPause ? 'auto' : 'none';
			resumeButton.style.opacity = canResume ? '1' : '0.5';
			resumeButton.style.pointerEvents = canResume ? 'auto' : 'none';
			rebuildButton.style.opacity = canRebuild ? '1' : '0.5';
			rebuildButton.style.pointerEvents = canRebuild ? 'auto' : 'none';
		} else {
			pauseButton.style.opacity = '0.5';
			pauseButton.style.pointerEvents = 'none';
			resumeButton.style.opacity = '0.5';
			resumeButton.style.pointerEvents = 'none';
			rebuildButton.style.opacity = '0.5';
			rebuildButton.style.pointerEvents = 'none';
		}

		// Removed: File change feedback tracking

		// Handle model status first - show appropriate message even when status is null
		if (!status || !hasValidWorkspace || !indexingEnabled) {
			// No workspace or indexing disabled - show "No Workspace"
			modelStatusProgressCircle.style.display = 'none';
			modelStatusIcon.style.display = 'inline-block';
			modelStatusGreenLight.style.display = 'none';
			modelStatusIcon.className = 'codicon codicon-folder';
			modelStatusText.textContent = 'No Workspace';
		} else if (!status.modelDownloadState || status.modelDownloadState === 'idle') {
			// Status exists but model state not initialized yet - show "Initializing..."
			modelStatusProgressCircle.style.display = 'none';
			modelStatusIcon.style.display = 'inline-block';
			modelStatusGreenLight.style.display = 'none';
			modelStatusIcon.className = 'codicon codicon-loading codicon-modifier-spin';
			modelStatusText.textContent = 'Initializing...';
		}

		if (!hasValidWorkspace || !indexingEnabled) {
			// No workspace or indexing disabled
			// Structural indexing
			structuralProgressValueLabel.textContent = 'Not indexed';
			structuralProgressFill.style.width = '0%';
			structuralProgressDetails.textContent = 'Enable local indexing to start indexing your codebase.';
			structuralProgressContainer.setAttribute('aria-valuenow', '0');
			structuralProgressContainer.setAttribute('aria-valuetext', 'Not indexed');

			// Embedding indexing
			embeddingProgressValueLabel.textContent = 'Not started';
			embeddingProgressFill.style.width = '0%';
			embeddingProgressDetails.textContent = 'Embeddings will start after structural indexing completes.';
			embeddingProgressContainer.setAttribute('aria-valuenow', '0');
			embeddingProgressContainer.setAttribute('aria-valuetext', 'Not started');

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
			// Structural indexing
			structuralProgressValueLabel.textContent = 'Loading...';
			structuralProgressFill.style.width = '0%';
			structuralProgressDetails.textContent = 'Loading index status...';
			structuralProgressContainer.setAttribute('aria-valuenow', '0');
			structuralProgressContainer.setAttribute('aria-valuetext', 'Loading');

			// Embedding indexing
			embeddingProgressValueLabel.textContent = 'Loading...';
			embeddingProgressFill.style.width = '0%';
			embeddingProgressDetails.textContent = 'Waiting for structural indexing...';
			embeddingProgressContainer.setAttribute('aria-valuenow', '0');
			embeddingProgressContainer.setAttribute('aria-valuetext', 'Loading');

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
		const originalTotalFiles = totalFiles;

		// Windows-specific fix: If totalFiles is 0 but we have indexed files, use indexedFiles as total
		// This handles the case where the database query returns 0 for totalFiles but files are actually indexed
		// This is a known issue on Windows where totalFiles might not be tracked correctly
		if (totalFiles === 0 && indexedFiles > 0) {
			// If totalFiles is 0 but we have indexed files, use indexedFiles as the total
			// This ensures percentage calculation works: 81/81 = 100% instead of 81/0 = undefined
			totalFiles = indexedFiles;
		}

		// Calculate structural indexing percentage
		// CRITICAL: Always calculate percentage if we have indexed files, even if totalFiles was originally 0
		let structuralPercentage = 0;

		// CRITICAL FIX: If we have indexed files, we MUST show a percentage > 0
		// This ensures we never show 0% when files are actually indexed
		if (indexedFiles > 0) {
			if (totalFiles > 0) {
				const isIndexingComplete = status.state === IndexState.Ready && indexedFiles >= totalFiles;
				if (isIndexingComplete) {
					structuralPercentage = 100;
				} else {
					const rawPercentage = (indexedFiles / totalFiles) * 100;
					structuralPercentage = Math.min(99, Math.max(1, Math.round(rawPercentage))); // Cap at 99% but ensure at least 1%
				}
			} else {
				// totalFiles is 0 but we have indexed files - show progress based on state
				// This should not happen after our fix above (totalFiles should = indexedFiles), but safety check
				// ALWAYS show 100% if we have indexed files but totalFiles is 0 (means tracking is broken)
				structuralPercentage = 100;
			}
		} else if (indexedFiles === 0 && totalFiles > 0) {
			// No files indexed yet, but we know the total - show 0%
			structuralPercentage = 0;
		} else {
			// No files indexed and no total - show 0%
			structuralPercentage = 0;
		}

		// DEBUG: Always log the calculation for troubleshooting (remove after fix verified)
		console.log('[IndexingUI] Percentage calculation:', {
			indexedFiles,
			originalTotalFiles,
			totalFiles,
			state: status.state,
			calculatedPercentage: structuralPercentage,
			statusIndexedFiles: status.indexedFiles,
			statusIndexedFileCount: status.indexedFileCount,
			statusTotalFiles: status.totalFiles
		});

		// Calculate embedding percentage
		// Only show 100% when state is Ready AND all chunks are embedded AND no pending/in-progress chunks
		const embeddedChunks = status.embeddedChunks ?? 0;
		const totalChunks = status.totalChunks ?? 0;
		const pendingChunks = status.embeddingPending ?? 0;
		const inProgressChunks = status.embeddingInProgress ?? 0;
		const doneChunks = embeddedChunks;
		const totalEmbeddingChunks = totalChunks > 0 ? totalChunks : (doneChunks + pendingChunks + inProgressChunks);

		let embeddingPercentage = 0;
		if (totalEmbeddingChunks > 0) {
			const isEmbeddingComplete = status.state === IndexState.Ready &&
				doneChunks >= totalEmbeddingChunks &&
				pendingChunks === 0 &&
				inProgressChunks === 0;
			if (isEmbeddingComplete) {
				embeddingPercentage = 100;
			} else {
				const rawPercentage = (doneChunks / totalEmbeddingChunks) * 100;
				embeddingPercentage = Math.min(99, Math.round(rawPercentage)); // Cap at 99% until truly complete
			}
		}

		// Update structural indexing progress
		structuralProgressFill.style.width = `${structuralPercentage}%`;
		structuralProgressContainer.setAttribute('aria-valuenow', String(structuralPercentage));
		structuralProgressContainer.setAttribute('aria-valuetext', `${structuralPercentage}%`);

		// Update embedding progress
		embeddingProgressFill.style.width = `${embeddingPercentage}%`;
		embeddingProgressContainer.setAttribute('aria-valuenow', String(embeddingPercentage));
		embeddingProgressContainer.setAttribute('aria-valuetext', `${embeddingPercentage}%`);

		// Update structural indexing status
		switch (status.state) {
			case IndexState.Uninitialized:
			case IndexState.Idle:
				// CRITICAL FIX: Use calculated percentage if we have indexed files, don't hardcode 0%
				// This fixes Windows issue where state is Idle but files are indexed
				structuralProgressValueLabel.textContent = `${structuralPercentage}%`;
				structuralProgressFill.style.width = `${structuralPercentage}%`;
				// After rebuild, show 0 files indexed (not stale totalFiles count)
				if (indexedFiles === 0 && totalFiles === 0) {
					structuralProgressDetails.textContent = 'Not indexed • Click Sync to start indexing.';
				} else if (indexedFiles === 0 && totalFiles > 0) {
					structuralProgressDetails.textContent = `0 files indexed of ${totalFiles.toLocaleString()} discovered • Click Sync to start indexing.`;
				} else {
					// Show actual counts if they exist (Windows fix: shows "81 files indexed" with correct percentage)
					structuralProgressDetails.textContent = `${indexedFiles.toLocaleString()} files indexed`;
				}
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
			case IndexState.Indexing: {
				// If we're structurally complete (100% or indexedFiles >= totalFiles),
				// keep showing the "X files indexed" message instead of "Indexing X/Y"
				// to avoid the confusing "Indexing 17/17 files" state after completion.
				structuralProgressValueLabel.textContent = `${structuralPercentage}%`;
				if (indexedFiles < totalFiles && structuralPercentage < 100) {
					structuralProgressDetails.textContent = `Indexing... ${indexedFiles.toLocaleString()} of ${totalFiles.toLocaleString()} files`;
				} else {
					structuralProgressDetails.textContent = `${indexedFiles.toLocaleString()} files indexed`;
				}
				syncButton.style.opacity = '0.5';
				syncButton.style.pointerEvents = 'none';
				break;
			}
			case IndexState.Ready:
			case IndexState.Stale:
				structuralProgressValueLabel.textContent = `${structuralPercentage}%`;
				structuralProgressDetails.textContent = `${indexedFiles.toLocaleString()} files indexed`;
				// Only show "Last synced" when indexing is truly complete (100% and Ready state)
				if (status.lastIndexedTime && status.state === IndexState.Ready && structuralPercentage === 100 && indexedFiles >= totalFiles) {
					// Only recalculate timestamp if lastIndexedTime actually changed
					const lastIndexed = new Date(status.lastIndexedTime);
					if (!lastFormattedTimestamp || lastFormattedTimestamp.time !== status.lastIndexedTime) {
						lastFormattedTimestamp = {
							time: status.lastIndexedTime,
							formatted: formatTimeAgo(lastIndexed)
						};
					}
					structuralProgressDetails.textContent += ` • Last synced ${lastFormattedTimestamp.formatted}`;
				}
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
			case IndexState.Error:
				structuralProgressValueLabel.textContent = 'Error';
				structuralProgressDetails.textContent = status.errorMessage || 'An error occurred during indexing.';
				structuralProgressFill.style.width = '0%';
				syncButton.style.opacity = '1';
				syncButton.style.pointerEvents = 'auto';
				break;
		}

		// Update model download status (shown on the left of buttons) - always visible
		// Note: Model status for null/invalid cases is already handled at the beginning of updateProgressUI
		// This section only runs when status exists and workspace is valid
		const modelState = status.modelDownloadState;
		const progress = status.modelDownloadProgress || 0;
		let message = '';
		let iconClass = 'codicon ';
		let showProgressCircle = false;

		// Set icon and message based on state
		// Only show "Model ready" when state is explicitly 'ready', not when undefined/idle
		if (!modelState || modelState === 'idle') {
			// No state yet or idle - show initializing state
			iconClass += 'codicon-loading codicon-modifier-spin';
			message = 'Initializing...';
		} else if (modelState === 'checking') {
			iconClass += 'codicon-loading codicon-modifier-spin';
			message = 'Checking For Model Files...';
		} else if (modelState === 'downloading') {
			// Show circular progress indicator instead of icon
			showProgressCircle = true;
			message = 'Downloading Model Files...';

			// Update circular progress (no percentage text, just visual progress)
			const circumference = 2 * Math.PI * 6; // radius = 6 for 16px SVG
			const progressValue = Math.max(0, Math.min(100, progress));
			const offset = circumference - (progressValue / 100) * circumference;
			progressCircle.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
			progressCircle.setAttribute('stroke-dashoffset', offset.toString());
		} else if (modelState === 'extracting') {
			iconClass += 'codicon-loading codicon-modifier-spin';
			message = 'Extracting Model Files...';
		} else if (modelState === 'hash') {
			// Hash embeddings are being used (not ONNX model)
			showProgressCircle = false;
			iconClass += 'codicon-check';
			message = 'Hash Embeddings Ready';
		} else if (modelState === 'ready') {
			// Show blinking green light instead of icon - only for ONNX model
			showProgressCircle = false; // Make sure progress circle is hidden
			message = 'Model Warmed Up';
		} else if (modelState === 'error') {
			iconClass += 'codicon-error';
			// Extract error message, removing MB details
			const errorMsg = status.modelDownloadMessage || 'Model Error';
			// Remove MB details if present (e.g., "Download Failed With Status Code 403" instead of full message)
			// Convert to title case
			message = errorMsg.split('\n')[0].trim()
				.split(' ')
				.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
				.join(' ');
		}

		// Show/hide progress circle vs icon vs green light
		if (showProgressCircle) {
			// Downloading - show progress circle
			modelStatusProgressCircle.style.display = 'block';
			modelStatusIcon.style.display = 'none';
			modelStatusGreenLight.style.display = 'none';
		} else if (modelState === 'hash') {
			// Hash embeddings - show check icon (not green light)
			modelStatusProgressCircle.style.display = 'none';
			modelStatusIcon.style.display = 'block';
			modelStatusGreenLight.style.display = 'none';
		} else if (modelState === 'ready') {
			// Ready (ONNX model) - show blinking green light
			modelStatusProgressCircle.style.display = 'none';
			modelStatusIcon.style.display = 'none';
			modelStatusGreenLight.style.display = 'block';
		} else {
			// Other states - show icon
			modelStatusProgressCircle.style.display = 'none';
			modelStatusIcon.style.display = 'inline-block';
			modelStatusGreenLight.style.display = 'none';
			modelStatusIcon.className = iconClass;
		}

		modelStatusText.textContent = message;

		// Update embedding status
		const activeBatches = status.embeddingActiveBatches ?? 0;
		// Only show "Completed" when embeddings are truly complete (100% and Ready state)
		const isEmbeddingComplete = status.state === IndexState.Ready && embeddingPercentage === 100 &&
			doneChunks >= totalEmbeddingChunks && pendingChunks === 0 && inProgressChunks === 0;

		if (isEmbeddingComplete) {
			// Embeddings truly complete
			embeddingProgressValueLabel.textContent = `${embeddingPercentage}%`;
			embeddingProgressDetails.textContent = `${doneChunks.toLocaleString()} embeddings generated`;
			if (status.lastIndexedTime) {
				// Only recalculate timestamp if lastIndexedTime actually changed
				const lastIndexed = new Date(status.lastIndexedTime);
				if (!lastFormattedTimestamp || lastFormattedTimestamp.time !== status.lastIndexedTime) {
					lastFormattedTimestamp = {
						time: status.lastIndexedTime,
						formatted: formatTimeAgo(lastIndexed)
					};
				}
				embeddingProgressDetails.textContent += ` • Completed ${lastFormattedTimestamp.formatted}`;
			}
		} else if (status.state === IndexState.Indexing || status.state === IndexState.Ready) {
			// Both in progress
			embeddingProgressValueLabel.textContent = totalEmbeddingChunks > 0 ? `${embeddingPercentage}%` : 'Waiting...';
			if (totalEmbeddingChunks > 0) {
				// Show "Processing..." if there are active batches OR in-progress chunks
				const isProcessing = activeBatches > 0 || inProgressChunks > 0;
				if (isProcessing) {
					if (activeBatches > 0) {
						embeddingProgressDetails.textContent = `Processing... ${doneChunks.toLocaleString()}/${totalEmbeddingChunks.toLocaleString()} chunks (${activeBatches} active batch${activeBatches !== 1 ? 'es' : ''})`;
					} else {
						embeddingProgressDetails.textContent = `Processing... ${doneChunks.toLocaleString()}/${totalEmbeddingChunks.toLocaleString()} chunks (${inProgressChunks.toLocaleString()} in progress)`;
					}
				} else {
					embeddingProgressDetails.textContent = `${doneChunks.toLocaleString()}/${totalEmbeddingChunks.toLocaleString()} chunks embedded`;
				}
			} else {
				embeddingProgressDetails.textContent = 'Waiting for structural indexing to generate chunks...';
			}
		} else {
			// Other states
			embeddingProgressValueLabel.textContent = totalEmbeddingChunks > 0 ? `${embeddingPercentage}%` : 'Not started';
			if (totalEmbeddingChunks > 0) {
				embeddingProgressDetails.textContent = `${doneChunks.toLocaleString()}/${totalEmbeddingChunks.toLocaleString()} chunks embedded`;
			} else {
				embeddingProgressDetails.textContent = 'No chunks available yet';
			}
		}

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
		structuralProgressValueLabel.textContent = 'Loading...';
		structuralProgressDetails.textContent = 'Loading index status...';
		embeddingProgressValueLabel.textContent = 'Loading...';
		embeddingProgressDetails.textContent = 'Loading embedding status...';

		// Wait a brief moment for auto-index check to run, then get status
		// This prevents showing stale data (e.g., "1 file" from file watcher) before full scan completes
		setTimeout(() => {
			(indexService as any).getStatus(indexingWorkspace).then((status: ExtendedIndexStatus) => {
				currentStatus = status;
				updateProgressUI(status);
				// Also refresh status after a short delay to catch any model download state updates
				// that might have happened during initialization
				setTimeout(() => {
					(indexService as any).getStatus(indexingWorkspace!).then((refreshedStatus: ExtendedIndexStatus) => {
						if (refreshedStatus.modelDownloadState !== currentStatus?.modelDownloadState ||
							refreshedStatus.modelDownloadMessage !== currentStatus?.modelDownloadMessage) {
							currentStatus = refreshedStatus;
							updateProgressUI(refreshedStatus);
						}
					}).catch(() => {
						// Ignore refresh errors
					});
				}, 2000);
			}).catch(() => {
				updateProgressUI(null);
			});
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

		// Phase 12: Poll for status updates (configurable, default 5s)
		const pollIntervalMs = configurationService.getValue<number>('vybe.localIndexing.statusPollInterval') ?? 5000;
		const pollInterval = setInterval(async () => {
			try {
				const status = await (indexService as any).getStatus(indexingWorkspace!);
				const extendedStatus = status as ExtendedIndexStatus;
				if (extendedStatus) {
					// Only update if values actually changed to prevent flickering
					// Compare all relevant fields to detect real changes
					// Use strict equality checks and ignore timestamp-only changes
					const hasChanged = !currentStatus ||
						currentStatus.embeddedChunks !== extendedStatus.embeddedChunks ||
						currentStatus.totalChunks !== extendedStatus.totalChunks ||
						currentStatus.embeddingPending !== extendedStatus.embeddingPending ||
						currentStatus.embeddingInProgress !== extendedStatus.embeddingInProgress ||
						currentStatus.embeddingActiveBatches !== extendedStatus.embeddingActiveBatches ||
						currentStatus.state !== extendedStatus.state ||
						currentStatus.indexedFiles !== extendedStatus.indexedFiles ||
						currentStatus.totalFiles !== extendedStatus.totalFiles ||
						currentStatus.modelDownloadState !== extendedStatus.modelDownloadState ||
						currentStatus.modelDownloadProgress !== extendedStatus.modelDownloadProgress ||
						currentStatus.modelDownloadMessage !== extendedStatus.modelDownloadMessage;

					// Only update if values actually changed - don't update on timestamp-only changes
					// This prevents flickering when status is polled but nothing actually changed
					const shouldUpdate = hasChanged;

					if (shouldUpdate) {
						currentStatus = extendedStatus;
						updateProgressUI(extendedStatus);
					}
				}
			} catch (error) {
				// Silently handle polling errors
			}
		}, pollIntervalMs);

		disposables.add({ dispose: () => clearInterval(pollInterval) });
	}

	// Removed: Recent Indexing Activity section
	// Removed: Context Preview section (dev-only)

	// Phase 12: Wire up control buttons
	addDisposableListener(pauseButton, EventType.CLICK, async () => {
		if (commandService && indexingWorkspace) {
			await commandService.executeCommand('vybe.indexing.pause');
		}
	});

	addDisposableListener(resumeButton, EventType.CLICK, async () => {
		if (commandService && indexingWorkspace) {
			await commandService.executeCommand('vybe.indexing.resume');
		}
	});

	addDisposableListener(rebuildButton, EventType.CLICK, async () => {
		if (commandService && indexingWorkspace) {
			await commandService.executeCommand('vybe.indexing.rebuild');
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

	createSecondaryButton(docsTrailing, 'Add Doc');

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

	const diagnosticsLabel = DOM.append(diagnosticsContainer, DOM.$('span'));
	diagnosticsLabel.textContent = 'Export Index Diagnostics (JSON)';
	diagnosticsLabel.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.8));';

	const diagnosticsButton = DOM.append(diagnosticsContainer, DOM.$('div.cursor-button.cursor-button-tertiary.cursor-button-tertiary-clickable.cursor-button-small'));
	diagnosticsButton.textContent = 'Export';
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

	// Local Indexing Settings section
	const localIndexingSection = createSection(parent, 'Local Indexing');
	const localIndexingSectionList = localIndexingSection.querySelector('.cursor-settings-section-list') as HTMLElement;

	// Main toggle: Enable Local Indexing
	const mainToggleSubSection = DOM.append(localIndexingSectionList, DOM.$('.cursor-settings-sub-section'));
	const mainToggleSubSectionList = DOM.append(mainToggleSubSection, DOM.$('.cursor-settings-sub-section-list'));
	mainToggleSubSectionList.style.cssText = `
		display: flex;
		flex-direction: column;
		background-color: var(--vscode-activityBar-background);
		border-radius: 8px;
		gap: 0;
	`;

	const localIndexingEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;
	const localIndexingCell = createCell(mainToggleSubSectionList, {
		label: 'Enable Local Indexing',
		description: 'Enable VYBE local indexing and semantic engine. When disabled, behavior matches upstream VS Code.',
		action: { type: 'switch', checked: localIndexingEnabled }
	});

	// Wire up toggle
	const localIndexingSwitch = localIndexingCell.querySelector('.solid-switch') as HTMLElement;
	if (localIndexingSwitch) {
		const updateToggleVisual = (checked: boolean) => {
			const bgFill = localIndexingSwitch.querySelector('.solid-switch-bg-fill') as HTMLElement;
			const knob = localIndexingSwitch.querySelector('.solid-switch-knob') as HTMLElement;
			if (bgFill && knob) {
				localIndexingSwitch.style.background = checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
				bgFill.style.opacity = checked ? '1' : '0';
				bgFill.style.width = checked ? '100%' : '0%';
				knob.style.left = checked ? 'calc(100% - 16px)' : '2px';
				localIndexingSwitch.setAttribute('data-checked', String(checked));
			}
		};

		addDisposableListener(localIndexingSwitch, EventType.CLICK, (e) => {
			e.stopPropagation();
			const current = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;
			const newValue = !current;
			updateToggleVisual(newValue);
			configurationService.updateValue(CONFIG_ENABLE_LOCAL_INDEXING, newValue, ConfigurationTarget.USER_LOCAL);
		});

		// Listen to configuration changes
		disposables.add(configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (e.affectsConfiguration(CONFIG_ENABLE_LOCAL_INDEXING)) {
				const newValue = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;
				updateToggleVisual(newValue);
			}
		}));
	}

	// Semantic Search toggle
	const semanticSearchEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH) ?? false;
	const semanticSearchCell = createCell(mainToggleSubSectionList, {
		label: 'Enable Local Semantic Search',
		description: 'Use the local semantic engine for AI text search when available. Falls back to existing providers when disabled.',
		action: { type: 'switch', checked: semanticSearchEnabled },
		hasDivider: true
	});

	const semanticSearchSwitch = semanticSearchCell.querySelector('.solid-switch') as HTMLElement;
	if (semanticSearchSwitch) {
		const updateToggleVisual = (checked: boolean) => {
			const bgFill = semanticSearchSwitch.querySelector('.solid-switch-bg-fill') as HTMLElement;
			const knob = semanticSearchSwitch.querySelector('.solid-switch-knob') as HTMLElement;
			if (bgFill && knob) {
				semanticSearchSwitch.style.background = checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
				bgFill.style.opacity = checked ? '1' : '0';
				bgFill.style.width = checked ? '100%' : '0%';
				knob.style.left = checked ? 'calc(100% - 16px)' : '2px';
				semanticSearchSwitch.setAttribute('data-checked', String(checked));
			}
		};

		addDisposableListener(semanticSearchSwitch, EventType.CLICK, (e) => {
			e.stopPropagation();
			const current = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH) ?? false;
			const newValue = !current;
			updateToggleVisual(newValue);
			configurationService.updateValue(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH, newValue, ConfigurationTarget.USER_LOCAL);
		});

		disposables.add(configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (e.affectsConfiguration(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH)) {
				const newValue = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH) ?? false;
				updateToggleVisual(newValue);
			}
		}));
	}

	// File Watcher toggle
	const watcherEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEX_WATCHER) ?? false;
	const watcherCell = createCell(mainToggleSubSectionList, {
		label: 'Enable File System Watcher',
		description: 'Enable file system watcher for local indexing. Requires local indexing to be enabled.',
		action: { type: 'switch', checked: watcherEnabled },
		hasDivider: true
	});

	const watcherSwitch = watcherCell.querySelector('.solid-switch') as HTMLElement;
	if (watcherSwitch) {
		const updateToggleVisual = (checked: boolean) => {
			const bgFill = watcherSwitch.querySelector('.solid-switch-bg-fill') as HTMLElement;
			const knob = watcherSwitch.querySelector('.solid-switch-knob') as HTMLElement;
			if (bgFill && knob) {
				watcherSwitch.style.background = checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
				bgFill.style.opacity = checked ? '1' : '0';
				bgFill.style.width = checked ? '100%' : '0%';
				knob.style.left = checked ? 'calc(100% - 16px)' : '2px';
				watcherSwitch.setAttribute('data-checked', String(checked));
			}
		};

		addDisposableListener(watcherSwitch, EventType.CLICK, (e) => {
			e.stopPropagation();
			const current = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEX_WATCHER) ?? false;
			const newValue = !current;
			updateToggleVisual(newValue);
			configurationService.updateValue(CONFIG_ENABLE_LOCAL_INDEX_WATCHER, newValue, ConfigurationTarget.USER_LOCAL);
		});

		disposables.add(configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (e.affectsConfiguration(CONFIG_ENABLE_LOCAL_INDEX_WATCHER)) {
				const newValue = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEX_WATCHER) ?? false;
				updateToggleVisual(newValue);
			}
		}));
	}

	// Embeddings toggle
	const embeddingsEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS) ?? false;
	const embeddingsCell = createCell(mainToggleSubSectionList, {
		label: 'Enable Local Embeddings',
		description: 'Enable local embedding generation and storage for semantic search. Requires local indexing to be enabled.',
		action: { type: 'switch', checked: embeddingsEnabled },
		hasDivider: true
	});

	const embeddingsSwitch = embeddingsCell.querySelector('.solid-switch') as HTMLElement;
	if (embeddingsSwitch) {
		const updateToggleVisual = (checked: boolean) => {
			const bgFill = embeddingsSwitch.querySelector('.solid-switch-bg-fill') as HTMLElement;
			const knob = embeddingsSwitch.querySelector('.solid-switch-knob') as HTMLElement;
			if (bgFill && knob) {
				embeddingsSwitch.style.background = checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
				bgFill.style.opacity = checked ? '1' : '0';
				bgFill.style.width = checked ? '100%' : '0%';
				knob.style.left = checked ? 'calc(100% - 16px)' : '2px';
				embeddingsSwitch.setAttribute('data-checked', String(checked));
			}
		};

		addDisposableListener(embeddingsSwitch, EventType.CLICK, (e) => {
			e.stopPropagation();
			const current = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS) ?? false;
			const newValue = !current;
			updateToggleVisual(newValue);
			configurationService.updateValue(CONFIG_ENABLE_LOCAL_EMBEDDINGS, newValue, ConfigurationTarget.USER_LOCAL);
		});

		disposables.add(configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (e.affectsConfiguration(CONFIG_ENABLE_LOCAL_EMBEDDINGS)) {
				const newValue = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS) ?? false;
				updateToggleVisual(newValue);
			}
		}));
	}

	// Advanced Settings section
	const advancedSection = createSection(parent, 'Advanced Settings');
	const advancedSectionList = advancedSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const advancedSubSection = DOM.append(advancedSectionList, DOM.$('.cursor-settings-sub-section'));

	// Max Concurrent Jobs
	const maxJobs = configurationService.getValue<number>(CONFIG_MAX_CONCURRENT_JOBS) ?? 2;
	const maxJobsCell = createCellWithNumberInput(advancedSubSection, {
		label: 'Max Concurrent Jobs',
		description: 'Maximum concurrent indexing jobs when local indexing is enabled.',
		numberValue: maxJobs,
		dropdownLabel: 'jobs'
	});
	const maxJobsInput = maxJobsCell.querySelector('input[type="number"]') as HTMLInputElement;
	if (maxJobsInput) {
		addDisposableListener(maxJobsInput, EventType.BLUR, () => {
			const value = parseInt(maxJobsInput.value, 10);
			if (!isNaN(value) && value >= 1) {
				configurationService.updateValue(CONFIG_MAX_CONCURRENT_JOBS, value, ConfigurationTarget.USER_LOCAL);
			}
		});
	}

	// Batch Size
	const batchSize = configurationService.getValue<number>(CONFIG_INDEX_BATCH_SIZE) ?? 20;
	const batchSizeCell = createCellWithNumberInput(advancedSubSection, {
		label: 'Index Batch Size',
		description: 'Maximum files per indexing batch.',
		numberValue: batchSize,
		dropdownLabel: 'files',
		hasDivider: true
	});
	const batchSizeInput = batchSizeCell.querySelector('input[type="number"]') as HTMLInputElement;
	if (batchSizeInput) {
		addDisposableListener(batchSizeInput, EventType.BLUR, () => {
			const value = parseInt(batchSizeInput.value, 10);
			if (!isNaN(value) && value >= 1) {
				configurationService.updateValue(CONFIG_INDEX_BATCH_SIZE, value, ConfigurationTarget.USER_LOCAL);
			}
		});
	}

	// Debounce MS
	const debounceMs = configurationService.getValue<number>(CONFIG_INDEX_DEBOUNCE_MS) ?? 500;
	const debounceCell = createCellWithNumberInput(advancedSubSection, {
		label: 'Debounce Delay',
		description: 'Debounce delay (ms) for batching file change events into indexing jobs.',
		numberValue: debounceMs,
		dropdownLabel: 'ms',
		hasDivider: true
	});
	const debounceInput = debounceCell.querySelector('input[type="number"]') as HTMLInputElement;
	if (debounceInput) {
		addDisposableListener(debounceInput, EventType.BLUR, () => {
			const value = parseInt(debounceInput.value, 10);
			if (!isNaN(value) && value >= 0) {
				configurationService.updateValue(CONFIG_INDEX_DEBOUNCE_MS, value, ConfigurationTarget.USER_LOCAL);
			}
		});
	}

	// Storage Path (text input)
	const storagePath = configurationService.getValue<string>(CONFIG_INDEX_STORAGE_PATH) ?? '';
	const storagePathCell = createCell(advancedSubSection, {
		label: 'Storage Path Override',
		description: 'Optional override path for local index storage. When empty, uses workspace/profile default locations.',
		action: null,
		hasDivider: true
	});

	const storagePathTrailing = storagePathCell.querySelector('.cursor-settings-cell-trailing-items') as HTMLElement;
	if (storagePathTrailing) {
		DOM.clearNode(storagePathTrailing);
		storagePathTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

		const inputContainer = DOM.append(storagePathTrailing, DOM.$('div'));
		inputContainer.style.cssText = 'display: flex; width: 300px;';

		const storageInput = DOM.append(inputContainer, DOM.$('input'));
		(storageInput as HTMLInputElement).type = 'text';
		(storageInput as HTMLInputElement).value = storagePath;
		(storageInput as HTMLInputElement).placeholder = 'Leave empty for default';
		storageInput.style.cssText = `
			width: 100%;
			background-color: var(--vscode-input-background);
			border-radius: 2px;
			border: 1px solid var(--vscode-input-border);
			outline: none;
			padding: 4px 8px;
			font-size: 12px;
			color: var(--vscode-input-foreground);
			line-height: 1.4;
			box-sizing: border-box;
		`;

		addDisposableListener(storageInput, EventType.BLUR, () => {
			const value = (storageInput as HTMLInputElement).value.trim();
			configurationService.updateValue(CONFIG_INDEX_STORAGE_PATH, value || undefined, ConfigurationTarget.USER_LOCAL);
		});
	}

	// Embedding Model (text input)
	const embeddingModel = configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) ?? 'coderank-embed';
	const embeddingModelCell = createCell(advancedSubSection, {
		label: 'Embedding Model',
		description: 'Embedding model identifier used for local semantic search.',
		action: null,
		hasDivider: true
	});

	const embeddingModelTrailing = embeddingModelCell.querySelector('.cursor-settings-cell-trailing-items') as HTMLElement;
	if (embeddingModelTrailing) {
		DOM.clearNode(embeddingModelTrailing);
		embeddingModelTrailing.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;';

		const inputContainer = DOM.append(embeddingModelTrailing, DOM.$('div'));
		inputContainer.style.cssText = 'display: flex; width: 300px;';

		const modelInput = DOM.append(inputContainer, DOM.$('input'));
		(modelInput as HTMLInputElement).type = 'text';
		(modelInput as HTMLInputElement).value = embeddingModel;
		modelInput.style.cssText = `
			width: 100%;
			background-color: var(--vscode-input-background);
			border-radius: 2px;
			border: 1px solid var(--vscode-input-border);
			outline: none;
			padding: 4px 8px;
			font-size: 12px;
			color: var(--vscode-input-foreground);
			line-height: 1.4;
			box-sizing: border-box;
		`;

		addDisposableListener(modelInput, EventType.BLUR, () => {
			const value = (modelInput as HTMLInputElement).value.trim();
			configurationService.updateValue(CONFIG_EMBEDDING_MODEL, value || 'coderank-embed', ConfigurationTarget.USER_LOCAL);
		});
	}

	// Embedding Runtime is now always "auto" (ONNX with hash fallback) - no UI setting needed

	// Embedding Batch Size
	const embeddingBatchSize = configurationService.getValue<number>(CONFIG_EMBEDDING_BATCH_SIZE) ?? 16;
	const embeddingBatchCell = createCellWithNumberInput(advancedSubSection, {
		label: 'Embedding Batch Size',
		description: 'Batch size for embedding generation requests.',
		numberValue: embeddingBatchSize,
		dropdownLabel: 'items',
		hasDivider: true
	});
	const embeddingBatchInput = embeddingBatchCell.querySelector('input[type="number"]') as HTMLInputElement;
	if (embeddingBatchInput) {
		addDisposableListener(embeddingBatchInput, EventType.BLUR, () => {
			const value = parseInt(embeddingBatchInput.value, 10);
			if (!isNaN(value) && value >= 1) {
				configurationService.updateValue(CONFIG_EMBEDDING_BATCH_SIZE, value, ConfigurationTarget.USER_LOCAL);
			}
		});
	}

	// Search Top K
	const searchTopK = configurationService.getValue<number>(CONFIG_SEARCH_TOP_K) ?? 50;
	const searchTopKCell = createCellWithNumberInput(advancedSubSection, {
		label: 'Search Top K',
		description: 'Maximum vector neighbors to consider per semantic search.',
		numberValue: searchTopK,
		dropdownLabel: 'neighbors',
		hasDivider: true
	});
	const searchTopKInput = searchTopKCell.querySelector('input[type="number"]') as HTMLInputElement;
	if (searchTopKInput) {
		addDisposableListener(searchTopKInput, EventType.BLUR, () => {
			const value = parseInt(searchTopKInput.value, 10);
			if (!isNaN(value) && value >= 1) {
				configurationService.updateValue(CONFIG_SEARCH_TOP_K, value, ConfigurationTarget.USER_LOCAL);
			}
		});
	}

	// Lexical Row Limit
	const lexicalRowLimit = configurationService.getValue<number>(CONFIG_LEXICAL_ROW_LIMIT) ?? 200;
	const lexicalRowLimitCell = createCellWithNumberInput(advancedSubSection, {
		label: 'Lexical Row Limit',
		description: 'Maximum rows returned from lexical search per query.',
		numberValue: lexicalRowLimit,
		dropdownLabel: 'rows',
		hasDivider: true
	});
	const lexicalRowLimitInput = lexicalRowLimitCell.querySelector('input[type="number"]') as HTMLInputElement;
	if (lexicalRowLimitInput) {
		addDisposableListener(lexicalRowLimitInput, EventType.BLUR, () => {
			const value = parseInt(lexicalRowLimitInput.value, 10);
			if (!isNaN(value) && value >= 1) {
				configurationService.updateValue(CONFIG_LEXICAL_ROW_LIMIT, value, ConfigurationTarget.USER_LOCAL);
			}
		});
	}
}

