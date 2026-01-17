/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Register view container
import './vybeChatParticipant.contribution.js';

// Register session management (dynamic view registration)
import './vybeChatSessions.contribution.js';

// Register initialization (ensures default chat tab always exists)
import './vybeChatInitialization.contribution.js';

// Register terminal selection button
import './terminalSelectionButton.contribution.js';

// Register terminal prompt bar
import './vybeTerminalPromptBar.contribution.js';
import './vybeTerminalPromptBarActions.js';

// Register actions
import '../actions/vybeChatActions.js';

// Register diff service
import './vybeDiffService.contribution.js';

// Register edit service
import './vybeEditService.contribution.js';

// Register diff zone manager
import './vybeDiffZoneManager.contribution.js';

// Register diff decorations configuration
import './vybeDiffDecorations.contribution.js';

// Register checkpoint service
import './vybeCheckpointService.contribution.js';

// Note: MCP execution service removed - now using LangChain/LangGraph
