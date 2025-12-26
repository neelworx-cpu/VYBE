# Void vs Vybe — Remaining Gaps

## Executive Summary

After completing the minimal migration (file model contains modified content, accept updates baseline, reject writes original back), Vybe now has the core invariant correct. However, Void has several additional safety mechanisms and architectural features that prevent diff drift, widget misalignment, and incorrect behavior. This audit identifies what is still missing.

---

## 1. Diff Lifecycle Completeness

### Gap 1.1: Automatic Diff Recomputation on User Edits

**What Void Does:**
- Listens to `model.onDidChangeContent` for every user edit
- Calls `_onUserChangeContent` → `_realignAllDiffAreasLines` → `_refreshStylesAndDiffsInURI`
- `_refreshStylesAndDiffsInURI` clears all diffs, then calls `_computeDiffsAndAddStylesToURI`
- `_computeDiffsAndAddStylesToURI` recomputes diffs by comparing current file region to `DiffZone.originalCode`
- Diffs are always fresh and match current file state

**What Vybe Currently Does:**
- Listens to `model.onDidChangeContent` but only refreshes decorations (doesn't recompute diffs)
- Explicitly removed automatic recomputation to avoid instability
- Diffs remain static after creation until accept/reject

**Why the Gap Matters:**
- User edits between diffs can make diff ranges stale
- Accepting a stale diff could apply changes to wrong lines
- Widgets may appear at incorrect positions if file content shifted
- Multiple diffs in same file become misaligned after user edits

**Severity:** HIGH

**Category:** REQUIRED for correctness

**Impact:**
- If user types between diff 1 (line 10) and diff 2 (line 20), adding 5 lines shifts diff 2 to line 25
- Accepting diff 2 would apply changes at line 20 (wrong location)
- Widgets show at line 20 but actual diff content is at line 25

---

### Gap 1.2: Region-Specific Baselines vs Full-File Baselines

**What Void Does:**
- Each `DiffZone` has its own `originalCode` (region baseline, not full file)
- `DiffZone.startLine` and `DiffZone.endLine` track the region in current file
- When accepting a diff, merges `diff.code` into `DiffZone.originalCode` only
- Other diffs in same file remain valid because their baseline is independent
- Accepting diff 1 doesn't affect diff 2's baseline

**What Vybe Currently Does:**
- Uses full-file `DiffArea.originalSnapshot` (entire file baseline)
- When accepting a diff, updates `originalSnapshot` to entire current file content
- All diffs in a file share the same baseline
- Accepting one diff updates the baseline for ALL diffs in that file

**Why the Gap Matters:**
- If diff 1 is at lines 10-15 and diff 2 is at lines 20-25, accepting diff 1 updates the full-file baseline
- Diff 2's `originalRange` is now relative to a baseline that includes diff 1's changes
- Diff 2 may become invalid or incorrectly positioned
- Cannot accept diffs independently without affecting others

**Severity:** MEDIUM

**Category:** FUTURE HARDENING (works for single-diff scenarios, breaks for multi-diff)

**Impact:**
- Accepting diff 1 when diff 2 exists can cause diff 2 to show incorrect changes
- Accepting multiple diffs in sequence may cause cascading misalignments

---

### Gap 1.3: Empty Diff Area Auto-Deletion

**What Void Does:**
- After user edits, checks if any `DiffZone` has zero diffs (`Object.keys(diffArea._diffOfId).length === 0`)
- Automatically deletes empty diff zones
- Prevents orphaned diff areas with no diffs

**What Vybe Currently Does:**
- No automatic cleanup of empty diff areas
- Diff areas persist even if all diffs are accepted/rejected

**Why the Gap Matters:**
- Empty diff areas consume memory
- UI may show diff areas with no visible diffs
- File command bar may show incorrect counts

**Severity:** LOW

**Category:** FUTURE HARDENING (cosmetic issue, doesn't break correctness)

---

## 2. Baseline Correctness

### Gap 2.1: Incremental Baseline Updates

**What Void Does:**
- When accepting a diff, computes new baseline by merging `diff.code` into `DiffZone.originalCode`
- Uses string manipulation: `[...originalLines.slice(0, start), diff.code, ...originalLines.slice(end)]`
- Updates only the region baseline, not the full file
- Preserves other parts of the baseline unchanged

**What Vybe Currently Does:**
- When accepting a diff, updates `DiffArea.originalSnapshot` to entire current file content
- Uses `model.getValue()` to get full file, replaces entire baseline
- Simpler but less precise

**Why the Gap Matters:**
- If file has user edits outside diff areas, full-file baseline includes those edits
- Baseline becomes "current file state" rather than "original + accepted diffs"
- Future diffs computed against this baseline may be incorrect
- Cannot distinguish between "accepted AI changes" and "user edits"

**Severity:** MEDIUM

**Category:** FUTURE HARDENING (works for clean files, breaks if user edits between diffs)

**Impact:**
- User edits line 5, then accepts diff at line 20
- Baseline becomes "file with user edit at line 5"
- Next diff computation compares against baseline that includes user edit
- May cause incorrect diff detection

---

### Gap 2.2: Baseline Mutation Invariants

**What Void Does:**
- `DiffZone.originalCode` is only mutated on accept (never on reject)
- Reject writes `diff.originalCode` back to file but doesn't change baseline
- Baseline always represents "what was accepted so far"
- Clear separation: baseline = accepted state, file = current state

**What Vybe Currently Does:**
- `DiffArea.originalSnapshot` is mutated on accept (updates to current file)
- Reject doesn't mutate baseline (correct)
- But baseline update is full-file replacement, not incremental merge

**Why the Gap Matters:**
- Void's incremental merge preserves the structure of what was accepted
- Full-file replacement loses the history of which specific diffs were accepted
- Cannot reconstruct "original + accepted diff 1 + accepted diff 2" from full-file baseline

**Severity:** LOW

**Category:** FUTURE HARDENING (current approach works, but less precise)

---

## 3. Recompute / Refresh Triggers

### Gap 3.1: Comprehensive Refresh Triggers

**What Void Does:**
- `_refreshStylesAndDiffsInURI` called on:
  - Every `onDidChangeContent` (user edits)
  - After `_writeURIText` (any file write, including accept/reject)
  - On model mount (`initializeModel`)
  - On editor tab change (`onCodeEditorAdd`)
  - After accept/reject operations
- Always ensures diffs are recomputed from current file state

**What Vybe Currently Does:**
- `refreshDecorationsForEditor` called on:
  - Model content changes (debounced, decorations only)
  - Accept/reject events
  - Diff area updates
- Does NOT recompute diffs on content changes
- Diffs remain static until explicit recomputation

**Why the Gap Matters:**
- User edits make diffs stale but we don't refresh them
- Editor tab changes don't trigger refresh (diffs may be out of sync)
- Model mounts don't trigger refresh (diffs created in background may not show)

**Severity:** HIGH

**Category:** REQUIRED for correctness

**Impact:**
- User edits file → diffs become stale → accept applies to wrong location
- Switch editor tabs → decorations don't refresh → widgets misaligned
- Diffs created while editor closed → editor opens → no refresh → diffs invisible

---

### Gap 3.2: Write Flag to Prevent Recursive Refresh

**What Void Does:**
- `weAreWriting` flag set to `true` during `_writeURIText`
- `onDidChangeContent` listener checks `if (this.weAreWriting) return`
- Prevents realignment/refresh during system writes (accept/reject/streaming)
- Only user edits trigger refresh

**What Vybe Currently Does:**
- No write flag
- `onDidChangeContent` always triggers refresh (even during accept/reject)
- May cause unnecessary refreshes or race conditions

**Why the Gap Matters:**
- During accept, we write to file → triggers `onDidChangeContent` → tries to refresh
- Refresh may happen before accept completes → incorrect state
- Streaming writes trigger refreshes → may cause flicker or duplicate diffs

**Severity:** MEDIUM

**Category:** REQUIRED for correctness (prevents race conditions)

**Impact:**
- Accept writes to file → content change event → refresh → diffs recomputed → accept not complete → incorrect state
- Streaming writes → multiple content change events → multiple refreshes → performance issues

---

## 4. Range Realignment Responsibilities

### Gap 4.1: DiffArea Range Tracking and Realignment

**What Void Does:**
- `DiffZone.startLine` and `DiffZone.endLine` track region in current file (mutable)
- `_realignAllDiffAreasLines` called on every content change
- Handles 6 cases:
  1. Change fully below diff area → no change
  2. Change fully above diff area → shift down by delta
  3. Change fully within diff area → expand diff area by delta
  4. Change fully contains diff area → replace diff area range
  5. Change overlaps top of diff area → adjust start, expand end
  6. Change overlaps bottom of diff area → expand end
- Ensures `startLine/endLine` always reflect current file coordinates

**What Vybe Currently Does:**
- No `startLine/endLine` tracking on `DiffArea`
- No realignment logic
- Diff ranges (`originalRange`, `modifiedRange`) are static after creation

**Why the Gap Matters:**
- User edits above diff area → diff area should shift down
- User edits within diff area → diff area should expand
- Without realignment, `_computeDiffsAndAddStylesToURI` extracts wrong region from file
- Diffs computed from wrong region → incorrect diff detection

**Severity:** HIGH

**Category:** REQUIRED for correctness (if implementing automatic recomputation)

**Impact:**
- User adds 5 lines at line 1 → diff at line 10 should shift to line 15
- Without realignment, recomputation extracts lines 10-15 (wrong region)
- Diff shows incorrect changes

---

### Gap 4.2: Realignment Before Recomputation

**What Void Does:**
- `_onUserChangeContent` calls `_realignAllDiffAreasLines` FIRST
- Then calls `_refreshStylesAndDiffsInURI`
- Realignment happens before diff recomputation
- Ensures region extraction uses correct `startLine/endLine`

**What Vybe Currently Does:**
- No realignment, so this ordering doesn't matter
- But if we add recomputation, we need realignment first

**Why the Gap Matters:**
- Must realign ranges before recomputing diffs
- Wrong order → recomputation uses stale ranges → incorrect diffs

**Severity:** HIGH

**Category:** REQUIRED for correctness (if implementing recomputation)

---

## 5. Streaming-Specific Guarantees

### Gap 5.1: Incremental Streaming Writes

**What Void Does:**
- `_writeStreamedDiffZoneLLMText` writes delta text incrementally
- Tracks `StreamLocationMutable` with current line/column position
- Computes diffs from `originalCode` vs `llmTextSoFar` to find insertion point
- Writes delta, then adjusts original code position
- Realigns after each write

**What Vybe Currently Does:**
- `updateDiffsForStreaming` receives full `newModifiedContent`
- Writes entire content to file (not incremental)
- No tracking of streaming position
- No incremental write logic

**Why the Gap Matters:**
- Writing full content on each chunk is inefficient
- No way to show "streaming cursor" or partial content
- Large files may cause performance issues

**Severity:** LOW

**Category:** FUTURE HARDENING (current approach works, just less efficient)

---

### Gap 5.2: Streaming State Management

**What Void Does:**
- `DiffZone._streamState.isStreaming` tracks streaming state
- `_streamState.line` tracks current streaming line
- `_stopIfStreaming` aborts LLM stream and cleans up
- Streaming state prevents diff recomputation (diffs added incrementally)

**What Vybe Currently Does:**
- No explicit streaming state on `DiffArea`
- Streaming handled via `updateDiffsForStreaming` but no state tracking
- No way to abort streaming or detect if streaming is active

**Why the Gap Matters:**
- Cannot abort streaming if user accepts/rejects during stream
- Cannot prevent recomputation during streaming (may cause conflicts)
- No way to show "streaming in progress" UI state

**Severity:** MEDIUM

**Category:** FUTURE HARDENING (nice to have, not required for basic streaming)

---

## 6. Undo / Redo Safety

### Gap 6.1: Full State Snapshot System

**What Void Does:**
- `_getCurrentVoidFileSnapshot` captures:
  - `snapshottedDiffAreaOfId`: All diff areas with `originalCode`, `startLine`, `endLine`
  - `entireFileCode`: Full file content
- `_restoreVoidFileSnapshot` restores:
  - All diff areas (recreated with empty `_diffOfId`)
  - File content
  - Then calls `_refreshStylesAndDiffsInURI` to recompute diffs
- Undo/redo restores complete state (file + diff areas)

**What Vybe Currently Does:**
- Checkpoints capture file content only
- Do not capture diff area state (`originalSnapshot`, diff IDs, etc.)
- Undo/redo restores file content but not diff state
- Diffs may be lost or invalidated after undo

**Why the Gap Matters:**
- User accepts diff → undo → file reverts but diff state is lost
- User rejects diff → undo → file reverts but diff is still marked rejected
- Cannot restore "file with pending diffs" state after undo

**Severity:** HIGH

**Category:** REQUIRED for correctness (undo/redo breaks diff state)

**Impact:**
- Accept diff → undo → file reverted but diff still marked accepted → inconsistent state
- Reject diff → undo → file reverted but diff deleted → cannot restore diff

---

### Gap 6.2: Snapshot Before Operations

**What Void Does:**
- `_addToHistory` called BEFORE any operation (accept/reject/streaming start)
- Captures "before" snapshot
- `onFinishEdit` called AFTER operation completes
- Captures "after" snapshot
- Undo restores "before", redo restores "after"

**What Vybe Currently Does:**
- Checkpoints created before accept/reject (correct)
- But checkpoints don't include diff state
- Undo/redo callbacks don't restore diff state

**Why the Gap Matters:**
- Without diff state in snapshots, undo cannot fully restore previous state
- Diff areas may be lost or recreated incorrectly

**Severity:** HIGH

**Category:** REQUIRED for correctness

---

## 7. Multi-Diff Interactions

### Gap 7.1: Independent Diff Acceptance

**What Void Does:**
- Accepting diff 1 updates only `DiffZone.originalCode` (region baseline)
- Diff 2's baseline is independent (different `DiffZone` or different region)
- Accepting diff 1 doesn't affect diff 2's validity
- Each diff area has its own baseline

**What Vybe Currently Does:**
- Accepting diff 1 updates `DiffArea.originalSnapshot` (full-file baseline)
- All diffs in same file share the same baseline
- Accepting diff 1 may invalidate diff 2's ranges

**Why the Gap Matters:**
- If diff 1 and diff 2 are in same file, accepting diff 1 changes the baseline
- Diff 2's `originalRange` is now relative to a different baseline
- Diff 2 may show incorrect changes or become invalid

**Severity:** MEDIUM

**Category:** FUTURE HARDENING (works if only one diff per file, breaks for multiple)

**Impact:**
- File has diff 1 (lines 10-15) and diff 2 (lines 20-25)
- Accept diff 1 → baseline updated → diff 2's ranges may be wrong
- Accept diff 2 → applies to wrong location

---

### Gap 7.2: Overlapping Diff Area Detection

**What Void Does:**
- `_findOverlappingDiffArea` checks for overlaps before creating new diff areas
- Prevents multiple diff areas from overlapping
- Handles conflicts by accepting/rejecting existing areas or keeping conflicts

**What Vybe Currently Does:**
- No overlap detection
- Multiple diff areas can overlap
- No conflict resolution

**Why the Gap Matters:**
- Creating a new diff area that overlaps existing one may cause conflicts
- Accepting one may affect the other incorrectly
- Widgets may overlap or show incorrect state

**Severity:** LOW

**Category:** FUTURE HARDENING (edge case, may not occur in practice)

---

## Summary Lists

### Safe to Ignore for Now

1. **Incremental streaming writes** (Gap 5.1)
   - Current full-content write works
   - Optimization can be added later

2. **Streaming state management** (Gap 5.2)
   - Basic streaming works without explicit state
   - Can add state tracking later for abort/UI

3. **Empty diff area auto-deletion** (Gap 1.3)
   - Cosmetic issue, doesn't break correctness
   - Can add cleanup later

4. **Overlapping diff area detection** (Gap 7.2)
   - Edge case, may not occur
   - Can add detection later if needed

5. **Incremental baseline updates** (Gap 2.1)
   - Full-file baseline works for single-diff scenarios
   - Can optimize to incremental later

---

### Must Eventually Implement

1. **Automatic diff recomputation on user edits** (Gap 1.1)
   - Required for correctness when user edits between diffs
   - Severity: HIGH

2. **Range realignment system** (Gap 4.1, 4.2)
   - Required if implementing recomputation
   - Must track `startLine/endLine` and realign on edits
   - Severity: HIGH

3. **Comprehensive refresh triggers** (Gap 3.1)
   - Must refresh on model mount, editor tab change
   - Must recompute diffs, not just refresh decorations
   - Severity: HIGH

4. **Write flag to prevent recursive refresh** (Gap 3.2)
   - Prevents race conditions during accept/reject
   - Severity: MEDIUM (but required for stability)

5. **Full state snapshot system** (Gap 6.1, 6.2)
   - Required for correct undo/redo
   - Must capture and restore diff area state
   - Severity: HIGH

---

### Must Implement Before AI Integration

1. **Automatic diff recomputation on user edits** (Gap 1.1)
   - AI may generate diffs, user may edit, then accept
   - Without recomputation, accept applies to wrong location
   - **BLOCKER for production use**

2. **Range realignment system** (Gap 4.1, 4.2)
   - Required for recomputation to work correctly
   - Must track and adjust diff area ranges
   - **BLOCKER for production use**

3. **Write flag to prevent recursive refresh** (Gap 3.2)
   - Prevents instability during accept/reject operations
   - **BLOCKER for stability**

4. **Full state snapshot system** (Gap 6.1, 6.2)
   - Undo/redo is a core VS Code feature
   - Must work correctly with diff system
   - **BLOCKER for user experience**

---

## Critical Path to Production Readiness

To make the diff system production-ready for AI integration, implement in this order:

1. **Write flag** (Gap 3.2) - Prevents race conditions
2. **Range realignment** (Gap 4.1, 4.2) - Foundation for recomputation
3. **Automatic recomputation** (Gap 1.1) - Keeps diffs fresh
4. **Comprehensive refresh triggers** (Gap 3.1) - Ensures diffs visible
5. **Full state snapshots** (Gap 6.1, 6.2) - Correct undo/redo

After these 5 gaps are addressed, the system will be stable and correct for AI integration.

---

## Notes

- All gaps are architectural/behavioral, not UI-related
- No UI changes proposed
- Focus is on correctness and stability
- Current implementation works for simple cases (single diff, no user edits)
- Production use requires addressing the "Must Implement Before AI Integration" list

