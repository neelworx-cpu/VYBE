# Void Repository Implementation Analysis

## Core Architecture Difference

### Void's Approach (Two Models)
- **`originalModel`**: Immutable baseline snapshot (what the file WAS when transaction started)
- **`modifiedModel`**: The actual file being edited (what the file IS NOW)
- Diffs are ALWAYS computed between these two models
- After accept/reject, they recompute the diff to check if models are identical

### Our Approach (Single Model + String Baseline)
- **`originalSnapshot`**: String baseline (what the file WAS)
- **Actual File Model**: The live file (currently has original content)
- Diffs are computed between `originalContent` (string) and `modifiedContent` (string)
- Ranges are relative to these strings, not the live model

## Void's Accept/Reject Logic

### Accept Hunk (`_acceptHunk`)
```typescript
// For each inner change (character-level):
const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
edits.push(EditOperation.replace(edit.originalRange, newText));
this.originalModel.pushEditOperations(null, edits, _ => null);
// Then recompute diff - if identical, state = Accepted
```

**Meaning**: Copy from `modifiedModel` → `originalModel` (sync baseline to current)

### Reject Hunk (`_rejectHunk`)
```typescript
// For each inner change:
const newText = this.originalModel.getValueInRange(edit.originalRange);
edits.push(EditOperation.replace(edit.modifiedRange, newText));
this.modifiedModel.pushEditOperations(null, edits, _ => null);
// Then recompute diff - if identical, state = Rejected
```

**Meaning**: Copy from `originalModel` → `modifiedModel` (sync current to baseline)

## Our Problem

1. **We only have ONE model** (the actual file)
2. **The file currently has ORIGINAL content** (diffs haven't been applied)
3. **Our ranges are from string comparison**, not model comparison
4. **We're trying to use `modifiedRange` when the file has original content**

## The Correct Logic for Our System

### Accept Diff
- **File state**: Has `originalCode` at `originalRange`
- **Action**: Replace `originalRange` with `modifiedCode`
- **Result**: File now has modified content

### Reject Diff
- **File state**: Has `originalCode` at `originalRange` (diff not applied)
- **Action**: Do nothing (file already matches baseline)
- **Result**: Mark as rejected, no file change needed

## Key Insight

In our system:
- `originalRange` = where the change is in the ORIGINAL baseline (the file as it was)
- `modifiedRange` = where the change WOULD BE in the modified version
- **The actual file model currently has the ORIGINAL content**

So:
- **Accept**: Replace `originalRange` in the file with `modifiedCode`
- **Reject**: File already has original content, so just mark as rejected

## What We're Doing Wrong

1. Using `modifiedRange` for reject when file has original content
2. Trying to check if diff was applied by comparing file content
3. Not understanding that ranges are relative to the diff computation, not the live model
4. Making reject do different things based on file state instead of being consistent

## The Fix

1. **Accept**: Always replace `originalRange` with `modifiedCode` (file has original, apply modified)
2. **Reject**: Always do nothing to the file (file has original, which is the rejected state)
3. **After accept**: The file has modified content, so ranges shift - but we don't need to handle this because accept is a one-way operation
4. **Undo accept**: Restore `originalCode` at the same range where we applied `modifiedCode`

