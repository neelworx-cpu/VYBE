# Critical Fix - Removed Automatic Recomputation

## Problem
The automatic recomputation on every user edit was causing:
- Diffs to disappear and reappear randomly
- Ranges to shift unpredictably
- Accept/reject to use wrong ranges
- Entire system to be unstable

## Solution
**Removed automatic recomputation** - it was the root cause of instability.

### Changes Made

1. **Zone Manager**: Removed `recomputeDiffsForFile` call on content changes
   - Now only refreshes decorations (ranges may be slightly off, but stable)
   - Decorations refresh on content change (300ms debounce)

2. **Accept Logic**: Simplified to use original ranges
   - Uses `originalRange` to find where `originalCode` is
   - Replaces with `modifiedCode`
   - Clamps ranges to model bounds for safety
   - No more searching/fuzzy matching

3. **Reject Logic**: Already simplified
   - Pending: Mark as rejected, no file change
   - Accepted: Revert using tracked `appliedRange`

## How It Works Now

1. **Diffs are computed once** when transaction is created
2. **Ranges are stable** - they don't change unless explicitly recomputed
3. **Accept uses `originalRange`** - where originalCode is in the baseline
4. **Reject uses tracked ranges** - where we applied the diff

## Trade-offs

- ✅ **Stable**: No random disappearing/reappearing diffs
- ✅ **Predictable**: Ranges don't shift unexpectedly
- ✅ **Simple**: Easy to understand and debug
- ⚠️ **Limitation**: If user edits conflict with a diff, the diff may not apply correctly
  - This is acceptable - user edits take precedence
  - Similar to how void handles conflicts

## Next Steps

If we need to handle user edits better in the future, we should:
1. Use void's two-model approach (originalModel + modifiedModel)
2. Rebase user edits against AI edits (like void does)
3. Only recompute when explicitly needed (after accept/reject)

But for now, the simple stable approach should work.

