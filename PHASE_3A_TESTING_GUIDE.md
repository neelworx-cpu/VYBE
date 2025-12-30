# Phase 3A Testing Guide: Edit Mutations + Approval Gates

## Prerequisites

1. **Build VYBE IDE**:
   ```bash
   cd /Users/neel/VYBE
   npm run watch
   ```

2. **Build VYBE-MCP**:
   ```bash
   cd /Users/neel/VYBE-MCP
   npm run build
   ```

3. **Set environment variable**:
   ```bash
   export VYBE_MCP_COMMAND="node /Users/neel/VYBE-MCP/build/index.js"
   ```

4. **Start IDE**:
   ```bash
   cd /Users/neel/VYBE
   ./scripts/code.sh
   ```

## Where to See Logs

### 1. Browser Console (Renderer Process)
- **Open**: `View → Toggle Developer Tools` (or `Cmd+Option+I` on Mac)
- **Location**: Console tab
- **What you'll see**:
  - `[VYBE MCP] Checking for VYBE_MCP_COMMAND: FOUND: ...`
  - `[VYBE MCP] MCP process spawned successfully by main process`
  - Approval dialog logs (if you enable trace logging)

### 2. IDE Output Panel
- **Open**: `View → Output` (or `Cmd+Shift+U`)
- **Select**: "VYBE MCP Stdio" from dropdown (if available)
- **What you'll see**: MCP process logs, tool execution logs

### 3. MCP Process Logs (Terminal)
- The MCP process logs to `stdout`/`stderr`
- You'll see logs in the terminal where you ran `./scripts/code.sh`
- Look for: `[MCPClient] Connected...`, tool call results

### 4. Enable Trace Logging (Optional)
To see approval service logs, you can temporarily change log level:
- In `vybeMcpToolApprovalServiceImpl.ts`, change `_logService.trace` to `_logService.info`
- Or check IDE logs with trace level enabled

## Test Plan

### Test 1: Verify Tools Are Registered

**Goal**: Confirm all 5 Phase 3A tools appear in `tools/list`.

**Steps**:
1. Open IDE with MCP enabled
2. Check browser console for: `[VYBE MCP] MCP process spawned successfully`
3. In VYBE-MCP, add a test to `src/index.ts`:

```typescript
// After MCP client connects
const toolsResult = await mcpClient.client.listTools();
console.log('[TEST] Available tools:', toolsResult.tools.map(t => t.name));

// Verify Phase 3A tools exist
const phase3aTools = [
  'vybe.create_edit_transaction',
  'vybe.accept_diff',
  'vybe.reject_diff',
  'vybe.accept_file',
  'vybe.reject_file'
];

for (const toolName of phase3aTools) {
  const found = toolsResult.tools.some(t => t.name === toolName);
  console.log(`[TEST] ${toolName}: ${found ? '✅ FOUND' : '❌ MISSING'}`);
}
```

**Expected Result**:
- All 5 tools appear in `tools/list`
- Console shows: `✅ FOUND` for each tool

---

### Test 2: Create Edit Transaction (No Approval)

**Goal**: Verify `vybe.create_edit_transaction` works without approval.

**Steps**:
1. Open a file in the IDE (e.g., `package.json`)
2. Read its content first:
   ```typescript
   const readResult = await mcpClient.client.callTool({
     name: 'vybe.read_file',
     arguments: { uri: 'file:///Users/neel/VYBE/package.json' }
   });
   const content = JSON.parse(readResult.content[0].text).content;
   ```

3. Create edit transaction:
   ```typescript
   const createResult = await mcpClient.client.callTool({
     name: 'vybe.create_edit_transaction',
     arguments: {
       uri: 'file:///Users/neel/VYBE/package.json',
       originalContent: content,
       streaming: false
     }
   });

   console.log('[TEST] Transaction created:', createResult);
   ```

**Expected Result**:
- No approval dialog appears
- Returns: `{ transactionId: "...", diffAreaId: "..." }`
- No errors in console

---

### Test 3: Accept Diff (With Approval)

**Goal**: Verify approval dialog appears and blocks mutation if denied.

**Prerequisites**:
- You need an existing diff in a file
- Create a diff first by:
  1. Opening a file
  2. Making an edit (add/remove lines)
  3. The IDE should create a diff automatically

**Steps**:
1. Get diff areas for a file:
   ```typescript
   const diffAreasResult = await mcpClient.client.callTool({
     name: 'vybe.get_diff_areas',
     arguments: { uri: 'file:///Users/neel/VYBE/package.json' }
   });

   const diffAreas = JSON.parse(diffAreasResult.content[0].text).diffAreas;
   if (diffAreas.length === 0) {
     console.log('[TEST] No diffs found - create a diff first');
     return;
   }

   // Get first diff ID (you'll need to query diffs differently)
   // For now, assume you have a diffId
   ```

2. **Test 3A: Deny Approval**
   - Call `vybe.accept_diff`:
     ```typescript
     const acceptResult = await mcpClient.client.callTool({
       name: 'vybe.accept_diff',
       arguments: { diffId: 'your-diff-id-here' }
     });
     ```
   - **When approval dialog appears**: Click "Deny"
   - **Expected**:
     - Returns error: `{ code: 'APPROVAL_DENIED', ... }`
     - No editor state change
     - Console shows: `[VybeMcpToolApprovalService] User denied: vybe.accept_diff`

3. **Test 3B: Approve**
   - Call `vybe.accept_diff` again
   - **When approval dialog appears**: Click "Approve"
   - **Expected**:
     - Returns: `{ success: true, diffId: "..." }`
     - Editor state changes (diff is accepted)
     - Console shows: `[VybeMcpToolApprovalService] User approved: vybe.accept_diff`
     - Changes are undoable (Cmd+Z)

---

### Test 4: Reject Diff (With Approval)

**Goal**: Verify `vybe.reject_diff` requires approval.

**Steps**:
1. Create a new diff (make an edit to a file)
2. Call `vybe.reject_diff`:
   ```typescript
   const rejectResult = await mcpClient.client.callTool({
     name: 'vybe.reject_diff',
     arguments: { diffId: 'your-diff-id-here' }
   });
   ```

3. **When approval dialog appears**: Click "Approve"
4. **Expected**:
   - Returns: `{ success: true, diffId: "..." }`
   - Editor state reverts (diff is rejected)
   - Changes are undoable

---

### Test 5: Accept File (With Approval)

**Goal**: Verify `vybe.accept_file` requires approval and shows diff count.

**Steps**:
1. Ensure a file has multiple diffs
2. Call `vybe.accept_file`:
   ```typescript
   const acceptFileResult = await mcpClient.client.callTool({
     name: 'vybe.accept_file',
     arguments: { uri: 'file:///Users/neel/VYBE/package.json' }
   });
   ```

3. **Check approval dialog**:
   - Should show: "Accept all diffs in file?"
   - Should show: "Diffs: X diff(s) will be affected"
   - Should show file URI

4. **When approval dialog appears**: Click "Approve"
5. **Expected**:
   - Returns: `{ success: true, uri: "...", diffCount: X }`
   - All diffs in file are accepted
   - Editor state changes
   - Changes are undoable

---

### Test 6: Reject File (With Approval)

**Goal**: Verify `vybe.reject_file` requires approval.

**Steps**:
1. Ensure a file has diffs
2. Call `vybe.reject_file`:
   ```typescript
   const rejectFileResult = await mcpClient.client.callTool({
     name: 'vybe.reject_file',
     arguments: { uri: 'file:///Users/neel/VYBE/package.json' }
   });
   ```

3. **When approval dialog appears**: Click "Approve"
4. **Expected**:
   - Returns: `{ success: true, uri: "...", diffCount: X }`
   - All diffs in file are rejected
   - Editor state reverts to original
   - Changes are undoable

---

## Quick Test Script for VYBE-MCP

Add this to `VYBE-MCP/src/index.ts` after Phase 2 tests:

```typescript
// ============================================
// PHASE 3A VALIDATION: Test mutation tools
// ============================================
logger.info("=== PHASE 3A VALIDATION: Testing mutation tools ===");

try {
  if (!mcpClient.client) {
    throw new Error("MCP client not initialized");
  }

  // Discover workspace (reuse Phase 2 logic)
  let workspaceRoot: string | null = null;
  // ... (reuse workspace discovery from Phase 2)

  const testFile = `${workspaceRoot}/package.json`;

  // TEST 1: Create edit transaction (no approval)
  logger.info("[TEST 1] Creating edit transaction...");
  const readResult = await mcpClient.client.callTool({
    name: 'vybe.read_file',
    arguments: { uri: `file://${testFile}` }
  });
  const content = JSON.parse((readResult.content as any)[0].text).content;

  const createResult = await mcpClient.client.callTool({
    name: 'vybe.create_edit_transaction',
    arguments: {
      uri: `file://${testFile}`,
      originalContent: content,
      streaming: false
    }
  });
  logger.info("[TEST 1] Transaction created:", createResult);

  // TEST 2: Get diff areas (to find a diff ID)
  logger.info("[TEST 2] Getting diff areas...");
  const diffAreasResult = await mcpClient.client.callTool({
    name: 'vybe.get_diff_areas',
    arguments: { uri: `file://${testFile}` }
  });
  const diffAreas = JSON.parse((diffAreasResult.content as any)[0].text).diffAreas;
  logger.info(`[TEST 2] Found ${diffAreas.length} diff areas`);

  if (diffAreas.length > 0 && diffAreas[0].ranges.length > 0) {
    // Note: You'll need to get actual diff IDs from the edit service
    // This is a placeholder - actual implementation would query diffs
    logger.info("[TEST 3] Skipping accept_diff test - need actual diff ID");
    logger.info("[TEST 4] Skipping reject_diff test - need actual diff ID");
  } else {
    logger.info("[TEST 3-4] No diffs found - create a diff first by editing the file");
  }

  // TEST 5: Accept file (will show approval dialog)
  logger.info("[TEST 5] Testing accept_file (approval required)...");
  logger.info("[TEST 5] NOTE: Approval dialog will appear in IDE - click Approve or Deny");

  const acceptFileResult = await mcpClient.client.callTool({
    name: 'vybe.accept_file',
    arguments: { uri: `file://${testFile}` }
  });
  logger.info("[TEST 5] Accept file result:", acceptFileResult);

} catch (error) {
  logger.error("[PHASE 3A] Validation failed:", error);
}
```

## Manual Testing Checklist

- [ ] All 5 tools appear in `tools/list`
- [ ] `vybe.create_edit_transaction` works without approval
- [ ] `vybe.accept_diff` shows approval dialog
- [ ] Approval denial returns `APPROVAL_DENIED` error
- [ ] Approval acceptance applies mutation
- [ ] `vybe.reject_diff` shows approval dialog
- [ ] `vybe.accept_file` shows approval dialog with diff count
- [ ] `vybe.reject_file` shows approval dialog
- [ ] Mutations are undoable (Cmd+Z)
- [ ] No disk writes occur (check file timestamps)
- [ ] Workspace boundary validation works (test with outside-workspace URI)

## Troubleshooting

### Approval Dialog Not Appearing
- Check browser console for errors
- Verify `IVybeMcpToolApprovalService` is registered
- Check that `IDialogService` is available
- Look for errors in approval service implementation

### Tools Not Found
- Verify MCP process is spawned (check console logs)
- Check `vybeMcpToolBridge.ts` has all 5 tools registered
- Verify `vybeMcpToolContribution.ts` has all 5 cases in switch statement

### Mutations Not Applying
- Check approval was actually granted (look for approval logs)
- Verify `IVybeEditService` methods are being called
- Check editor state (should see changes in editor)
- Verify undo/redo works (Cmd+Z / Cmd+Shift+Z)

### Errors in Console
- Check error messages for specific tool names
- Verify workspace validation is working
- Check that URIs are correctly formatted
- Look for TypeScript compilation errors

## Next Steps

After Phase 3A is validated:
1. Test with real MCP agent workflows
2. Verify approval dialogs are user-friendly
3. Test edge cases (no diffs, invalid URIs, etc.)
4. Prepare for Phase 3B (filesystem write wrappers)


