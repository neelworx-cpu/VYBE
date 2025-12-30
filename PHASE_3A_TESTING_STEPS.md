# Phase 3A Testing Steps - Exact Flow

## Step 1: Stop Everything (Clean Start)

**In your terminal, stop any running processes:**
```bash
# Press Ctrl+C in any terminal running:
# - npm run watch (VYBE IDE)
# - npm run build/watch (VYBE-MCP)
# - Any other related processes
```

---

## Step 2: Build VYBE-MCP

**Open a terminal and run:**
```bash
cd /Users/neel/VYBE-MCP
npm run build
```

**Expected output:**
- Should complete without errors
- Creates `build/index.js`

**If errors occur:** Fix them before proceeding.

---

## Step 3: Set Environment Variable

**In the same terminal (or a new one), run:**
```bash
export VYBE_MCP_COMMAND="node /Users/neel/VYBE-MCP/build/index.js"
```

**Verify it's set:**
```bash
echo $VYBE_MCP_COMMAND
# Should output: node /Users/neel/VYBE-MCP/build/index.js
```

**Important:** Keep this terminal open - you'll need the environment variable when starting the IDE.

---

## Step 4: Start VYBE IDE

**In the same terminal (where you set the env var), run:**
```bash
cd /Users/neel/VYBE
npm run watch
```

**Expected output:**
- Compilation starts
- Should complete with "Finished compilation" (no errors)
- IDE window should open automatically

**If IDE doesn't open:** Wait for compilation to finish, then run:
```bash
./scripts/code.sh
```

---

## Step 5: Open Browser Console (Where to Check Logs)

**In the IDE window:**
1. Press `Cmd+Option+I` (Mac) or `F12` (Windows/Linux)
   - OR: `View → Toggle Developer Tools`
2. Click the **Console** tab
3. **This is where you'll see all the logs**

**What to look for:**
- `[VYBE MCP] Checking for VYBE_MCP_COMMAND: FOUND: ...`
- `[VYBE MCP] MCP process spawned successfully by main process`

**If you see "NOT FOUND":**
- The environment variable wasn't set before starting IDE
- Stop IDE, set the variable, restart IDE

---

## Step 6: Verify MCP Process is Running

**In the browser console, you should see:**
```
[VYBE MCP] Checking for VYBE_MCP_COMMAND: FOUND: node /Users/neel/VYBE-MCP/build/index.js
[VYBE MCP] Initializing stdio tool host with command: node /Users/neel/VYBE-MCP/build/index.js
[VYBE MCP] MCP process spawned successfully by main process
```

**Also check the terminal where you ran `npm run watch`:**
- You should see MCP process logs (if MCP logs to stdout)
- Look for connection messages

**If MCP process didn't spawn:**
- Check browser console for errors
- Verify `VYBE_MCP_COMMAND` is set correctly
- Check that `build/index.js` exists

---

## Step 7: Verify Tools Are Registered

**Add this test code to `VYBE-MCP/src/index.ts`** (after the Phase 2 tests):

```typescript
// ============================================
// PHASE 3A VALIDATION: Verify tools are registered
// ============================================
logger.info("=== PHASE 3A VALIDATION: Checking tool registration ===");

try {
  if (!mcpClient.client) {
    throw new Error("MCP client not initialized");
  }

  // List all available tools
  const toolsResult = await mcpClient.client.listTools();
  logger.info(`[PHASE 3A] Total tools available: ${toolsResult.tools.length}`);

  // Check for Phase 3A tools
  const phase3aTools = [
    'vybe.create_edit_transaction',
    'vybe.accept_diff',
    'vybe.reject_diff',
    'vybe.accept_file',
    'vybe.reject_file'
  ];

  logger.info("[PHASE 3A] Checking for Phase 3A tools:");
  for (const toolName of phase3aTools) {
    const found = toolsResult.tools.some(t => t.name === toolName);
    const status = found ? '✅ FOUND' : '❌ MISSING';
    logger.info(`[PHASE 3A] ${toolName}: ${status}`);

    if (found) {
      const tool = toolsResult.tools.find(t => t.name === toolName);
      logger.info(`[PHASE 3A]   Description: ${tool?.description || 'N/A'}`);
    }
  }

  // List all tool names for reference
  logger.info("[PHASE 3A] All available tools:");
  toolsResult.tools.forEach(tool => {
    logger.info(`[PHASE 3A]   - ${tool.name}`);
  });

} catch (error) {
  logger.error("[PHASE 3A] Tool registration check failed:", error);
}
```

**Then rebuild MCP:**
```bash
cd /Users/neel/VYBE-MCP
npm run build
```

**Restart IDE** (stop `npm run watch`, then restart):
```bash
cd /Users/neel/VYBE
npm run watch
```

**Check browser console for:**
- `[PHASE 3A] Total tools available: X` (should be 13+ tools: 3 Phase 1 + 5 Phase 2 + 5 Phase 3A)
- `✅ FOUND` for all 5 Phase 3A tools

---

## Step 8: Test Create Edit Transaction (No Approval)

**Add this to `VYBE-MCP/src/index.ts`** (after tool registration check):

```typescript
// ============================================
// PHASE 3A TEST 1: Create edit transaction (no approval)
// ============================================
logger.info("=== PHASE 3A TEST 1: Create edit transaction ===");

try {
  // Discover workspace (reuse Phase 2 logic)
  let workspaceRoot: string | null = null;
  const commonPaths = [
    process.cwd().replace('/VYBE-MCP', '/VYBE'),
    '/Users/neel/VYBE',
    '/Users/neel/void'
  ];

  for (const testPath of commonPaths) {
    try {
      const testResult = await mcpClient.client.callTool({
        name: 'vybe.list_files',
        arguments: { uri: `file://${testPath}` }
      });
      const parsed = JSON.parse((testResult.content as any)[0]?.text || '{}');
      if (!testResult.isError && parsed?.files) {
        workspaceRoot = testPath;
        logger.info(`[TEST 1] Found workspace: ${workspaceRoot}`);
        break;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  if (!workspaceRoot) {
    logger.warn("[TEST 1] Could not discover workspace, skipping test");
  } else {
    const testFile = `${workspaceRoot}/package.json`;

    // Read file first
    logger.info(`[TEST 1] Reading file: ${testFile}`);
    const readResult = await mcpClient.client.callTool({
      name: 'vybe.read_file',
      arguments: { uri: `file://${testFile}` }
    });

    const fileContent = JSON.parse((readResult.content as any)[0]?.text || '{}');
    if (fileContent.content) {
      // Create edit transaction
      logger.info(`[TEST 1] Creating edit transaction...`);
      const createResult = await mcpClient.client.callTool({
        name: 'vybe.create_edit_transaction',
        arguments: {
          uri: `file://${testFile}`,
          originalContent: fileContent.content,
          streaming: false
        }
      });

      const result = JSON.parse((createResult.content as any)[0]?.text || '{}');
      logger.info(`[TEST 1] ✅ Transaction created:`, result);
      logger.info(`[TEST 1]   Transaction ID: ${result.transactionId}`);
      logger.info(`[TEST 1]   Diff Area ID: ${result.diffAreaId}`);
    } else {
      logger.warn("[TEST 1] Could not read file content, skipping");
    }
  }
} catch (error) {
  logger.error("[TEST 1] Failed:", error);
}
```

**Rebuild MCP and restart IDE:**
```bash
cd /Users/neel/VYBE-MCP
npm run build

# In another terminal (keep the watch running):
cd /Users/neel/VYBE
# Stop watch (Ctrl+C), then:
npm run watch
```

**Check browser console:**
- Should see: `[TEST 1] ✅ Transaction created:`
- Should see transaction ID and diff area ID
- **No approval dialog should appear** (this tool doesn't require approval)

---

## Step 9: Test Approval Dialog (Accept File)

**Prerequisites:**
- You need a file with existing diffs
- If you don't have diffs, create them by:
  1. Open a file in IDE (e.g., `package.json`)
  2. Make an edit (add/remove a line)
  3. The IDE should show a diff decoration

**Add this test to `VYBE-MCP/src/index.ts`:**

```typescript
// ============================================
// PHASE 3A TEST 2: Accept file (with approval)
// ============================================
logger.info("=== PHASE 3A TEST 2: Accept file (approval required) ===");

try {
  if (!workspaceRoot) {
    logger.warn("[TEST 2] No workspace found, skipping");
  } else {
    const testFile = `${workspaceRoot}/package.json`;

    // Get diff areas first
    logger.info(`[TEST 2] Getting diff areas for: ${testFile}`);
    const diffAreasResult = await mcpClient.client.callTool({
      name: 'vybe.get_diff_areas',
      arguments: { uri: `file://${testFile}` }
    });

    const diffAreas = JSON.parse((diffAreasResult.content as any)[0]?.text || '{}');
    logger.info(`[TEST 2] Found ${diffAreas.diffAreas?.length || 0} diff areas`);

    if (diffAreas.diffAreas && diffAreas.diffAreas.length > 0) {
      // Call accept_file - this will trigger approval dialog
      logger.info(`[TEST 2] Calling vybe.accept_file...`);
      logger.info(`[TEST 2] ⚠️  APPROVAL DIALOG WILL APPEAR IN IDE - Click "Approve" or "Deny"`);

      const acceptResult = await mcpClient.client.callTool({
        name: 'vybe.accept_file',
        arguments: { uri: `file://${testFile}` }
      });

      const result = JSON.parse((acceptResult.content as any)[0]?.text || '{}');

      if (result.code === 'APPROVAL_DENIED') {
        logger.info(`[TEST 2] ✅ Approval was denied (expected if you clicked Deny)`);
        logger.info(`[TEST 2]   Error: ${result.message}`);
      } else if (result.success) {
        logger.info(`[TEST 2] ✅ File accepted successfully`);
        logger.info(`[TEST 2]   Diffs accepted: ${result.diffCount}`);
      } else {
        logger.warn(`[TEST 2] Unexpected result:`, result);
      }
    } else {
      logger.info(`[TEST 2] No diffs found - create a diff first by editing the file`);
    }
  }
} catch (error) {
  logger.error("[TEST 2] Failed:", error);
}
```

**Rebuild MCP and restart IDE:**
```bash
cd /Users/neel/VYBE-MCP
npm run build
# Restart IDE (stop watch, restart)
```

**What to watch for:**
1. **In browser console:**
   - `[TEST 2] ⚠️  APPROVAL DIALOG WILL APPEAR IN IDE`
   - Then wait for your response

2. **In IDE window:**
   - **Approval dialog should appear** with:
     - Title: "MCP Tool Approval Required"
     - Message: "Accept all diffs in file?"
     - Details showing tool name, file, diff count
     - "Approve" and "Deny" buttons

3. **Click "Approve"** (or "Deny" to test denial)

4. **Back in browser console:**
   - If approved: `[TEST 2] ✅ File accepted successfully`
   - If denied: `[TEST 2] ✅ Approval was denied`

5. **In IDE editor:**
   - If approved: Editor state should change (diffs accepted)
   - Test undo: `Cmd+Z` should revert the changes

---

## Step 10: Test Approval Denial

**To test denial:**
1. Create a new diff (edit a file)
2. Run the test again
3. **Click "Deny"** in the approval dialog
4. **Verify:**
   - Console shows: `APPROVAL_DENIED` error
   - Editor state does NOT change
   - No mutations applied

---

## Step 11: Test Other Tools

**Repeat Step 9 for:**
- `vybe.accept_diff` (single diff)
- `vybe.reject_diff` (single diff)
- `vybe.reject_file` (all diffs in file)

**Each should:**
- Show approval dialog
- Block mutation if denied
- Apply mutation if approved
- Be undoable

---

## Quick Reference: Where to Check What

### Browser Console (`Cmd+Option+I` → Console tab)
- ✅ MCP process spawn confirmation
- ✅ Tool registration logs
- ✅ Tool execution results
- ✅ Approval service logs (if trace enabled)
- ❌ Errors (red text)

### IDE Window
- ✅ Approval dialogs (modal popups)
- ✅ Editor state changes (after approval)
- ✅ Undo/redo functionality

### Terminal (where you ran `npm run watch`)
- ✅ Compilation status
- ✅ MCP process stdout/stderr (if any)

### VYBE-MCP Terminal (if running separately)
- ✅ MCP client connection logs
- ✅ Tool call results
- ✅ Test validation logs

---

## Troubleshooting Checklist

### MCP Process Not Spawning
- [ ] `VYBE_MCP_COMMAND` is set before starting IDE
- [ ] `build/index.js` exists in VYBE-MCP
- [ ] Browser console shows no errors
- [ ] Check terminal for compilation errors

### Tools Not Found
- [ ] MCP process spawned successfully
- [ ] Check browser console for tool registration
- [ ] Verify `vybeMcpToolBridge.ts` has all 5 tools
- [ ] Verify `vybeMcpToolContribution.ts` has all 5 cases

### Approval Dialog Not Appearing
- [ ] Check browser console for errors
- [ ] Verify `IVybeMcpToolApprovalService` is registered
- [ ] Check that tool is actually mutating (not read-only)
- [ ] Verify `IDialogService` is available

### Mutations Not Applying
- [ ] Approval was actually granted (check console logs)
- [ ] Check editor state (should see changes)
- [ ] Verify `IVybeEditService` methods are called
- [ ] Test undo (Cmd+Z) to verify changes were applied

---

## Success Criteria

Phase 3A is working correctly if:
- ✅ All 5 tools appear in `tools/list`
- ✅ `vybe.create_edit_transaction` works without approval
- ✅ All 4 mutating tools show approval dialogs
- ✅ Approval denial returns `APPROVAL_DENIED` error
- ✅ Approval acceptance applies mutations
- ✅ Mutations are undoable (Cmd+Z)
- ✅ No disk writes occur (check file timestamps)
- ✅ Workspace boundary validation works

---

## Next Steps After Validation

Once Phase 3A is validated:
1. Commit the changes
2. Document any issues found
3. Prepare for Phase 3B (filesystem write wrappers)


