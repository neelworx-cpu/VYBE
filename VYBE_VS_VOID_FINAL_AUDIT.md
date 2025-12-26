# Vybe vs Void — Final Production Readiness Audit

## Executive Summary

After completing Phases D1–D5, Vybe's diff system has achieved **architectural parity** with Void's core correctness invariants. The system now correctly:
- Maintains modified content in the file model
- Updates baselines on accept without changing the file
- Writes original back on reject
- Uses modified ranges for decorations/widgets
- Prevents recursive recomputation during system writes
- Realigns diff area ranges on user edits
- Automatically recomputes diffs after realignment
- Captures and restores diff state for undo/redo

**However**, several **behavioral gaps** remain that could cause correctness issues or instability under real-world usage. This audit identifies **8 critical gaps** that must be addressed before AI integration, plus **5 hardening improvements** for beta readiness.

**Overall Assessment**: The system is **architecturally sound** but requires **6 blockers** to be fixed before production AI integration. The remaining gaps are primarily edge cases and optimizations that can be deferred.

---

## Confirmed Parity (What We Now Match)

### Core Invariants ✓
1. **File model contains modified content** — After `computeDiffs`, file model holds modified content, baseline stored separately
2. **Accept updates baseline only** — File unchanged, `originalSnapshot` updated to current file content
3. **Reject writes original back** — `originalSnapshot` written to file model, reverting changes
4. **Decorations use modified ranges** — All decorations highlight content in the modified file using `modifiedRange`
5. **Widgets align with decorations** — Widgets use decoration ranges, ensuring perfect alignment

### Safety Mechanisms ✓
6. **Write guard prevents recursion** — `_isSystemWrite` flags prevent recomputation during accept/reject/streaming writes
7. **Range tracking** — `DiffArea.startLine/endLine` track current file coordinates
8. **Range realignment** — 6-case logic adjusts ranges on user edits before recomputation
9. **Automatic recomputation** — Diffs recomputed from current file state after user edits
10. **Refresh triggers** — Recompute on editor tab change, after accept/reject

### Undo/Redo Foundation ✓
11. **Snapshot capture** — `_captureDiffStateSnapshot` captures diff areas, ranges, and diff IDs
12. **Snapshot restore** — `_restoreDiffStateSnapshot` restores file content and triggers recomputation
13. **Checkpoint integration** — Checkpoints include `diffAreaSnapshots` for full state restoration

---

## Remaining Gaps

### A. Diff Engine Correctness

#### Gap A1: Full-File Baseline in Recomputation (BLOCKER)

**What Void Does:**
- `_computeDiffsAndAddStylesToURI` extracts region `[startLine:endLine]` from current file
- Compares against `DiffZone.originalCode` (region-specific baseline, not full file)
- Each `DiffZone` has its own `originalCode` baseline for that region only
- Recomputation compares region-to-region, not region-to-full-file

**What Vybe Currently Does:**
- `recomputeDiffsForFile` extracts region `[startLine:endLine]` from current file ✓
- Compares against `DiffArea.originalSnapshot` (full-file baseline) ✗
- Uses entire file baseline even though only extracting a region
- Comment in code: "For now, use the full baseline (region-specific baselines will be added in future phases)"

**Why the Gap Matters:**
- If user edits outside the diff area (e.g., line 5), then recomputation extracts region `[10:20]` and compares against full baseline that includes the user edit at line 5
- This causes incorrect diff detection — the recomputation sees differences that aren't actually in the region
- Accepting a diff may apply changes incorrectly because the baseline includes unrelated user edits
- **Example**: File has diff at lines 10-15. User edits line 5. Recomputation extracts lines 10-15, compares against full baseline (includes line 5 edit). Diff engine incorrectly detects changes.

**Severity:** BLOCKER

**Impact:**
- Accept/reject operates on incorrect diffs if user edits outside diff area
- Diffs may appear/disappear incorrectly after user edits
- Multi-diff files become unstable

---

#### Gap A2: Empty Diff Area Auto-Deletion After User Edits (REQUIRED)

**What Void Does:**
- After `_onUserChangeContent`, checks if any `DiffZone` has zero diffs
- Automatically deletes empty diff zones: `if (Object.keys(diffArea._diffOfId).length === 0) { this._deleteDiffZone(diffArea) }`
- Prevents orphaned diff areas with no diffs
- Happens immediately after user edits, before refresh

**What Vybe Currently Does:**
- Empty diff areas are deleted when `deleteDiff` is called manually (accept/reject)
- No automatic cleanup after user edits delete all diffs
- If user edits delete all diffs in an area, the area persists with empty `diffs` map
- Empty areas remain until explicit accept/reject

**Why the Gap Matters:**
- Empty diff areas consume memory and may show in UI (file command bar counts)
- Zones may persist for empty areas, showing widgets/decorations incorrectly
- File command bar may show "0 diffs" but still have a diff area
- Memory leak over time if users frequently edit away diffs

**Severity:** REQUIRED

**Impact:**
- Memory leaks (minor)
- UI confusion (file command bar shows incorrect state)
- Orphaned zones/widgets

---

#### Gap A3: Accept/Reject Idempotency (HARDENING)

**What Void Does:**
- `acceptDiff` checks if diff already accepted (no-op if already accepted)
- `rejectDiff` checks if diff already rejected (no-op if already rejected)
- Prevents double-accept or double-reject from causing errors

**What Vybe Currently Does:**
- `acceptDiff` checks `if (currentState === DiffState.Accepted) return true` ✓
- `rejectDiff` checks `if (currentState === DiffState.Rejected) return true` ✓
- **However**: No check if diff was already deleted (diff not found)
- If diff is deleted but state map still has entry, may cause issues

**Why the Gap Matters:**
- Rapid clicking "Keep" button may trigger multiple accept calls
- If diff is deleted between calls, second call may fail or cause inconsistent state
- Edge case, but can cause errors in UI

**Severity:** HARDENING

**Impact:**
- Rare errors from rapid clicking
- State inconsistency if diff deleted between calls

---

#### Gap A4: Reject After User Edit Behavior (REQUIRED)

**What Void Does:**
- `rejectDiff` writes `diff.originalCode` back to file at `diff.startLine` (current file coordinates)
- Uses `diff.startLine` which is in the modified file (already realigned)
- Reject always works because it uses current file coordinates

**What Vybe Currently Does:**
- `rejectDiff` writes `diffArea.originalSnapshot` (full file) back to file
- Uses full-file revert, not region-specific revert
- If user edited outside diff area, reject reverts those edits too (incorrect behavior)

**Why the Gap Matters:**
- User edits line 5, then rejects diff at line 10
- Current: Reject reverts entire file (including user's edit at line 5) ✗
- Expected: Reject only reverts the diff region, preserving user's edit at line 5 ✓
- **This is a correctness issue** — reject should only affect the diff, not unrelated user edits

**Severity:** REQUIRED

**Impact:**
- Reject incorrectly reverts user edits outside diff area
- User loses work when rejecting diffs
- Violates principle that reject only affects the diff

---

### B. Recompute + Refresh Safety

#### Gap B1: Model Mount Trigger Missing (BLOCKER)

**What Void Does:**
- `initializeModel` calls `_refreshStylesAndDiffsInURI(model.uri)` on model mount
- Ensures diffs created in background (while editor closed) are visible when editor opens
- Listens to `onModelAdded` to refresh on new model mounts

**What Vybe Currently Does:**
- `_initializeZonesForOpenEditors` creates zones for already-open editors
- No recomputation trigger on model mount
- If diffs are created while editor is closed, editor opens but diffs may be stale
- No listener to `IModelService.onModelAdded`

**Why the Gap Matters:**
- AI generates diffs → user closes editor → user reopens editor
- Editor opens but diffs are not recomputed → stale ranges → accept/reject fails
- Diffs created in background may not be visible until user edits

**Severity:** BLOCKER

**Impact:**
- Diffs invisible when editor reopens
- Stale diffs cause accept/reject to fail
- Poor user experience (diffs appear broken)

---

#### Gap B2: Recomputation Baseline Region Mismatch (BLOCKER)

**What Void Does:**
- Extracts region `[startLine:endLine]` from current file
- Extracts corresponding region from `DiffZone.originalCode` (region baseline)
- Compares region-to-region: `findDiffs(diffArea.originalCode, newDiffAreaCode)`
- `newDiffAreaCode = fullFileText.split('\n').slice((diffArea.startLine - 1), (diffArea.endLine - 1) + 1).join('\n')`

**What Vybe Currently Does:**
- Extracts region `[startLine:endLine]` from current file ✓
- Compares against full `DiffArea.originalSnapshot` (full-file baseline) ✗
- Region-to-full-file comparison causes incorrect diff detection
- No extraction of corresponding region from baseline

**Why the Gap Matters:**
- If baseline has 100 lines and diff area is lines 10-15, we extract lines 10-15 from current file but compare against all 100 lines of baseline
- Diff engine sees differences in lines 1-9 and 16-100 that aren't relevant to the region
- Causes incorrect diff computation → wrong diffs → accept/reject fails

**Severity:** BLOCKER

**Impact:**
- Recomputation produces incorrect diffs
- Accept/reject operates on wrong content
- System becomes unstable after user edits

---

#### Gap B3: Scheduler Race Condition Risk (HARDENING)

**What Void Does:**
- `_refreshStylesAndDiffsInURI` is synchronous (no debouncing)
- Called immediately after realignment
- No scheduler, so no race conditions

**What Vybe Currently Does:**
- Uses `RunOnceScheduler` with 300ms debounce
- Scheduler callback is async (`async () => { await recomputeDiffsForFile(...) }`)
- Multiple rapid edits may queue multiple recomputations
- If user edits rapidly, scheduler may fire while previous recomputation is still running

**Why the Gap Matters:**
- User types rapidly → multiple edits → scheduler fires multiple times
- Second recomputation may start before first completes → race condition
- Diffs may be computed from intermediate state, causing incorrect results
- Low probability but possible under fast typing

**Severity:** HARDENING

**Impact:**
- Rare race conditions during rapid typing
- Incorrect diffs if recomputation overlaps
- System instability under stress

---

#### Gap B4: Recomputation After Accept/Reject Timing (REQUIRED)

**What Void Does:**
- `acceptDiff` / `rejectDiff` call `_refreshStylesAndDiffsInURI` at the end
- This recomputes diffs after accept/reject completes
- Ensures remaining diffs are fresh after one is accepted/rejected

**What Vybe Currently Does:**
- `onDidAcceptDiff` / `onDidRejectDiff` events trigger `recomputeDiffsForFile`
- However, this happens **after** the system write flag is cleared
- If recomputation happens too quickly, it may see intermediate state
- No explicit ordering guarantee

**Why the Gap Matters:**
- Accept diff → system write flag cleared → event fires → recomputation starts
- If recomputation reads file before accept fully completes, may see stale state
- Remaining diffs may be incorrect after accept/reject

**Severity:** REQUIRED

**Impact:**
- Remaining diffs may be stale after accept/reject
- Accept one diff may cause other diffs to become incorrect
- Multi-diff files become unstable

---

### C. Undo / Redo Guarantees

#### Gap C1: Incomplete State Restoration (BLOCKER)

**What Void Does:**
- `_restoreVoidFileSnapshot` recreates `DiffZone` objects with exact `originalCode`, `startLine`, `endLine`
- Restores file content
- Then calls `_refreshStylesAndDiffsInURI` to recompute diffs from restored state
- Result: Exact same diffs as before (same IDs, same ranges, same content)

**What Vybe Currently Does:**
- `_restoreDiffStateSnapshot` deletes all existing diff areas
- Restores file content
- Calls `recomputeDiffsForFile` to regenerate diffs
- **Problem**: Recomputation generates NEW diffs with NEW IDs
- Snapshot contains `diffIds` but we don't use them — we just recompute
- Result: Different diff IDs after undo, widgets may not match

**Why the Gap Matters:**
- Undo should restore exact state (same diff IDs, same ranges)
- Current approach: Undo restores file content but generates new diffs
- Widgets created for old diff IDs become orphaned
- User sees different diffs after undo (even if content is same)
- **This breaks undo/redo correctness** — state is not truly restored

**Severity:** BLOCKER

**Impact:**
- Undo does not restore exact state (different diff IDs)
- Widgets become orphaned (created for old IDs, new IDs generated)
- User experience: Undo "works" but diffs look different
- Redo may fail because state doesn't match

---

#### Gap C2: Undo During Streaming Not Handled (REQUIRED)

**What Void Does:**
- `_restoreVoidFileSnapshot` calls `_stopIfStreaming` for each diff area before restore
- Aborts LLM stream: `this._llmMessageService.abort(streamRequestId)`
- Sets streaming state to false
- Then proceeds with restore

**What Vybe Currently Does:**
- No streaming abort mechanism
- No check for streaming state before undo
- If user undos during streaming, restore may conflict with active stream
- Stream may continue writing after undo completes

**Why the Gap Matters:**
- User starts streaming → user undos → restore happens → stream still writing
- File content may be overwritten by stream after restore
- Undo state becomes incorrect
- Race condition between stream and undo

**Severity:** REQUIRED

**Impact:**
- Undo during streaming causes file corruption
- Stream overwrites restored content
- Undo state becomes invalid

---

#### Gap C3: Accept/Reject File/All Undo Not Implemented (HARDENING)

**What Void Does:**
- `acceptOrRejectAllDiffAreas` creates checkpoint with full state
- Undo restores all files and all diff areas
- Full multi-file undo/redo support

**What Vybe Currently Does:**
- `acceptFile` / `acceptAll` / `rejectFile` / `rejectAll` create checkpoints
- Undo callbacks are stubs: `this._logService.warn('[VybeEditService] Undo acceptAll not fully implemented yet')`
- No actual undo/redo implementation for file-level or global operations

**Why the Gap Matters:**
- User accepts all diffs → undos → nothing happens (stub)
- User loses ability to undo file-level operations
- Inconsistent with single-diff undo (which works)

**Severity:** HARDENING

**Impact:**
- File-level operations cannot be undone
- User confusion (some operations undo, others don't)
- Not a correctness issue (file content is correct), just missing feature

---

### D. Widget Stability

#### Gap D1: Widget Cleanup During Recomputation (REQUIRED)

**What Void Does:**
- `_refreshStylesAndDiffsInURI` clears all effects first: `_clearAllEffects(uri)`
- This deletes all diffs and clears all styles
- Then recomputes and re-adds everything
- Widgets are recreated from scratch, no orphan risk

**What Vybe Currently Does:**
- `_updateWidgetsForZone` clears all widgets before creating new ones ✓
- However, if recomputation deletes a diff (user edited it away), widget cleanup happens in `_updateWidgetsForZone`
- If recomputation happens while widget update is in progress, race condition possible
- No explicit synchronization between recomputation and widget updates

**Why the Gap Matters:**
- Recomputation deletes diff → event fires → widget update starts → widget tries to create for deleted diff
- Widget may be created for diff that no longer exists
- Or widget may not be cleaned up if diff is deleted during update

**Severity:** REQUIRED

**Impact:**
- Orphaned widgets (widgets for deleted diffs)
- Widgets may appear/disappear incorrectly
- UI instability during recomputation

---

#### Gap D2: Zone Disposal During Widget Update (HARDENING)

**What Void Does:**
- Zone disposal is synchronous and immediate
- Widgets are disposed as part of zone disposal
- No async operations during disposal

**What Vybe Currently Does:**
- `_updateWidgetsForZone` is called from async scheduler callback
- Zone may be disposed while widget update is in progress
- No check if zone is disposed before creating widgets

**Why the Gap Matters:**
- User closes editor → zone disposed → scheduler fires → widget update tries to create widgets for disposed zone
- May cause errors or memory leaks
- Edge case but possible

**Severity:** HARDENING

**Impact:**
- Rare errors when editor closes during recomputation
- Memory leaks if widgets created for disposed zones
- Low probability issue

---

#### Gap D3: Widget Lifecycle vs Diff Lifecycle Mismatch (HARDENING)

**What Void Does:**
- Widgets are created per-diff and disposed when diff is deleted
- Widget lifecycle matches diff lifecycle exactly
- No widgets exist for deleted diffs

**What Vybe Currently Does:**
- Widgets are created in `_updateWidgetsForZone` based on current diffs
- Widgets are cleared and recreated on every refresh
- If diff is deleted, widget is removed on next refresh
- **However**: If refresh doesn't happen immediately, widget may persist for deleted diff

**Why the Gap Matters:**
- User accepts diff → diff deleted → refresh scheduled (300ms debounce) → widget still visible for 300ms
- User may see widget for diff that was already accepted
- Minor UX issue, not correctness

**Severity:** HARDENING

**Impact:**
- Brief widget visibility for deleted diffs (300ms max)
- Minor UX confusion
- Not a correctness issue

---

### E. Streaming Safety

#### Gap E1: No Streaming Abort Mechanism (REQUIRED)

**What Void Does:**
- `_stopIfStreaming` aborts LLM stream: `this._llmMessageService.abort(streamRequestId)`
- Sets streaming state to false
- Called before undo, before new streaming starts, on explicit abort
- Prevents conflicts between streaming and other operations

**What Vybe Currently Does:**
- No streaming abort mechanism
- No `streamRequestId` tracking on `DiffArea`
- No way to stop active stream
- If user accepts/rejects during streaming, stream continues

**Why the Gap Matters:**
- User starts streaming → user accepts diff → stream continues writing → file overwritten
- Accept/reject during streaming causes file corruption
- Undo during streaming causes conflicts (see Gap C2)
- **Critical for correctness** — streaming must be abortable

**Severity:** REQUIRED

**Impact:**
- File corruption if accept/reject during streaming
- Undo conflicts with active stream
- System becomes unstable during streaming

---

#### Gap E2: No Streaming State Tracking (REQUIRED)

**What Void Does:**
- `DiffZone._streamState.isStreaming` tracks streaming state
- `_streamState.streamRequestIdRef` tracks the active stream request
- Used to prevent recomputation during streaming
- Used to abort stream on undo/accept/reject

**What Vybe Currently Does:**
- No streaming state on `DiffArea`
- No way to detect if a diff area is currently streaming
- `recomputeDiffsForFile` may run during streaming, causing conflicts
- Write guard prevents recomputation, but no explicit streaming state check

**Why the Gap Matters:**
- If streaming is active, recomputation should be blocked (even if write guard is false)
- Accept/reject during streaming should abort stream first
- Without state tracking, we can't detect or handle streaming conflicts

**Severity:** REQUIRED

**Impact:**
- Recomputation may run during streaming (conflict)
- Accept/reject can't abort stream (no stream ID)
- System unstable during streaming

---

#### Gap E3: Streaming vs Recompute Conflict (BLOCKER)

**What Void Does:**
- Streaming writes incrementally via `_writeStreamedDiffZoneLLMText`
- Each write calls `_refreshStylesAndDiffsInURI` which recomputes diffs
- However, streaming state prevents normal recomputation — diffs are added incrementally
- `_fireChangeDiffsIfNotStreaming` only fires events if NOT streaming

**What Vybe Currently Does:**
- `updateDiffsForStreaming` recomputes all diffs from full content
- No check if recomputation is already in progress
- If user edits during streaming, both streaming update and user-edit recomputation may run
- Race condition: streaming update vs user-edit recomputation

**Why the Gap Matters:**
- User edits during streaming → user-edit recomputation starts → streaming update arrives → both try to update diffs
- Diffs may be overwritten incorrectly
- File content may become inconsistent
- **Critical correctness issue** — streaming and recomputation must not conflict

**Severity:** BLOCKER

**Impact:**
- File corruption if user edits during streaming
- Diffs become incorrect during streaming
- System unstable during streaming + user edits

---

## Must Fix Before AI Integration

### Critical Blockers (6 items)

1. **Gap A1: Full-File Baseline in Recomputation**
   - Extract region from baseline, not full file
   - Compare region-to-region, not region-to-full-file
   - **Impact**: Accept/reject operates on incorrect diffs

2. **Gap B1: Model Mount Trigger Missing**
   - Add `IModelService.onModelAdded` listener
   - Call `recomputeDiffsForFile` on model mount if diff areas exist
   - **Impact**: Diffs invisible when editor reopens

3. **Gap B2: Recomputation Baseline Region Mismatch**
   - Extract corresponding region from baseline (same as current file region)
   - Compare extracted regions, not region-to-full-file
   - **Impact**: Recomputation produces incorrect diffs

4. **Gap C1: Incomplete State Restoration**
   - Restore `DiffArea` objects directly from snapshot (don't delete and recompute)
   - Preserve diff IDs from snapshot
   - Only recompute if snapshot doesn't match current state
   - **Impact**: Undo doesn't restore exact state, widgets orphaned

5. **Gap E1: No Streaming Abort Mechanism**
   - Add `streamRequestId` to `DiffArea` or transaction
   - Implement `abortStreaming(diffAreaId)` method
   - Call abort before accept/reject/undo during streaming
   - **Impact**: File corruption if accept/reject during streaming

6. **Gap E3: Streaming vs Recompute Conflict**
   - Add streaming state check to `recomputeDiffsForFile` (block if streaming)
   - Or: Queue recomputation until streaming completes
   - Prevent user-edit recomputation during streaming
   - **Impact**: File corruption if user edits during streaming

---

## Must Fix Before Beta

### Required Fixes (5 items)

7. **Gap A2: Empty Diff Area Auto-Deletion**
   - After recomputation, check if diff area has zero diffs
   - Auto-delete empty areas (similar to Void's `_onUserChangeContent`)
   - **Impact**: Memory leaks, UI confusion

8. **Gap A4: Reject After User Edit Behavior**
   - Reject should write region-specific original code, not full file
   - Extract region from `originalSnapshot` and write only that region
   - Preserve user edits outside diff area
   - **Impact**: Reject incorrectly reverts user edits

9. **Gap B4: Recomputation After Accept/Reject Timing**
   - Ensure recomputation happens after system write flag is cleared AND file content is stable
   - Add explicit ordering: accept/reject completes → flag cleared → recompute
   - **Impact**: Remaining diffs may be stale after accept/reject

10. **Gap C2: Undo During Streaming Not Handled**
    - Check for streaming state before undo
    - Abort stream before restore (requires Gap E1)
    - **Impact**: Undo during streaming causes file corruption

11. **Gap E2: No Streaming State Tracking**
    - Add `isStreaming: boolean` and `streamRequestId?: string` to `DiffArea`
    - Track streaming state in `updateDiffsForStreaming`
    - Block recomputation if streaming (requires Gap E1)
    - **Impact**: Can't detect or handle streaming conflicts

---

## Safe to Defer

### Hardening Improvements (5 items)

12. **Gap A3: Accept/Reject Idempotency**
    - Add check if diff is already deleted before accept/reject
    - Return early if diff not found (already handled)
    - **Impact**: Rare errors from rapid clicking

13. **Gap B3: Scheduler Race Condition Risk**
    - Add flag to prevent overlapping recomputations
    - Or: Cancel previous recomputation if new one starts
    - **Impact**: Rare race conditions during rapid typing

14. **Gap C3: Accept/Reject File/All Undo Not Implemented**
    - Implement undo/redo for `acceptFile`, `rejectFile`, `acceptAll`, `rejectAll`
    - Use same snapshot approach as single-diff undo
    - **Impact**: File-level operations cannot be undone (feature gap, not correctness)

15. **Gap D2: Zone Disposal During Widget Update**
    - Add check if zone is disposed before creating widgets
    - Early return if zone disposed
    - **Impact**: Rare errors when editor closes during recomputation

16. **Gap D3: Widget Lifecycle vs Diff Lifecycle Mismatch**
    - Immediate widget cleanup on diff deletion (don't wait for refresh)
    - Or: Reduce debounce time for widget updates
    - **Impact**: Brief widget visibility for deleted diffs (UX issue)

---

## Non-Goals (Explicitly Excluded)

The following are **explicitly out of scope** for this audit and should NOT be implemented yet:

1. **Region-specific baselines** (`DiffArea.originalCode` per region) — Future optimization
2. **Incremental streaming writes** — Current full-content write is correct, optimization can wait
3. **Overlapping diff area detection** — Edge case, may not occur in practice
4. **Performance optimizations** — Focus on correctness, not speed
5. **UI changes** — Hunk widgets and file command bar design are fine
6. **New services or refactoring** — Keep existing architecture
7. **Streaming cursor/partial content display** — UI feature, not correctness

---

## Final Recommendation

### Go / No-Go for AI Integration

**Status: NO-GO** (with path to GO)

**Reasoning:**
- **6 blockers** must be fixed before AI integration
- Most critical: Recomputation baseline mismatch (Gap A1, B2) and incomplete undo restore (Gap C1)
- Streaming safety gaps (E1, E2, E3) are critical for production use
- Model mount trigger (B1) is required for correct behavior

**Path to GO:**
1. Fix **Gap A1 + B2** (recomputation baseline) — **HIGHEST PRIORITY**
   - This is the most critical correctness issue
   - Without this, accept/reject will fail after user edits
2. Fix **Gap C1** (undo restore) — **HIGH PRIORITY**
   - Undo/redo is a core VS Code feature, must work correctly
3. Fix **Gap E1 + E2 + E3** (streaming safety) — **HIGH PRIORITY**
   - Required for production streaming use
4. Fix **Gap B1** (model mount) — **MEDIUM PRIORITY**
   - Required for correct behavior when editor reopens

**Estimated Effort:**
- Gap A1+B2: 2-3 hours (extract region from baseline)
- Gap C1: 3-4 hours (restore DiffAreas directly from snapshot)
- Gap E1+E2+E3: 2-3 hours (add streaming state and abort)
- Gap B1: 1 hour (add model mount listener)
- **Total: 8-11 hours** of focused work

**After Fixes:**
- System will be **production-ready** for AI integration
- All correctness invariants will be satisfied
- Remaining gaps are hardening/optimization (can be deferred)

---

## Risk Assessment

### Current Risk Level: **HIGH** (before fixes)

**Critical Risks:**
1. **File corruption** — Accept/reject during streaming (Gap E1, E3)
2. **Incorrect diffs** — Recomputation baseline mismatch (Gap A1, B2)
3. **Broken undo** — Incomplete state restoration (Gap C1)
4. **Invisible diffs** — Model mount trigger missing (Gap B1)

### Risk Level After Fixes: **LOW**

**Remaining Risks (deferrable):**
- Memory leaks from empty diff areas (minor)
- Widget visibility delays (UX only)
- Race conditions during rapid typing (rare)

---

## Conclusion

Vybe's diff system has achieved **architectural parity** with Void's core invariants. The foundation is solid. However, **6 critical behavioral gaps** remain that must be fixed before AI integration:

1. Recomputation baseline region mismatch (2 gaps, same root cause)
2. Incomplete undo state restoration
3. Streaming safety (3 gaps: abort, state tracking, conflict prevention)
4. Model mount trigger

These are **focused, implementable fixes** (8-11 hours total). Once addressed, the system will be **production-ready** for AI integration with confidence that:
- User files will not be corrupted
- Undo/redo will be lossless
- Widgets will not drift or orphan
- AI integration can be layered without touching diff internals

The remaining gaps are **hardening improvements** that can be deferred to post-beta releases.

