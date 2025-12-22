/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The original ExtHostLocalEmbeddingRuntime bridged the extension host to a
// local embedding runtime implementation. That experimental path has been
// removed as part of resetting the indexing/embedding backend. This stub keeps
// the module path compiling while providing no behavior.

export class ExtHostLocalEmbeddingRuntime {
	// Intentionally empty – local embeddings are disabled in this reset state.
}


