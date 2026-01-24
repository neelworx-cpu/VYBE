/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference types="mermaid" />

import { VybeChatContentPart, IVybeChatMermaidDiagramContent } from './vybeChatContentPart.js';
import { $, addDisposableListener, append, getWindow } from '../../../../../base/browser/dom.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { FileAccess, nodeModulesPath } from '../../../../../base/common/network.js';

/**
 * Renders Mermaid diagrams in AI responses with diagram/code view toggle.
 * Matches codeblock design pattern but renders SVG diagrams instead of code.
 */
export class VybeChatMermaidDiagramPart extends VybeChatContentPart {
	private currentContent: IVybeChatMermaidDiagramContent;
	private targetCode: string = ''; // Full code for streaming towards
	private isStreaming: boolean = false;
	private viewMode: 'diagram' | 'code' = 'diagram'; // Current view mode
	private editor: ICodeEditor | null = null;
	private editorContainer: HTMLElement | null = null;
	private diagramContainer: HTMLElement | null = null;
	private svgElement: HTMLElement | null = null;
	private buttonOverlay: HTMLElement | null = null;
	private expandButton: HTMLElement | null = null;
	private copyButton: HTMLElement | null = null;
	private markdownButton: HTMLElement | null = null;
	private mermaidInitialized: boolean = false;
	private mermaidModule: any = null; // Mermaid module (loaded dynamically)

	constructor(
		content: IVybeChatMermaidDiagramContent,
		_mermaidIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super('mermaidDiagram');
		this.currentContent = content;
		this.targetCode = content.diagramCode;
		this.isStreaming = content.isStreaming ?? false;
	}

	protected createDomNode(): HTMLElement {
		// Outer container (matches markdown-code-outer-container)
		const outerContainer = $('.markdown-code-outer-container');
		outerContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			position: relative;
		`;

		// Width/height wrapper
		const wrapper = $('div');
		wrapper.style.cssText = 'height: 100%; width: 100%;';

		// Code block container (reuse codeblock styling)
		const codeBlockContainer = $('.composer-code-block-container.composer-message-codeblock');
		codeBlockContainer.style.cssText = 'transition: border-color 0.1s ease-in-out;';

		// Position wrapper
		const positionWrapper = $('div');
		positionWrapper.style.cssText = 'position: relative; overflow: hidden;';

		// Content container
		const contentContainer = $('.composer-code-block-content');
		contentContainer.style.cssText = 'display: block; overflow: hidden; position: relative;';

		// Diagram container (for diagram view)
		this.diagramContainer = $('div');
		this.diagramContainer.className = 'mermaid-diagram-container';
		this.diagramContainer.style.cssText = `
			display: ${this.viewMode === 'diagram' ? 'block' : 'none'};
			width: 100%;
			min-height: 100px;
			padding: 12px;
			overflow: auto;
			background-color: var(--vscode-editor-background);
		`;

		// Editor container (for code view)
		this.editorContainer = $('.scrollable-div-container.show-only-on-hover');
		this.editorContainer.style.cssText = `
			display: ${this.viewMode === 'code' ? 'block' : 'none'};
			position: relative;
			overflow-y: hidden;
			overflow-x: visible;
		`;

		// Build hierarchy
		contentContainer.appendChild(this.diagramContainer);
		contentContainer.appendChild(this.editorContainer);
		positionWrapper.appendChild(contentContainer);
		codeBlockContainer.appendChild(positionWrapper);

		// Button overlay (same pattern as codeblock)
		this.buttonOverlay = this.createButtonOverlay(codeBlockContainer);
		contentContainer.appendChild(this.buttonOverlay);
		wrapper.appendChild(codeBlockContainer);
		outerContainer.appendChild(wrapper);

		// Initialize views
		if (this.viewMode === 'diagram') {
			this.renderDiagram();
		} else {
			this.createCodeEditor();
		}

		return outerContainer;
	}

	private async renderDiagram(): Promise<void> {
		if (!this.diagramContainer) {
			return;
		}

		// Clear existing content
		while (this.diagramContainer.firstChild) {
			this.diagramContainer.removeChild(this.diagramContainer.firstChild);
		}

		// Show loading state
		const loadingDiv = $('div');
		loadingDiv.textContent = 'Rendering diagram...';
		loadingDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--vscode-foreground);';
		this.diagramContainer.appendChild(loadingDiv);

		try {
			// Load Mermaid dynamically
			// Mermaid is ESM-only, so we need to use dynamic import with a URL
			if (!this.mermaidModule) {
				try {
					// Try loading from node_modules first
					const resourcePath = `${nodeModulesPath}/mermaid/dist/mermaid.esm.mjs` as any;
					const mermaidPath = FileAccess.asBrowserUri(resourcePath).toString(true);
					this.mermaidModule = await import(/* @vite-ignore */ mermaidPath);
				} catch (localError) {
					// Fallback to CDN if local loading fails
					console.warn('[VybeChatMermaidDiagramPart] Failed to load mermaid from node_modules, trying CDN:', localError);
					try {
						// Use jsDelivr CDN as fallback
						const cdnUrl = 'https://cdn.jsdelivr.net/npm/mermaid@11.12.1/dist/mermaid.esm.min.mjs';
						this.mermaidModule = await import(/* @vite-ignore */ cdnUrl);
					} catch (cdnError) {
						console.error('[VybeChatMermaidDiagramPart] Failed to load mermaid from CDN:', cdnError);
						throw new Error('Mermaid library not available. Please ensure mermaid package is installed or check your internet connection.');
					}
				}
			}

			// Initialize Mermaid if not already done
			if (!this.mermaidInitialized && this.mermaidModule) {
				const isDarkTheme = this.themeService.getColorTheme().type === 'dark';
				this.mermaidModule.default.initialize({
					startOnLoad: false,
					theme: isDarkTheme ? 'dark' : 'default',
					securityLevel: 'loose',
					fontFamily: 'var(--vscode-font-family)'
				});
				this.mermaidInitialized = true;
			}

			// Generate unique ID for this diagram
			const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

			// Render diagram using an iframe to isolate Mermaid from VS Code's TrustedHTML policy
			// Mermaid's DOMPurify tries to create a TrustedTypePolicy that conflicts with VS Code's existing one
			// By rendering in an iframe, we create a separate TrustedTypes context
			let svg: string;
			let bindFunctions: ((element: Element) => void) | undefined;

			// Create a temporary iframe with a blob URL to isolate the rendering
			const iframe = document.createElement('iframe');
			iframe.style.position = 'absolute';
			iframe.style.visibility = 'hidden';
			iframe.style.width = '1px';
			iframe.style.height = '1px';
			iframe.style.border = 'none';
			document.body.appendChild(iframe);

			try {
				// Wait for iframe to be ready
				await new Promise<void>((resolve) => {
					if (iframe.contentDocument?.readyState === 'complete') {
						resolve();
					} else {
						iframe.onload = () => resolve();
						iframe.src = 'about:blank';
					}
				});

				const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
				const iframeWindow = iframe.contentWindow;
				if (!iframeDoc || !iframeWindow) {
					throw new Error('Failed to access iframe document');
				}

				// Inject Mermaid into iframe's global scope
				(iframeWindow as any).mermaid = this.mermaidModule.default;
				(iframeWindow as any).mermaidCode = this.targetCode;
				(iframeWindow as any).mermaidId = uniqueId;
				(iframeWindow as any).mermaidTheme = this.themeService.getColorTheme().type === 'dark' ? 'dark' : 'default';

				// Create script in iframe to render
				const script = iframeDoc.createElement('script');
				script.textContent = `
					(async function() {
						try {
							const mermaid = window.mermaid;
							mermaid.initialize({
								startOnLoad: false,
								theme: window.mermaidTheme,
								securityLevel: 'loose',
								fontFamily: 'var(--vscode-font-family)'
							});
							const result = await mermaid.render(window.mermaidId, window.mermaidCode);
							window.__mermaidResult = result;
						} catch (e) {
							window.__mermaidError = e.message || String(e);
						}
					})();
				`;
				iframeDoc.head.appendChild(script);

				// Wait for rendering (max 5 seconds)
				let attempts = 0;
				while (attempts < 100 && !(iframeWindow as any).__mermaidResult && !(iframeWindow as any).__mermaidError) {
					await new Promise(resolve => setTimeout(resolve, 50));
					attempts++;
				}

				if ((iframeWindow as any).__mermaidError) {
					throw new Error((iframeWindow as any).__mermaidError);
				}

				const result = (iframeWindow as any).__mermaidResult;
				if (!result || !result.svg) {
					throw new Error('Mermaid rendering timed out or returned no result');
				}

				svg = result.svg;
				bindFunctions = result.bindFunctions;
			} finally {
				// Always clean up the iframe
				if (iframe.parentNode) {
					document.body.removeChild(iframe);
				}
			}

			// Remove loading state
			while (this.diagramContainer.firstChild) {
				this.diagramContainer.removeChild(this.diagramContainer.firstChild);
			}

			// Create SVG container
			const svgWrapper = $('div');
			svgWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 100%;';
			// Parse SVG string and append to avoid TrustedHTML issues
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
			const svgElement = svgDoc.documentElement;
			if (svgElement && svgElement.tagName === 'svg') {
				// Clone the SVG element to avoid namespace issues
				const clonedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				// Copy all attributes
				Array.from(svgElement.attributes).forEach(attr => {
					clonedSvg.setAttribute(attr.name, attr.value);
				});
				// Clone all children (deep clone to preserve structure)
				Array.from(svgElement.childNodes).forEach(child => {
					clonedSvg.appendChild(child.cloneNode(true));
				});
				svgWrapper.appendChild(clonedSvg);
				this.svgElement = clonedSvg as unknown as HTMLElement;
				// Make SVG responsive
				clonedSvg.style.maxWidth = '100%';
				clonedSvg.style.height = 'auto';
			} else {
				// Fallback: try to append the parsed document directly
				if (svgElement) {
					svgWrapper.appendChild(svgElement);
					this.svgElement = svgElement as unknown as HTMLElement;
					if (this.svgElement) {
						const svgEl = this.svgElement as unknown as SVGSVGElement;
						svgEl.style.maxWidth = '100%';
						svgEl.style.height = 'auto';
					}
				}
			}

			// Get the SVG element
			const svgEl = svgWrapper.querySelector('svg') as SVGSVGElement | null;
			if (svgEl) {
				this.svgElement = svgEl as unknown as HTMLElement;
				// Make SVG responsive
				svgEl.style.maxWidth = '100%';
				svgEl.style.height = 'auto';
			}

			this.diagramContainer.appendChild(svgWrapper);

			// Bind functions for interactivity
			if (bindFunctions && svgWrapper) {
				bindFunctions(svgWrapper);
			}
		} catch (error) {
			// Show error message
			while (this.diagramContainer.firstChild) {
				this.diagramContainer.removeChild(this.diagramContainer.firstChild);
			}
			const errorDiv = $('div');
			errorDiv.style.cssText = 'padding: 20px; color: var(--vscode-errorForeground);';

			const errorTitle = $('div');
			errorTitle.style.cssText = 'margin-bottom: 8px; font-weight: bold;';
			errorTitle.textContent = 'Failed to render diagram';

			const errorMessage = $('div');
			errorMessage.style.cssText = 'font-size: 12px; color: var(--vscode-foreground);';
			errorMessage.textContent = error instanceof Error ? error.message : String(error);

			const viewCodeBtn = $('button');
			viewCodeBtn.style.cssText = 'margin-top: 8px; padding: 4px 8px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px;';
			viewCodeBtn.textContent = 'View Code';

			errorDiv.appendChild(errorTitle);
			errorDiv.appendChild(errorMessage);
			errorDiv.appendChild(viewCodeBtn);
			this._register(addDisposableListener(viewCodeBtn, 'click', () => {
				this.switchToCodeView();
			}));
			this.diagramContainer.appendChild(errorDiv);
			console.error('[VybeChatMermaidDiagramPart] Failed to render diagram:', error);
		}
	}

	private createCodeEditor(): void {
		if (!this.editorContainer) {
			return;
		}

		// Create text model with mermaid language
		const model = this.modelService.createModel(
			this.isStreaming ? '' : this.targetCode,
			this.languageService.createById('mermaid'),
			undefined
		);

		// Create Monaco editor (same setup as codeblock)
		this.editor = this.instantiationService.createInstance(
			CodeEditorWidget,
			this.editorContainer,
			{
				readOnly: true,
				lineNumbers: 'off',
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				wordWrap: 'off',
				fontSize: 12,
				fontFamily: 'Menlo, Monaco, "Courier New", monospace',
				lineHeight: 18,
				padding: { top: 6, bottom: 6 },
				overviewRulerLanes: 0,
				scrollbar: {
					vertical: 'hidden',
					horizontal: 'auto',
					verticalScrollbarSize: 0,
					horizontalScrollbarSize: 6,
					alwaysConsumeMouseWheel: false
				},
				glyphMargin: false,
				folding: false,
				selectOnLineNumbers: false,
				selectionHighlight: false,
				automaticLayout: true,
				renderLineHighlight: 'none',
				contextmenu: false,
				renderWhitespace: 'none',
				domReadOnly: true
			},
			{
				isSimpleWidget: true,
				contributions: []
			}
		);

		this.editor.setModel(model);
		this._register(this.editor);
		this._register(model);

		// Calculate and set height
		const lineCount = model.getLineCount();
		const height = lineCount * 18 + 12;
		if (this.editorContainer) {
			this.editorContainer.style.height = `${height}px`;
			this.editorContainer.style.minHeight = `${height}px`;
			this.editorContainer.style.maxHeight = `${height}px`;
		}

		// Initial layout
		setTimeout(() => {
			if (this.editor && this.editorContainer?.parentElement) {
				const width = this.editorContainer.parentElement.clientWidth || 507;
				this.editor.layout({ width, height });
			}
		}, 0);
	}

	private createButtonOverlay(codeBlockContainer: HTMLElement): HTMLElement {
		const overlay = $('.composer-codeblock-copy-overlay');

		// Wrapper for alignment
		const overflowWrapper = $('div');
		overflowWrapper.style.cssText = `
			overflow: hidden;
			display: flex;
			justify-content: flex-end;
			align-items: center;
			position: relative;
		`;

		// Actions container
		const actionsContainer = $('div');
		actionsContainer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			justify-self: flex-end;
			flex-shrink: 0;
			position: relative;
			align-items: center;
			gap: 4px;
		`;

		// Expand button (only in diagram view)
		this.expandButton = $('.vybe-icon-button');
		this.expandButton.className = 'vybe-icon-button';
		this.expandButton.style.cssText = `
			height: 20px;
			width: 20px;
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			display: ${this.viewMode === 'diagram' ? 'flex' : 'none'};
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;
		const expandIcon = $('span.codicon.codicon-arrows-expand');
		expandIcon.style.cssText = 'font-size: 12px;';
		this.expandButton.appendChild(expandIcon);
		this._register(addDisposableListener(this.expandButton, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showMermaidModal();
		}));

		// Copy button
		this.copyButton = $('.vybe-icon-button');
		this.copyButton.className = 'vybe-icon-button';
		this.copyButton.style.cssText = `
			height: 20px;
			width: 20px;
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;
		const copyIcon = $('span.codicon.codicon-copy');
		copyIcon.style.cssText = 'font-size: 12px;';
		this.copyButton.appendChild(copyIcon);
		this._register(addDisposableListener(this.copyButton, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.copyDiagramCode();
		}));

		// Markdown button (toggle view)
		this.markdownButton = $('.vybe-icon-button');
		this.markdownButton.className = 'vybe-icon-button';
		this.markdownButton.style.cssText = `
			height: 20px;
			width: 20px;
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;
		const markdownIcon = $('span.codicon.codicon-code');
		markdownIcon.style.cssText = 'font-size: 12px;';
		this.markdownButton.appendChild(markdownIcon);
		this._register(addDisposableListener(this.markdownButton, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleView();
		}));

		actionsContainer.appendChild(this.expandButton);
		actionsContainer.appendChild(this.copyButton);
		actionsContainer.appendChild(this.markdownButton);
		overflowWrapper.appendChild(actionsContainer);
		overlay.appendChild(overflowWrapper);

		// Hover effect (same as codeblock)
		this._register(addDisposableListener(codeBlockContainer, 'mouseenter', () => {
			overlay.style.display = 'flex';
			overlay.style.pointerEvents = 'auto';
		}));

		this._register(addDisposableListener(codeBlockContainer, 'mouseleave', () => {
			overlay.style.display = 'none';
			overlay.style.pointerEvents = 'none';
		}));

		return overlay;
	}

	private toggleView(): void {
		this.viewMode = this.viewMode === 'diagram' ? 'code' : 'diagram';

		// Update visibility
		if (this.diagramContainer) {
			this.diagramContainer.style.display = this.viewMode === 'diagram' ? 'block' : 'none';
		}
		if (this.editorContainer) {
			this.editorContainer.style.display = this.viewMode === 'code' ? 'block' : 'none';
		}

		// Update expand button visibility
		if (this.expandButton) {
			this.expandButton.style.display = this.viewMode === 'diagram' ? 'flex' : 'none';
		}

		// Update markdown button icon
		if (this.markdownButton) {
			const icon = this.markdownButton.querySelector('.codicon');
			if (icon) {
				icon.className = this.viewMode === 'diagram' ? 'codicon codicon-code' : 'codicon codicon-eye';
			}
		}

		// Initialize code editor if switching to code view
		if (this.viewMode === 'code' && !this.editor) {
			this.createCodeEditor();
		}
	}

	private switchToCodeView(): void {
		if (this.viewMode !== 'code') {
			this.toggleView();
		}
	}

	private copyDiagramCode(): void {
		this.clipboardService.writeText(this.targetCode);

		// Visual feedback
		if (this.copyButton) {
			const icon = this.copyButton.querySelector('.codicon');
			if (icon) {
				icon.classList.remove('codicon-copy');
				icon.classList.add('codicon-check');
				setTimeout(() => {
					icon.classList.remove('codicon-check');
					icon.classList.add('codicon-copy');
				}, 1000);
			}
		}
	}

	private isDarkTheme(): boolean {
		const targetWindow = getWindow(this.domNode);
		const workbench = targetWindow.document.querySelector('.monaco-workbench');
		if (workbench) {
			return workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black');
		}
		return targetWindow.document.body.classList.contains('vs-dark') || targetWindow.document.body.classList.contains('hc-black');
	}

	private showMermaidModal(): void {
		const targetWindow = getWindow(this.domNode);
		const document = targetWindow.document;

		// Remove existing modal if any
		const existingModal = document.querySelector('.vybe-mermaid-modal');
		if (existingModal) {
			existingModal.remove();
		}

		// Create overlay
		const overlay = $('div');
		overlay.className = 'vybe-mermaid-modal';
		overlay.style.cssText = `
			position: fixed;
			top: 0px;
			left: 0px;
			width: 100%;
			height: 100%;
			background-color: rgba(14, 14, 14, 0.7);
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			z-index: 2551;
		`;

		// Inner container
		const innerContainer = append(overlay, $('div'));
		innerContainer.className = 'fade-in-fast';
		innerContainer.style.cssText = `
			background-color: var(--vscode-editor-background);
			padding: 0px;
			border-radius: 8px;
			box-shadow: rgba(0, 0, 0, 0.15) 0px 4px 20px;
			width: calc(-10vh + 100vw);
			display: flex;
			flex-direction: column;
			gap: 12px;
			z-index: 2552;
			height: 90vh;
			max-width: none;
			max-height: none;
			position: relative;
		`;

		// Content wrapper (pannable viewport)
		const contentWrapper = append(innerContainer, $('div'));
		contentWrapper.setAttribute('tabindex', '0');
		contentWrapper.className = 'mermaid-diagram-pannable-viewport group outline-none';
		contentWrapper.style.cssText = `
			height: 100%;
			width: 100%;
			outline: none;
			display: block;
			overflow: hidden;
			position: relative;
		`;

		// Pannable wrapper (handles pan/zoom)
		const pannableWrapper = append(contentWrapper, $('div'));
		pannableWrapper.className = 'mermaid-diagram-pannable-wrapper';
		pannableWrapper.style.cssText = `
			cursor: grab;
			transition: transform 0.1s ease-out;
			position: absolute;
			top: 0px;
			left: 0px;
			height: 100%;
			width: 100%;
			display: flex;
			justify-content: center;
			align-items: center;
			transform: translate(0px, 0px);
		`;

		// Diagram content container (zoomable)
		const diagramContent = append(pannableWrapper, $('div'));
		diagramContent.className = 'mermaid-diagram-content';
		diagramContent.style.cssText = `
			transform-origin: center center;
			transform: scale(1);
			transition: transform 0.1s ease-out;
		`;

		// Clone or re-render SVG for modal
		const svgContainer = append(diagramContent, $('div'));
		svgContainer.style.cssText = 'display: flex; justify-content: center; align-items: center;';

		// Try to clone existing SVG, otherwise re-render
		if (this.svgElement) {
			const clonedSvg = this.svgElement.cloneNode(true) as HTMLElement;
			svgContainer.appendChild(clonedSvg);
		} else {
			// Re-render if no SVG available
			this.renderDiagramForModal(svgContainer);
		}

		// Controls toolbar (bottom-right)
		const controls = append(innerContainer, $('div'));
		controls.className = 'mermaid-diagram-controls group-hover:opacity-100 opacity-0 transition-opacity duration-100';
		controls.style.cssText = `
			position: absolute;
			bottom: 12px;
			right: 12px;
			display: flex;
			gap: 6px;
			z-index: 2;
		`;

		// Contract button (close modal)
		const contractBtn = append(controls, $('div'));
		contractBtn.className = 'anysphere-icon-button';
		contractBtn.style.cssText = `
			width: 20px;
			height: 20px;
			background: transparent;
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;
		const contractIcon = append(contractBtn, $('span'));
		contractIcon.className = 'codicon codicon-arrows-contract';
		contractIcon.style.cssText = 'font-size: 16px; color: var(--vscode-foreground);';

		// Copy button
		const copyBtn = append(controls, $('div'));
		copyBtn.className = 'anysphere-icon-button';
		copyBtn.style.cssText = contractBtn.style.cssText;
		const copyIcon = append(copyBtn, $('span'));
		copyIcon.className = 'codicon codicon-copy-two';
		copyIcon.style.cssText = 'font-size: 16px; color: var(--vscode-foreground);';

		// Pan/Zoom functionality
		let isPanning = false;
		let startX = 0;
		let startY = 0;
		let currentX = 0;
		let currentY = 0;
		let scale = 1;

		// Mouse down - start panning
		this._register(addDisposableListener(pannableWrapper, 'mousedown', (e) => {
			if (e.button === 0) { // Left mouse button
				isPanning = true;
				pannableWrapper.style.cursor = 'grabbing';
				startX = e.clientX - currentX;
				startY = e.clientY - currentY;
			}
		}));

		// Mouse move - pan
		this._register(addDisposableListener(document, 'mousemove', (e) => {
			if (isPanning) {
				e.preventDefault();
				currentX = e.clientX - startX;
				currentY = e.clientY - startY;
				pannableWrapper.style.transform = `translate(${currentX}px, ${currentY}px)`;
			}
		}));

		// Mouse up - stop panning
		this._register(addDisposableListener(document, 'mouseup', () => {
			if (isPanning) {
				isPanning = false;
				pannableWrapper.style.cursor = 'grab';
			}
		}));

		// Wheel - zoom
		this._register(addDisposableListener(contentWrapper, 'wheel', (e) => {
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
				const delta = e.deltaY > 0 ? 0.9 : 1.1;
				scale = Math.max(0.5, Math.min(5, scale * delta));
				diagramContent.style.transform = `scale(${scale})`;
			}
		}));

		// Close functionality
		const closeModal = () => {
			overlay.remove();
		};

		this._register(addDisposableListener(contractBtn, 'click', (e) => {
			e.stopPropagation();
			closeModal();
		}));

		this._register(addDisposableListener(copyBtn, 'click', (e) => {
			e.stopPropagation();
			this.copyDiagramCode();
		}));

		// Close on overlay click
		this._register(addDisposableListener(overlay, 'click', (e) => {
			if (e.target === overlay) {
				closeModal();
			}
		}));

		// Close on Escape key
		const escapeHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				closeModal();
				targetWindow.removeEventListener('keydown', escapeHandler);
			}
		};
		targetWindow.addEventListener('keydown', escapeHandler);
		this._register({
			dispose: () => targetWindow.removeEventListener('keydown', escapeHandler)
		});

		document.body.appendChild(overlay);
	}

	private async renderDiagramForModal(container: HTMLElement): Promise<void> {
		try {
			// Load Mermaid if not already loaded
			if (!this.mermaidModule) {
				try {
					const resourcePath = `${nodeModulesPath}/mermaid/dist/mermaid.esm.mjs` as any;
					const mermaidPath = FileAccess.asBrowserUri(resourcePath).toString(true);
					this.mermaidModule = await import(/* @vite-ignore */ mermaidPath);
				} catch (localError) {
					// Fallback to CDN if local loading fails
					console.warn('[VybeChatMermaidDiagramPart] Failed to load mermaid from node_modules, trying CDN:', localError);
					const cdnUrl = 'https://cdn.jsdelivr.net/npm/mermaid@11.12.1/dist/mermaid.esm.min.mjs';
					this.mermaidModule = await import(/* @vite-ignore */ cdnUrl);
				}
			}

			// Initialize if needed
			if (!this.mermaidInitialized && this.mermaidModule) {
				const isDarkTheme = this.isDarkTheme();
				this.mermaidModule.default.initialize({
					startOnLoad: false,
					theme: isDarkTheme ? 'dark' : 'default',
					securityLevel: 'loose',
					fontFamily: 'var(--vscode-font-family)'
				});
				this.mermaidInitialized = true;
			}

			// Render
			const uniqueId = `mermaid-modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			const { svg, bindFunctions } = await this.mermaidModule.default.render(uniqueId, this.targetCode);

			// Parse SVG string and append to avoid TrustedHTML issues
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
			const svgElement = svgDoc.documentElement;
			if (svgElement && svgElement.tagName === 'svg') {
				// Clone the SVG element to avoid namespace issues
				const clonedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				// Copy all attributes
				Array.from(svgElement.attributes).forEach(attr => {
					clonedSvg.setAttribute(attr.name, attr.value);
				});
				// Clone all children (deep clone to preserve structure)
				Array.from(svgElement.childNodes).forEach(child => {
					clonedSvg.appendChild(child.cloneNode(true));
				});
				container.appendChild(clonedSvg);
				// Make SVG responsive
				clonedSvg.style.maxWidth = '100%';
				clonedSvg.style.height = 'auto';
			} else if (svgElement) {
				// Fallback: try to append the parsed document directly
				container.appendChild(svgElement);
				const svgEl = svgElement as unknown as SVGSVGElement;
				svgEl.style.maxWidth = '100%';
				svgEl.style.height = 'auto';
			}

			if (bindFunctions) {
				bindFunctions(container);
			}
		} catch (error) {
			// Clear container
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			const errorDiv = $('div');
			errorDiv.style.cssText = 'padding: 20px; color: var(--vscode-errorForeground);';
			errorDiv.textContent = `Failed to render: ${error instanceof Error ? error.message : String(error)}`;
			container.appendChild(errorDiv);
		}
	}

	public override hasSameContent(other: any): boolean {
		return other.kind === 'mermaidDiagram' &&
			other.diagramCode === this.targetCode &&
			other.diagramType === this.currentContent.diagramType;
	}

	public updateContent(newContent: any): void {
		if (newContent.kind !== 'mermaidDiagram') {
			return;
		}
		if (this.hasSameContent(newContent)) {
			return;
		}

		this.currentContent = newContent as IVybeChatMermaidDiagramContent;
		this.targetCode = newContent.diagramCode;
		this.isStreaming = newContent.isStreaming ?? false;

		// Update editor if in code view
		if (this.editor && this.viewMode === 'code') {
			const model = this.editor.getModel();
			if (model) {
				model.setValue(this.targetCode);
				const lineCount = model.getLineCount();
				const height = lineCount * 18 + 12;
				if (this.editorContainer) {
					this.editorContainer.style.height = `${height}px`;
					this.editorContainer.style.minHeight = `${height}px`;
					this.editorContainer.style.maxHeight = `${height}px`;
					this.editor.layout({ width: this.editorContainer.clientWidth, height });
				}
			}
		}

		// Re-render diagram if in diagram view
		if (this.viewMode === 'diagram') {
			this.renderDiagram();
		}
	}

	override dispose(): void {
		this.editor = null;
		this.editorContainer = null;
		this.diagramContainer = null;
		this.svgElement = null;
		this.buttonOverlay = null;
		this.expandButton = null;
		this.copyButton = null;
		this.markdownButton = null;
		super.dispose();
	}
}
