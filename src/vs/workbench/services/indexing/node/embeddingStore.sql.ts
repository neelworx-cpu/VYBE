/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS embeddings (
  chunkId TEXT PRIMARY KEY,
  uri TEXT,
  languageId TEXT,
  chunkHash TEXT,
  vector BLOB,
  norm REAL
);

CREATE INDEX IF NOT EXISTS idx_embeddings_uri ON embeddings(uri);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunkhash ON embeddings(chunkHash);
`;

export const UPSERT_EMBEDDING = `
INSERT INTO embeddings(chunkId, uri, languageId, chunkHash, vector, norm)
VALUES(?, ?, ?, ?, ?, ?)
ON CONFLICT(chunkId) DO UPDATE SET uri=excluded.uri, languageId=excluded.languageId, chunkHash=excluded.chunkHash, vector=excluded.vector, norm=excluded.norm;
`;

export const DELETE_EMBEDDINGS_FOR_URI = `DELETE FROM embeddings WHERE uri = ?;`;

export const SELECT_BY_HASH = `SELECT chunkId, uri, languageId, chunkHash, vector, norm FROM embeddings WHERE chunkHash = ?;`;

export const SELECT_ALL = `SELECT chunkId, uri, languageId, chunkHash, vector, norm FROM embeddings LIMIT ? OFFSET ?;`;

