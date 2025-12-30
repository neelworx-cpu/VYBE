# Phase 3A Diff Seeding Implementation

## Summary

Implemented **Option 1 (Preferred)**: Internal headless diff seeding mechanism that allows Phase 3A tools to be tested without requiring UI widgets.

## Changes Made

### 1. Modified `IVybeDiffService.computeDiffs()` to Accept Optional `diffAreaId`

**File:** `src/vs/workbench/contrib/vybeChat/common/vybeDiffService.ts`
- Added `diffAreaId?: string` to `DiffComputationOptions` interface

**File:** `src/vs/workbench/contrib/vybeChat/browser/vybeDiffServiceImpl.ts`
- Modified `computeDiffs()` to accept optional `diffAreaId` in options
- Modified `_convertDocumentDiffToDiffs()` to accept optional `providedDiffAreaId` parameter
- When `providedDiffAreaId` is given, uses it instead of generating a new UUID
- This allows diffs to be linked to existing transaction's `diffAreaId`

### 2. Added Internal `_seedDiffsForTransaction()` Method

**File:** `src/vs/workbench/contrib/vybeChat/browser/vybeEditServiceImpl.ts`
- Added `_seedDiffsForTransaction(transactionId, originalContent, modifiedContent)` method
- This method:
  1. Retrieves the transaction by ID
  2. Calls `_diffService.computeDiffs()` with the transaction's `diffAreaId`
  3. Stores computed diffs in `IVybeDiffService._diffAreas` Map
  4. Makes diffs available for `acceptDiff`/`acceptFile` operations
- Marked as `INTERNAL/TEST-ONLY` with clear documentation

### 3. Enhanced `vybe.create_edit_transaction` Tool

**File:** `src/vs/workbench/contrib/mcp/common/vybeMutationToolContracts.ts`
- Added optional `modifiedContent?: string` to `VybeCreateEditTransactionInput`
- Marked as `@internal TEST-ONLY` in JSDoc

**File:** `src/vs/workbench/contrib/mcp/browser/tools/vybeMutationToolHandlers.ts`
- Modified `handleVybeCreateEditTransaction()` to:
  - Check if `input.modifiedContent` is provided
  - If yes, call `_seedDiffsForTransaction()` after creating the transaction
  - This seeds diffs immediately, making them available for testing

### 4. Updated Phase 3A Validation Test

**File:** `VYBE-MCP/src/index.ts`
- Modified TEST 11 to:
  - Read file content
  - Create modified content (adds a test comment)
  - Pass both `originalContent` and `modifiedContent` to `vybe.create_edit_transaction`
  - This automatically seeds diffs, so TEST 12 should now find diff areas
  - TEST 13 (approval dialog) will now run if diffs are found

## How It Works

### Flow Diagram

```
1. MCP Test calls: vybe.create_edit_transaction({ uri, originalContent, modifiedContent })
   ↓
2. IDE creates transaction with diffAreaId: "abc-123"
   ↓
3. IDE calls _seedDiffsForTransaction(transactionId, originalContent, modifiedContent)
   ↓
4. _seedDiffsForTransaction calls: _diffService.computeDiffs(uri, originalContent, modifiedContent, { diffAreaId: "abc-123" })
   ↓
5. _diffService computes diffs and stores them with diffAreaId: "abc-123"
   ↓
6. Diffs are now available in IVybeDiffService._diffAreas Map
   ↓
7. MCP Test calls: vybe.get_diff_areas({ uri })
   ↓
8. IDE returns diff areas (now non-empty)
   ↓
9. MCP Test calls: vybe.accept_file({ uri })
   ↓
10. IDE shows approval dialog
    ↓
11. User approves/denies
    ↓
12. IDE mutates editor state (if approved)
```

## Testing

### Prerequisites
- IDE must be running with workspace open
- MCP must be built: `cd /Users/neel/VYBE-MCP && npm run build`
- IDE must be started with: `export VYBE_MCP_COMMAND="node /Users/neel/VYBE-MCP/build/index.js" && ./scripts/code.sh`

### Expected Test Output

```
[TEST 11] ✅ SUCCESS: Transaction created
  Transaction ID: ...
  Diff Area ID: ...
  Note: Diffs should be seeded if VYBE_DEV_TESTS=1 is set

[TEST 12] Found 1 diff areas  ← Should now be > 0

[TEST 13] ⚠️  APPROVAL DIALOG WILL APPEAR IN IDE - Click 'Approve' or 'Deny'
[TEST 13] ✅ SUCCESS: File accepted  (if approved)
  Diffs accepted: 1
  URI: file:///Users/neel/void/package.json
```

## Architecture Compliance

✅ **No UI widgets required** - Pure headless diff seeding
✅ **No agent logic in IDE** - Just tool handlers
✅ **No MCP-side mutation** - All mutations via IDE tools
✅ **Test-only mechanism** - `modifiedContent` parameter is marked internal
✅ **Minimal changes** - Only modified diff service and edit service
✅ **Workspace-scoped** - Uses `IWorkspaceContextService` for validation

## Files Modified

1. `src/vs/workbench/contrib/vybeChat/common/vybeDiffService.ts` - Added `diffAreaId` to options
2. `src/vs/workbench/contrib/vybeChat/browser/vybeDiffServiceImpl.ts` - Accept optional `diffAreaId`
3. `src/vs/workbench/contrib/vybeChat/browser/vybeEditServiceImpl.ts` - Added `_seedDiffsForTransaction()`
4. `src/vs/workbench/contrib/mcp/common/vybeMutationToolContracts.ts` - Added `modifiedContent` to input
5. `src/vs/workbench/contrib/mcp/browser/tools/vybeMutationToolHandlers.ts` - Auto-seed diffs if `modifiedContent` provided
6. `VYBE-MCP/src/index.ts` - Updated test to pass `modifiedContent`

## Next Steps

1. **Rebuild MCP:** `cd /Users/neel/VYBE-MCP && npm run build`
2. **Restart IDE:** Stop `npm run watch`, then run `export VYBE_MCP_COMMAND="node /Users/neel/VYBE-MCP/build/index.js" && ./scripts/code.sh`
3. **Verify:** Check terminal for Phase 3A test output showing diffs found and approval dialog triggered


