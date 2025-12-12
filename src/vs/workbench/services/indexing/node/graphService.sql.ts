/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  uri TEXT,
  languageId TEXT,
  name TEXT,
  kind TEXT,
  container TEXT,
  startLine INTEGER,
  startColumn INTEGER,
  endLine INTEGER,
  endColumn INTEGER,
  hash TEXT
);

CREATE TABLE IF NOT EXISTS symbol_edges (
  from_id TEXT,
  to_id TEXT,
  edge_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbols_uri ON symbols(uri);
CREATE INDEX IF NOT EXISTS idx_edges_from ON symbol_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON symbol_edges(to_id);
`;

export const UPSERT_SYMBOL = `
INSERT OR REPLACE INTO symbols(id, uri, languageId, name, kind, container, startLine, startColumn, endLine, endColumn, hash)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

export const DELETE_SYMBOLS_FOR_URI = `DELETE FROM symbols WHERE uri = ?;`;
export const DELETE_EDGES_FOR_URI = `DELETE FROM symbol_edges WHERE from_id IN (SELECT id FROM symbols WHERE uri = ?) OR to_id IN (SELECT id FROM symbols WHERE uri = ?);`;
export const INSERT_EDGE = `INSERT INTO symbol_edges(from_id, to_id, edge_type) VALUES(?, ?, ?);`;

export const SELECT_DEFS = `SELECT * FROM symbols WHERE id = ?;`;
export const SELECT_REFS = `SELECT * FROM symbol_edges WHERE to_id = ?;`;
export const SELECT_NEIGHBORS = `SELECT * FROM symbol_edges WHERE from_id = ? OR to_id = ?;`;
export const SELECT_GRAPH_FOR_URI = `SELECT * FROM symbol_edges WHERE from_id IN (SELECT id FROM symbols WHERE uri = ?) OR to_id IN (SELECT id FROM symbols WHERE uri = ?);`;
export const SELECT_STATS = `SELECT (SELECT COUNT(*) FROM symbols) as nodes, (SELECT COUNT(*) FROM symbol_edges) as edges;`;

