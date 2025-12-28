# Phase 3B Audit Report
## Filesystem Mutation via Edit Transactions

**Date:** 2025-12-28
**Scope:** Audit-only assessment of Phase 3B readiness
**Tools in Scope:** `vybe.write_file`, `vybe.apply_patch`

---

## 1. EXISTING IDE SERVICES (FACTUAL INVENTORY)

### 1.1 File Writing Services

#### ITextFileService
**Location:** `src/vs/workbench/services/textfile/common/textfiles.ts`

**Capabilities:**
- `save(resource: URI, options?: ITextFileSaveOptions): Promise<URI | undefined>`
  - Saves a text file editor model to disk
  - Returns URI if successful, undefined if canceled
  - Requires model to exist in `files` manager
  - For untitled files, may prompt user for save location
- `write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata>`
  - **DIRECT DISK WRITE** - Bypasses editor model
  - Updates file content replacing previous value
  - Emits `FileOperation.WRITE` event
  - **FORBIDDEN FOR PHASE 3B** - Does not go through edit transactions

**Does it mutate editor state?**
- `save()`: Yes, but only if model exists and is dirty
- `write()`: No, writes directly to disk

**Does it write to disk?**
- `save()`: Yes, via `TextFileEditorModel.doSave()` → `textFileService.write()`
- `write()`: Yes, directly via `IFileService.writeFile()`

**Is it reversible?**
- `save()`: Yes, participates in undo/redo via editor model
- `write()`: No, not reversible through undo system

**Is it transaction-aware?**
- `save()`: No, not aware of edit transactions
- `write()`: No, not aware of edit transactions

#### IFileService
**Location:** `src/vs/platform/files/common/files.ts`

**Capabilities:**
- `writeFile(resource: URI, bufferOrReadableOrStream: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: IWriteFileOptions): Promise<IFileStatWithMetadata>`
  - **LOW-LEVEL DISK WRITE** - Raw filesystem operation
  - Emits `FileOperation.WRITE` event
  - **FORBIDDEN FOR PHASE 3B** - Must never be called directly from MCP tools

**Does it mutate editor state?**
- No, only writes to disk

**Does it write to disk?**
- Yes, directly

**Is it reversible?**
- No, not through undo system

**Is it transaction-aware?**
- No

#### TextFileEditorModel
**Location:** `src/vs/workbench/services/textfile/common/textFileEditorModel.ts`

**Capabilities:**
- `save(options?: ITextFileSaveAsOptions): Promise<boolean>`
  - Saves model to disk if dirty
  - Returns true if saved successfully
  - Can be called programmatically if model exists
  - Requires model to be resolved (file loaded)
  - Respects save participants, encoding, etag checks

**Does it mutate editor state?**
- No, state is already mutated (model is dirty)

**Does it write to disk?**
- Yes, via `textFileService.write()` → `fileService.writeFile()`

**Is it reversible?**
- Yes, save operation is part of undo/redo system

**Is it transaction-aware?**
- No, but can be called after `acceptFile()` mutates model

### 1.2 Editor Save Pipeline

**Flow:**
1. User/Code mutates `ITextModel` via `pushEditOperations()`
2. Model becomes "dirty" (has unsaved changes)
3. `ITextFileService.save(uri)` is called
4. `TextFileEditorModel.save()` is invoked
5. `doSave()` runs save participants, encoding resolution
6. `textFileService.write()` is called with model snapshot
7. `fileService.writeFile()` performs actual disk write
8. Model state updated to `SAVED`

**Key Finding:** Save can be triggered programmatically via `ITextFileService.save(uri, options)` if:
- Model exists in `files` manager
- Model is resolved (file loaded)
- Model is dirty (has unsaved changes)

**Example from Void:** `void/src/vs/workbench/contrib/chat/common/tools/editFileTool.ts:204` shows:
```typescript
await this.textFileService.save(uri, {
    reason: SaveReason.AUTO,
    skipSaveParticipants: true,
});
```

---

## 2. EDIT TRANSACTION + SAVE PIPELINE

### 2.1 Current Flow (Phase 3A)

**Path:** `createEditTransaction` → `_seedDiffsForTransaction` → `acceptFile` → **STOPS HERE**

**Current Implementation (`acceptFile`):**
1. Gets diff areas for URI
2. Collects pending diffs
3. Gets text model for URI
4. Creates checkpoint
5. Applies edits via `model.pushEditOperations()`
6. Updates diff states to `Accepted`
7. Pushes undo element
8. Updates transaction states
9. Emits events
10. **DOES NOT SAVE TO DISK**

**Factual Finding:** `acceptFile()` does NOT write to disk. It only mutates editor state.

### 2.2 Where Disk Write Actually Occurs

**Disk write happens in:**
- `TextFileEditorModel.doSave()` → `textFileService.write()` → `fileService.writeFile()`
- This is triggered by:
  - User pressing Ctrl+S / Cmd+S
  - Auto-save (if enabled)
  - Programmatic call to `ITextFileService.save(uri)`

**Current Gap:** After `acceptFile()` mutates the model, the model is dirty but NOT saved. Save must be triggered separately.

### 2.3 Can Save Be Safely Invoked from MCP Tool Handler?

**Answer: YES, with conditions**

**Requirements:**
1. Model must exist (file must be loaded in editor or loaded via `IModelService`)
2. Model must be resolved (not in error state)
3. Model must be dirty (has unsaved changes)
4. Should use `SaveReason.EXPLICIT` or `SaveReason.AUTO`
5. May want to skip save participants: `skipSaveParticipants: true`

**Example Pattern:**
```typescript
// After acceptFile() completes
const model = modelService.getModel(uri);
if (model && textFileService.isDirty(uri)) {
    await textFileService.save(uri, {
        reason: SaveReason.EXPLICIT,
        skipSaveParticipants: false // Or true, depending on requirements
    });
}
```

### 2.4 What Happens If Save Fails?

**Error Handling:**
- `ITextFileService.save()` returns `undefined` if save fails or is canceled
- `TextFileEditorModel.save()` returns `false` if save fails
- Errors are logged but not thrown (graceful degradation)
- Model remains dirty
- User can retry save manually

**Risk:** If save fails after `acceptFile()`, model is mutated but file on disk is unchanged. This is acceptable because:
- Model state is preserved
- User can manually save
- Undo/redo still works
- No data loss (changes are in memory)

---

## 3. DIFF + PATCH APPLICATION FEASIBILITY

### 3.1 Existing Patch Application Logic

**MCP Side (`VYBE-MCP/src/tools/local/apply_patch.ts`):**
- Uses `diff` npm package: `diff.applyPatch(originalContent, patch.diff)`
- Applies unified diff format patches
- Writes directly to filesystem via `fs.writeFile()`
- **FORBIDDEN PATTERN** - Must be migrated to IDE

**IDE Side:**
- **NO EXISTING PATCH APPLICATION LOGIC FOUND**
- No unified diff parser
- No patch application utilities
- No `applyPatch()` helpers in IDE codebase

### 3.2 What Must Be Built

**For `vybe.apply_patch`:**

1. **Patch Format Support:**
   - Must support unified diff format (standard)
   - Must parse patch hunks
   - Must validate patch against current file content

2. **Patch Application Strategy:**
   - **PREFERRED:** Diff-first approach
     - Parse patch → compute diffs → create edit transaction → seed diffs → accept file → save
   - **ALTERNATIVE:** Direct application
     - Parse patch → apply in memory → create edit transaction with full content → seed diffs → accept file → save
   - **FORBIDDEN:** Direct filesystem write

3. **Where Logic Must Live:**
   - IDE side: New service or utility in `vybeChat` or `mcp` contribution
   - Must NOT live in MCP repo
   - Can reuse `diff` package (if available) or implement parser

4. **Integration Points:**
   - Must call `createEditTransaction()`
   - Must call `_seedDiffsForTransaction()` (or equivalent)
   - Must call `acceptFile()` (with approval)
   - Must call `ITextFileService.save()`

### 3.3 What Does NOT Exist

- Unified diff parser in IDE
- Patch application utilities
- Hunk validation logic
- Patch-to-diff conversion helpers

### 3.4 What Must Be Built Later (Design Phase)

- Unified diff parser (or npm package integration)
- Patch validation (hunk line numbers, context matching)
- Patch-to-diff conversion (if using diff-first approach)
- Error handling for patch conflicts
- Partial application handling (some hunks succeed, others fail)

---

## 4. APPROVAL GATE ADEQUACY (PHASE 3B)

### 4.1 Current Approval Service

**Location:** `src/vs/workbench/contrib/mcp/browser/vybeMcpToolApprovalServiceImpl.ts`

**Current Capabilities:**
- Shows modal dialog via `IDialogService.confirm()`
- Displays: tool name, file URI(s), diff count, description, warning
- Returns: `{ approved: boolean, reason?: string }`
- Denies by default on error/timeout

### 4.2 Metadata Currently Supported

**ApprovalRequest Interface:**
- `toolName: string` ✅
- `fileUri?: string` ✅
- `fileUris?: string[]` ✅
- `diffCount?: number` ✅
- `description: string` ✅

### 4.3 Additional Metadata Needed for Phase 3B

**For `vybe.write_file`:**
- ✅ File path (already supported via `fileUri`)
- ⚠️ Line count (NOT currently supported - would need to compute from content)
- ⚠️ Overwrite warning (NOT currently supported - would need to check if file exists)
- ✅ Description (already supported)

**For `vybe.apply_patch`:**
- ✅ File path (already supported)
- ⚠️ Patch size / hunk count (NOT currently supported)
- ⚠️ Conflict warnings (NOT currently supported - would need patch validation)
- ✅ Description (already supported)

### 4.4 Capability Gaps

**Missing (but not blockers):**
1. **File existence check:** Cannot warn "This will overwrite existing file"
2. **Content size metrics:** Cannot show "X lines will be added/removed"
3. **Patch validation:** Cannot warn "Patch may conflict with current file"
4. **Multi-file operations:** Can show multiple files but not aggregate stats

**Workarounds:**
- File existence can be checked before approval via `IFileService.exists()`
- Content size can be computed before approval
- Patch validation can be done before approval (but may be expensive)

### 4.5 Operations That Should NEVER Be Auto-Approved

**Hard Rules:**
1. **Overwriting existing files** - Always require approval
2. **Large changes** (>1000 lines) - Always require approval
3. **Binary files** - Always require approval (if supported)
4. **Files outside workspace** - Already blocked by workspace validation
5. **System files** (e.g., `/etc/passwd`) - Already blocked by workspace validation

**Current Service:** Adequate for Phase 3B, but may need enhancement for production hardening.

---

## 5. MCP SIDE IMPACT (READ-ONLY)

### 5.1 Existing Tools That Must Be Migrated

#### write_file Tool
**Location:** `VYBE-MCP/src/tools/local/files.ts:36-297`

**Current Behavior:**
- Direct filesystem write via `fs.writeFile()`
- Creates snapshots before write
- Records audit logs to Supabase
- Updates task graph
- **FORBIDDEN:** Direct `fs.writeFile()` call

**Required IDE Delegation:**
- Must call `vybe.write_file` IDE tool instead
- IDE tool will: create transaction → seed diffs → request approval → accept file → save
- MCP must NOT write to filesystem

**Risk Level:** **HIGH** - Currently violates architecture

#### apply_patch Tool
**Location:** `VYBE-MCP/src/tools/local/apply_patch.ts:42-430`

**Current Behavior:**
- Fetches patch from Supabase
- Validates approval status
- Applies patch via `diff.applyPatch()`
- Writes directly to filesystem via `fs.writeFile()`
- Updates patch status in database
- **FORBIDDEN:** Direct `fs.writeFile()` and `diff.applyPatch()` calls

**Required IDE Delegation:**
- Must call `vybe.apply_patch` IDE tool instead
- IDE tool will: parse patch → create transaction → seed diffs → request approval → accept file → save
- MCP must NOT apply patches or write to filesystem

**Risk Level:** **HIGH** - Currently violates architecture

### 5.2 Migration Impact Table

| Tool | Current Behavior | Required IDE Delegation | Risk Level | Migration Complexity |
|------|-----------------|------------------------|------------|---------------------|
| `write_file` | Direct `fs.writeFile()` | Call `vybe.write_file` tool | **HIGH** | Medium - Need to remove filesystem logic, keep audit/task graph |
| `apply_patch` | Direct `diff.applyPatch()` + `fs.writeFile()` | Call `vybe.apply_patch` tool | **HIGH** | High - Need to remove patch application logic, keep approval validation |

### 5.3 MCP Assumptions That Will Break

**Current Assumptions:**
1. MCP can write files directly ✅ **MUST BE REMOVED**
2. MCP can apply patches directly ✅ **MUST BE REMOVED**
3. MCP manages file snapshots ✅ **CAN KEEP** (but may need to coordinate with IDE)
4. MCP records audit logs ✅ **CAN KEEP** (but may need IDE to provide mutation metadata)
5. MCP updates task graph ✅ **CAN KEEP**

**Breaking Changes:**
- `write_file` tool must become a wrapper that calls IDE tool
- `apply_patch` tool must become a wrapper that calls IDE tool
- Snapshot creation may need to happen in IDE (or MCP can still create snapshots before calling IDE)
- Audit logs may need IDE to provide mutation details (file path, diff size, etc.)

---

## 6. HARD "DO NOT IMPLEMENT" LIST

### 6.1 Forbidden APIs

**MUST NOT be exposed to MCP:**
1. `IFileService.writeFile()` - Direct disk write
2. `ITextFileService.write()` - Direct disk write (bypasses editor)
3. `fs.writeFile()` / `fs.promises.writeFile()` - Node.js direct write
4. Any filesystem write API that bypasses edit transactions

**MUST NOT be called from MCP tool handlers:**
1. `IFileService.writeFile()` - Even if accessible, must not be called
2. `ITextFileService.write()` - Even if accessible, must not be called
3. Direct editor model mutations without transactions - Must go through `acceptFile()`

### 6.2 Forbidden Shortcuts

**MUST NOT implement:**
1. **"Fast path" for new files:** Even new files must go through edit transactions
2. **"Bypass approval for small changes":** All mutations require approval
3. **"Direct save without accept":** Cannot save file without going through `acceptFile()`
4. **"Patch application without diffs":** Cannot apply patch without creating diffs first

### 6.3 Anti-Patterns to Avoid

1. **MCP-side file writing:**
   ```typescript
   // FORBIDDEN
   await fs.writeFile(path, content);
   ```

2. **IDE tool bypassing transactions:**
   ```typescript
   // FORBIDDEN
   await fileService.writeFile(uri, content);
   ```

3. **Approval bypass:**
   ```typescript
   // FORBIDDEN
   if (content.length < 100) {
       // Skip approval
   }
   ```

4. **Direct model mutation without diffs:**
   ```typescript
   // FORBIDDEN
   model.setValue(newContent); // Without transaction/diffs
   ```

5. **Save without accept:**
   ```typescript
   // FORBIDDEN
   model.setValue(newContent);
   await textFileService.save(uri); // Without acceptFile()
   ```

---

## 7. RISK & BLOCKER ANALYSIS

### 7.1 Hard Blockers

**BLOCKER 1: No Patch Application Logic in IDE**
- **What is missing:** Unified diff parser, patch application utilities
- **Why it matters:** `vybe.apply_patch` cannot be implemented without this
- **Blocks:** `vybe.apply_patch` tool entirely
- **Mitigation:** Can be built in Phase 3B implementation

**BLOCKER 2: MCP Tools Still Write Directly to Filesystem**
- **What is missing:** Migration of `write_file` and `apply_patch` to IDE delegation
- **Why it matters:** Violates canonical architecture
- **Blocks:** Phase 3B cannot proceed until MCP tools are migrated
- **Mitigation:** Must be done as part of Phase 3B

### 7.2 Soft Blockers

**SOFT BLOCKER 1: Save Not Triggered After acceptFile()**
- **What is missing:** Automatic save after `acceptFile()` completes
- **Why it matters:** Model is mutated but file on disk is unchanged until user saves
- **Blocks:** User experience (changes not persisted)
- **Mitigation:** Can be added in Phase 3B implementation

**SOFT BLOCKER 2: Approval Dialog Metadata Gaps**
- **What is missing:** File existence warnings, content size metrics, patch conflict warnings
- **Why it matters:** User may not have full context for approval decision
- **Blocks:** User experience (less informed decisions)
- **Mitigation:** Can be enhanced incrementally

### 7.3 Non-Issues

**NON-ISSUE 1: ITextFileService.save() Can Be Called Programmatically**
- **Status:** ✅ Confirmed - Can be called from tool handlers
- **Evidence:** Void's `editFileTool.ts` shows this pattern

**NON-ISSUE 2: Undo/Redo Support**
- **Status:** ✅ Confirmed - `acceptFile()` already pushes undo elements
- **Evidence:** `vybeEditServiceImpl.ts:406` shows undo element creation

**NON-ISSUE 3: Checkpoint Support**
- **Status:** ✅ Confirmed - `acceptFile()` already creates checkpoints
- **Evidence:** `vybeEditServiceImpl.ts:376` shows checkpoint creation

**NON-ISSUE 4: Workspace Validation**
- **Status:** ✅ Confirmed - Already enforced in Phase 2 tools
- **Evidence:** `vybeReadOnlyToolHandlers.ts` has `validateWorkspace()` helper

---

## 8. READINESS VERDICT

### 8.1 Is Phase 3B Implementable Now?

**Answer: CONDITIONALLY YES**

**Conditions:**
1. ✅ Edit transaction infrastructure exists (Phase 3A)
2. ✅ Approval service exists (Phase 3A)
3. ✅ Save pipeline can be invoked programmatically (confirmed)
4. ⚠️ Patch application logic must be built (not a blocker, but required)
5. ⚠️ MCP tools must be migrated (required before Phase 3B completion)

### 8.2 What MUST Be Designed Before Coding

**Design Required:**

1. **Patch Application Architecture:**
   - Decision: Diff-first vs. direct application
   - Decision: Where patch parser lives (IDE service vs. utility)
   - Decision: Error handling for patch conflicts
   - Decision: Partial application strategy

2. **Save Trigger Strategy:**
   - Decision: Auto-save after `acceptFile()` or require explicit save?
   - Decision: Save options (skip participants, reason, etc.)
   - Decision: Error handling if save fails

3. **MCP Tool Migration Plan:**
   - Decision: Keep MCP tools as wrappers or remove entirely?
   - Decision: How to handle audit logs (MCP vs. IDE)?
   - Decision: How to handle snapshots (MCP vs. IDE)?

4. **Approval Dialog Enhancements:**
   - Decision: What metadata to show (file size, line count, etc.)
   - Decision: When to show warnings (overwrite, large changes, etc.)
   - Decision: UI/UX for multi-file operations

### 8.3 What Can Safely Be Deferred

**Can Be Deferred:**
1. **Advanced patch features:** Context-aware patching, fuzzy matching
2. **Batch operations:** Writing multiple files in one transaction
3. **Conflict resolution UI:** Advanced UI for patch conflicts
4. **Performance optimizations:** Large file handling, incremental saves
5. **Approval dialog enhancements:** Can start with basic version, enhance later

### 8.4 What Would Cause Data Loss If Done Incorrectly

**CRITICAL RISKS:**

1. **Saving Without Approval:**
   - **Risk:** User changes overwritten without consent
   - **Mitigation:** Approval gate is mandatory, cannot be bypassed

2. **Saving Without Transaction:**
   - **Risk:** Changes not undoable, no checkpoint
   - **Mitigation:** Must go through `createEditTransaction()` → `acceptFile()`

3. **Direct Filesystem Write:**
   - **Risk:** Bypasses editor state, causes desync
   - **Mitigation:** Must use `ITextFileService.save()`, never `IFileService.writeFile()`

4. **Patch Application Without Validation:**
   - **Risk:** Corrupts file if patch doesn't match current content
   - **Mitigation:** Must validate patch hunks before application

5. **Save Failure Without Rollback:**
   - **Risk:** Model mutated but file unchanged, user confusion
   - **Mitigation:** Model state is preserved, user can retry or undo

### 8.5 Implementation Readiness Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Edit Transactions | ✅ Ready | Phase 3A complete |
| Approval Service | ✅ Ready | Phase 3A complete |
| Diff Seeding | ✅ Ready | Phase 3A complete |
| Save Pipeline | ✅ Ready | Can be called programmatically |
| Patch Parser | ❌ Missing | Must be built |
| MCP Migration | ❌ Pending | Must be done |
| Approval Enhancements | ⚠️ Partial | Basic version ready, enhancements optional |

**Final Verdict:** Phase 3B is **CONDITIONALLY IMPLEMENTABLE** with the following prerequisites:
1. Design patch application architecture
2. Implement patch parser/application logic
3. Migrate MCP tools to IDE delegation
4. Add save trigger after `acceptFile()`
5. Enhance approval dialogs (optional but recommended)

**Estimated Complexity:** Medium-High (due to patch application logic and MCP migration)

---

## APPENDIX: Key Files Referenced

### IDE Services
- `src/vs/workbench/services/textfile/common/textfiles.ts` - ITextFileService interface
- `src/vs/workbench/services/textfile/common/textFileEditorModel.ts` - TextFileEditorModel.save()
- `src/vs/platform/files/common/files.ts` - IFileService interface
- `src/vs/workbench/contrib/vybeChat/browser/vybeEditServiceImpl.ts` - acceptFile() implementation
- `src/vs/workbench/contrib/mcp/browser/vybeMcpToolApprovalServiceImpl.ts` - Approval service

### MCP Tools (To Be Migrated)
- `VYBE-MCP/src/tools/local/files.ts` - write_file tool (FORBIDDEN pattern)
- `VYBE-MCP/src/tools/local/apply_patch.ts` - apply_patch tool (FORBIDDEN pattern)

### Reference Implementation
- `void/src/vs/workbench/contrib/chat/common/tools/editFileTool.ts:204` - Example of programmatic save

---

**END OF AUDIT REPORT**

