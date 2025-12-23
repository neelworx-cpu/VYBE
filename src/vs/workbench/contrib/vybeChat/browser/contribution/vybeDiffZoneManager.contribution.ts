/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE DiffZone Manager Contribution
 * Initializes the diff zone manager as a workbench contribution.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { VybeDiffZoneManager } from '../vybeDiffZoneManager.js';

/**
 * Workbench contribution that initializes the DiffZone manager.
 * This ensures the manager starts listening to editor lifecycle events.
 */
export class VybeDiffZoneManagerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'vybeDiffZoneManager';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		// Create and register the zone manager
		// It will automatically start listening to editor events
		this._register(instantiationService.createInstance(VybeDiffZoneManager));
	}
}

// Register the contribution
registerWorkbenchContribution2(VybeDiffZoneManagerContribution.ID, VybeDiffZoneManagerContribution, WorkbenchPhase.AfterRestored);

