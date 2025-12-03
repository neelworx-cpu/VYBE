/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, getWindow } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';

export interface ImageAttachment {
	id: string;
	url: string;
	file: File;
}

export class ImageAttachments extends Disposable {
	public toolbar: HTMLElement | null = null;
	private scrollableContainer: HTMLElement | null = null;
	private imageContainer: HTMLElement | null = null;
	private scrollableElement: DomScrollableElement | null = null;
	private images: Map<string, ImageAttachment> = new Map();
	private onChangeCallback: (() => void) | null = null;

	constructor(private parent: HTMLElement) {
		super();
		this.toolbar = this.renderToolbar();
		// Don't append here - let the caller insert it in the right position
		// parent.appendChild(this.toolbar);
	}

	private renderToolbar(): HTMLElement {
		// Outer container - matches provided HTML structure
		const outerContainer = $('div');
		outerContainer.style.cssText = `
			border-bottom: none;
			display: flex;
			flex-direction: column;
			gap: 2px;
			margin-bottom: 0;
		`;

		// Scrollable container wrapper
		const scrollWrapper = append(outerContainer, $('div'));
		scrollWrapper.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 4px;
			outline: none;
			overflow: hidden;
		`;

		// Scrollable container with fixed height
		this.scrollableContainer = append(scrollWrapper, $('div'));
		this.scrollableContainer.style.cssText = `
			width: 100%;
			overflow: hidden;
			height: 32px;
			margin-top: 2px;
		`;

		// Content container (will be wrapped by DomScrollableElement)
		this.imageContainer = $('div');
		this.imageContainer.style.cssText = `
			display: flex;
			gap: 8px;
			height: 32px;
			min-width: 100%;
		`;

		// Create VS Code ScrollableElement for horizontal scrolling
		this.scrollableElement = this._register(new DomScrollableElement(this.imageContainer, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			useShadows: false,
			verticalScrollbarSize: 6,
			horizontalScrollbarSize: 6
		}));

		const scrollableDomNode = this.scrollableElement.getDomNode();
		scrollableDomNode.style.cssText = `
			height: 100%;
			width: 100%;
		`;

		this.scrollableContainer.appendChild(scrollableDomNode);

		// Initially hidden - will show when images are added
		outerContainer.style.display = 'none';
		this.toolbar = outerContainer;

		return outerContainer;
	}

	public setOnChangeCallback(callback: () => void): void {
		this.onChangeCallback = callback;
	}

	public addImage(file: File): void {
		const imageId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const imageUrl = URL.createObjectURL(file);

		this.images.set(imageId, { id: imageId, url: imageUrl, file });

		this.updateImages();

		// Notify change
		if (this.onChangeCallback) {
			this.onChangeCallback();
		}
	}

	public removeImage(imageId: string): void {
		const image = this.images.get(imageId);
		if (image) {
			URL.revokeObjectURL(image.url);
			this.images.delete(imageId);
		}
		this.updateImages();

		// Notify change
		if (this.onChangeCallback) {
			this.onChangeCallback();
		}
	}

	public getImages(): ImageAttachment[] {
		return Array.from(this.images.values());
	}

	public clear(): void {
		// Revoke all object URLs
		this.images.forEach(image => {
			URL.revokeObjectURL(image.url);
		});
		this.images.clear();
		this.updateImages();
	}

	private updateImages(): void {
		if (!this.imageContainer || !this.toolbar) {
			return;
		}

		// Clear existing images
		while (this.imageContainer.firstChild) {
			this.imageContainer.removeChild(this.imageContainer.firstChild);
		}

		// Show/hide toolbar based on whether there are images
		if (this.images.size === 0) {
			this.toolbar.style.display = 'none';
			this.toolbar.style.marginBottom = '0';
			return;
		}

		this.toolbar.style.display = 'flex';
		// Add gap below image toolbar (will be adjusted based on whether pills exist)
		this.toolbar.style.marginBottom = '4px';

		// Render image pills
		this.images.forEach((image) => {
			const pill = this.createImagePill(image);
			this.imageContainer!.appendChild(pill);
		});

		// Update scrollable element
		if (this.scrollableElement) {
			setTimeout(() => {
				this.scrollableElement?.scanDomNode();
			}, 0);
		}

		// Update margin based on whether context pills exist (check parent for pills toolbar)
		this.updateMargin();
	}

	public updateMargin(): void {
		if (!this.toolbar || this.toolbar.style.display === 'none') {
			return;
		}

		// Keep 4px for image toolbar
		this.toolbar.style.marginBottom = '4px';
	}

	private createImagePill(image: ImageAttachment): HTMLElement {
		const pill = $('div');
		pill.className = 'context-pill context-pill-image';
		pill.setAttribute('data-image-id', image.id);
		pill.style.cssText = `
			display: flex;
			align-items: center;
			height: 32px;
			flex-shrink: 0;
		`;

		const imageContainer = append(pill, $('div'));
		imageContainer.className = 'image-pill-container';
		imageContainer.style.cssText = `
			width: 32px;
			height: 32px;
			position: relative;
			overflow: hidden;
			border-radius: 4px;
			cursor: pointer;
		`;

		const img = append(imageContainer, $('img')) as HTMLImageElement;
		img.className = 'image-pill-img';
		img.alt = 'Attached image';
		img.src = image.url;
		img.style.cssText = `
			width: 100%;
			height: 100%;
			object-fit: cover;
		`;

		// Hover effect - show close button at top right corner
		const closeBtn = append(imageContainer, $('span'));
		closeBtn.className = 'codicon codicon-close';
		closeBtn.style.cssText = `
			position: absolute;
			top: 2px;
			right: 2px;
			font-size: 14px;
			width: 14px;
			height: 14px;
			display: none;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			background-color: rgba(128, 128, 128, 0.8);
			border-radius: 4px;
			color: white;
			z-index: 2;
		`;

		this._register(addDisposableListener(imageContainer, 'mouseenter', () => {
			closeBtn.style.display = 'flex';
		}));

		this._register(addDisposableListener(imageContainer, 'mouseleave', () => {
			closeBtn.style.display = 'none';
		}));

		this._register(addDisposableListener(closeBtn, 'click', (e) => {
			e.stopPropagation();
			this.removeImage(image.id);
		}));

		// Click on image to open modal (but not on close button)
		this._register(addDisposableListener(imageContainer, 'click', (e) => {
			// Only open modal if clicking on the image container or image, not the close button
			const target = e.target as HTMLElement;
			if ((target === imageContainer || target === img) && !closeBtn.contains(target)) {
				this.showImageModal(image);
			}
		}));

		return pill;
	}

	private isDarkTheme(): boolean {
		const targetWindow = getWindow(this.parent);
		const workbench = targetWindow.document.querySelector('.monaco-workbench');
		if (workbench) {
			return workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black');
		}
		return targetWindow.document.body.classList.contains('vs-dark') || targetWindow.document.body.classList.contains('hc-black');
	}

	private showImageModal(image: ImageAttachment): void {
		const targetWindow = getWindow(this.parent);
		const document = targetWindow.document;
		const isDarkTheme = this.isDarkTheme();

		// Remove existing modal if any
		const existingModal = document.querySelector('.vybe-image-modal');
		if (existingModal) {
			existingModal.remove();
		}

		// Create overlay
		const overlay = $('div');
		overlay.className = 'vybe-image-modal';
		overlay.style.cssText = `
			position: fixed;
			top: 0px;
			left: 0px;
			width: 100%;
			height: 100%;
			background-color: rgba(170, 170, 170, 0.7);
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
			background: transparent;
			padding: 0px;
			border-radius: 8px;
			box-shadow: none;
			width: calc(-10vh + 100vw);
			display: flex;
			flex-direction: column;
			gap: 12px;
			z-index: 2552;
			height: 90vh;
			max-width: none;
			max-height: none;
			border: none;
		`;

		// Content wrapper
		const contentWrapper = append(innerContainer, $('div'));
		contentWrapper.setAttribute('tabindex', '0');
		contentWrapper.style.cssText = `
			height: 100%;
			width: 100%;
			outline: none;
			display: flex;
			align-items: center;
			justify-content: center;
		`;

		// Image container
		const imageWrapper = append(contentWrapper, $('div'));
		imageWrapper.style.cssText = `
			display: inline-block;
			position: relative;
		`;

		// Image
		const modalImg = append(imageWrapper, $('img')) as HTMLImageElement;
		modalImg.className = 'fade-in-fast';
		modalImg.src = image.url;
		modalImg.alt = 'Attached image';
		modalImg.style.cssText = `
			max-width: 100%;
			max-height: 80vh;
			object-fit: contain;
			border-radius: 8px;
			display: block;
		`;

		// Toolbar with download and close buttons
		const toolbar = append(imageWrapper, $('div'));
		const toolbarBg = isDarkTheme ? '#1e1f21' : '#f8f8f9';
		const toolbarBorder = isDarkTheme ? '#383838' : '#d9d9d9';
		toolbar.style.cssText = `
			position: absolute;
			top: 6px;
			right: 6px;
			display: flex;
			gap: 6px;
			z-index: 2;
			background-color: ${toolbarBg};
			border: 1px solid ${toolbarBorder};
			border-radius: 6px;
			padding: 4px;
			box-shadow: rgba(0, 0, 0, 0.18) 0px 1px 4px;
		`;

		// Download button
		const downloadBtn = append(toolbar, $('div'));
		downloadBtn.className = 'anysphere-icon-button';
		downloadBtn.style.cssText = `
			width: 16px;
			height: 16px;
			background-color: transparent;
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			border-radius: 5px;
		`;

		// Icon colors based on theme
		const iconColor = isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';
		const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

		const downloadIcon = append(downloadBtn, $('span'));
		downloadIcon.className = 'codicon codicon-arrow-down';
		downloadIcon.style.cssText = `
			font-size: 16px;
			width: 16px;
			height: 16px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: ${iconColor};
			opacity: 1;
		`;

		// Add hover effect to download button
		this._register(addDisposableListener(downloadBtn, 'mouseenter', () => {
			downloadBtn.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(downloadBtn, 'mouseleave', () => {
			downloadBtn.style.backgroundColor = 'transparent';
		}));

		// Close button
		const modalCloseBtn = append(toolbar, $('div'));
		modalCloseBtn.className = 'anysphere-icon-button';
		modalCloseBtn.style.cssText = `
			width: 16px;
			height: 16px;
			background-color: transparent;
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			border-radius: 5px;
		`;

		const closeIcon = append(modalCloseBtn, $('span'));
		closeIcon.className = 'codicon codicon-close';
		closeIcon.style.cssText = `
			font-size: 16px;
			width: 16px;
			height: 16px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: ${iconColor};
			opacity: 1;
		`;

		// Add hover effect to close button
		this._register(addDisposableListener(modalCloseBtn, 'mouseenter', () => {
			modalCloseBtn.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(modalCloseBtn, 'mouseleave', () => {
			modalCloseBtn.style.backgroundColor = 'transparent';
		}));

		// Download functionality
		this._register(addDisposableListener(downloadBtn, 'click', (e) => {
			e.stopPropagation();
			const link = document.createElement('a');
			link.href = image.url;
			link.download = image.file.name;
			link.click();
		}));

		// Close functionality
		const closeModal = () => {
			overlay.remove();
		};

		this._register(addDisposableListener(modalCloseBtn, 'click', (e) => {
			e.stopPropagation();
			closeModal();
		}));

		// Close on overlay click (outside the image)
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

	override dispose(): void {
		// Revoke all object URLs
		this.clear();
		super.dispose();
	}
}

