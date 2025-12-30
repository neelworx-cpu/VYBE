# Phase 3A Diff Creation Pipeline Audit

## Executive Summary

The diff creation pipeline has a **disconnect** between transaction creation and diff computation:
- `createEditTransaction()` generates a `diffAreaId` but doesn't create diffs
- `IVybeDiffService.computeDiffs()` creates diffs but generates its OWN `diffAreaId`
- These two `diffAreaId`s are never linked, but `acceptDiff`/`acceptFile` work anyway because they query by URI

**Key Finding:** `acceptDiff`/`acceptFile` don't require transactionId - they work purely on diffAreas stored in `IVybeDiffService`.

---

## A) Canonical Flow (Current State)

### 1. Where Diffs Are Created

**File:** `src/vs/workbench/contrib/vybeChat/browser/vybeDiffServiceImpl.ts`

**Method:** `computeDiffs(uri, originalContent, modifiedContent, options?)`
- Creates temporary text models
- Calls `IEditorWorkerService.computeDiff()` (VS Code's diff engine)
- Converts `IDocumentDiff` → `Diff[]` and `DiffArea[]` via `_convertDocumentDiffToDiffs()`
- **Stores diffs in:** `_diffAreas` Map (keyed by `diffAreaId`)
- **Updates:** `_uriToDiffAreaIds` Map (URI → Set<diffAreaId>)
- **Generates NEW diffAreaId** inside `_convertDocumentDiffToDiffs()` (line 377)

### 2. Where Diffs Are Stored

**Storage Location:** `VybeDiffServiceImpl._diffAreas: Map<string, DiffArea>`
- Key: `diffAreaId` (UUID)
- Value: `DiffArea` containing `Map<string, Diff>` (keyed by `diffId`)

**URI Index:** `VybeDiffServiceImpl._uriToDiffAreaIds: Map<string, Set<string>>`
- Key: URI string
- Value: Set of `diffAreaId`s for that URI

### 3. What Triggers Diff Creation Today

**Current Call Sites:**
- **NONE FOUND** in production code (UI widgets are stashed)
- `vybe.compute_diff` tool (read-only) calls `computeDiffs()` but doesn't store results
- Expected flow (when UI exists): UI widgets call `computeDiffs()` after `createEditTransaction()`

### 4. Transaction Creation Flow

**File:** `src/vs/workbench/contrib/vybeChat/browser/vybeEditServiceImpl.ts`

**Method:** `createEditTransaction(uri, originalContent, options?)`
- Generates `transactionId` (UUID)
- Generates `diffAreaId` (UUID) - **NOTE: This is NOT used by diffs yet**
- Stores transaction in `_transactions` Map
- Emits `onDidCreateTransaction` event
- **CRITICAL:** Does NOT compute diffs (by design - see comment line 117-120)

### 5. What `acceptDiff` / `acceptFile` Consume

**File:** `src/vs/workbench/contrib/vybeChat/browser/vybeEditServiceImpl.ts`

**`acceptDiff(diffId: string)`:**
- Calls `_findDiff(diffId)` which:
  - Gets all diffAreas via `_getAllDiffAreas()`
  - Searches all diffAreas for a diff with matching `diffId`
- **Does NOT require:** transactionId
- **Requires:** Diff must exist in `IVybeDiffService._diffAreas` Map

**`acceptFile(uri: URI)`:**
- Calls `_diffService.getDiffAreasForUri(uri)`
- Filters diffs by state (Pending/Streaming)
- **Does NOT require:** transactionId
- **Requires:** DiffAreas must exist in `IVybeDiffService` for that URI

**`acceptAll()` / `rejectAll()`:**
- Calls `_getAllDiffAreas()` which:
  - Gets URIs from transactions
  - Queries `_diffService.getDiffAreasForUri()` for each URI
- **Does NOT require:** transactionId
- **Requires:** DiffAreas must exist in `IVybeDiffService`

---

## B) Required Invariants for Accept/Reject Operations

### For `acceptDiff(diffId)`:
1. ✅ Diff with `diffId` must exist in `IVybeDiffService._diffAreas`
2. ✅ Diff must be in `DiffState.Pending` or `DiffState.Streaming`
3. ✅ Text model must exist for `diff.uri` (via `IModelService`)
4. ❌ TransactionId is NOT required

### For `acceptFile(uri)`:
1. ✅ At least one `DiffArea` must exist for `uri` in `IVybeDiffService`
2. ✅ At least one diff in those areas must be `Pending` or `Streaming`
3. ✅ Text model must exist for `uri`
4. ❌ TransactionId is NOT required

### For `rejectDiff(diffId)` / `rejectFile(uri)`:
- Same requirements as accept operations

---

## C) The Gap

**Problem:** `createEditTransaction()` and `computeDiffs()` generate separate `diffAreaId`s that are never linked.

**Current Behavior:**
1. `createEditTransaction()` → generates `diffAreaId: "abc-123"`
2. `computeDiffs()` → generates NEW `diffAreaId: "xyz-789"` (unrelated)
3. Transaction's `diffAreaId` is never used
4. `acceptFile()` works because it queries by URI, not by transactionId

**Why It Works (But Is Not Ideal):**
- `acceptFile(uri)` queries `_diffService.getDiffAreasForUri(uri)` which finds diffs by URI
- Transaction's `diffAreaId` is essentially unused
- This works but breaks the intended association between transactions and diffAreas

---

## D) Solution: Headless Diff Seeding

**Option 1 (Preferred):** Add internal method to `IVybeEditService` that:
1. Takes: `{ transactionId, modifiedContent }`
2. Gets transaction's `diffAreaId` and `originalContent`
3. Calls `IVybeDiffService.computeDiffs()` with **transaction's diffAreaId** (not generate new one)
4. This requires modifying `_convertDocumentDiffToDiffs()` to accept optional `diffAreaId` parameter

**Implementation Plan:**
- Add `_seedDiffsForTransaction(transactionId, modifiedContent)` to `VybeEditServiceImpl`
- Modify `VybeDiffServiceImpl._convertDocumentDiffToDiffs()` to accept optional `diffAreaId` parameter
- Guard the new method behind dev-only flag or make it test-only
- Update MCP validation test to call this method after `createEditTransaction()`

---

## Files to Modify

1. `src/vs/workbench/contrib/vybeChat/browser/vybeDiffServiceImpl.ts`
   - Modify `_convertDocumentDiffToDiffs()` to accept optional `diffAreaId` parameter
   - Modify `computeDiffs()` to accept optional `diffAreaId` parameter

2. `src/vs/workbench/contrib/vybeChat/browser/vybeEditServiceImpl.ts`
   - Add `_seedDiffsForTransaction(transactionId, modifiedContent)` method (internal/test-only)

3. `src/vs/workbench/contrib/vybeChat/common/vybeEditService.ts`
   - Add optional `seedDiffsForTransaction()` method to interface (if making it public, or keep internal)

4. `VYBE-MCP/src/index.ts`
   - Update Phase 3A test to call diff seeding after `createEditTransaction()`


