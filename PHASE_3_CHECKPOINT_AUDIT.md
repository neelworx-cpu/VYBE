# Phase 3 Checkpoint Timeline Audit

**Date:** 2025-01-XX
**Purpose:** Audit existing checkpoint infrastructure before implementing Phase 3
**Status:** Analysis Only

---

## Executive Summary

**Key Finding:** VS Code's Chat Editing has a sophisticated checkpoint system, but it's tightly coupled to chat-specific concepts (request IDs, undo stops, observables). VYBE needs a simpler, focused checkpoint system that captures file snapshots before AcceptFile/AcceptAll operations and integrates with `IUndoRedoService` for undo/redo.

---

## A. Existing VS Code Checkpoint Infrastructure

### 1. ChatEditingCheckpointTimelineImpl ✅

**Location:** `src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingCheckpointTimelineImpl.ts`

**Key Features:**
- **Epoch-based ordering:** Uses `_epochCounter` to order checkpoints and operations
- **Observable state:** Uses `observableValue` for reactive state management
- **File baselines:** Stores `IFileBaseline` objects keyed by `${uri}::${requestId}`
- **File operations:** Tracks `FileOperation[]` (Create, Delete, Rename, TextEdit, NotebookEdit)
- **Checkpoint structure:** `ICheckpoint { checkpointId, requestId, undoStopId, epoch, label, description }`
- **Navigation:** `navigateToCheckpoint()`, `undoToLastCheckpoint()`, `redoToNextCheckpoint()`

**Chat-Specific Concepts:**
- `requestId`: Ties checkpoints to chat requests
- `undoStopId`: Marks undo boundaries within requests
- `IChatEditingTimelineFsDelegate`: File system operations delegate
- Observable-based reactivity (for UI updates)

**Reusable Patterns:**
- ✅ Epoch-based ordering (simple counter)
- ✅ File snapshot storage (Map<URI, string>)
- ✅ Checkpoint creation before operations
- ✅ Navigation between checkpoints

**Not Reusable (Chat-Coupled):**
- ❌ Request ID / undo stop ID concepts
- ❌ Observable state management (overkill for VYBE)
- ❌ File system delegate pattern (we use IModelService directly)
- ❌ Complex operation replay (we just need snapshots)

---

### 2. IUndoRedoService ✅

**Location:** `src/vs/platform/undoRedo/common/undoRedoService.ts`

**Key Methods:**
- `pushElement(element, group?, source?)` - Add undo element
- `createSnapshot(resource)` - Create snapshot for a resource
- `restoreSnapshot(snapshot)` - Restore snapshot
- `undo(resource)` / `redo(resource)` - Undo/redo operations

**Key Types:**
- `IUndoRedoElement` - Base undo element interface
- `IResourceUndoRedoElement` - Resource-level undo element
- `IWorkspaceUndoRedoElement` - Workspace-level undo element
- `UndoRedoElementType.Resource` - Resource-level undo
- `UndoRedoElementType.Workspace` - Workspace-level undo
- `UndoRedoGroup` - Groups multiple edits into single undo step

**Status:** ✅ **REUSE DIRECTLY** - Already used in `VybeEditServiceImpl` for accept/reject operations

**Current Usage in VYBE:**
- `acceptFile()` uses `UndoRedoGroup` for atomic file operations
- `acceptAll()` uses `UndoRedoElementType.Workspace` for workspace-level undo
- `rejectFile()` / `rejectAll()` use similar patterns

---

### 3. How Chat Editing Creates Checkpoints

**Location:** `src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingSession.ts`

**On Accept All:**
- `session.accept()` → calls `_timeline.createCheckpoint(requestId, undoStop, label)`
- Creates checkpoint BEFORE applying edits
- Uses `undoStopId` to mark undo boundaries

**On Tool Edits:**
- `_acceptEdits()` → calls `_recordEditOperations()`
- Records `FileOperation` objects in timeline
- Creates checkpoints at undo stops

**On User Edits:**
- Tracks file baselines via `recordFileBaseline()`
- Baselines stored keyed by `${uri}::${requestId}`
- Used for reconstructing file state

**Pattern:** ✅ **REUSE** - Create checkpoint BEFORE applying edits

---

## B. What VYBE Needs

### Simplified Checkpoint Model

**Requirements:**
1. **File snapshots:** Capture `model.getValue()` for affected files
2. **Epoch ordering:** Simple counter for deterministic ordering
3. **Integration:** Use `IUndoRedoService` for undo/redo
4. **In-memory only:** No persistence, no database
5. **Multi-file support:** Workspace-level checkpoints for AcceptAll

**Not Needed:**
- ❌ Request IDs (no chat requests)
- ❌ Undo stop IDs (simpler model)
- ❌ Observable state (no reactive UI yet)
- ❌ File operation replay (just restore snapshots)
- ❌ File system delegate (use IModelService directly)

---

## C. Architecture Comparison

### Chat Editing Checkpoint System
```
ICheckpoint {
  checkpointId, requestId, undoStopId, epoch, label, description
}
+ FileOperation[] (replay operations)
+ IFileBaseline[] (baseline snapshots)
+ Observable state (reactive UI)
+ File system delegate (apply operations)
```

### VYBE Checkpoint System (Simplified)
```
VybeCheckpoint {
  checkpointId, epoch, label, timestamp,
  affectedUris: URI[],
  fileSnapshots: Map<URI, string>
}
+ Direct snapshot restore (no operation replay)
+ Simple in-memory storage
+ IUndoRedoService integration
```

---

## D. Integration Points

### Existing VYBE Code

**VybeEditServiceImpl:**
- `acceptFile()` - Uses `UndoRedoGroup` ✅
- `acceptAll()` - Uses `UndoRedoElementType.Workspace` ✅
- `rejectFile()` / `rejectAll()` - Already restore original snapshots ✅

**Integration Strategy:**
1. Create checkpoint BEFORE `acceptFile()` / `acceptAll()`
2. Store file snapshots (current model values)
3. Use `IUndoRedoService.pushElement()` with workspace element
4. On undo, restore snapshots from checkpoint

---

## E. Implementation Approach

### Step 3A: Define Checkpoint Model
- Simple `VybeCheckpoint` interface
- No chat-specific fields
- File snapshots as `Map<URI, string>`

### Step 3B: Checkpoint Service Interface
- `IVybeCheckpointService`
- `createCheckpoint(label, uris, reason)`
- `restoreCheckpoint(checkpointId)`
- `getCheckpoints()` / `getLatestCheckpoint()`

### Step 3C: Checkpoint Service Implementation
- Capture snapshots via `model.getValue()`
- Store in-memory (Map<checkpointId, VybeCheckpoint>)
- Track epochs (simple counter)
- Integrate with `IUndoRedoService`

### Step 3D: Wire into Edit Service
- `acceptFile()` → create checkpoint BEFORE applying edits
- `acceptAll()` → create single workspace checkpoint
- Reject paths do NOT create checkpoints (already restore originals)

---

## F. Reusable vs New Code

### Reuse (Adapt):
- ✅ Epoch-based ordering concept
- ✅ File snapshot storage pattern
- ✅ `IUndoRedoService` integration
- ✅ `UndoRedoGroup` for multi-file operations
- ✅ Checkpoint creation before operations

### New (Simplified):
- ✅ Simple checkpoint model (no request IDs)
- ✅ Direct snapshot restore (no operation replay)
- ✅ In-memory storage only
- ✅ Simple service interface (no observables)

---

## G. Success Criteria

After Phase 3:
- ✅ Accept All can be undone in one step
- ✅ Multi-file AI edits rollback correctly
- ✅ Checkpoints are deterministic and ordered
- ✅ No UI dependency exists yet
- ✅ Integrates cleanly with existing `IUndoRedoService` usage

---

## H. Risks & Considerations

**Risk 1: Snapshot Size**
- Large files may consume memory
- **Mitigation:** In-memory only, cleared on reload

**Risk 2: Undo/Redo Integration**
- Must work with existing `IUndoRedoService` usage
- **Mitigation:** Use workspace-level undo elements

**Risk 3: Checkpoint Lifecycle**
- When to create/remove checkpoints
- **Mitigation:** Create before AcceptFile/AcceptAll, keep until next AcceptAll

---

**End of Audit Report**

