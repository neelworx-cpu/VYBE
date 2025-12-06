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

// Register actions
import '../actions/vybeChatActions.js';
