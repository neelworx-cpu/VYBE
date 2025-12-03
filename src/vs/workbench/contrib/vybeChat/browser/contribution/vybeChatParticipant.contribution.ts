/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../../common/views.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { VYBE_CHAT_DEFAULT_SESSION_ID, getVybeChatViewContainerId, getVybeChatViewId, VYBE_CHAT_NEW_CHAT_LABEL } from '../../common/vybeChatConstants.js';
import { getVybeChatIconUri } from '../../common/vybeChatIcon.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { VybeChatViewPane } from '../vybeChatViewPane.js';

/**
 * Statically register the default "New Chat" container at module load time.
 * This ensures it's available immediately when the sidebar opens, preventing empty sidebar.
 * Similar to how Copilot Chat registers its container statically.
 */
const defaultVybeChatViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: getVybeChatViewContainerId(VYBE_CHAT_DEFAULT_SESSION_ID),
	title: localize2('vybeChat.newChat', VYBE_CHAT_NEW_CHAT_LABEL),
	icon: getVybeChatIconUri(),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [getVybeChatViewContainerId(VYBE_CHAT_DEFAULT_SESSION_ID), { mergeViewWithContainerWhenSingleView: true }]),
	storageId: getVybeChatViewContainerId(VYBE_CHAT_DEFAULT_SESSION_ID),
	hideIfEmpty: false,
	order: 1,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

/**
 * Statically register the default "New Chat" view descriptor.
 * This view is always present in the default container.
 */
const defaultVybeChatViewDescriptor: IViewDescriptor = {
	id: getVybeChatViewId(VYBE_CHAT_DEFAULT_SESSION_ID),
	name: localize2('vybeChat.newChat', VYBE_CHAT_NEW_CHAT_LABEL),
	containerIcon: getVybeChatIconUri(),
	containerTitle: VYBE_CHAT_NEW_CHAT_LABEL,
	singleViewPaneContainerTitle: VYBE_CHAT_NEW_CHAT_LABEL,
	ctorDescriptor: new SyncDescriptor(VybeChatViewPane),
	canToggleVisibility: false,
	canMoveView: false, // VYBE Chat sessions cannot be moved to other containers
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([defaultVybeChatViewDescriptor], defaultVybeChatViewContainer);

/**
 * Export the default container so it can be used by the sessions service.
 * This allows the service to reference the statically registered container
 * instead of creating a new one.
 */
export const DEFAULT_VYBE_CHAT_VIEW_CONTAINER = defaultVybeChatViewContainer;
