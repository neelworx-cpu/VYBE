/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS documents (
  uri TEXT PRIMARY KEY,
  languageId TEXT,
  docHash TEXT,
  mtime INTEGER,
  size INTEGER,
  docLength INTEGER
);

CREATE TABLE IF NOT EXISTS chunks (
  chunkId TEXT PRIMARY KEY,
  uri TEXT REFERENCES documents(uri) ON DELETE CASCADE,
  languageId TEXT,
  startLine INTEGER,
  endLine INTEGER,
  chunkHash TEXT,
  content BLOB
);

CREATE TABLE IF NOT EXISTS tokens (
  term TEXT,
  chunkId TEXT REFERENCES chunks(chunkId) ON DELETE CASCADE,
  tf REAL,
  positions BLOB
);

CREATE INDEX IF NOT EXISTS idx_tokens_term ON tokens(term);
CREATE INDEX IF NOT EXISTS idx_chunks_uri ON chunks(uri);
`;

export const UPSERT_DOCUMENT = `
INSERT INTO documents(uri, languageId, docHash, mtime, size, docLength)
VALUES(?, ?, ?, ?, ?, ?)
ON CONFLICT(uri) DO UPDATE SET languageId=excluded.languageId, docHash=excluded.docHash, mtime=excluded.mtime, size=excluded.size, docLength=excluded.docLength;
`;

export const DELETE_DOCUMENT = `DELETE FROM documents WHERE uri = ?;`;
export const DELETE_CHUNKS_FOR_DOC = `DELETE FROM chunks WHERE uri = ?;`;
export const DELETE_TOKENS_FOR_CHUNKS = `DELETE FROM tokens WHERE chunkId IN (SELECT chunkId FROM chunks WHERE uri = ?);`;

export const INSERT_CHUNK = `
INSERT OR REPLACE INTO chunks(chunkId, uri, languageId, startLine, endLine, chunkHash, content)
VALUES(?, ?, ?, ?, ?, ?, ?);
`;

export const INSERT_TOKEN = `
INSERT INTO tokens(term, chunkId, tf, positions)
VALUES(?, ?, ?, ?);
`;

export const STATS_DOC_COUNT = `SELECT COUNT(*) as count, AVG(docLength) as avgLen FROM documents;`;

export const SELECT_CHUNKS_BY_TERMS = `
SELECT t.term, t.chunkId, t.tf, c.uri, c.languageId, c.startLine, c.endLine, c.content
FROM tokens t
JOIN chunks c ON c.chunkId = t.chunkId
WHERE t.term IN (%TERM_PLACEHOLDER%);
`;

