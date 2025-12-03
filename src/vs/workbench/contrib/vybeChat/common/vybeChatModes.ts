/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Modes
 * Wrapper around upstream chat modes to maintain compatibility
 */

import { ChatMode } from '../../chat/common/chatModes.js';
import { ChatModeKind } from '../../chat/common/constants.js';

export { ChatMode, ChatModeKind };

// VYBE: Re-export upstream chat modes for compatibility
// VYBE: Add VYBE-specific mode extensions here if needed

