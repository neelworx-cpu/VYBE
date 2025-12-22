# Fix for "no such column: workspaceId" Error

## Problem

You're seeing the error: **"SQLITE_ERROR: no such column: workspaceId"**

This happens when the database was created with an older schema version that doesn't have `workspaceId` columns in all tables.

## Solution: Rebuild the Index

The easiest and safest fix is to **rebuild the index**, which will recreate the database with the correct schema.

### Steps to Fix:

1. **Open VYBE Settings**:
   - Command Palette (`Cmd+Shift+P`): `VYBE: Open Settings`
   - Or click the settings icon in Vybe Chat title bar

2. **Navigate to Indexing Tab**:
   - Click "Indexing" tab in VYBE Settings

3. **Click "Rebuild" Button**:
   - Find the "Rebuild" button (🔄 icon) in the control buttons section
   - Click it
   - Confirm the dialog: "This will delete all index data and rebuild from scratch. Continue?"
   - Click "Rebuild"

4. **Wait for Rebuild**:
   - Status pill will change to "Rebuilding" (blue)
   - Progress bars will reset and start filling
   - For a repository with 110,000+ files, this may take several minutes

5. **Verify Success**:
   - Status pill should change to "Ready" (green)
   - File counts should appear
   - Error message should disappear

## Alternative: Manual Database Deletion

If the Rebuild button doesn't work, you can manually delete the database:

1. **Find the database file**:
   ```bash
   # On macOS:
   ~/Library/Application Support/code-oss-dev/User/workspaceStorage/<workspace-hash>/vybe-index.db
   ```

2. **Delete the database**:
   ```bash
   rm "~/Library/Application Support/code-oss-dev/User/workspaceStorage/<workspace-hash>/vybe-index.db"
   ```

3. **Restart VS Code** and click "Sync" in VYBE Settings

## Why This Happens

The indexing system has evolved through multiple phases:
- **Phase 1-2**: Initial schema without `workspaceId` columns
- **Phase 3+**: Schema with `workspaceId` columns for multi-workspace support

If you have an old database from Phase 1-2, it won't have the `workspaceId` columns, causing this error.

## Prevention

After rebuilding, the database will use schema version 7, which includes:
- ✅ `workspaceId` columns in all tables
- ✅ Proper migration support
- ✅ Future schema compatibility checks

The system will now automatically handle schema migrations going forward.

---

**Note**: Rebuilding will delete all existing index data, but this is safe - the index will be recreated from your current codebase files.

