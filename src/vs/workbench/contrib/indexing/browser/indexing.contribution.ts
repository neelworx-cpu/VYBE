/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IndexingToolsContribution } from './indexingTools.js';
import { IndexingMcpToolContribution } from './indexingMcpTools.js';
import { registerIndexingCommands } from './indexingCommands.js';

// Phase 12: Register all contributions
registerWorkbenchContribution2(IndexingToolsContribution.ID, IndexingToolsContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(IndexingMcpToolContribution.ID, IndexingMcpToolContribution, WorkbenchPhase.BlockStartup);

// Register commands
registerIndexingCommands();

