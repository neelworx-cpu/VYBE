/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, getWindow } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';

export interface QuestionnaireOption {
	id: string;
	label: string;
	letter: string; // A, B, C, or D
}

export interface QuestionnaireQuestion {
	id: string;
	text: string;
	options: QuestionnaireOption[];
	selectedOptionId?: string;
}

export interface QuestionnaireData {
	questions: QuestionnaireQuestion[];
	currentQuestionIndex: number;
}

export class QuestionnaireToolbar extends Disposable {
	public toolbar: HTMLElement | null = null;
	private questions: QuestionnaireQuestion[] = [];
	private currentQuestionIndex: number = 0;
	private toolbarContainer: HTMLElement | null = null;
	private headerContainer: HTMLElement | null = null;
	private questionIcon: HTMLElement | null = null;
	private titleElement: HTMLElement | null = null;
	private stepperContainer: HTMLElement | null = null;
	private stepperUpButton: HTMLElement | null = null;
	private stepperDownButton: HTMLElement | null = null;
	private stepperLabel: HTMLElement | null = null;
	private scrollContainer: HTMLElement | null = null;
	private questionsContainer: HTMLElement | null = null;
	private scrollableElement: DomScrollableElement | null = null;
	private actionsContainer: HTMLElement | null = null;
	private skipButton: HTMLElement | null = null;
	private continueButton: HTMLElement | null = null;
	private scrollSpacer: HTMLElement | null = null; // Spacer element to ensure last question can scroll to top
	private isUpdatingFromSelection: boolean = false; // Flag to prevent scroll during option selection

	// Callbacks
	private onSkipCallback: (() => void) | null = null;
	private onContinueCallback: (() => void) | null = null;
	private onOptionSelectedCallback: ((questionId: string, optionId: string) => void) | null = null;

	constructor(private parent: HTMLElement) {
		super();
		this.toolbar = this.renderToolbar();
		this.setupThemeObserver();
	}

	private isDarkTheme(): boolean {
		const workbenchElement = document.querySelector('.monaco-workbench');
		const isDark = document.body.classList.contains('vs-dark') ||
		               document.body.classList.contains('hc-black') ||
		               (workbenchElement?.classList.contains('vs-dark') ?? false) ||
		               (workbenchElement?.classList.contains('hc-black') ?? false);
		return !!isDark;
	}

	private setupThemeObserver(): void {
		const targetWindow = getWindow(this.parent);
		const observer = new MutationObserver(() => {
			this.updateToolbarTheme();
		});

		observer.observe(targetWindow.document.body, {
			attributes: true,
			attributeFilter: ['class']
		});

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
		// Match composer input box background - same as messageComposer uses
		// Dark: #212427, Light: #eceff2
		this.toolbarContainer.style.cssText = `
			background: ${isDarkTheme ? '#212427' : '#eceff2'};
			border-top: 1px solid var(--cursor-text-green-primary, #3ecf8e);
			border-right: 1px solid var(--cursor-text-green-primary, #3ecf8e);
			border-bottom: none;
			border-left: 1px solid var(--cursor-text-green-primary, #3ecf8e);
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

		// Update skip button color based on theme
		if (this.skipButton) {
			this.skipButton.style.color = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
		}

		// Update questions to refresh border colors for A/B/C buttons
		if (this.questions.length > 0) {
			this.updateQuestions();
		}
	}

	private renderToolbar(): HTMLElement {
		// Outer positioning container
		const outerContainer = $('div');
		outerContainer.style.cssText = `
			position: relative;
			height: 0px;
			z-index: 10;
		`;

		// Absolute positioned wrapper - attached to top of composer (same as files edited toolbar)
		// Uses bottom: 100% to position above the input box
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

		// Main toolbar container
		this.toolbarContainer = append(absoluteWrapper, $('div'));
		this.toolbarContainer.id = 'composer-toolbar-section';
		this.toolbarContainer.className = 'hide-if-empty has-pending-questionnaire';
		this.updateToolbarTheme();

		// Questionnaire toolbar container
		const questionnaireContainer = append(this.toolbarContainer, $('div'));
		questionnaireContainer.className = 'composer-questionnaire-toolbar';
		questionnaireContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			width: 100%;
			box-sizing: border-box;
			overflow: hidden;
			padding: 6px;
			gap: 12px;
		`;

		// Header
		this.headerContainer = append(questionnaireContainer, $('div'));
		this.headerContainer.className = 'composer-questionnaire-toolbar-header';
		this.headerContainer.style.cssText = `
			display: flex;
			align-items: center;
			column-gap: 8px;
			row-gap: 8px;
			position: relative;
			width: 100%;
			box-sizing: border-box;
		`;

		// Question icon
		this.questionIcon = append(this.headerContainer, $('span.codicon.codicon-question'));
		this.questionIcon.className = 'codicon codicon-question composer-questionnaire-toolbar-icon';
		this.questionIcon.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 16px;
			font-size: 16px;
			line-height: 16px;
			margin-top: 0px;
			opacity: 0.7;
			text-align: center;
			flex-shrink: 0;
		`;

		// Title
		this.titleElement = append(this.headerContainer, $('span'));
		this.titleElement.className = 'composer-questionnaire-toolbar-title';
		this.titleElement.textContent = 'Questions';
		this.titleElement.style.cssText = `
			display: block;
			font-size: 13px;
			line-height: 19.5px;
			height: 19.5px;
			flex: 0 0 auto;
		`;

		// Stepper container
		this.stepperContainer = append(this.headerContainer, $('div'));
		this.stepperContainer.className = 'composer-questionnaire-toolbar-stepper';
		this.stepperContainer.style.cssText = `
			display: flex;
			align-items: center;
			column-gap: 4px;
			row-gap: 4px;
			margin-left: auto;
			margin-right: 2px;
			flex-shrink: 0;
		`;

		// Stepper up button
		this.stepperUpButton = append(this.stepperContainer, $('div'));
		this.stepperUpButton.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center';
		this.stepperUpButton.style.cssText = `
			width: 16px;
			height: 16px;
		`;
		const upIcon = append(this.stepperUpButton, $('span.codicon.codicon-chevron-up'));
		upIcon.className = 'codicon codicon-chevron-up !text-[16px] composer-questionnaire-toolbar-stepper-icon';
		this._register(addDisposableListener(this.stepperUpButton, 'click', () => {
			this.navigateToPreviousQuestion();
		}));

		// Stepper label
		this.stepperLabel = append(this.stepperContainer, $('span'));
		this.stepperLabel.className = 'composer-questionnaire-toolbar-stepper-label';
		const isDarkTheme = this.isDarkTheme();
		this.stepperLabel.style.color = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';

		// Stepper down button
		this.stepperDownButton = append(this.stepperContainer, $('div'));
		this.stepperDownButton.className = 'anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center';
		this.stepperDownButton.style.cssText = `
			width: 16px;
			height: 16px;
		`;
		const downIcon = append(this.stepperDownButton, $('span.codicon.codicon-chevron-down'));
		downIcon.className = 'codicon codicon-chevron-down !text-[16px] composer-questionnaire-toolbar-stepper-icon';
		this._register(addDisposableListener(this.stepperDownButton, 'click', () => {
			this.navigateToNextQuestion();
		}));

		// Scroll container - fixed height 200px
		this.scrollContainer = append(questionnaireContainer, $('div'));
		this.scrollContainer.className = 'composer-questionnaire-toolbar-scroll-container';
		this.scrollContainer.style.cssText = `
			height: 200px;
			overflow: hidden;
			position: relative;
		`;

		// Questions container (will be wrapped by DomScrollableElement)
		// Must be scrollable for DomScrollableElement to work
		this.questionsContainer = $('div');
		this.questionsContainer.className = 'composer-questionnaire-toolbar-questions';
		this.questionsContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 12px;
			width: 100%;
			padding: 0;
			overflow-y: auto;
			overflow-x: hidden;
			height: 200px;
		`;

		// Hide native scrollbar (DomScrollableElement provides custom scrollbar)
		const targetWindow = getWindow(this.parent);
		const style = targetWindow.document.createElement('style');
		style.textContent = `
			.composer-questionnaire-toolbar-questions::-webkit-scrollbar {
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
		// Firefox
		this.questionsContainer.style.setProperty('scrollbar-width', 'none', 'important');
		// IE/Edge
		this.questionsContainer.style.setProperty('-ms-overflow-style', 'none', 'important');

		// Create scrollable element - same pattern as filesEditedToolbar
		this.scrollableElement = this._register(new DomScrollableElement(this.questionsContainer, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			useShadows: false,
			verticalScrollbarSize: 10,
			horizontalScrollbarSize: 10
		}));

		// Listen to element's scroll events to sync back to scrollable element
		this._register(addDisposableListener(this.questionsContainer, 'scroll', () => {
			if (this.scrollableElement) {
				const scrollTop = this.questionsContainer!.scrollTop;
				const scrollLeft = this.questionsContainer!.scrollLeft;
				this.scrollableElement.setScrollPosition({ scrollTop, scrollLeft });
			}
		}));

		const scrollableDomNode = this.scrollableElement.getDomNode();
		scrollableDomNode.className = 'monaco-scrollable-element mac';
		scrollableDomNode.setAttribute('role', 'presentation');
		scrollableDomNode.style.cssText = `
			position: relative;
			width: 100%;
			height: 200px;
			overflow: hidden;
		`;

		// Append scrollable element directly to container
		this.scrollContainer.appendChild(scrollableDomNode);

		// Initial scroll dimensions setup - reuse targetWindow from above
		targetWindow.requestAnimationFrame(() => {
			if (this.scrollableElement && this.questionsContainer && this.scrollContainer) {
				this.scrollableElement.setScrollDimensions({
					width: this.questionsContainer.offsetWidth || this.scrollContainer.offsetWidth,
					scrollWidth: this.questionsContainer.offsetWidth || this.scrollContainer.offsetWidth,
					height: 200,
					scrollHeight: this.questionsContainer.scrollHeight || 0
				});
			}
		});

		// Actions container
		this.actionsContainer = append(questionnaireContainer, $('div'));
		this.actionsContainer.className = 'composer-questionnaire-toolbar-actions';
		this.actionsContainer.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 4px;
			padding-top: 4px;
		`;

		// Skip button - gray text, no background, no hover background
		const isDark = this.isDarkTheme();
		this.skipButton = append(this.actionsContainer, $('div'));
		// Use a different class to avoid CSS hover background from vybeChatTerminal.css
		this.skipButton.className = 'composer-questionnaire-skip-button';
		this.skipButton.setAttribute('data-click-ready', 'true');
		this.skipButton.style.cssText = `
			display: flex;
			flex-wrap: nowrap;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			cursor: pointer;
			white-space: nowrap;
			flex-shrink: 0;
			font-size: 12px;
			line-height: 16px;
			box-sizing: border-box;
			min-height: 20px;
			background: transparent;
			border: none;
			color: ${isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'};
			transition: color 0.1s ease;
		`;
		const skipSpan = append(this.skipButton, $('span'));
		skipSpan.className = 'inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden';
		const skipText = append(skipSpan, $('span'));
		skipText.className = 'truncate';
		skipText.textContent = 'Skip';
		// No hover background - just color change
		this._register(addDisposableListener(this.skipButton, 'mouseenter', () => {
			this.skipButton!.style.color = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
			this.skipButton!.style.backgroundColor = 'transparent';
		}));
		this._register(addDisposableListener(this.skipButton, 'mouseleave', () => {
			this.skipButton!.style.color = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
			this.skipButton!.style.backgroundColor = 'transparent';
		}));
		this._register(addDisposableListener(this.skipButton, 'click', () => {
			if (this.onSkipCallback) {
				this.onSkipCallback();
			}
		}));

		// Continue button - exact copy from Build button in plan document
		this.continueButton = $('.anysphere-button.composer-run-button');
		this.continueButton.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			line-height: 16px;
			min-height: 20px;
			background: #3ecf8e;
			color: white;
			border: none;
		`;
		const continueSpan = append(this.continueButton, $('span'));
		continueSpan.className = 'inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden';
		const continueText = append(continueSpan, $('span'));
		continueText.className = 'truncate';
		continueText.textContent = 'Continue';
		const keybinding = append(continueSpan, $('span'));
		keybinding.className = 'keybinding-font-settings';
		keybinding.style.cssText = 'font-size: 10px; opacity: 0.5; margin-left: 2px;';
		keybinding.textContent = ' ⌘⏎';
		// Hover effects - same as Build button
		this._register(addDisposableListener(this.continueButton, 'mouseenter', () => {
			this.continueButton!.style.background = 'color-mix(in srgb, #3ecf8e 80%, black)';
		}));
		this._register(addDisposableListener(this.continueButton, 'mouseleave', () => {
			this.continueButton!.style.background = '#3ecf8e';
		}));
		this._register(addDisposableListener(this.continueButton, 'click', () => {
			if (this.onContinueCallback) {
				this.onContinueCallback();
			}
		}));
		this.actionsContainer.appendChild(this.continueButton);

		// Initially hide toolbar
		outerContainer.style.display = 'none';

		return outerContainer;
	}

	public setQuestions(questions: QuestionnaireQuestion[]): void {
		this.questions = questions;
		this.currentQuestionIndex = 0;
		this.updateQuestions();
		this.updateStepper();
		this.updateVisibility();
	}

	public setCurrentQuestionIndex(index: number): void {
		if (index >= 0 && index < this.questions.length) {
			this.currentQuestionIndex = index;
			this.updateQuestions();
			this.updateStepper();
		}
	}

	public selectOption(questionId: string, optionId: string): void {
		const question = this.questions.find(q => q.id === questionId);
		if (question) {
			// Toggle: if already selected, unselect it
			if (question.selectedOptionId === optionId) {
				question.selectedOptionId = undefined;
			} else {
				question.selectedOptionId = optionId;
			}
			// Set flag to prevent scroll during update
			this.isUpdatingFromSelection = true;
			// Store current scroll position to restore it
			const currentScrollTop = this.questionsContainer?.scrollTop || 0;
			// Update questions but don't trigger scroll (prevent unwanted scrolling on last question)
			this.updateQuestions();
			// Restore scroll position after update
			if (this.questionsContainer) {
				const targetWindow = getWindow(this.parent);
				targetWindow.requestAnimationFrame(() => {
					if (this.questionsContainer) {
						this.questionsContainer.scrollTop = currentScrollTop;
						if (this.scrollableElement) {
							this.scrollableElement.setScrollPosition({ scrollTop: currentScrollTop });
						}
					}
					this.isUpdatingFromSelection = false;
				});
			} else {
				this.isUpdatingFromSelection = false;
			}
			// Don't call scrollToCurrentQuestion() here - only update the visual state
			if (this.onOptionSelectedCallback && question.selectedOptionId) {
				this.onOptionSelectedCallback(questionId, question.selectedOptionId);
			}
		}
	}

	public setOnSkip(callback: () => void): void {
		this.onSkipCallback = callback;
	}

	public setOnContinue(callback: () => void): void {
		this.onContinueCallback = callback;
	}

	public setOnOptionSelected(callback: (questionId: string, optionId: string) => void): void {
		this.onOptionSelectedCallback = callback;
	}

	private navigateToPreviousQuestion(): void {
		if (this.currentQuestionIndex > 0) {
			this.currentQuestionIndex--;
			this.updateQuestions();
			this.updateStepper();
			// Wait for questions to be rendered before scrolling
			const targetWindow = getWindow(this.parent);
			targetWindow.requestAnimationFrame(() => {
				this.scrollToCurrentQuestion();
			});
		}
	}

	private navigateToNextQuestion(): void {
		if (this.currentQuestionIndex < this.questions.length - 1) {
			this.currentQuestionIndex++;
			this.updateQuestions();
			this.updateStepper();
			// Wait for questions to be rendered before scrolling
			const targetWindow = getWindow(this.parent);
			targetWindow.requestAnimationFrame(() => {
				this.scrollToCurrentQuestion();
			});
		}
	}

	private updateStepper(): void {
		if (!this.stepperLabel) {
			return;
		}

		const total = this.questions.length;
		const current = this.currentQuestionIndex + 1;
		this.stepperLabel.textContent = `${current} of ${total}`;
		// Ensure stepper label stays gray
		const isDarkTheme = this.isDarkTheme();
		this.stepperLabel.style.color = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';

		// Update button states
		if (this.stepperUpButton) {
			this.stepperUpButton.style.opacity = this.currentQuestionIndex > 0 ? '1' : '0.5';
			this.stepperUpButton.style.pointerEvents = this.currentQuestionIndex > 0 ? 'auto' : 'none';
		}
		if (this.stepperDownButton) {
			this.stepperDownButton.style.opacity = this.currentQuestionIndex < this.questions.length - 1 ? '1' : '0.5';
			this.stepperDownButton.style.pointerEvents = this.currentQuestionIndex < this.questions.length - 1 ? 'auto' : 'none';
		}
	}

	private updateQuestions(): void {
		if (!this.questionsContainer) {
			return;
		}

		// Remove spacer temporarily if it exists (we'll add it back at the end)
		if (this.scrollSpacer && this.scrollSpacer.parentNode) {
			this.scrollSpacer.parentNode.removeChild(this.scrollSpacer);
		}

		// Clear all existing questions
		while (this.questionsContainer.firstChild) {
			this.questionsContainer.removeChild(this.questionsContainer.firstChild);
		}

		// Render all questions first - ensure each is a direct child of questionsContainer
		this.questions.forEach((question, index) => {
			const questionElement = this.createQuestionElement(question, index);
			// Explicitly ensure question is appended directly to questionsContainer, not nested
			if (questionElement.parentNode) {
				questionElement.parentNode.removeChild(questionElement);
			}
			this.questionsContainer!.appendChild(questionElement);
		});

		// Create or re-append spacer element at the END (after all questions)
		// This is an empty container that dynamically adjusts height (like Cursor does)
		// IMPORTANT: Spacer must be a DIRECT CHILD of questionsContainer, not nested inside any question
		if (!this.scrollSpacer) {
			this.scrollSpacer = $('div');
			this.scrollSpacer.className = 'composer-questionnaire-toolbar-scroll-spacer';
			this.scrollSpacer.style.cssText = `
				width: 100%;
				flex-shrink: 0;
			`;
		}

		// Ensure spacer is removed from any parent before appending (in case it got nested)
		if (this.scrollSpacer.parentNode) {
			this.scrollSpacer.parentNode.removeChild(this.scrollSpacer);
		}

		// Always append spacer at the end, after all questions, as a DIRECT CHILD
		this.questionsContainer!.appendChild(this.scrollSpacer);


		// Remove any padding (we use spacer instead)
		if (this.questionsContainer) {
			this.questionsContainer.style.paddingBottom = '0px';
		}

		// Calculate and set spacer height after questions are rendered
		// Use requestAnimationFrame to ensure DOM is updated before calculating
		// Only update spacer if we're not in the middle of a selection (to prevent unwanted scrolling)
		if (!this.isUpdatingFromSelection) {
			const targetWindow = getWindow(this.parent);
			targetWindow.requestAnimationFrame(() => {
				this.updateScrollSpacer();
			});
		}

		// Update scrollable element dimensions and scan
		if (this.scrollableElement && this.questionsContainer) {
			const targetWindow = getWindow(this.parent);
			// Use double requestAnimationFrame to ensure DOM is fully updated
			targetWindow.requestAnimationFrame(() => {
				targetWindow.requestAnimationFrame(() => {
					if (this.scrollableElement && this.questionsContainer && this.scrollContainer) {
						// Scan DOM first to get current dimensions
						this.scrollableElement.scanDomNode();
						// Then update scroll dimensions explicitly
						this.scrollableElement.setScrollDimensions({
							width: this.questionsContainer.clientWidth || this.scrollContainer.offsetWidth,
							scrollWidth: this.questionsContainer.scrollWidth || this.questionsContainer.offsetWidth,
							height: 200, // Fixed height of scroll container
							scrollHeight: this.questionsContainer.scrollHeight
						});
					}
				});
			});
		}
	}

	private updateScrollSpacer(): void {
		this.updateScrollSpacerWithCallback();
	}

	private updateScrollSpacerWithCallback(callback?: () => void): void {
		if (!this.scrollSpacer || !this.questionsContainer || this.questions.length === 0) {
			if (callback) callback();
			return;
		}

		const targetWindow = getWindow(this.parent);
		const viewportHeight = 200;

		// Use requestAnimationFrame to ensure DOM is updated
		targetWindow.requestAnimationFrame(() => {
			if (!this.scrollSpacer || !this.questionsContainer) {
				if (callback) callback();
				return;
			}

			const questionElements = this.questionsContainer.querySelectorAll('.composer-questionnaire-toolbar-question');
			const lastQuestionElement = questionElements[this.questions.length - 1] as HTMLElement;

			if (lastQuestionElement) {
				// Temporarily set spacer height to 0 to measure content without spacer
				this.scrollSpacer.style.height = '0px';

				// Wait for layout to update, then measure
				targetWindow.requestAnimationFrame(() => {
					if (!this.scrollSpacer || !this.questionsContainer) {
						if (callback) callback();
						return;
					}

					const lastQuestionTop = lastQuestionElement.offsetTop;
					const lastQuestionHeight = lastQuestionElement.offsetHeight;
					const contentHeightWithoutSpacer = this.questionsContainer.scrollHeight;

					// Calculate spacer height needed:
					// When we scroll to lastQuestionTop, we want the question at the top of viewport
					// The maximum scroll position is: scrollHeight - viewportHeight
					// For the question to reach the top, we need: maxScroll >= lastQuestionTop
					// So: (contentHeight + spacerHeight) - viewportHeight >= lastQuestionTop
					// Which gives: spacerHeight >= viewportHeight - (contentHeight - lastQuestionTop)
					// Also need extra space if question is taller than viewport
					const spaceNeeded = viewportHeight - (contentHeightWithoutSpacer - lastQuestionTop);
					const extraSpace = lastQuestionHeight > viewportHeight ? lastQuestionHeight - viewportHeight : 0;
					const spacerHeight = Math.max(0, spaceNeeded + extraSpace);

					this.scrollSpacer.style.height = `${spacerHeight}px`;

					// Update scroll dimensions after spacer height is set
					targetWindow.requestAnimationFrame(() => {
						if (this.scrollableElement && this.questionsContainer) {
							this.scrollableElement.scanDomNode();
							this.scrollableElement.setScrollDimensions({
								width: this.questionsContainer.offsetWidth,
								scrollWidth: this.questionsContainer.offsetWidth,
								height: viewportHeight,
								scrollHeight: this.questionsContainer.scrollHeight
							});
						}
						// Execute callback after everything is updated
						if (callback) callback();
					});
				});
			} else {
				if (callback) callback();
			}
		});
	}

	private createQuestionElement(question: QuestionnaireQuestion, index: number): HTMLElement {
		const questionDiv = $('div');
		questionDiv.className = 'composer-questionnaire-toolbar-question composer-questionnaire-toolbar-question-animate-in';
		const isActive = index === this.currentQuestionIndex;
		if (isActive) {
			questionDiv.classList.add('composer-questionnaire-toolbar-question-active');
		}
		questionDiv.style.cssText = `
			display: flex;
			flex-direction: column;
			row-gap: 2px;
			column-gap: 2px;
		`;

		// Question label
		const isDark = this.isDarkTheme();
		const textColor = isActive
			? 'var(--vscode-foreground)'
			: (isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)');

		const label = append(questionDiv, $('label'));
		label.className = 'composer-questionnaire-toolbar-question-label';
		label.style.cssText = `
			display: flex;
			align-items: flex-start;
			column-gap: 8px;
			row-gap: 8px;
			cursor: pointer;
			margin-left: 6px;
			color: ${textColor};
		`;

		const numberDiv = append(label, $('div'));
		numberDiv.className = 'composer-questionnaire-toolbar-question-number';
		numberDiv.textContent = `${index + 1}.`;
		numberDiv.style.cssText = `
			flex-shrink: 0;
			font-weight: 600;
			min-width: 12px;
			color: ${textColor};
		`;

		const questionText = append(label, $('span'));
		questionText.textContent = question.text;
		questionText.style.cssText = `
			flex: 1;
			margin-right: 6px;
			font-weight: 600;
			color: ${textColor};
		`;

		// Options container - align with the "1." number
		// Question div has margin-left: 4px, label has margin-left: 6px
		// So number is at 4px + 6px = 10px from container edge
		// Options should align: 4px (question) + 6px (to match label) = 10px total
		// But structure doc shows margin-left: -4px, which would be 4px + (-4px) = 0px
		// Let's try matching the label's margin: 6px from question div
		const optionsContainer = append(questionDiv, $('div'));
		optionsContainer.className = 'composer-questionnaire-toolbar-options';
		optionsContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 2px;
			margin-top: 4px;
		`;

		question.options.forEach((option) => {
			const optionElement = this.createOptionElement(question, option);
			optionsContainer.appendChild(optionElement);
		});

		return questionDiv;
	}

	private createOptionElement(question: QuestionnaireQuestion, option: QuestionnaireOption): HTMLElement {
		const optionDiv = $('div');
		optionDiv.className = 'composer-questionnaire-toolbar-option';
		optionDiv.setAttribute('role', 'button');
		optionDiv.style.cssText = `
			display: flex;
			align-items: center;
			column-gap: 8px;
			row-gap: 8px;
			cursor: pointer;
			padding: 3px 4px;
			border-radius: 4px;
			transition: background-color 0.1s ease;
		`;

		const isSelected = question.selectedOptionId === option.id;
		const hasSelection = question.selectedOptionId !== undefined;
		const isQuestionActive = this.questions.findIndex(q => q.id === question.id) === this.currentQuestionIndex;

		// Option letter button
		const letterButton = append(optionDiv, $('button'));
		letterButton.className = 'composer-questionnaire-toolbar-option-letter';
		letterButton.setAttribute('type', 'button');
		letterButton.textContent = option.letter;
		// Get border color based on theme
		const isDarkTheme = this.isDarkTheme();
		const borderColor = isSelected
			? 'var(--cursor-text-green-primary, #3ecf8e)'
			: (isDarkTheme ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)');

		letterButton.style.cssText = `
			width: 19px;
			height: 19px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 3px;
			border: 1px solid ${borderColor};
			background: ${isSelected ? 'var(--cursor-text-green-primary, #3ecf8e)' : 'transparent'};
			color: ${isSelected ? 'white' : 'var(--vscode-foreground)'};
			font-weight: 700;
			cursor: pointer;
			flex-shrink: 0;
			font-size: 10px;
			line-height: 10px;
			min-width: 19px;
			padding: 1px;
			box-sizing: border-box;
		`;

		if (isSelected) {
			letterButton.classList.add('composer-questionnaire-toolbar-option-letter-selected');
		}

		// Option label color logic:
		// - If question is active AND has selection AND this option is not selected: use inactive color
		// - If question is active AND (no selection OR this option is selected): use active color
		// - If question is inactive but option is selected: that option uses active color
		// - If question is inactive and has selection (but this option is not selected): use inactive color
		// - Otherwise: use inactive color
		const shouldUseInactiveColor = hasSelection && !isSelected; // If any option is selected and this one isn't, use inactive
		const shouldUseActiveColor = !shouldUseInactiveColor && (isQuestionActive || isSelected);

		// Reuse isDarkTheme from above
		const labelColor = shouldUseInactiveColor
			? (isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)')
			: (shouldUseActiveColor
				? 'var(--vscode-foreground)'
				: (isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'));

		const optionLabel = append(optionDiv, $('span'));
		optionLabel.className = 'composer-questionnaire-toolbar-option-label';
		optionLabel.textContent = option.label;
		optionLabel.style.cssText = `
			flex: 1;
			color: ${labelColor};
			font-weight: 400;
		`;

		if (isSelected) {
			optionLabel.classList.add('composer-questionnaire-toolbar-option-label-selected');
		}

		// Click handler
		this._register(addDisposableListener(optionDiv, 'click', () => {
			this.selectOption(question.id, option.id);
		}));

		// Hover effect - reuse isDarkTheme from above (line 610)
		const hoverBackground = isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
		this._register(addDisposableListener(optionDiv, 'mouseenter', () => {
			// Always apply hover background, even on selected items
			optionDiv.style.backgroundColor = hoverBackground;
		}));
		this._register(addDisposableListener(optionDiv, 'mouseleave', () => {
			optionDiv.style.backgroundColor = 'transparent';
		}));

		return optionDiv;
	}

	private scrollToCurrentQuestion(): void {
		if (!this.questionsContainer || !this.scrollableElement) {
			return;
		}

		const questionElements = this.questionsContainer.querySelectorAll('.composer-questionnaire-toolbar-question');
		const currentQuestionElement = questionElements[this.currentQuestionIndex] as HTMLElement;
		if (!currentQuestionElement) {
			return;
		}

		const viewportHeight = 200;

		// Ensure spacer exists and is at the end as a DIRECT CHILD
		if (!this.scrollSpacer || !this.questionsContainer.contains(this.scrollSpacer)) {
			// Spacer was removed, recreate it
			if (!this.scrollSpacer) {
				this.scrollSpacer = $('div');
				this.scrollSpacer.className = 'composer-questionnaire-toolbar-scroll-spacer';
				this.scrollSpacer.style.cssText = `
					width: 100%;
					flex-shrink: 0;
				`;
			}
			// If spacer exists but is in wrong parent, remove it first
			if (this.scrollSpacer.parentNode && this.scrollSpacer.parentNode !== this.questionsContainer) {
				this.scrollSpacer.parentNode.removeChild(this.scrollSpacer);
			}
			// Append spacer at the end as a DIRECT CHILD of questionsContainer
			this.questionsContainer.appendChild(this.scrollSpacer);
		} else if (this.scrollSpacer.parentNode !== this.questionsContainer) {
			// Spacer exists but is nested incorrectly - move it
			this.scrollSpacer.parentNode?.removeChild(this.scrollSpacer);
			this.questionsContainer.appendChild(this.scrollSpacer);
		}

		// Update spacer height first - this will trigger its own requestAnimationFrame chain
		// We need to wait for that to complete before scrolling
		this.updateScrollSpacerWithCallback(() => {
			// Now spacer height is set, we can scroll
			if (this.scrollableElement && this.questionsContainer) {
				// Re-query to ensure we have the latest element positions after spacer sizing
				const questionElements = this.questionsContainer.querySelectorAll('.composer-questionnaire-toolbar-question');
				const currentElement = questionElements[this.currentQuestionIndex] as HTMLElement;
				if (!currentElement) return;

				// Verify spacer is still there and has height
				if (!this.scrollSpacer || !this.questionsContainer.contains(this.scrollSpacer)) {
					// Recreate spacer and retry
					if (!this.scrollSpacer) {
						this.scrollSpacer = $('div');
						this.scrollSpacer.className = 'composer-questionnaire-toolbar-scroll-spacer';
						this.scrollSpacer.style.cssText = `width: 100%; flex-shrink: 0;`;
					}
					this.questionsContainer.appendChild(this.scrollSpacer);
					// Retry the entire scroll operation
					this.scrollToCurrentQuestion();
					return;
				}

				const spacerHeight = this.scrollSpacer.offsetHeight;
				if (spacerHeight === 0) {
					// Spacer height wasn't set - retry the entire scroll operation
					this.scrollToCurrentQuestion();
					return;
				}

				const questionTop = currentElement.offsetTop;
				const contentHeight = this.questionsContainer.scrollHeight;

				// Update scroll dimensions with spacer included
				this.scrollableElement.scanDomNode();
				this.scrollableElement.setScrollDimensions({
					width: this.questionsContainer.offsetWidth,
					scrollWidth: this.questionsContainer.offsetWidth,
					height: viewportHeight,
					scrollHeight: contentHeight
				});

				// Calculate maximum scroll position
				const maxScroll = Math.max(0, contentHeight - viewportHeight);

				// Scroll to position question at top
				// With spacer, maxScroll should be >= questionTop for all questions including last
				const scrollTop = Math.min(questionTop, maxScroll);

				// Scroll to position
				this.scrollableElement.setScrollPosition({ scrollTop });
				this.questionsContainer.scrollTop = scrollTop;
			}
		});
	}

	private updateVisibility(): void {
		if (!this.toolbar) {
			return;
		}

		if (this.questions.length > 0) {
			this.toolbar.style.display = 'block';
		} else {
			this.toolbar.style.display = 'none';
		}
	}

	public clear(): void {
		this.questions = [];
		this.currentQuestionIndex = 0;
		this.updateQuestions();
		this.updateStepper();
		this.updateVisibility();
	}

	/**
	 * Get all selected answers as question-answer pairs.
	 * Returns array of { questionId, questionText, answerText } for questions that have been answered.
	 */
	public getSelectedAnswers(): Array<{ questionId: string; questionText: string; answerText: string }> {
		const answers: Array<{ questionId: string; questionText: string; answerText: string }> = [];

		for (const question of this.questions) {
			if (question.selectedOptionId) {
				// Find the selected option to get its label
				const selectedOption = question.options.find(opt => opt.id === question.selectedOptionId);
				if (selectedOption) {
					answers.push({
						questionId: question.id,
						questionText: question.text,
						answerText: selectedOption.label
					});
				}
			}
		}

		return answers;
	}
}

