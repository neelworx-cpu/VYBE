# Phase 2 Testing Guide

## Prerequisites

1. **IDE is running** with `npm run watch` (or already built)
2. **MCP is built** in `VYBE-MCP` repository
3. **Environment variable set:** `VYBE_MCP_COMMAND` pointing to MCP executable

---

## Step 1: Start IDE with MCP Connected

### Terminal 1: Set Environment & Start IDE

```bash
cd /Users/neel/VYBE

# Set MCP command (if not already in your shell profile)
export VYBE_MCP_COMMAND="node /Users/neel/VYBE-MCP/build/index.js"

# Start IDE
npm run watch
# OR if already built:
./scripts/code.sh
```

### Verify MCP Connection

1. **Open Browser Console** (in IDE: Help → Toggle Developer Tools)
2. **Look for these log messages:**
   ```
   [VYBE MCP] Checking for VYBE_MCP_COMMAND: FOUND: node /Users/neel/VYBE-MCP/build/index.js
   [VYBE MCP] Initializing stdio tool host with command: ...
   [VYBE MCP] MCP process spawned successfully by main process
   ```

3. **Check MCP Process:**
   ```bash
   ps aux | grep "VYBE-MCP" | grep -v grep
   ```
   Should show the MCP process running.

---

## Step 2: Verify Tools Registration

### Option A: Check Browser Console (MCP Validation Logs)

If MCP has validation tests, you should see logs like:
```
[MCPClient] Connected to IDE tool host
[MCPClient] tools/list returned: [vybe.send_llm_message, vybe.list_models, ...]
```

### Option B: Add Temporary Test Command

**Add this to `VYBE-MCP/src/index.ts` after MCP client connects:**

```typescript
// After MCP client connects
async function testTools() {
    try {
        // Test tools/list
        const tools = await mcpClient.client.listTools();
        console.log('[TEST] Available tools:', tools.tools.map(t => t.name));
        console.log('[TEST] Expected 8 tools, got:', tools.tools.length);

        // Verify Phase 1 tools
        const phase1Tools = ['vybe.send_llm_message', 'vybe.list_models', 'vybe.abort_llm_request'];
        const phase2Tools = ['vybe.read_file', 'vybe.list_files', 'vybe.get_file_info', 'vybe.compute_diff', 'vybe.get_diff_areas'];

        const foundPhase1 = phase1Tools.filter(t => tools.tools.some(tt => tt.name === t));
        const foundPhase2 = phase2Tools.filter(t => tools.tools.some(tt => tt.name === t));

        console.log('[TEST] Phase 1 tools found:', foundPhase1.length, '/', phase1Tools.length);
        console.log('[TEST] Phase 2 tools found:', foundPhase2.length, '/', phase2Tools.length);

        if (foundPhase1.length === 3 && foundPhase2.length === 5) {
            console.log('[TEST] ✅ All 8 tools registered correctly!');
        } else {
            console.error('[TEST] ❌ Tool registration mismatch!');
        }
    } catch (error) {
        console.error('[TEST] Error testing tools:', error);
    }
}

testTools();
```

**Expected Output:**
```
[TEST] Available tools: ['vybe.send_llm_message', 'vybe.list_models', 'vybe.abort_llm_request', 'vybe.read_file', 'vybe.list_files', 'vybe.get_file_info', 'vybe.compute_diff', 'vybe.get_diff_areas']
[TEST] Expected 8 tools, got: 8
[TEST] Phase 1 tools found: 3 / 3
[TEST] Phase 2 tools found: 5 / 5
[TEST] ✅ All 8 tools registered correctly!
```

---

## Step 3: Test Individual Tools

### Test 3.1: vybe.read_file

**Add to MCP test function:**

```typescript
// Test vybe.read_file
async function testReadFile() {
    try {
        // Get workspace root (adjust path as needed)
        const workspaceRoot = process.cwd(); // Or use actual workspace path
        const testFile = path.join(workspaceRoot, 'package.json');

        const result = await mcpClient.client.callTool({
            name: 'vybe.read_file',
            arguments: {
                uri: `file://${testFile}`
            }
        });

        console.log('[TEST] vybe.read_file result:', {
            success: !result.isError,
            hasContent: result.content && result.content[0]?.text?.includes('"name"'),
            contentLength: result.content?.[0]?.text?.length || 0
        });

        if (!result.isError && result.content?.[0]?.text) {
            console.log('[TEST] ✅ vybe.read_file works!');
        } else {
            console.error('[TEST] ❌ vybe.read_file failed:', result);
        }
    } catch (error) {
        console.error('[TEST] Error testing read_file:', error);
    }
}

testReadFile();
```

**Expected:** Returns file content as string, no errors.

---

### Test 3.2: vybe.list_files

```typescript
async function testListFiles() {
    try {
        const workspaceRoot = process.cwd();

        const result = await mcpClient.client.callTool({
            name: 'vybe.list_files',
            arguments: {
                uri: `file://${workspaceRoot}`
            }
        });

        console.log('[TEST] vybe.list_files result:', {
            success: !result.isError,
            fileCount: result.content?.[0]?.text ? JSON.parse(result.content[0].text).files?.length : 0,
            hasFiles: result.content?.[0]?.text ? JSON.parse(result.content[0].text).files?.length > 0 : false
        });

        if (!result.isError) {
            const parsed = JSON.parse(result.content[0].text);
            console.log('[TEST] Sample files:', parsed.files?.slice(0, 5));
            console.log('[TEST] ✅ vybe.list_files works!');
        } else {
            console.error('[TEST] ❌ vybe.list_files failed:', result);
        }
    } catch (error) {
        console.error('[TEST] Error testing list_files:', error);
    }
}

testListFiles();
```

**Expected:** Returns array of files/directories, one level only.

---

### Test 3.3: vybe.get_file_info

```typescript
async function testGetFileInfo() {
    try {
        const workspaceRoot = process.cwd();
        const testFile = path.join(workspaceRoot, 'package.json');

        // Test existing file
        const result1 = await mcpClient.client.callTool({
            name: 'vybe.get_file_info',
            arguments: {
                uri: `file://${testFile}`
            }
        });

        console.log('[TEST] vybe.get_file_info (existing):', {
            success: !result1.isError,
            exists: result1.content?.[0]?.text ? JSON.parse(result1.content[0].text).exists : false,
            hasSize: result1.content?.[0]?.text ? JSON.parse(result1.content[0].text).size !== undefined : false
        });

        // Test non-existent file
        const result2 = await mcpClient.client.callTool({
            name: 'vybe.get_file_info',
            arguments: {
                uri: 'file:///nonexistent/file.txt'
            }
        });

        console.log('[TEST] vybe.get_file_info (non-existent):', {
            success: !result2.isError,
            exists: result2.content?.[0]?.text ? JSON.parse(result2.content[0].text).exists : false
        });

        if (!result1.isError && !result2.isError) {
            console.log('[TEST] ✅ vybe.get_file_info works!');
        } else {
            console.error('[TEST] ❌ vybe.get_file_info failed');
        }
    } catch (error) {
        console.error('[TEST] Error testing get_file_info:', error);
    }
}

testGetFileInfo();
```

**Expected:**
- Existing file: `exists: true`, has `size`, `mtime`, `type`
- Non-existent: `exists: false`

---

### Test 3.4: vybe.compute_diff

```typescript
async function testComputeDiff() {
    try {
        const result = await mcpClient.client.callTool({
            name: 'vybe.compute_diff',
            arguments: {
                original: 'function hello() {\n  return "world";\n}',
                modified: 'function hello() {\n  return "hello world";\n}',
                languageId: 'typescript'
            }
        });

        console.log('[TEST] vybe.compute_diff result:', {
            success: !result.isError,
            hasHunks: result.content?.[0]?.text ? JSON.parse(result.content[0].text).hunks?.length > 0 : false,
            hunksCount: result.content?.[0]?.text ? JSON.parse(result.content[0].text).hunks?.length : 0
        });

        if (!result.isError && result.content?.[0]?.text) {
            const parsed = JSON.parse(result.content[0].text);
            if (parsed.hunks && parsed.hunks.length > 0) {
                console.log('[TEST] Sample hunk:', {
                    originalRange: parsed.hunks[0].originalRange,
                    modifiedRange: parsed.hunks[0].modifiedRange,
                    hasOriginalCode: !!parsed.hunks[0].originalCode,
                    hasModifiedCode: !!parsed.hunks[0].modifiedCode
                });
                console.log('[TEST] ✅ vybe.compute_diff works!');
            } else {
                console.error('[TEST] ❌ No hunks returned');
            }
        } else {
            console.error('[TEST] ❌ vybe.compute_diff failed:', result);
        }
    } catch (error) {
        console.error('[TEST] Error testing compute_diff:', error);
    }
}

testComputeDiff();
```

**Expected:** Returns array of `DiffHunk` objects with inclusive line ranges.

---

### Test 3.5: vybe.get_diff_areas

```typescript
async function testGetDiffAreas() {
    try {
        const workspaceRoot = process.cwd();
        // Use a file that might have diffs, or any file
        const testFile = path.join(workspaceRoot, 'package.json');

        const result = await mcpClient.client.callTool({
            name: 'vybe.get_diff_areas',
            arguments: {
                uri: `file://${testFile}`
            }
        });

        console.log('[TEST] vybe.get_diff_areas result:', {
            success: !result.isError,
            hasDiffAreas: result.content?.[0]?.text ? JSON.parse(result.content[0].text).diffAreas !== undefined : false,
            diffAreasCount: result.content?.[0]?.text ? JSON.parse(result.content[0].text).diffAreas?.length || 0
        });

        if (!result.isError) {
            const parsed = JSON.parse(result.content[0].text);
            console.log('[TEST] ✅ vybe.get_diff_areas works! (may be empty if no diffs)');
            if (parsed.diffAreas && parsed.diffAreas.length > 0) {
                console.log('[TEST] Sample diff area:', {
                    id: parsed.diffAreas[0].id,
                    status: parsed.diffAreas[0].status,
                    rangesCount: parsed.diffAreas[0].ranges?.length || 0
                });
            }
        } else {
            console.error('[TEST] ❌ vybe.get_diff_areas failed:', result);
        }
    } catch (error) {
        console.error('[TEST] Error testing get_diff_areas:', error);
    }
}

testGetDiffAreas();
```

**Expected:** Returns array of `DiffAreaInfo` objects (may be empty if no diffs).

---

### Test 3.6: Workspace Boundary Enforcement

```typescript
async function testWorkspaceBoundary() {
    try {
        // Try to read file outside workspace
        const result = await mcpClient.client.callTool({
            name: 'vybe.read_file',
            arguments: {
                uri: 'file:///etc/passwd' // Outside workspace
            }
        });

        console.log('[TEST] Workspace boundary test:', {
            isError: result.isError,
            hasErrorCode: result.content?.[0]?.text ? JSON.parse(result.content[0].text).code === 'RESOURCE_OUTSIDE_WORKSPACE' : false
        });

        if (result.isError || (result.content?.[0]?.text && JSON.parse(result.content[0].text).code === 'RESOURCE_OUTSIDE_WORKSPACE')) {
            console.log('[TEST] ✅ Workspace boundary enforced!');
        } else {
            console.error('[TEST] ❌ Workspace boundary NOT enforced!');
            console.error('[TEST] Result:', result);
        }
    } catch (error) {
        console.error('[TEST] Error testing workspace boundary:', error);
    }
}

testWorkspaceBoundary();
```

**Expected:** Returns structured error with `code: 'RESOURCE_OUTSIDE_WORKSPACE'`, no crash.

---

## Step 4: Quick Test Script

**Create `VYBE-MCP/test-phase2.ts`:**

```typescript
import { mcpClient } from './src/core/mcp_client.js';
import path from 'path';

async function runAllTests() {
    console.log('[PHASE 2 TESTS] Starting...\n');

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run all tests
    await testTools();
    await testReadFile();
    await testListFiles();
    await testGetFileInfo();
    await testComputeDiff();
    await testGetDiffAreas();
    await testWorkspaceBoundary();

    console.log('\n[PHASE 2 TESTS] Complete!');
    process.exit(0);
}

// Add all test functions from above here
// ... (copy test functions from above)

runAllTests().catch(console.error);
```

**Run it:**
```bash
cd /Users/neel/VYBE-MCP
npm run build
node build/test-phase2.js
```

---

## Step 5: Manual Verification Checklist

- [ ] IDE starts with MCP connected (check console logs)
- [ ] `tools/list` returns 8 tools
- [ ] `vybe.read_file` returns file content
- [ ] `vybe.list_files` returns directory listing (one level)
- [ ] `vybe.get_file_info` returns metadata for existing file
- [ ] `vybe.get_file_info` returns `exists: false` for non-existent file
- [ ] `vybe.compute_diff` returns diff hunks in correct format
- [ ] `vybe.get_diff_areas` returns array (may be empty)
- [ ] Workspace boundary enforced (external path returns error)

---

## Troubleshooting

### MCP Not Connecting
- Check `VYBE_MCP_COMMAND` is set correctly
- Verify MCP is built: `cd VYBE-MCP && npm run build`
- Check browser console for errors

### Tools Not Appearing
- Verify `registerVybeMcpTools()` is called in `vybeMcpMainService.ts`
- Check main process logs for tool registration errors

### Tool Calls Failing
- Check browser console for IPC errors
- Verify renderer process has access to required services
- Check workspace is open in IDE

---

**Once all tests pass, Phase 2 is validated and ready to commit!**


