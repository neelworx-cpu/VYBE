/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export class VybeSettingsEditorInput extends EditorInput {
	static readonly ID = 'vybeSettingsEditorInput';

	override get typeId(): string { return VybeSettingsEditorInput.ID; }
	override get editorId(): string | undefined { return VybeSettingsEditorInput.ID; }
	override get resource(): undefined { return undefined; }
	override getName(): string { return localize('vybeSettings.editorName', "VYBE Settings"); }
	override matches(other: unknown): boolean { return other instanceof VybeSettingsEditorInput; }
	override isReadonly(): boolean { return true; }
	override isDirty(): boolean { return false; }
	override getIcon(): ThemeIcon | undefined { return ThemeIcon.fromId('settings'); }
}

