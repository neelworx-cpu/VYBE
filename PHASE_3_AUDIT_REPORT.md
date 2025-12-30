# Phase 3: MCP Mutating Tools + Approval Gates — Audit Report

**Mode:** AUDIT ONLY (NO IMPLEMENTATION)
**Date:** 2025-12-28
**Status:** Phase 2 Complete, Phase 3 Preparation

---

## EXECUTIVE SUMMARY

This audit examines existing IDE services for Phase 3 mutating tools. The IDE has robust edit transaction, checkpoint, and filesystem services. MCP currently has direct filesystem mutation tools (`write_file`, `apply_patch`) that must be migrated to IDE tool calls. Approval mechanisms exist in VS Code's chat tools system but are not yet integrated with Vybe's edit system.

**Key Findings:**
- ✅ Edit transaction service (`IVybeEditService`) is mature and transaction-scoped
- ✅ Checkpoint service (`IVybeCheckpointService`) exists and supports multi-file undo/redo
- ✅ Filesystem write operations (`IFileService`) are available but must be wrapped
- ⚠️ No existing approval gate infrastructure for MCP tools
- ⚠️ MCP has direct filesystem access that must be deprecated

---

## 1. SERVICE INVENTORY TABLE

### 1.1 Edit Transaction Services

| Service | Method | Mutates? | Writes Disk? | Reversible? | Transaction-Scoped? | MCP-Callable? |
|--------|-------|---------|--------------|-------------|---------------------|---------------|
| `IVybeEditService` | `createEditTransaction` | ❌ No | ❌ No | N/A | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `acceptDiff` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `rejectDiff` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `acceptFile` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `rejectFile` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `acceptAll` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `rejectAll` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | ✅ Yes | ✅ **With Approval** |
| `IVybeEditService` | `getEditTransaction` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** |
| `IVybeEditService` | `getDiffsForFile` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** (Phase 2) |
| `IVybeEditService` | `getDiffAreasForFile` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** (Phase 2) |
| `IVybeEditService` | `getAllDiffs` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** (Phase 2) |
| `IVybeEditService` | `getAllDiffAreas` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** (Phase 2) |

**Notes:**
- All accept/reject methods mutate **editor state only** (via `IModelService.pushEditOperations`)
- They do **NOT** write to disk directly
- All mutations are integrated with `IUndoRedoService` for full undo/redo support
- `acceptFile` and `acceptAll` automatically create checkpoints before applying edits
- Transactions are in-memory only (no persistence)

**Current UI Usage:**
- `acceptDiff` / `rejectDiff` are called from diff decorations/widgets
- `acceptFile` / `rejectFile` are called from file command bar
- `acceptAll` / `rejectAll` are called from chat titlebar actions

---

### 1.2 Filesystem Mutation Services

| Service | Method | Mutates? | Writes Disk? | Reversible? | Scope | MCP-Callable? |
|--------|-------|---------|--------------|-------------|-------|---------------|
| `IFileService` | `writeFile` | ✅ Yes | ✅ Yes | ⚠️ Partial (undo/redo) | File | ⚠️ **NEVER Direct** |
| `IFileService` | `createFile` | ✅ Yes | ✅ Yes | ⚠️ Partial (undo/redo) | File | ⚠️ **NEVER Direct** |
| `IFileService` | `createFolder` | ✅ Yes | ✅ Yes | ⚠️ Partial (undo/redo) | Folder | ⚠️ **NEVER Direct** |
| `IFileService` | `del` | ✅ Yes | ✅ Yes | ⚠️ Partial (undo/redo) | File/Folder | ⚠️ **NEVER Direct** |
| `IFileService` | `move` | ✅ Yes | ✅ Yes | ⚠️ Partial (undo/redo) | File/Folder | ⚠️ **NEVER Direct** |
| `IFileService` | `copy` | ✅ Yes | ✅ Yes | ⚠️ Partial (undo/redo) | File/Folder | ⚠️ **NEVER Direct** |
| `IFileService` | `readFile` | ❌ No | ❌ No | N/A | File | ✅ **Safe** (Phase 2) |
| `IFileService` | `stat` | ❌ No | ❌ No | N/A | File/Folder | ✅ **Safe** (Phase 2) |
| `IFileService` | `exists` | ❌ No | ❌ No | N/A | File/Folder | ✅ **Safe** (Phase 2) |

**Critical Findings:**
- `IFileService.writeFile` writes **directly to disk** (bypasses editor state)
- `IFileService` methods are **NOT** integrated with edit transactions
- `IFileService` methods are **NOT** integrated with diff system
- `IFileService` methods do **NOT** create checkpoints automatically
- `IFileService` methods emit `FileOperation` events but do not participate in edit transaction lifecycle

**Verdict:**
- ❌ **MCP MUST NEVER call `IFileService.writeFile` directly**
- ✅ **MCP MUST use edit transactions** (`createEditTransaction` → `acceptFile` → checkpoint)
- ✅ **OR** MCP must call a wrapper tool that bridges `IFileService` to edit transactions

---

### 1.3 Checkpoint Services

| Service | Method | Mutates? | Writes Disk? | Reversible? | Immutable? | MCP-Callable? |
|--------|-------|---------|--------------|-------------|------------|---------------|
| `IVybeCheckpointService` | `createCheckpoint` | ❌ No | ❌ No | N/A | ✅ Yes | ✅ **With Approval** |
| `IVybeCheckpointService` | `restoreCheckpoint` | ✅ Yes | ❌ No | ✅ Yes (undo/redo) | N/A | ✅ **With Approval** |
| `IVybeCheckpointService` | `getCheckpoint` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** |
| `IVybeCheckpointService` | `getCheckpoints` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** |
| `IVybeCheckpointService` | `getLatestCheckpoint` | ❌ No | ❌ No | N/A | N/A | ✅ **Safe** |

**Notes:**
- Checkpoints are **in-memory only** (no persistence across IDE restarts)
- Checkpoints capture **editor model snapshots** (not disk state)
- `restoreCheckpoint` mutates editor state via `IModelService.pushEditOperations`
- `restoreCheckpoint` is integrated with `IUndoRedoService` for undo/redo
- Checkpoints are **immutable** once created (cannot be modified)
- Checkpoints are **ordered by epoch** (incremental counter)

**Current Usage:**
- `createCheckpoint` is called automatically by `acceptFile` and `acceptAll`
- `restoreCheckpoint` is **NOT** currently exposed to UI (no timeline widget yet)

---

### 1.4 Diff Computation Services

| Service | Method | Mutates? | Writes Disk? | Reversible? | MCP-Callable? |
|--------|-------|---------|--------------|-------------|---------------|
| `IVybeDiffService` | `computeDiffs` | ❌ No | ❌ No | N/A | ✅ **Safe** (Phase 2) |
| `IVybeDiffService` | `updateDiffsForStreaming` | ❌ No | ❌ No | N/A | ⚠️ **IDE Internal** |
| `IVybeDiffService` | `getDiffArea` | ❌ No | ❌ No | N/A | ✅ **Safe** (Phase 2) |
| `IVybeDiffService` | `getDiffAreasForUri` | ❌ No | ❌ No | N/A | ✅ **Safe** (Phase 2) |

**Notes:**
- `computeDiffs` is **pure computation** (no side effects)
- `updateDiffsForStreaming` is used internally for streaming diff updates
- All methods are read-only and already exposed in Phase 2

---

## 2. TOOL FEASIBILITY MATRIX

### 2.1 Edit & Mutation Tools

| Tool Name | Backing Service | Risk Level | Required Approval | Blockers | Notes |
|-----------|----------------|------------|-------------------|----------|-------|
| `vybe.create_edit_transaction` | `IVybeEditService.createEditTransaction` | **Low** | ⚠️ **Yes** | None | Creates transaction only (no mutation) |
| `vybe.accept_diff` | `IVybeEditService.acceptDiff` | **High** | ✅ **Yes** | None | Mutates editor state, reversible |
| `vybe.reject_diff` | `IVybeEditService.rejectDiff` | **High** | ✅ **Yes** | None | Mutates editor state, reversible |
| `vybe.accept_file` | `IVybeEditService.acceptFile` | **High** | ✅ **Yes** | None | Mutates editor state, creates checkpoint |
| `vybe.reject_file` | `IVybeEditService.rejectFile` | **High** | ✅ **Yes** | None | Mutates editor state, reversible |
| `vybe.accept_all` | `IVybeEditService.acceptAll` | **Critical** | ✅ **Yes** | None | Mutates multiple files, creates checkpoint |
| `vybe.reject_all` | `IVybeEditService.rejectAll` | **Critical** | ✅ **Yes** | None | Mutates multiple files, reversible |

**Approval Requirements:**
- All accept/reject operations **MUST** require user approval
- `accept_all` and `reject_all` are **critical risk** (multi-file mutations)
- Approval should show:
  - File(s) affected
  - Number of diffs
  - Preview of changes (if possible)

---

### 2.2 Filesystem Write Tools

| Tool Name | Backing Service | Risk Level | Required Approval | Blockers | Notes |
|-----------|----------------|------------|-------------------|----------|-------|
| `vybe.write_file` | ⚠️ **Wrapper Required** | **Critical** | ✅ **Yes** | ⚠️ **Must wrap IFileService** | Should create edit transaction first |
| `vybe.apply_patch` | ⚠️ **Wrapper Required** | **Critical** | ✅ **Yes** | ⚠️ **Must wrap IFileService** | Should create edit transaction first |

**Critical Design Decision:**
- **Option A:** `vybe.write_file` creates edit transaction → computes diff → requires approval → calls `acceptFile` → writes to disk
- **Option B:** `vybe.write_file` writes directly to disk (bypasses edit system) — **❌ REJECTED**
- **Option C:** `vybe.write_file` writes to disk AND creates edit transaction for undo — **⚠️ COMPLEX**

**Recommendation:** **Option A** (transaction-first approach)
- Maintains consistency with existing edit system
- Enables diff preview before write
- Enables checkpoint creation
- Enables undo/redo integration

**Blockers:**
- Must implement wrapper that:
  1. Creates edit transaction
  2. Computes diff (original vs new content)
  3. Requires approval
  4. Calls `acceptFile` (which writes to disk via `ITextFileService`)

**Note:** `acceptFile` does **NOT** write to disk directly. It mutates editor state. Disk write happens via `ITextFileService.save()` when user saves the file. For MCP tools, we may need to trigger save explicitly.

---

### 2.3 Checkpoint Tools

| Tool Name | Backing Service | Risk Level | Required Approval | Blockers | Notes |
|-----------|----------------|------------|-------------------|----------|-------|
| `vybe.create_checkpoint` | `IVybeCheckpointService.createCheckpoint` | **Low** | ⚠️ **Optional** | None | Read-only operation (captures state) |
| `vybe.restore_checkpoint` | `IVybeCheckpointService.restoreCheckpoint` | **Critical** | ✅ **Yes** | None | Mutates multiple files, reversible |
| `vybe.get_checkpoint` | `IVybeCheckpointService.getCheckpoint` | **Low** | ❌ **No** | None | Read-only query |

**Approval Requirements:**
- `create_checkpoint` is **low risk** (read-only snapshot)
- `restore_checkpoint` is **critical risk** (multi-file mutations, destructive)
- Approval should show:
  - Checkpoint label and description
  - Files to be restored
  - Warning about data loss

---

## 3. HARD "DO NOT EXPOSE" LIST

### 3.1 Services That Must NEVER Be Exposed

| Service | Method | Reason |
|---------|--------|--------|
| `IFileService` | `writeFile` | Bypasses edit transactions, no diff preview, no checkpoint |
| `IFileService` | `createFile` | Bypasses edit transactions, no diff preview |
| `IFileService` | `del` | Bypasses edit transactions, destructive |
| `IFileService` | `move` | Bypasses edit transactions, complex side effects |
| `IFileService` | `copy` | Bypasses edit transactions, complex side effects |
| `IModelService` | `pushEditOperations` | Low-level editor API, must go through edit service |
| `ITextFileService` | `save` | Should be triggered by edit service, not directly |
| `IVybeDiffService` | `updateDiffsForStreaming` | Internal implementation detail |

### 3.2 Internal Implementation Details

- **Diff state tracking maps** (`_diffStates` in `VybeEditServiceImpl`)
- **Transaction storage** (`_transactions` in `VybeEditServiceImpl`)
- **Checkpoint storage** (`_checkpoints` in `VybeCheckpointServiceImpl`)
- **Undo/redo element creation** (internal to edit service)

---

## 4. APPROVAL GATE SURFACE (DESIGN AUDIT)

### 4.1 Existing Approval Mechanisms

**VS Code Chat Tools System:**
- `ILanguageModelToolsConfirmationService` exists for chat tool approvals
- Supports pre-execution and post-execution confirmation
- Supports session/workspace/profile-level auto-approval
- Uses `IDialogService` for user prompts

**Vybe Edit System:**
- ❌ **NO existing approval mechanism** for edit operations
- Accept/reject operations are **direct** (no approval gates)
- UI widgets (diff decorations, file command bar) call accept/reject directly

### 4.2 Feasibility Analysis

**Where Approval Hooks Could Live:**

1. **MCP Tool Handler Layer** (Recommended)
   - Tool handler checks `requiresApproval: true` flag
   - Calls approval service before executing tool
   - Returns approval request to MCP if needed
   - MCP waits for approval before proceeding

2. **Edit Service Layer** (Alternative)
   - Add `requiresApproval` parameter to `acceptDiff`, `acceptFile`, etc.
   - Edit service calls approval service internally
   - Blocks execution until approval granted

3. **IPC Bridge Layer** (Not Recommended)
   - Approval happens in renderer process
   - Main process tool bridge waits for approval
   - Complex IPC coordination required

**Recommendation:** **Option 1 (Tool Handler Layer)**
- Keeps approval logic at tool boundary
- Enables tool-specific approval policies
- Enables MCP to handle approval requests
- Maintains separation of concerns

### 4.3 Approval Service Design (Feasibility Only)

**Required Components:**
- `IVybeMcpToolApprovalService` (new service)
- Approval request/response types
- Integration with `IDialogService` for UI prompts
- Storage for auto-approval preferences (session/workspace/profile)

**Approval Flow:**
1. MCP calls tool (e.g., `vybe.accept_file`)
2. Tool handler checks `requiresApproval: true`
3. Tool handler calls `approvalService.requestApproval(...)`
4. Approval service shows dialog (or checks auto-approval)
5. User approves/rejects
6. Tool handler proceeds or returns error

**Auto-Approval Policies:**
- Session-level: "Allow in this session"
- Workspace-level: "Allow in this workspace"
- Profile-level: "Always allow"
- Tool-specific: Per-tool auto-approval settings

---

## 5. MCP MIGRATION IMPACT (READ-ONLY)

### 5.1 Existing MCP Mutation Tools

| Tool Name | Location | Current Behavior | Migration Required |
|-----------|----------|------------------|-------------------|
| `write_file` | `VYBE-MCP/src/tools/local/files.ts` | Direct `fs.writeFile` | ✅ **YES** → `vybe.write_file` |
| `apply_patch` | `VYBE-MCP/src/tools/local/apply_patch.ts` | Direct `fs.writeFile` + diff | ✅ **YES** → `vybe.apply_patch` |
| `read_file` | `VYBE-MCP/src/tools/local/files.ts` | Direct `fs.readFile` | ✅ **YES** → `vybe.read_file` (Phase 2) |
| `list_dir` | `VYBE-MCP/src/tools/local/files.ts` | Direct `fs.readdir` | ✅ **YES** → `vybe.list_files` (Phase 2) |

**Migration Strategy:**
1. **Phase 2 (Complete):** Replace `read_file` and `list_dir` with IDE tool calls
2. **Phase 3:** Replace `write_file` and `apply_patch` with IDE tool calls
3. **Deprecation:** Mark old tools as deprecated, log warnings
4. **Fallback:** If IDE tool host unavailable, return error (no fallback to direct filesystem)

### 5.2 MCP Tools That Must Remain Internal

| Tool Name | Reason |
|-----------|--------|
| Agent orchestration tools | MCP-internal logic |
| Memory management tools | MCP-internal state |
| Task graph tools | MCP-internal state |
| Safety policy tools | MCP-internal logic |
| Snapshot service tools | MCP-internal state (if not migrated to IDE) |

**Note:** MCP's `apply_patch` tool has complex approval logic (L3 agent level, user approval, reviewer approval). This logic should be **preserved in MCP** but the actual file write should be delegated to IDE tool.

---

## 6. READINESS VERDICT

### 6.1 What Is Already Sufficient for Phase 3A

✅ **Edit Transaction Service:**
- `createEditTransaction` is ready for MCP exposure
- `acceptDiff`, `rejectDiff`, `acceptFile`, `rejectFile` are ready (with approval)
- Transaction lifecycle is well-defined
- Undo/redo integration is complete

✅ **Checkpoint Service:**
- `createCheckpoint` is ready for MCP exposure
- `restoreCheckpoint` is ready (with approval)
- Multi-file undo/redo is supported

✅ **Diff Service:**
- `computeDiffs` is already exposed (Phase 2)
- Diff computation is pure and safe

### 6.2 What Gaps Exist

❌ **Approval Gate Infrastructure:**
- No approval service for MCP tools
- No integration with existing VS Code approval system
- No auto-approval preferences storage

❌ **Filesystem Write Wrapper:**
- No wrapper that bridges `IFileService.writeFile` to edit transactions
- No tool that creates transaction → computes diff → requires approval → writes to disk

❌ **Patch Application Wrapper:**
- No wrapper that applies patches via edit transactions
- MCP's `apply_patch` logic must be preserved but file write must be delegated

❌ **Save Integration:**
- `acceptFile` mutates editor state but does not save to disk
- Need to trigger `ITextFileService.save()` after `acceptFile` for MCP tools
- Or need to ensure editor auto-saves after accept

### 6.3 What Must Be Designed Before Coding

1. **Approval Service Contract:**
   - Interface definition
   - Request/response types
   - Integration points (tool handler, dialog service)
   - Auto-approval storage schema

2. **Filesystem Write Tool Contract:**
   - Input: `{ uri: string, content: string }`
   - Output: `{ transactionId: string, diffAreaId: string }`
   - Approval: Required before write
   - Flow: Create transaction → Compute diff → Request approval → Accept file → Save to disk

3. **Patch Application Tool Contract:**
   - Input: `{ uri: string, patch: string }` (unified diff format)
   - Output: `{ transactionId: string, diffAreaId: string }`
   - Approval: Required before apply
   - Flow: Create transaction → Apply patch → Compute diff → Request approval → Accept file → Save to disk

4. **Checkpoint Tool Contracts:**
   - `createCheckpoint`: `{ label: string, description?: string, uris?: string[] }`
   - `restoreCheckpoint`: `{ checkpointId: string }` (requires approval)
   - `getCheckpoint`: `{ checkpointId: string }` (read-only)

5. **MCP Migration Plan:**
   - Deprecation timeline for old tools
   - Error messages for fallback attempts
   - Testing strategy for tool replacement

---

## 7. ARCHITECTURAL RISKS

### 7.1 High-Risk Areas

1. **Direct Filesystem Access:**
   - Risk: MCP tools bypass edit transactions
   - Mitigation: Enforce tool-only filesystem access, no direct `IFileService` exposure

2. **Approval Bypass:**
   - Risk: Auto-approval settings allow dangerous operations
   - Mitigation: Require explicit approval for critical operations (multi-file, destructive)

3. **Transaction Lifecycle:**
   - Risk: Transactions created but never accepted/rejected
   - Mitigation: Timeout and cleanup for abandoned transactions

4. **Checkpoint Storage:**
   - Risk: In-memory checkpoints lost on IDE restart
   - Mitigation: Document limitation, consider persistence for Phase 4

### 7.2 Security Considerations

- **Workspace Boundary Enforcement:** Already enforced in Phase 2 tools
- **Path Validation:** Must be enforced in write tools (reuse Phase 2 validation)
- **Approval Escalation:** Prevent auto-approval for critical operations
- **Audit Logging:** Consider logging all mutating tool calls (Phase 4)

---

## 8. PHASE 3 IMPLEMENTATION PRIORITIES

### Phase 3A: Core Mutation Tools (High Priority)

1. ✅ `vybe.create_edit_transaction` (low risk, no approval needed)
2. ✅ `vybe.accept_diff` (high risk, approval required)
3. ✅ `vybe.reject_diff` (high risk, approval required)
4. ✅ `vybe.accept_file` (high risk, approval required)
5. ✅ `vybe.reject_file` (high risk, approval required)

### Phase 3B: Filesystem Write Tools (Critical Priority)

6. ⚠️ `vybe.write_file` (critical risk, wrapper required)
7. ⚠️ `vybe.apply_patch` (critical risk, wrapper required)

### Phase 3C: Checkpoint Tools (Medium Priority)

8. ✅ `vybe.create_checkpoint` (low risk, optional approval)
9. ✅ `vybe.restore_checkpoint` (critical risk, approval required)
10. ✅ `vybe.get_checkpoint` (low risk, read-only)

### Phase 3D: Global Operations (Low Priority)

11. ⚠️ `vybe.accept_all` (critical risk, approval required)
12. ⚠️ `vybe.reject_all` (critical risk, approval required)

---

## 9. CONCLUSION

**Phase 3 is FEASIBLE** with the following prerequisites:

1. ✅ Edit transaction service is mature and ready
2. ✅ Checkpoint service exists and supports multi-file operations
3. ⚠️ Approval gate infrastructure must be designed and implemented
4. ⚠️ Filesystem write wrapper must be designed and implemented
5. ⚠️ MCP migration plan must be defined

**Recommended Approach:**
- Start with Phase 3A (core mutation tools) + approval infrastructure
- Then Phase 3B (filesystem write tools) + wrapper implementation
- Then Phase 3C (checkpoint tools)
- Finally Phase 3D (global operations)

**Blockers:**
- Approval service design and implementation
- Filesystem write wrapper design and implementation
- Save integration (editor state → disk)

**No Blockers:**
- Edit transaction service (ready)
- Checkpoint service (ready)
- Diff computation (ready)
- Workspace validation (ready from Phase 2)

---

**END OF AUDIT REPORT**


