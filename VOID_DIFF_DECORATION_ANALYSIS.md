# Void vs Vybe — Complete Diff Decoration Analysis

## Executive Summary

This document provides a ground-truth explanation of how Void renders diff background decorations and keeps them visible, based on direct analysis of Void's codebase. The analysis identifies the exact lifecycle, invariants, and mechanisms that prevent decoration disappearance, and compares them with Vybe's current implementation.

---

## 1. How Void Renders Diff Background Colors

### 1.1 Decoration Creation

**File**: `editCodeService.ts:300-314`
**Function**: `_addLineDecoration`

```typescript
private _addLineDecoration = (model: ITextModel | null, startLine: number, endLine: number, className: string, options?: Partial<IModelDecorationOptions>) => {
    if (model === null) return
    const id = model.changeDecorations(accessor => accessor.addDecoration(
        { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: Number.MAX_SAFE_INTEGER },
        {
            className: className,
            description: className,
            isWholeLine: true,
            ...options
        }))
    const disposeHighlight = () => {
        if (id && !model.isDisposed()) model.changeDecorations(accessor => accessor.removeDecoration(id))
    }
    return disposeHighlight
}
```

**Key Details**:
- Uses `model.changeDecorations()` with `accessor.addDecoration()`
- Range: `startLineNumber` to `endLineNumber`, `startColumn: 1`, `endColumn: Number.MAX_SAFE_INTEGER`
- Options: `isWholeLine: true`, `className` (e.g., `'void-greenBG'`)
- Returns a dispose function that removes the decoration

### 1.2 Decoration Types

**File**: `editCodeService.ts:475-613`
**Function**: `_addDiffStylesToURI`

**For Green Backgrounds (Edits/Insertions)**:
- **Location**: Line 484
- **Condition**: `if (type !== 'deletion')`
- **Decoration**: `_addLineDecoration(model, diff.startLine, diff.endLine, 'void-greenBG', {...})`
- **Range**: Uses `diff.startLine` and `diff.endLine` (coordinates in the **modified file**)
- **CSS Class**: `void-greenBG` (defined in `void.css:18-20`)
- **Additional Options**: Minimap and overview ruler decorations

**For Red Backgrounds (Deletions)**:
- **Location**: Lines 493-560
- **Condition**: `if (type !== 'insertion')`
- **Implementation**: Uses a **view zone** (not a line decoration)
- **View Zone**: Created via `IConsistentItemService` with `afterLineNumber: diff.startLine - 1`
- **CSS Class**: `void-redBG` (applied to DOM node, not decoration)
- **Reason**: Deletions don't exist in the modified file, so they're shown in a view zone above the insertion point

**For Streaming Highlights**:
- **Location**: `editCodeService.ts:317-343` (`_addDiffAreaStylesToURI`)
- **Sweep Index**: `void-sweepIdxBG` at `diffArea._streamState.line`
- **Sweep Background**: `void-sweepBG` from `diffArea._streamState.line + 1` to `diffArea.endLine`

### 1.3 CSS Registration

**File**: `void.css:18-24`

```css
.void-greenBG {
    background-color: var(--vscode-void-greenBG);
}

.void-redBG {
    background-color: var(--vscode-void-redBG);
}
```

**Note**: CSS classes are registered globally. VS Code's theme variables (`--vscode-void-greenBG`) are used for theming.

### 1.4 Range Logic Summary

| Diff Type | Decoration Type | Range Source | Coordinates |
|-----------|----------------|--------------|-------------|
| **Edit** | Green line decoration | `diff.startLine` to `diff.endLine` | Modified file |
| **Insertion** | Green line decoration | `diff.startLine` to `diff.endLine` | Modified file |
| **Deletion** | Red view zone | `afterLineNumber: diff.startLine - 1` | Modified file (above insertion point) |

**Critical**: All ranges use **modified file coordinates** (`diff.startLine`, `diff.endLine`), not original file coordinates.

---

## 2. Full Void Lifecycle for Diff Backgrounds

### 2.1 Sequential Flow

#### **Step 1: Diff Creation**
- **Trigger**: `startApplying` or streaming update
- **Location**: `editCodeService.ts:1307-1324` (creates `DiffZone`)
- **Action**: Creates `DiffZone` with `originalCode`, `startLine`, `endLine`
- **State**: `_streamState.isStreaming = true` (if streaming)

#### **Step 2: Write Modified Content to Model**
- **Trigger**: Immediately after diff creation (if not streaming) or during streaming
- **Location**: `editCodeService.ts:972-1042` (`_writeStreamedDiffZoneLLMText`) or `_writeURIText`
- **Action**: Writes modified content to file model using `model.applyEdits()`
- **Write Guard**: `weAreWriting = true` during write, `false` after
- **Critical**: Model **always contains modified content** before decorations are applied

#### **Step 3: Refresh Styles and Diffs**
- **Trigger**: After write completes, on model mount, on editor tab change, on user edit
- **Location**: `editCodeService.ts:950-966` (`_refreshStylesAndDiffsInURI`)
- **Sequence**:
  1. **Clear all effects** (`_clearAllEffects`) — removes all decorations and view zones
  2. **Add diff area styles** (`_addDiffAreaStylesToURI`) — adds streaming highlights if streaming
  3. **Compute and add diffs** (`_computeDiffsAndAddStylesToURI`) — recomputes diffs and adds decorations
  4. **Refresh CtrlK zones** (`_refreshCtrlKInputs`)
  5. **Fire change events** (`_fireChangeDiffsIfNotStreaming`)

#### **Step 4: Diff Recomputation**
- **Location**: `editCodeService.ts:346-369` (`_computeDiffsAndAddStylesToURI`)
- **Process**:
  1. Gets current file content: `model.getValue(EndOfLinePreference.LF)`
  2. Extracts region: `fullFileText.split('\n').slice((diffArea.startLine - 1), (diffArea.endLine - 1) + 1).join('\n')`
  3. Compares: `findDiffs(diffArea.originalCode, newDiffAreaCode)`
  4. For each computed diff: calls `_addDiff(computedDiff, diffArea)`

#### **Step 5: Decoration Application**
- **Location**: `editCodeService.ts:853-871` (`_addDiff`)
- **Process**:
  1. Creates `Diff` object with `diffid`, `diffareaid`
  2. Calls `_addDiffStylesToURI(uri, newDiff)` — applies decorations
  3. Stores dispose function in `diffZone._removeStylesFns`
  4. Adds diff to `diffZone._diffOfId` map

#### **Step 6: Decoration Rendering**
- **Location**: `editCodeService.ts:475-613` (`_addDiffStylesToURI`)
- **For edits/insertions**: Creates green line decoration via `_addLineDecoration`
- **For deletions**: Creates red view zone via `IConsistentItemService`
- **For widgets**: Creates accept/reject buttons via `AcceptRejectInlineWidget`

### 2.2 Lifecycle Triggers

| Trigger | Location | Action |
|---------|----------|--------|
| **Model mount** | `editCodeService.ts:226-227` | Calls `_refreshStylesAndDiffsInURI(model.uri)` |
| **Editor tab change** | `editCodeService.ts:235-238` | Calls `_refreshStylesAndDiffsInURI(uri)` |
| **User edit** | `editCodeService.ts:248-252` | Realigns ranges, then calls `_refreshStylesAndDiffsInURI(uri)` |
| **System write** | `editCodeService.ts:627-659` (`_writeURIText`) | Sets `weAreWriting = true`, writes, sets `false`, then calls `_refreshStylesAndDiffsInURI(uri)` |
| **Accept diff** | `editCodeService.ts:2118-2184` | Updates `originalCode`, deletes diff, calls `_refreshStylesAndDiffsInURI(uri)` |
| **Reject diff** | `editCodeService.ts:2189-2269` | Writes original back, deletes diff, calls `_refreshStylesAndDiffsInURI(uri)` |

### 2.3 Clear Logic

**Location**: `editCodeService.ts:797-802` (`_clearAllEffects`)

```typescript
private _clearAllEffects(uri: URI) {
    for (let diffareaid of this.diffAreasOfURI[uri.fsPath] || []) {
        const diffArea = this.diffAreaOfId[diffareaid]
        this._clearAllDiffAreaEffects(diffArea)
    }
}
```

**Process**:
1. Iterates all diff areas for URI
2. Calls `_clearAllDiffAreaEffects(diffArea)`:
   - Deletes all diffs in the diff zone
   - Calls all dispose functions in `_removeStylesFns` (removes decorations/view zones)
   - Clears `_removeStylesFns` set

**Critical**: Decorations are **always cleared before being re-added** during refresh. This ensures no stale decorations persist.

---

## 3. How Void Prevents Background Disappearance

### 3.1 Model Mount Handling

**Location**: `editCodeService.ts:204-228` (`initializeModel`)

```typescript
const initializeModel = async (model: ITextModel) => {
    await this._voidModelService.initializeModel(model.uri)

    // ... register listeners ...

    // when the model first mounts, refresh any diffs that might be on it (happens if diffs were added in the BG)
    this._refreshStylesAndDiffsInURI(model.uri)
}
```

**Key Points**:
- **NO recomputation on mount** — only calls `_refreshStylesAndDiffsInURI`
- **Refresh assumes model already has modified content** — does not write to model
- **Refresh recomputes diffs from existing model content** — compares `model.getValue()` vs `diffArea.originalCode`

**Why This Works**:
- Void's model service (`IVoidModelService`) ensures models are initialized with the correct content
- If diffs were created before model mount, the model is written to during diff creation
- Refresh only re-applies decorations, it doesn't change file content

### 3.2 Write Guard

**Location**: `editCodeService.ts:626, 654-656`

```typescript
weAreWriting = false

private _writeURIText(uri: URI, text: string, range_: IRange | 'wholeFileRange', { shouldRealignDiffAreas, }: { shouldRealignDiffAreas: boolean, }) {
    // ...
    this.weAreWriting = true
    model.applyEdits([{ range, text }])
    this.weAreWriting = false

    this._refreshStylesAndDiffsInURI(uri)
}
```

**User Edit Handler**: `editCodeService.ts:218-223`

```typescript
model.onDidChangeContent(e => {
    // it's as if we just called _write, now all we need to do is realign and refresh
    if (this.weAreWriting) return
    const uri = model.uri
    this._onUserChangeContent(uri, e)
})
```

**Key Points**:
- `weAreWriting` flag prevents `onDidChangeContent` from triggering during system writes
- System writes (accept, reject, streaming) set `weAreWriting = true` before edit, `false` after
- User edits trigger realignment and refresh only if `weAreWriting === false`

### 3.3 Model Content Invariant

**Critical Invariant**: The file model **always contains modified content** before decorations are computed.

**Enforcement**:
1. **During diff creation**: Modified content is written to model immediately (if model exists)
2. **During streaming**: Content is written incrementally via `_writeStreamedDiffZoneLLMText`
3. **During refresh**: Model content is read via `model.getValue()`, not written to
4. **During recomputation**: Compares current model content vs `originalCode` baseline

**Location**: `editCodeService.ts:346-356` (`_computeDiffsAndAddStylesToURI`)

```typescript
const fullFileText = model.getValue(EndOfLinePreference.LF)  // Read current model content
const newDiffAreaCode = fullFileText.split('\n').slice((diffArea.startLine - 1), (diffArea.endLine - 1) + 1).join('\n')
const computedDiffs = findDiffs(diffArea.originalCode, newDiffAreaCode)  // Compare baseline vs current
```

**Why This Works**:
- Model content is the source of truth for "modified content"
- Recomputation compares model (modified) vs `originalCode` (baseline)
- If model matches baseline, no diffs are found (correct behavior)
- If model differs from baseline, diffs are computed (correct behavior)

### 3.4 Refresh vs Recomputation

**Void's Approach**:
- **Refresh** (`_refreshStylesAndDiffsInURI`): Always clears and re-applies decorations
- **Recomputation** (`_computeDiffsAndAddStylesToURI`): Always runs during refresh
- **No separate recomputation trigger** — recomputation is part of refresh

**Why This Works**:
- Refresh is idempotent — clearing and re-adding ensures consistency
- Recomputation always uses current model content — no stale diffs
- No conditional recomputation — always recomputes during refresh

---

## 4. Void vs Vybe Comparison

| Aspect | Void | Vybe |
|--------|------|------|
| **Decoration Creation** | `_addLineDecoration` → `model.changeDecorations(accessor.addDecoration(...))` | `computeDecorationsFromDiffArea` → `zone.decorations.set([...])` |
| **Decoration Storage** | Dispose functions stored in `diffArea._removeStylesFns` | Decorations stored in `DiffZone.decorations` collection |
| **When Created** | During `_addDiff` (called from `_computeDiffsAndAddStylesToURI`) | During `refreshDecorationsForEditor` |
| **When Refreshed** | On model mount, editor tab change, user edit, system write, accept/reject | On model mount, editor tab change, user edit, accept/reject, streaming update |
| **What Clears Them** | `_clearAllEffects` → calls dispose functions | `zone.decorations.clear()` or `zone.decorations.set([])` |
| **What Recomputes Diffs** | `_computeDiffsAndAddStylesToURI` (always during refresh) | `recomputeDiffsForFile` (separate call, conditional) |
| **Model Mount Behavior** | Calls `_refreshStylesAndDiffsInURI` (refresh only, no recomputation trigger) | Calls `recomputeDiffsForFile` then `refreshDecorationsForUri` (recomputation + refresh) |
| **Write Guard** | `weAreWriting` flag, checked in `onDidChangeContent` | `_isSystemWrite` flag, checked in `onDidChangeContent` |
| **Model Content Invariant** | Model always contains modified content before refresh | Model should contain modified content, but not guaranteed on mount |
| **Recomputation Trigger** | Always during refresh (part of `_refreshStylesAndDiffsInURI`) | Separate call, triggered conditionally (model mount, user edit, accept/reject) |
| **Recomputation Logic** | Compares `model.getValue()` vs `diffArea.originalCode` | Compares `model.getValueInRange([startLine:endLine])` vs `diffArea.originalCode` |
| **Range Coordinates** | Uses `diff.startLine` / `diff.endLine` (modified file) | Uses `diff.modifiedRange` (modified file) |

### 4.1 Key Differences

1. **Model Mount**: Void only refreshes, Vybe recomputes
2. **Recomputation Timing**: Void always recomputes during refresh, Vybe recomputes separately
3. **Model Content Guarantee**: Void ensures model has modified content before refresh, Vybe doesn't guarantee this on mount
4. **Clear Logic**: Void uses dispose functions, Vybe uses decoration collection API

---

## 5. Required Invariants for Backgrounds to Render

### Invariant 1: Model Contains Modified Content Before Refresh
**Statement**: The file model must contain the modified content (not original) before `_refreshStylesAndDiffsInURI` is called.

**Enforcement in Void**:
- Modified content is written to model during diff creation (`_writeURIText`)
- Model is never reset to original content during refresh
- Refresh reads model content, doesn't write to it

**Why It Matters**:
- Decorations use `diff.startLine` / `diff.endLine` (modified file coordinates)
- If model contains original content, decorations will be placed at wrong lines
- Recomputation compares model (modified) vs `originalCode` (baseline) — if model is original, no diffs found

### Invariant 2: Refresh Always Clears Before Re-adding
**Statement**: All decorations must be cleared before new decorations are added during refresh.

**Enforcement in Void**:
- `_refreshStylesAndDiffsInURI` always calls `_clearAllEffects` first
- `_clearAllEffects` calls all dispose functions, removing all decorations
- Then decorations are re-added via `_computeDiffsAndAddStylesToURI`

**Why It Matters**:
- Prevents duplicate decorations
- Ensures decorations match current diff state
- Prevents stale decorations from persisting

### Invariant 3: Recomputation Uses Current Model Content
**Statement**: Diff recomputation must use the current model content, not a cached or stale version.

**Enforcement in Void**:
- `_computeDiffsAndAddStylesToURI` always calls `model.getValue()` to get current content
- No caching of model content
- Recomputation happens during every refresh

**Why It Matters**:
- Ensures diffs reflect current file state
- Prevents stale diffs from persisting after user edits
- Ensures decorations match actual file content

### Invariant 4: Write Guard Prevents Recursive Refresh
**Statement**: System writes must not trigger user-edit handlers that cause recursive refresh.

**Enforcement in Void**:
- `weAreWriting` flag set to `true` before `model.applyEdits()`, `false` after
- `onDidChangeContent` checks `if (this.weAreWriting) return`
- System writes call `_refreshStylesAndDiffsInURI` explicitly after write

**Why It Matters**:
- Prevents infinite refresh loops
- Ensures refresh happens once per write, not multiple times
- Prevents decorations from flickering or being removed prematurely

### Invariant 5: Model Mount Does Not Recompute Diffs
**Statement**: When a model mounts, refresh should re-apply existing decorations, not recompute diffs from scratch.

**Enforcement in Void**:
- `initializeModel` calls `_refreshStylesAndDiffsInURI(model.uri)` (refresh only)
- Refresh recomputes diffs, but assumes model already has modified content
- No separate recomputation trigger on mount

**Why It Matters**:
- If model is loaded from disk (original content), recomputation would find no diffs and remove them
- Refresh assumes model has modified content (written during diff creation)
- Prevents diffs from being removed on model mount

---

## 6. Which Invariant Vybe Violated

### Violated Invariant: **Invariant 5 — Model Mount Does Not Recompute Diffs**

**What Vybe Does**:
- **Location**: `vybeDiffZoneManager.ts:98-104`
- **Code**:
```typescript
this._register(this._modelService.onModelAdded(async (model) => {
    const diffAreas = this._diffService.getDiffAreasForUri(model.uri);
    if (diffAreas.length > 0) {
        await this._diffService.recomputeDiffsForFile(model.uri);  // ⚠️ PROBLEM
        this.refreshDecorationsForUri(model.uri);
    }
}));
```

**What Void Does**:
- **Location**: `editCodeService.ts:226-227`
- **Code**:
```typescript
// when the model first mounts, refresh any diffs that might be on it (happens if diffs were added in the BG)
this._refreshStylesAndDiffsInURI(model.uri)  // ✅ Refresh only, no recomputation trigger
```

### Why This Violation Causes Disappearance

**Sequence of Events**:

1. **Diff Creation** (`computeDiffs`):
   - Creates diffs with `state: DiffState.Pending`
   - Writes modified content to model (if model exists)
   - Creates `DiffArea` with `originalCode` (region baseline)

2. **Editor Opens**:
   - `IModelService.onModelAdded` fires
   - Model is loaded from disk (original content) — **overwrites modified content**

3. **Vybe's Model Mount Handler**:
   - Calls `recomputeDiffsForFile(model.uri)`
   - Extracts region: `model.getValueInRange([startLine:endLine])` → **original content**
   - Compares: `original content` vs `diffArea.originalCode` (also original) → **no diffs found**
   - Removes all diffs from `updatedDiffs` map (line 899-901 in `vybeDiffServiceImpl.ts`)
   - Updates `DiffArea.diffs` to empty map

4. **Decoration Refresh**:
   - `refreshDecorationsForUri` is called
   - `computeDecorationsFromDiffArea` finds no diffs → creates no decorations
   - Decorations disappear

### Why Void Doesn't Have This Problem

1. **Void's Model Service**: `IVoidModelService` ensures models are initialized with correct content before mount
2. **No Recomputation on Mount**: Void only refreshes, doesn't recompute
3. **Refresh Assumes Correct Content**: Refresh recomputes diffs, but assumes model already has modified content (written during diff creation)

### The Fix

**Vybe should**:
- **Option 1**: Skip recomputation on model mount if model content matches baseline (indicating model was just loaded from disk)
- **Option 2**: Only refresh decorations on mount, don't recompute (like Void)
- **Option 3**: Ensure model has modified content before mount (like Void's model service)

**Recommended**: Option 1 or 2 — skip recomputation on mount, or only refresh.

---

## 7. Additional Observations

### 7.1 Button Placement

**Void's Approach** (`editCodeService.ts:565-608`):
- Buttons are created via `AcceptRejectInlineWidget`
- Positioned using `startLine` and `offsetLines`:
  - **Edits/Insertions**: `startLine = diff.startLine`, `offsetLines = 0`
  - **Deletions**: `startLine = diff.startLine - 1`, `offsetLines = 1` (or `-numRedLines` if at line 1)
- Widgets are created during `_addDiffStylesToURI` (same function that creates decorations)
- Widgets are stored via `IConsistentItemService` (ensures consistency across editors)

**Vybe's Approach**:
- Buttons are created via `VybeDiffHunkWidget`
- Positioned using `decoration.range.startLineNumber` (from decoration)
- Widgets are created in `_updateWidgetsForZone` (separate from decoration creation)
- Widgets are stored in `_hunkWidgetsByZone` map

**Key Difference**: Void creates widgets **during diff decoration creation**, ensuring perfect alignment. Vybe creates widgets **after decorations**, which can cause misalignment if decoration ranges are incorrect.

### 7.2 Streaming State

**Void's Approach**:
- `DiffZone._streamState.isStreaming` tracks streaming state
- Streaming highlights (`void-sweepIdxBG`, `void-sweepBG`) are added during `_addDiffAreaStylesToURI`
- Recomputation is skipped if `isStreaming === true` (implicitly, since streaming writes don't trigger user-edit handlers)

**Vybe's Approach**:
- `DiffArea.isStreaming` tracks streaming state
- `recomputeDiffsForFile` skips recomputation if `diffArea.isStreaming === true` (Blocker 5)
- Streaming updates call `updateDiffsForStreaming`, which writes content and updates diffs

**Similarity**: Both systems prevent recomputation during streaming.

### 7.3 Accept/Reject Semantics

**Void's Accept** (`editCodeService.ts:2118-2184`):
- Updates `diffArea.originalCode` to include accepted diff
- Deletes the diff
- Calls `_refreshStylesAndDiffsInURI` (recomputes remaining diffs)

**Void's Reject** (`editCodeService.ts:2189-2269`):
- Writes `diff.originalCode` back to file (region-scoped)
- Deletes the diff
- Calls `_refreshStylesAndDiffsInURI` (recomputes remaining diffs)

**Vybe's Accept/Reject**:
- Similar approach (updates baseline on accept, writes original back on reject)
- Both call `refreshDecorationsForUri` after operation

**Similarity**: Both systems follow the same accept/reject semantics.

---

## 8. Conclusion

Void's diff decoration system is built on **5 critical invariants** that ensure decorations remain visible and stable:

1. **Model contains modified content before refresh**
2. **Refresh always clears before re-adding**
3. **Recomputation uses current model content**
4. **Write guard prevents recursive refresh**
5. **Model mount does not recompute diffs**

**Vybe violated Invariant 5**, causing decorations to disappear when models mount with original content (loaded from disk) instead of modified content.

**The fix**: Skip recomputation on model mount, or ensure model has modified content before mount. Void's approach (refresh only, no recomputation trigger) is the safest option.

