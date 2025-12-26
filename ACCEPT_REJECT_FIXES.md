# Accept/Reject Fixes - Summary

## Problems Identified

1. **Stale Ranges**: After user edits, diff ranges become stale because we don't recompute diffs
2. **Random Additions**: "Keep" was using wrong ranges, sometimes adding content at wrong locations
3. **Decoration Drift**: Decorations don't move with diffs when user types between them
4. **Inconsistent Behavior**: Accept/reject doing different things based on file state

## Root Cause

Void maintains TWO models (originalModel and modifiedModel) and always recomputes diffs between them. We only have one model and a string baseline, so ranges become stale after user edits.

## Fixes Implemented

### 1. Diff Recomputation on Content Changes
- Added `recomputeDiffsForFile(uri, currentContent)` to `IVybeDiffService`
- Recomputes diffs between `originalSnapshot` and current file content
- Preserves diffIds and states by matching content
- Updates ranges to reflect current file state
- Emits update event to refresh decorations

### 2. Zone Manager Integration
- Zone manager now calls `recomputeDiffsForFile` when model content changes
- Debounced to 500ms to avoid excessive recomputation
- Decorations refresh automatically after recompute

### 3. Accept Logic Fix
- Now uses `modifiedRange` (current location in file) instead of `originalRange` (stale baseline location)
- Verifies content matches `originalCode` before applying
- Falls back to searching for `originalCode` if ranges are off
- Tracks applied range for accurate reject

### 4. Reject Logic Fix
- If pending: Do nothing (file already has original content)
- If accepted: Revert using tracked `appliedRange`
- No longer tries to use stale ranges

## How It Works Now

1. **User types between diffs**:
   - Model content changes
   - Zone manager debounces and calls `recomputeDiffsForFile`
   - Diffs are recomputed with current file content
   - Ranges are updated to reflect current state
   - Decorations refresh with new ranges

2. **User clicks "Keep" (Accept)**:
   - Gets current diff (with updated ranges from recompute)
   - Uses `modifiedRange` to find where diff currently is
   - Verifies content matches `originalCode`
   - Replaces with `modifiedCode`
   - Tracks applied range for reject

3. **User clicks "Undo" (Reject)**:
   - If pending: Marks as rejected, no file change
   - If accepted: Reverts using tracked `appliedRange`

## Remaining Considerations

- Recompute is expensive - debouncing helps but may still be slow on large files
- Content matching by string search is fragile - may fail if user edited the exact content
- Better approach long-term: Maintain two models like void (originalModel + modifiedModel)

## Testing Checklist

- [ ] Type between diffs - decorations should move
- [ ] Accept diff - should apply correctly
- [ ] Reject pending diff - should mark as rejected
- [ ] Reject accepted diff - should revert correctly
- [ ] Accept all - should work correctly
- [ ] Reject all - should work correctly
- [ ] Undo accept - should restore original
- [ ] Redo accept - should re-apply modified

