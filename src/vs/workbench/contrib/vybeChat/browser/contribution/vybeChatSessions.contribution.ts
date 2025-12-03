/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewExtensions, IViewDescriptorService, IViewContainersRegistry, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { getVybeChatViewId, VYBE_CHAT_NEW_CHAT_LABEL, VYBE_CHAT_DEFAULT_SESSION_ID, getVybeChatViewContainerId } from '../../common/vybeChatConstants.js';
import { VybeChatViewPane } from '../vybeChatViewPane.js';
import { getVybeChatIconUri } from '../../common/vybeChatIcon.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { DEFAULT_VYBE_CHAT_VIEW_CONTAINER } from './vybeChatParticipant.contribution.js';

export const IVybeChatSessionsService = createDecorator<IVybeChatSessionsService>('vybeChatSessionsService');

export interface IVybeChatSessionsService {
	readonly _serviceBrand: undefined;

	/**
	 * Create a new chat session (registers a new view)
	 */
	createSession(): Promise<string>;

	/**
	 * Create the default chat session that always exists
	 */
	createDefaultSession(): Promise<string>;

	/**
	 * Close a chat session (deregisters the view)
	 * Note: If this is the last session, a new default session will be created
	 */
	closeSession(sessionId: string): Promise<void>;

	/**
	 * Rename a chat session
	 */
	renameSession(sessionId: string, newName: string): Promise<void>;

	/**
	 * Update session title (called when AI generates a name)
	 */
	updateSessionTitle(sessionId: string, title: string): Promise<void>;

	/**
	 * Get all registered session IDs
	 */
	getAllSessionIds(): string[];
}

class VybeChatSessionsService extends Disposable implements IVybeChatSessionsService {

	declare readonly _serviceBrand: undefined;

	private sessionCounter = 0;
	private readonly registeredContainers = new Map<string, ViewContainer>();

	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();
		// Initialize default session in the map (it's statically registered, but we need to track it)
		// This ensures getAllSessionIds() always includes the default session
		this.registeredContainers.set(VYBE_CHAT_DEFAULT_SESSION_ID, DEFAULT_VYBE_CHAT_VIEW_CONTAINER);
	}

	async createSession(): Promise<string> {
		const sessionId = `session-${Date.now()}-${++this.sessionCounter}`;
		return this.createSessionWithId(sessionId);
	}

	async createDefaultSession(): Promise<string> {
		// Default session uses the statically registered container
		const sessionId = VYBE_CHAT_DEFAULT_SESSION_ID;

		// Check if already registered
		if (this.registeredContainers.has(sessionId)) {
			return sessionId;
		}

		// Use the statically registered container
		const viewContainer = DEFAULT_VYBE_CHAT_VIEW_CONTAINER;
		this.registeredContainers.set(sessionId, viewContainer);

		// The view descriptor is already registered statically, so we're done
		return sessionId;
	}

	private async createSessionWithId(sessionId: string): Promise<string> {
		const containerId = getVybeChatViewContainerId(sessionId);
		const viewId = getVybeChatViewId(sessionId);

		// Check if container already exists
		if (this.registeredContainers.has(sessionId)) {
			return sessionId;
		}

		// For default session, use statically registered container
		if (sessionId === VYBE_CHAT_DEFAULT_SESSION_ID) {
			return this.createDefaultSession();
		}

		// For other sessions, create a separate VIEW CONTAINER for each chat session
		// This makes each session appear as a separate tab in the composite bar
		const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
			id: containerId,
			title: localize2('vybeChat.newChat', VYBE_CHAT_NEW_CHAT_LABEL),
			icon: getVybeChatIconUri(), // Use VYBE SVG icon - will show when in icon mode
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [containerId, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: containerId,
			hideIfEmpty: false,
			order: 1,
		}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

		// Create view descriptor for this chat session
		const viewDescriptor: IViewDescriptor = {
			id: viewId,
			name: localize2('vybeChat.newChat', VYBE_CHAT_NEW_CHAT_LABEL),
			containerIcon: getVybeChatIconUri(),
			containerTitle: VYBE_CHAT_NEW_CHAT_LABEL,
			singleViewPaneContainerTitle: VYBE_CHAT_NEW_CHAT_LABEL,
			ctorDescriptor: new SyncDescriptor(VybeChatViewPane),
			canToggleVisibility: false, // Can't hide the only view in the container
			canMoveView: false, // VYBE Chat sessions cannot be moved to other containers
		};

		// Register the view in the container
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);
		this.registeredContainers.set(sessionId, viewContainer);

		return sessionId;
	}

	async closeSession(sessionId: string): Promise<void> {
		// Prevent closing the default session - it must always exist
		if (sessionId === VYBE_CHAT_DEFAULT_SESSION_ID) {
			// Default session cannot be closed - it's statically registered
			return;
		}

		const viewContainer = this.registeredContainers.get(sessionId);

		if (viewContainer) {
			// Get the view descriptor to deregister it
			const viewId = getVybeChatViewId(sessionId);
			const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(viewId);

			if (viewDescriptor) {
				// Deregister the view descriptor
				Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews([viewDescriptor], viewContainer);
			}

			// Deregister the view container (only for non-default sessions)
			Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).deregisterViewContainer(viewContainer);
			this.registeredContainers.delete(sessionId);
		}
	}

	async renameSession(sessionId: string, newName: string): Promise<void> {
		const viewContainer = this.registeredContainers.get(sessionId);
		if (!viewContainer) {
			return;
		}

		const viewId = getVybeChatViewId(sessionId);
		const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(viewId);
		if (!viewDescriptor) {
			return;
		}

		// CRITICAL: Only update view descriptor, NOT container
		// The container stays registered, preventing the sidebar from closing.
		// ViewContainerModel.updateContainerInfo() will automatically pick up the new name
		// from the view descriptor's containerTitle or name property.

		// Deregister old view descriptor
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews([viewDescriptor], viewContainer);

		// Register updated view descriptor with new name (same container)
		const updatedDescriptor: IViewDescriptor = {
			...viewDescriptor,
			name: { value: newName, original: newName },
			containerTitle: newName,
			singleViewPaneContainerTitle: newName,
		};
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([updatedDescriptor], viewContainer);

		// Also update the container's title directly to ensure the action label updates
		// This is safe because we're updating a property, not re-registering the container
		// The ViewContainerModel uses the container's title when useDefaultContainerInfo is true
		if (typeof viewContainer.title === 'string') {
			(viewContainer as any).title = newName;
		} else if (viewContainer.title) {
			// ILocalizedString has { value: string, original: string }
			(viewContainer.title as any).value = newName;
			(viewContainer.title as any).original = newName;
		}

		// Get the ViewContainerModel and manually trigger updateContainerInfo()
		// This ensures the UI updates immediately by firing onDidChangeContainerInfo
		const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
		// Call the private updateContainerInfo method via reflection
		// This will fire onDidChangeContainerInfo which updates the composite bar action item
		if (viewContainerModel && (viewContainerModel as any).updateContainerInfo) {
			(viewContainerModel as any).updateContainerInfo();
		}
	}

	async updateSessionTitle(sessionId: string, title: string): Promise<void> {
		// Same as rename for now
		await this.renameSession(sessionId, title);
	}

	getAllSessionIds(): string[] {
		return Array.from(this.registeredContainers.keys());
	}
}

// Register service
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
registerSingleton(IVybeChatSessionsService, VybeChatSessionsService, InstantiationType.Delayed);
