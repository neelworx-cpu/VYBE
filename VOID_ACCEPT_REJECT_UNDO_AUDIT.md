# Void vs Vybe — Accept/Reject/Undo Complete Audit

## Executive Summary

This audit identifies critical architectural differences between Void's and Vybe's accept/reject/undo implementations that cause:
- Decorations not disappearing after accept
- Undo not working after first operation
- Buttons disappearing but decorations persisting
- State desynchronization between diff service and edit service

---

## 1. Void's Accept Flow

### Sequence (from `acceptDiff` at line 2118):

1. **Capture snapshot** (`_addToHistory`) - BEFORE any changes
2. **Update baseline** (`diffArea.originalCode = newOriginalCode`) - Merge accepted diff into baseline
3. **Delete diff** (`_deleteDiff(diff)`) - Remove from `diffArea._diffOfId` and `this.diffOfId`
4. **Delete empty diff area** (if no diffs remain)
5. **Refresh everything** (`_refreshStylesAndDiffsInURI(uri)`) - **CRITICAL**
6. **Finish edit** (`onFinishEdit()`) - Captures after snapshot

### Key: `_refreshStylesAndDiffsInURI` (line 950-966)

```typescript
private _refreshStylesAndDiffsInURI(uri: URI) {
    // 1. clear DiffArea styles and Diffs
    this._clearAllEffects(uri)  // ← CLEARS EVERYTHING FIRST

    // 2. style DiffAreas (sweep, etc)
    this._addDiffAreaStylesToURI(uri)

    // 3. add Diffs (RECOMPUTES DIFFS)
    this._computeDiffsAndAddStylesToURI(uri)  // ← RECOMPUTES + ADDS DECORATIONS

    // 4. refresh ctrlK zones
    this._refreshCtrlKInputs(uri)

    // 5. fire change event
    this._fireChangeDiffsIfNotStreaming(uri)
}
```

**Critical**: `_clearAllEffects` (line 797-802):
- Calls `_clearAllDiffAreaEffects` for each diff area
- Which calls `_deleteDiffs(diffArea)` - deletes ALL diffs from `diffArea._diffOfId`
- Then calls all dispose functions to remove decorations
- Then clears the dispose functions set

**Then** `_computeDiffsAndAddStylesToURI` (line 346-369):
- Recomputes diffs by comparing `model.getValue()` vs `diffArea.originalCode`
- Creates new `Diff` objects with fresh ranges
- Calls `_addDiff` for each diff (which adds decorations)

---

## 2. Void's Reject Flow

### Sequence (from `rejectDiff` at line 2189):

1. **Capture snapshot** (`_addToHistory`) - BEFORE any changes
2. **Write original back** (`_writeURIText`) - Writes `diff.originalCode` back to file
3. **Delete diff** (`_deleteDiff(diff)`) - Remove from maps
4. **Delete empty diff area** (if no diffs remain)
5. **Refresh everything** (`_refreshStylesAndDiffsInURI(uri)`) - **CRITICAL**
6. **Finish edit** (`onFinishEdit()`)

**Same refresh pattern**: Always clears, then recomputes, then adds decorations.

---

## 3. Void's Undo/Redo Flow

### Snapshot Capture (`_getCurrentVoidFileSnapshot` at line 666-687):

```typescript
private _getCurrentVoidFileSnapshot = (uri: URI): VoidFileSnapshot => {
    const { model } = this._voidModelService.getModel(uri)
    const snapshottedDiffAreaOfId: Record<string, DiffAreaSnapshotEntry> = {}

    for (const diffareaid in this.diffAreaOfId) {
        const diffArea = this.diffAreaOfId[diffareaid]
        if (diffArea._URI.fsPath !== uri.fsPath) continue

        // Deep clone the entire diff area (including _diffOfId map)
        snapshottedDiffAreaOfId[diffareaid] = deepClone(
            Object.fromEntries(diffAreaSnapshotKeys.map(key => [key, diffArea[key]]))
        ) as DiffAreaSnapshotEntry
    }

    const entireFileCode = model ? model.getValue(EndOfLinePreference.LF) : ''

    return {
        snapshottedDiffAreaOfId,  // ← Full diff area state
        entireFileCode,            // ← Full file content
    }
}
```

### Snapshot Restoration (`_restoreVoidFileSnapshot` at line 690-737):

```typescript
private _restoreVoidFileSnapshot = async (uri: URI, snapshot: VoidFileSnapshot) => {
    // 1. Stop streaming for all diff areas
    for (const diffareaid in this.diffAreaOfId) {
        const diffArea = this.diffAreaOfId[diffareaid]
        if (diffArea.type === 'DiffZone')
            this._stopIfStreaming(diffArea)
    }

    // 2. DELETE ALL DIFF AREAS (clearing their styles)
    this._deleteAllDiffAreas(uri)  // ← CLEARS EVERYTHING

    // 3. Restore diff areas from snapshot
    for (const diffareaid in snapshottedDiffAreaOfId) {
        const snapshottedDiffArea = snapshottedDiffAreaOfId[diffareaid]

        // Recreate diff area with all state
        this.diffAreaOfId[diffareaid] = {
            ...snapshottedDiffArea,
            type: 'DiffZone',
            _diffOfId: {},  // ← Will be repopulated by recomputation
            _URI: uri,
            _streamState: { isStreaming: false },
            _removeStylesFns: new Set(),
        }
        this._addOrInitializeDiffAreaAtURI(uri, diffareaid)
    }
    this._onDidAddOrDeleteDiffZones.fire({ uri })

    // 4. Restore file content (triggers refresh automatically)
    this._writeURIText(uri, entireModelCode, 'wholeFileRange', { shouldRealignDiffAreas: false })
    // ← This calls _refreshStylesAndDiffsInURI at the end
}
```

**Critical**: `_writeURIText` (line 627-659) calls `_refreshStylesAndDiffsInURI` at the end, which:
- Clears all effects
- Recomputes diffs (from restored `originalCode` vs current file)
- Adds decorations

---

## 4. Vybe's Current Implementation Issues

### Issue 1: Accept Doesn't Recompute Diffs

**Vybe's Accept Flow**:
1. Merge baseline
2. Delete diff
3. Update state
4. Emit `onDidAcceptDiff`
5. Zone manager calls `refreshDecorationsForUri` (NO recomputation)

**Problem**:
- Diff is deleted from `DiffArea.diffs`, so decoration computation skips it ✅
- BUT: If decoration collection isn't properly cleared, stale decorations persist
- Remaining diffs aren't recomputed, so their ranges may be stale

**Void's Approach**:
- Always calls `_refreshStylesAndDiffsInURI` which:
  1. Clears ALL decorations (via dispose functions)
  2. Recomputes ALL remaining diffs
  3. Adds fresh decorations

### Issue 2: Reject Doesn't Recompute Diffs

**Vybe's Reject Flow**:
1. Write original back
2. Realign ranges
3. Delete diff
4. Update state
5. Emit `onDidRejectDiff`
6. Zone manager calls `recomputeDiffsForFile` then `refreshDecorationsForUri`

**Problem**:
- Recomputation happens, but decorations may not be cleared first
- If decoration collection isn't cleared, stale decorations persist

**Void's Approach**:
- Always calls `_refreshStylesAndDiffsInURI` which clears first, then recomputes

### Issue 3: Undo Doesn't Restore Properly

**Vybe's Undo Flow**:
1. Restore file content
2. Restore diff state snapshot
3. Emit event

**Problems**:
1. **Snapshot captured AFTER delete**: When we capture snapshot in `acceptDiff`, the diff is already deleted, so snapshot doesn't include it
2. **State not restored**: `_restoreDiffStateSnapshot` restores diff areas but doesn't restore `_diffStates` map properly
3. **No recomputation**: After restore, we don't recompute diffs, so decorations may be stale

**Void's Approach**:
1. **Snapshot captured BEFORE changes**: `_addToHistory` is called FIRST, before any modifications
2. **Full restoration**: `_restoreVoidFileSnapshot` deletes all diff areas, restores from snapshot, writes file, which triggers refresh
3. **Automatic recomputation**: `_writeURIText` calls `_refreshStylesAndDiffsInURI` automatically

### Issue 4: Decoration Collection Not Cleared

**Vybe's Decoration Refresh**:
- `refreshDecorationsForEditor` calls `computeDecorationsFromDiffArea`
- Sets decorations via `zone.decorations.set([...])`
- But doesn't explicitly clear first

**Void's Approach**:
- `_clearAllEffects` calls all dispose functions, which remove decorations
- Then fresh decorations are added

---

## 5. Critical Differences Summary

| Aspect | Void | Vybe |
|--------|------|------|
| **Accept Flow** | Update baseline → Delete diff → `_refreshStylesAndDiffsInURI` (clears + recomputes) | Update baseline → Delete diff → `refreshDecorationsForUri` (no recomputation) |
| **Reject Flow** | Write original → Delete diff → `_refreshStylesAndDiffsInURI` (clears + recomputes) | Write original → Realign → Delete diff → `recomputeDiffsForFile` + `refreshDecorationsForUri` |
| **Undo Snapshot** | Captured BEFORE any changes | Captured AFTER delete (missing the deleted diff) |
| **Undo Restoration** | Delete all → Restore snapshot → Write file (triggers refresh) | Restore file → Restore snapshot → Emit event |
| **Decoration Clearing** | `_clearAllEffects` calls dispose functions | `zone.decorations.set([...])` (may not clear properly) |
| **Recomputation** | Always during refresh (part of `_refreshStylesAndDiffsInURI`) | Separate call, conditional |

---

## 6. Required Fixes

### Fix 1: Always Clear Decorations Before Refresh

**Vybe should**:
- Clear decoration collection explicitly before computing new decorations
- Or use dispose functions like Void

### Fix 2: Recompute Diffs After Accept

**Vybe should**:
- After accept, call `recomputeDiffsForFile` to regenerate remaining diff ranges
- Then refresh decorations

### Fix 3: Capture Snapshot BEFORE Changes

**Vybe should**:
- Capture snapshot at the START of `acceptDiff`/`rejectDiff`, before any modifications
- This ensures the snapshot includes the diff that will be deleted

### Fix 4: Full Restoration on Undo

**Vybe should**:
- Delete all diff areas first (like Void's `_deleteAllDiffAreas`)
- Restore from snapshot
- Write file content (which should trigger refresh)
- Or explicitly call `recomputeDiffsForFile` after restore

### Fix 5: Unified Refresh Method

**Vybe should**:
- Create a unified `_refreshDecorationsAndDiffs` method that:
  1. Clears all decorations
  2. Recomputes diffs (if needed)
  3. Adds fresh decorations
- Call this after accept/reject/undo

---

## 7. Root Cause Analysis

The fundamental issue is that **Vybe's refresh is not idempotent**:

- Void: `_refreshStylesAndDiffsInURI` ALWAYS clears everything first, then rebuilds
- Vybe: `refreshDecorationsForUri` computes new decorations and sets them, but doesn't guarantee old ones are cleared

This causes:
- Stale decorations persisting after accept/reject
- State desynchronization (diff deleted but decoration still visible)
- Undo not working (snapshot doesn't include deleted diff)

---

## 8. Recommended Implementation

1. **Create unified refresh method** that clears + recomputes + adds (like Void's `_refreshStylesAndDiffsInURI`)
2. **Capture snapshots BEFORE changes** (move `_captureDiffStateSnapshot` to start of accept/reject)
3. **Always clear decorations first** (explicitly clear collection or use dispose functions)
4. **Recompute after accept** (not just reject)
5. **Full restoration on undo** (delete all, restore snapshot, write file, refresh)

