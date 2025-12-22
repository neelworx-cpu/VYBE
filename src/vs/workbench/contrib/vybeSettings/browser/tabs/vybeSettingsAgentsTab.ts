/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createCell, createCellWithNumberInput, createCellWithTagEditor } from '../vybeSettingsComponents.js';

export function renderAgentsTab(parent: HTMLElement): void {
	// Chat Composer section (no title)
	const chatComposerSection = createSection(parent, null);
	chatComposerSection.id = 'cursor-settings-chat-composer';
	const chatComposerSectionList = chatComposerSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const chatComposerSubSection = DOM.append(chatComposerSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(chatComposerSubSection, {
		label: 'Default Mode',
		description: 'Mode for new agents',
		action: { type: 'dropdown', label: 'Agent' }
	});

	createCell(chatComposerSubSection, {
		label: 'Default Location',
		description: 'Where to open new agents',
		action: { type: 'dropdown', label: 'Pane' },
		hasDivider: true
	});

	createCell(chatComposerSubSection, {
		label: 'Text Size',
		description: 'Adjust the conversation text size',
		action: { type: 'dropdown', label: 'Default' },
		hasDivider: true
	});

	createCell(chatComposerSubSection, {
		label: 'Auto-Clear Chat',
		description: 'After periods of inactivity, open the Agent Pane to a new conversation',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Max Tab Count - special cell with number input + dropdown
	createCellWithNumberInput(chatComposerSubSection, {
		label: 'Max Tab Count',
		description: 'Limit how many chat tabs can be open at once',
		numberValue: 1,
		dropdownLabel: 'Custom',
		hasDivider: true
	});

	createCell(chatComposerSubSection, {
		label: 'Queue Messages',
		description: 'Adjust the default behavior of sending a message while Agent is streaming',
		action: { type: 'dropdown', label: 'Send after current message' }
	});

	createCell(chatComposerSubSection, {
		label: 'Usage Summary',
		description: 'When to show the usage summary at the bottom of the chat pane',
		action: { type: 'dropdown', label: 'Auto' }
	});

	// Agent Review section
	const agentReviewSection = createSection(parent, 'Agent Review');
	const agentReviewSectionList = agentReviewSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const agentReviewSubSection = DOM.append(agentReviewSectionList, DOM.$('.cursor-settings-sub-section'));
	agentReviewSubSection.id = 'cursor-settings-agent-review';

	createCell(agentReviewSubSection, {
		label: 'Start Agent Review on Commit',
		description: 'Automatically review your changes for issues after each commit',
		action: { type: 'switch', checked: true }
	});

	createCell(agentReviewSubSection, {
		label: 'Include Submodules in Agent Review',
		description: 'Include changes from Git submodules in the review',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(agentReviewSubSection, {
		label: 'Include Untracked Files in Agent Review',
		description: 'Include untracked files (new files not yet added to Git) in the review',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(agentReviewSubSection, {
		label: 'Default Approach',
		description: 'Choose between quick or more thorough, higher-cost analysis',
		action: { type: 'dropdown', label: 'Quick' }
	});

	// Context section
	const contextSection = createSection(parent, 'Context');
	const contextSectionList = contextSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const contextSubSection = DOM.append(contextSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(contextSubSection, {
		label: 'Web Search Tool',
		description: 'Allow Agent to search the web for relevant information',
		action: { type: 'switch', checked: true }
	});

	createCell(contextSubSection, {
		label: 'Auto-Accept Web Search',
		description: 'Skip approval dialog; Agent may run web searches automatically',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(contextSubSection, {
		label: 'Hierarchical Cursor Ignore',
		description: 'Apply .cursorignore files to all subdirectories. Changing this setting will require a restart of Cursor.',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Applying Changes section
	const applyingChangesSection = createSection(parent, 'Applying Changes');
	const applyingChangesSectionList = applyingChangesSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const applyingChangesSubSection = DOM.append(applyingChangesSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(applyingChangesSubSection, {
		label: 'Auto-Accept on Commit',
		description: 'Automatically accept all changes when files are committed and no longer in the worktree',
		action: { type: 'switch', checked: true }
	});

	createCell(applyingChangesSubSection, {
		label: 'Jump to Next Diff on Accept',
		description: 'Automatically jump to the next diff when accepting changes with Cmd+Y',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// Auto-Run section
	const autoRunSection = createSection(parent, 'Auto-Run');
	autoRunSection.id = 'auto-run-section';
	const autoRunSectionList = autoRunSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const autoRunSubSection = DOM.append(autoRunSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(autoRunSubSection, {
		label: 'Auto-Run Mode',
		description: 'Choose how Agent runs tools like command execution, MCP, and file writes.',
		action: { type: 'dropdown', label: 'Ask Every Time' }
	});

	// Auto-Approved Mode Transitions - tag editor
	createCellWithTagEditor(autoRunSubSection, {
		label: 'Auto-Approved Mode Transitions',
		description: 'Mode transitions that will be automatically approved without prompting.',
		placeholder: 'e.g., agent->plan',
		initialTags: [],
		hasDivider: true
	});

	createCell(autoRunSubSection, {
		label: 'Browser Protection',
		description: 'Prevent Agent from automatically running Browser tools',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	createCell(autoRunSubSection, {
		label: 'File-Deletion Protection',
		description: 'Prevent Agent from deleting files automatically',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(autoRunSubSection, {
		label: 'Dotfile Protection',
		description: 'Prevent Agent from modifying dot files like .gitignore automatically',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(autoRunSubSection, {
		label: 'External-File Protection',
		description: 'Prevent Agent from creating or modifying files outside of the workspace automatically',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// Inline Editing & Terminal section
	const inlineEditingSection = createSection(parent, 'Inline Editing & Terminal');
	const inlineEditingSectionList = inlineEditingSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const inlineEditingSubSection = DOM.append(inlineEditingSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(inlineEditingSubSection, {
		label: 'Legacy Terminal Tool',
		description: 'Use the legacy terminal tool in agent mode, for use on systems with unsupported shell configurations',
		action: { type: 'switch', checked: false }
	});

	createCell(inlineEditingSubSection, {
		label: 'Toolbar on Selection',
		description: 'Show Add to Chat & Quick Edit buttons when selecting code',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(inlineEditingSubSection, {
		label: 'Auto-Parse Links',
		description: 'Automatically parse links when pasted into Quick Edit (⌘K) input',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	createCell(inlineEditingSubSection, {
		label: 'Themed Diff Backgrounds',
		description: 'Use themed background colors for inline code diffs',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(inlineEditingSubSection, {
		label: 'Inline Diff Mode',
		description: 'Choose whether inline diffs show removed lines or only inserted code.',
		action: { type: 'dropdown', label: 'Diffs' }
	});

	createCell(inlineEditingSubSection, {
		label: 'Terminal Hint',
		description: 'Show a hint for ⌘K in the Terminal',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(inlineEditingSubSection, {
		label: 'Preview Box for Terminal ⌘K',
		description: 'Use a preview box instead of streaming responses directly into the shell',
		action: { type: 'switch', checked: false },
		hasDivider: true
	});

	// Voice Mode section
	const voiceModeSection = createSection(parent, 'Voice Mode');
	const voiceModeSectionList = voiceModeSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const voiceModeSubSection = DOM.append(voiceModeSectionList, DOM.$('.cursor-settings-sub-section'));

	// Submit Keywords - tag editor with initial "submit" tag
	createCellWithTagEditor(voiceModeSubSection, {
		label: 'Submit Keywords',
		description: 'Custom keywords that trigger auto-submit in voice mode. Only single words (no spaces) are allowed. Punctuation and capitalization are ignored.',
		placeholder: '',
		initialTags: ['submit'],
		hasDivider: false
	});
}




