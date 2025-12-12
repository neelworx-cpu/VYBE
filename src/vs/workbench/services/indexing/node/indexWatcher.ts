/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService, FileChangeType, IFileChange } from '../../../../platform/files/common/files.js';
import { debounce } from '../../../../base/common/decorators.js';

export interface WatcherEvent {
	readonly added: URI[];
	readonly changed: URI[];
	readonly deleted: URI[];
}

export class IndexWatcher extends Disposable {
	private readonly _onDidBatch = this._register(new Emitter<WatcherEvent>());
	readonly onDidBatch: Event<WatcherEvent> = this._onDidBatch.event;

	private watcherDisposable: IDisposable | undefined;
	private pending: IFileChange[] = [];

	constructor(
		private readonly fileService: IFileService,
		private readonly roots: URI[],
	) {
		super();
	}

	start(): void {
		if (this.watcherDisposable) {
			return;
		}
		this.watcherDisposable = this.fileService.watch(this.roots[0], { recursive: true, excludes: [] });
		this._register(this.fileService.onDidFilesChange(e => {
			const anyEvent = e as any;
			if (anyEvent?.changes) {
				this.pending.push(...anyEvent.changes);
			}
			this.flushDebounced();
		}));
	}

	stop(): void {
		this.watcherDisposable?.dispose();
		this.watcherDisposable = undefined;
		this.pending = [];
	}

	@debounce(300)
	private flushDebounced() {
		if (this.pending.length === 0) {
			return;
		}
		const added: URI[] = [];
		const changed: URI[] = [];
		const deleted: URI[] = [];
		for (const change of this.pending) {
			if (change.type === FileChangeType.ADDED) {
				added.push(change.resource);
			} else if (change.type === FileChangeType.UPDATED) {
				changed.push(change.resource);
			} else if (change.type === FileChangeType.DELETED) {
				deleted.push(change.resource);
			}
		}
		this.pending = [];
		this._onDidBatch.fire({ added, changed, deleted });
	}
}

