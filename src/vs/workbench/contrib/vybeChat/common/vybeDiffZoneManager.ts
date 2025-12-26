/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE DiffZone Manager Service Interface
 * Service for managing diff decorations and widgets in editors.
 */

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IVybeDiffZoneManager = createDecorator<IVybeDiffZoneManager>('vybeDiffZoneManager');

/**
 * Service for managing diff zone decorations and widgets.
 * Handles visual decorations for AI-generated diffs in editors.
 */
export interface IVybeDiffZoneManager {
	readonly _serviceBrand: undefined;

	/**
	 * Refreshes decorations and widgets for all zones associated with a URI.
	 * This ensures widgets are recreated with fresh diff IDs after recomputation.
	 * @param uri The URI of the file to refresh decorations for
	 */
	refreshDecorationsForUri(uri: URI): void;
}

