/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE DiffZone Manager Contribution
 * Registers the diff zone manager as a singleton service.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeDiffZoneManager } from '../../common/vybeDiffZoneManager.js';
import { VybeDiffZoneManager } from '../vybeDiffZoneManager.js';

// Register as singleton service so VybeEditService can inject and call refreshDecorationsForUri directly
registerSingleton(IVybeDiffZoneManager, VybeDiffZoneManager, InstantiationType.Delayed);

