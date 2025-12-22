# SQLite-Vector Integration Plan

## Current Status

✅ **System is working with TypeScript fallback** - Vector search uses JavaScript cosine similarity, which is functional and reliable.

❌ **sqlite-vector is disabled** - Detection always returns `false` to ensure system stability. The system gracefully falls back to TS implementation.

## Why sqlite-vector?

**Benefits:**
- **10-100x faster** vector search (C/SIMD optimized vs JavaScript)
- **Lower memory usage** (~30MB default)
- **Native SQL queries** for vector operations
- **No preindexing required** - works immediately

**Trade-offs:**
- Requires platform-specific binary (`.so`, `.dylib`, `.dll`)
- Additional dependency to manage
- More complex integration

## Integration Plan (Future Enhancement)

### Phase 1: Download & Distribution

1. **Add sqlite-vector binary download** (similar to ModelManager):
   - Download from: https://github.com/sqliteai/sqlite-vector/releases
   - **Platform + Architecture detection**:
     - `process.platform` → `darwin` (macOS), `win32` (Windows), `linux` (Linux)
     - `process.arch` → `x64`, `arm64`, `ia32`, etc.
     - Combine: `vector-darwin-x64.dylib`, `vector-darwin-arm64.dylib`, `vector-linux-x64.so`, `vector-win32-x64.dll`
   - Store in: `userDataPath/extensions/sqlite-vector/<version>/`
   - **Version pinning**: Use specific version (e.g., `0.9.52`) - do not use "latest"
   - Validate architecture match before download

2. **Add download progress tracking**:
   - Extend `IndexStatus` with `vectorExtensionDownloadState`, `vectorExtensionDownloadProgress`
   - Show in UI similar to model download status
   - Handle architecture mismatch gracefully (fall back to TS)

### Phase 2: Safe Detection

1. **Update `detectSqliteVector()`**:
   ```typescript
   private async detectSqliteVector(db: SqliteDatabase, deps: SqliteDeps): Promise<boolean> {
     // 1. Check if extension file exists in userDataPath/extensions/sqlite-vector/
     // 2. Try to load it using db.loadExtension()
     // 3. Verify by checking if vector_init() function exists (without calling it)
     // 4. Cache result to avoid repeated attempts
   }
   ```

2. **Error handling**:
   - If loading fails, silently fall back to TS
   - Log warnings but don't block indexing
   - Never throw errors that could break the system

### Phase 3: Vector Table Setup

1. **Update `ensureSchema()`**:
   - **Create virtual table using `vector0`** (not regular table):
     ```sql
     CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vector USING vector0(
       workspaceId TEXT,
       filePath TEXT,
       chunkId TEXT,
       embeddingModel TEXT,
       embeddingVersion TEXT,
       vector_embedding float32
     )
     ```
   - **Dimension enforcement remains in TypeScript** - validate embedding dimensions before insertion
   - Do not assume quantization APIs exist - check version or feature detection first

2. **Backfill existing embeddings**:
   - Copy from `embeddings` table to `embeddings_vector` virtual table
   - Convert JSON vectors to Float32Array BLOBs
   - **Only use quantization APIs if version-pinned and confirmed available**:
     - Check extension version first: `SELECT vector_version()`
     - Only call `vector_quantize()` if version >= required version
     - Otherwise, use unquantized vectors (still faster than TS)

### Phase 4: Query Implementation

1. **Update `queryVectorIndex()`**:
   - **Dimension validation in TypeScript first** - enforce expected dimensions before query
   - Use virtual table queries on `embeddings_vector` (vector0 table)
   - **Only use quantization APIs if version-pinned and available**:
     - Check version: `SELECT vector_version()`
     - If quantization available: `vector_quantize_scan(...)`
     - Otherwise: Use direct vector distance functions
   - Fall back to TS if query fails
   - Maintain same return format for compatibility

2. **Performance optimization** (only if quantization APIs confirmed):
   - Check version before calling `vector_quantize_preload()`
   - Cache quantization state only if feature is available
   - Do not assume these APIs exist

### Phase 5: UI Updates

1. **Status indicator**:
   - Show "Vector: sqlite-vector" when available (green check)
   - Show "Vector: TS (default)" when using fallback (also green - it's fine!)
   - Show download progress when installing

2. **Settings**:
   - Optional toggle: "Use sqlite-vector for faster search" (default: auto-detect)
   - Manual download button if auto-download fails

## Implementation Notes

### Safety First
- **Never block indexing** if sqlite-vector fails
- **Always have TS fallback** working
- **Graceful degradation** - system works with or without sqlite-vector
- **Virtual table required** - use `vector0`, not regular table
- **Version pinning** - do not assume quantization APIs without version check
- **Dimension enforcement in TypeScript** - validate before SQL operations
- **Platform + arch aware** - detect both platform and architecture for binary selection

### Architecture Detection
```typescript
const platform = process.platform; // 'darwin', 'win32', 'linux'
const arch = process.arch; // 'x64', 'arm64', 'ia32'
const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
const binaryName = `vector-${platform}-${arch}.${extName}`;
```

### Version Pinning
- Pin to specific version (e.g., `0.9.52`)
- Check version after loading: `SELECT vector_version()`
- Only use quantization APIs if version >= minimum required
- Document minimum version requirements for each feature

### Testing
1. Test with sqlite-vector available (all architectures)
2. Test with sqlite-vector missing (should use TS)
3. Test with sqlite-vector failing to load (should use TS)
4. Test with wrong architecture binary (should detect and use TS)
5. Test with old version (no quantization APIs - should still work)
6. Test query performance comparison
7. Test dimension validation in TypeScript

### Files to Modify
- `src/vs/workbench/api/common/extHostIndexing.ts` - Detection, table creation, queries
- `src/vs/workbench/services/indexing/node/modelManager.ts` - Add vector extension download (or create separate manager)
- `src/vs/workbench/contrib/vybeSettings/browser/tabs/vybeSettingsIndexingDocsTab.ts` - UI status updates

## Current Implementation (Disabled)

The current code has sqlite-vector detection **disabled** for stability:

```typescript
private async detectSqliteVector(...): Promise<boolean> {
  // Always returns false - uses TS fallback
  this.sqliteVectorAvailable = false;
  return false;
}
```

This ensures the system **always works** without external dependencies.

## Key Corrections Applied

✅ **Virtual table (`vector0`)** - Not regular table
✅ **Version pinning** - Do not assume quantization APIs
✅ **Dimension enforcement in TypeScript** - Validate before SQL
✅ **Platform + architecture aware** - Detect both for binary selection

These corrections ensure sqlite-vector remains an **acceleration layer**, not a correctness dependency.

## References

- sqlite-vector GitHub: https://github.com/sqliteai/sqlite-vector
- API Documentation: https://github.com/sqliteai/sqlite-vector/blob/main/API.md
- Releases: https://github.com/sqliteai/sqlite-vector/releases

