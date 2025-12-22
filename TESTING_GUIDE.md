# VYBE Codebase Indexing System - Complete Testing Guide
## Phases 1-12 End-to-End Test Plan

This guide covers testing all functionality implemented across Phases 1-12, including the UI, indexing, embeddings, retrieval, and agent tools.

---

## 📋 **Prerequisites**

1. **Open a workspace** with code files (not empty)
2. **Ensure you have a workspace folder** (single-folder or multi-root workspace)
3. **Check that the extension host is running** (should be automatic)

---

## 🚀 **Part 1: Accessing VYBE Settings UI**

### **Method 1: Top Menu Bar**
1. Click **"VYBE"** in the top menu bar
2. Select **"Settings"** → **"VYBE Settings"**
3. The VYBE Settings editor should open

### **Method 2: Command Palette**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `VYBE: Open Settings`
3. Press Enter
4. The VYBE Settings editor should open

### **Method 3: Vybe Chat Title Bar**
1. Open or focus the Vybe Chat panel
2. Look for the **settings icon** (⚙️) in the chat title bar
3. Click it
4. The VYBE Settings editor should open

### **Method 4: Preferences Menu**
1. Click **"File"** → **"Preferences"** (or **"Code"** → **"Preferences"** on Mac)
2. Look for **"VYBE Settings"** in the menu
3. Click it

---

## 🎯 **Part 2: Testing the Indexing UI (Phase 12)**

### **Step 1: Navigate to Indexing Tab**
1. In VYBE Settings, click the **"Indexing"** tab (or scroll to find it)
2. You should see the **"Codebase"** section

### **Step 2: Verify UI Components**

You should see the following UI elements:

#### **A. Status Pill (Top of Section)**
- **Location**: At the top of the Codebase Indexing section
- **States to check**:
  - `Idle` - Gray, when no indexing has started
  - `Building` - Blue, during full index build
  - `Ready` - Green, when indexing is complete
  - `Degraded` - Yellow, if there are issues
  - `Paused` - Orange, when paused
  - `Rebuilding` - Blue, during rebuild

#### **B. Progress Bars**
- **Structural Indexing Progress**:
  - Shows: `X files indexed / Y total files`
  - Percentage bar (0-100%)
  - "Last synced X ago" timestamp when ready

- **Semantic Indexing (Embeddings) Progress**:
  - Shows: `X embeddings generated / Y total chunks`
  - Percentage bar (0-100%)
  - "Completed X ago" timestamp when ready

#### **C. Model Status Indicator**
- **Left side of progress footer**
- **States**:
  - `Initializing...` - Spinning icon
  - `Checking For Model Files...` - Spinning icon
  - `Downloading Model Files...` - Circular progress indicator
  - `Extracting Model Files...` - Spinning icon
  - `Model Warmed Up` - Blinking green light
  - `Model Error` - Error icon with message

#### **D. Control Buttons**
- **Sync Button** (🔄):
  - Triggers full index build or incremental sync
  - Shows loading spinner when active
  - Disabled during indexing

- **Pause Button** (⏸️):
  - Pauses indexing operations
  - Only enabled when indexing is active
  - Shows confirmation dialog

- **Resume Button** (▶️):
  - Resumes paused indexing
  - Only enabled when paused
  - No confirmation needed

- **Rebuild Button** (🗑️):
  - Deletes all index data and rebuilds from scratch
  - Shows confirmation dialog
  - Only enabled when index exists

#### **E. File Change Feedback Section**
- **Location**: Below progress bars
- **Shows**: Recent indexing activities
  - "Indexed: filename.ts"
  - "Deleted: filename.ts"
  - Timestamps for each activity
- **Clear Button**: Removes all feedback items

#### **F. Context Preview (Dev-only)**
- **Location**: Below file change feedback
- **Components**:
  - Input box for query text
  - "Preview" button
  - Results display showing:
    - File paths
    - Line ranges
    - Code snippets
    - Scores and reasons
  - Budget indicator (chars used / 50,000 max)

---

## 🔧 **Part 3: Testing Indexing Functionality**

### **Test 3.1: Initial Index Build**

1. **Enable Indexing** (if not already enabled):
   - In VYBE Settings → Indexing tab
   - Toggle "Enable Local Indexing" to ON (if available)
   - Or check `vybe.localIndexing.enabled` in settings.json

2. **Start Full Index**:
   - Click the **"Sync"** button
   - **Expected behavior**:
     - Status pill changes to `Building` (blue)
     - Progress bars start filling
     - Structural progress shows "Indexing... X of Y files"
     - Sync button becomes disabled
     - Spinner appears on sync button

3. **Monitor Progress**:
   - Watch the structural indexing progress bar
   - Check the file count increasing
   - Look for file change feedback items appearing

4. **Wait for Completion**:
   - Status pill should change to `Ready` (green)
   - Progress bars should show 100%
   - "Last synced X ago" should appear
   - Sync button should re-enable

### **Test 3.2: Verify Index Persistence**

1. **Check Database Location**:
   - Index DB should be at: `<workspaceStorage>/<workspaceId>/vybe-index.db`
   - On Mac: `~/Library/Application Support/code-oss-dev/User/workspaceStorage/<hash>/vybe-index.db`

2. **Restart VS Code**:
   - Close VS Code completely
   - Reopen the same workspace
   - Open VYBE Settings → Indexing tab

3. **Verify Status Persists**:
   - Status should still show `Ready`
   - File counts should be the same
   - "Last synced" timestamp should be preserved
   - **This proves Phase 2 persistence works**

### **Test 3.3: Incremental Indexing (Phase 4)**

1. **Make a File Change**:
   - Open a file in your workspace
   - Make a small edit (add a comment, change a variable name)
   - Save the file (`Cmd+S` / `Ctrl+S`)

2. **Observe Real-time Indexing**:
   - Within 250-500ms, you should see:
     - File change feedback: "Indexed: filename.ts"
     - Progress bars may update slightly
     - No full rebuild triggered

3. **Verify Chunk Updates**:
   - The file's chunks should be re-indexed
   - Old chunks deleted, new chunks inserted
   - Hash should be updated in database

### **Test 3.4: File Deletion Handling**

1. **Delete a File**:
   - Delete a file from your workspace (via file explorer)
   - Or use `rm filename.ts` in terminal

2. **Observe Soft Deletion**:
   - File change feedback: "Deleted: filename.ts"
   - File marked as `deleted=1` in database
   - Chunks removed from database

3. **Recreate the File**:
   - Create a new file with the same name
   - Save it
   - Should be re-indexed automatically

---

## 🧠 **Part 4: Testing Embeddings (Phase 5)**

### **Test 4.1: Verify Embeddings Generation**

1. **Check Embedding Status**:
   - In VYBE Settings → Indexing tab
   - Look at "Semantic Indexing (Embeddings)" progress bar
   - Should show: `X embeddings generated / Y total chunks`

2. **Wait for Embeddings**:
   - After structural indexing completes, embeddings should start
   - Progress bar should fill gradually
   - Model status should show "Model Warmed Up" (green light)

3. **Verify Embedding Count**:
   - `embeddedChunks` should match `totalChunks` when complete
   - Progress should reach 100%

### **Test 4.2: Model Status**

1. **Check Model Status**:
   - Left side of progress footer
   - Should show one of:
     - `Model Warmed Up` (green blinking light) - ✅ Ready
     - `Downloading Model Files...` (circular progress) - ⏳ In progress
     - `Model Error` (error icon) - ❌ Problem

2. **Model File Location**:
   - Should be at: `/Users/neel/Library/Application Support/code-oss-dev/vybe/models/coderank-embed/1.0.0/model.onnx`
   - Check if file exists

---

## 🔍 **Part 5: Testing Semantic Search & Retrieval (Phases 6-7)**

### **Test 5.1: Context Preview (Dev Feature)**

1. **Navigate to Context Preview**:
   - In VYBE Settings → Indexing tab
   - Scroll to "Context Preview (Dev-only)" section

2. **Enter a Query**:
   - Type a query like: `navigation header` or `authentication function`
   - Click **"Preview"** button

3. **Verify Results**:
   - Should see a list of context items
   - Each item shows:
     - **File path**
     - **Line range** (e.g., "Lines 10-25")
     - **Code snippet** (truncated to 200 chars)
     - **Score** (similarity score)
     - **Reason** (e.g., "semantic_match", "active_file", "indexed_file")
   - Budget indicator shows chars used

4. **Test Different Queries**:
   - Try queries related to your codebase
   - Verify results are relevant
   - Check that scores make sense

### **Test 5.2: Verify Retrieval Quality**

1. **Check Ranking Signals**:
   - Results should be ordered by relevance
   - Files from same directory should be grouped
   - Recent files should have slight boost
   - Active/open files should appear first (if applicable)

2. **Verify Deduplication**:
   - Multiple chunks from same file should be merged
   - Overlapping chunks should be collapsed
   - No duplicate snippets

---

## 🛠️ **Part 6: Testing Control Plane (Phase 10)**

### **Test 6.1: Pause/Resume**

1. **Start Indexing**:
   - Click "Sync" to start indexing
   - Wait for indexing to begin

2. **Pause Indexing**:
   - Click **"Pause"** button
   - Should show confirmation dialog
   - Click "Pause" in dialog
   - **Expected**:
     - Status pill changes to `Paused` (orange)
     - Progress stops
     - Notification: "Indexing paused"

3. **Resume Indexing**:
   - Click **"Resume"** button
   - **Expected**:
     - Status pill changes back to `Building` or `Ready`
     - Progress resumes
     - Notification: "Indexing resumed"

### **Test 6.2: Rebuild Index**

1. **Trigger Rebuild**:
   - Click **"Rebuild"** button
   - Should show confirmation dialog: "This will delete all index data and rebuild from scratch. Continue?"
   - Click "Rebuild" in dialog

2. **Verify Rebuild**:
   - Status pill changes to `Rebuilding` (blue)
   - All progress bars reset to 0%
   - Database is deleted and recreated
   - Full index rebuild starts
   - File counts should match original after completion

### **Test 6.3: Error Handling**

1. **Simulate Error** (if possible):
   - Try indexing a very large workspace (>10,000 files)
   - Or corrupt the database file manually

2. **Verify Error State**:
   - Status pill should show `Degraded` or `Error`
   - Error message should appear in error banner
   - Control buttons should be disabled appropriately

---

## 🤖 **Part 7: Testing Agent Tools (Phase 12)**

### **Test 7.1: Internal VYBE Tools**

The following tools should be registered for VYBE's internal agent:

1. **`vybe_get_context_for_query`**:
   - Assembles context for a query
   - Input: `{ query: string, maxChars?: number, maxTokens?: number }`
   - Output: JSON with context items

2. **`vybe_get_repo_overview`**:
   - Returns repository structure overview
   - Input: `{}`
   - Output: JSON with file counts, folders, recent files

3. **`vybe_get_active_file_context`**:
   - Gets context for currently active file
   - Input: `{ maxChars?: number }`
   - Output: JSON with context items

4. **`vybe_get_index_status`**:
   - Returns current index status
   - Input: `{}`
   - Output: JSON with status information

**Note**: These tools are used by VYBE's internal agent runtime. To test them, you would need to invoke them through the agent system or use the dev-only context preview in the UI.

### **Test 7.2: MCP Tools (External Contract)**

The following MCP tools should be registered for external use:

1. **`get_context_for_query`**
2. **`get_repo_overview`**
3. **`get_active_file_context`**
4. **`get_index_status`**

**Note**: These are exposed via MCP (Model Context Protocol) for external systems. Testing requires an MCP client.

---

## 📊 **Part 8: Verification Checklist**

Use this checklist to verify all features are working:

### **UI Features**
- [ ] VYBE Settings opens from top menu
- [ ] VYBE Settings opens from command palette
- [ ] VYBE Settings opens from chat title bar settings button
- [ ] Indexing tab is visible and accessible
- [ ] Status pill displays correct state
- [ ] Progress bars update in real-time
- [ ] Model status indicator shows correct state
- [ ] Control buttons (Sync, Pause, Resume, Rebuild) work
- [ ] File change feedback appears
- [ ] Context preview works (dev-only)

### **Indexing Features**
- [ ] Full index build completes successfully
- [ ] File counts are accurate
- [ ] Index persists across restarts
- [ ] Incremental indexing works on file save
- [ ] File deletion is handled correctly
- [ ] Chunks are created and stored
- [ ] Hash-based change detection works

### **Embedding Features**
- [ ] Embeddings are generated after chunks
- [ ] Embedding progress bar updates
- [ ] Model status shows "Model Warmed Up"
- [ ] Embedding count matches chunk count (when complete)

### **Retrieval Features**
- [ ] Context preview returns results
- [ ] Results are relevant to query
- [ ] Ranking signals work (scores, reasons)
- [ ] Deduplication works (no overlapping chunks)
- [ ] Budget limits are enforced

### **Control Plane Features**
- [ ] Pause works and stops indexing
- [ ] Resume works and continues indexing
- [ ] Rebuild deletes and recreates index
- [ ] Error states are displayed correctly

---

## 🐛 **Troubleshooting**

### **Issue: Status always shows "Idle" or "No Workspace"**
- **Solution**: Ensure you have a workspace folder open (not just a file)
- Check: `File` → `Open Folder...` or `File` → `Open Workspace...`

### **Issue: Indexing doesn't start**
- **Solution**: Check that `vybe.localIndexing.enabled` is `true` in settings
- Verify workspace has files to index

### **Issue: Embeddings stuck at 0**
- **Solution**:
  - Check model status (should show "Model Warmed Up")
  - Verify model file exists at expected path
  - Check console for errors

### **Issue: Context preview returns no results**
- **Solution**:
  - Ensure indexing is complete
  - Ensure embeddings are generated
  - Try a more general query

### **Issue: Database errors**
- **Solution**:
  - Check that SQLite native module loaded
  - Verify workspace storage path is writable
  - Try rebuilding the index

---

## 📝 **Expected Console Logs**

When testing, you should see logs like:

```
INFO [indexService] buildFullIndex started {workspaceId: '...'}
INFO [indexService] enumerate files {workspace: '...', roots: Array(1), count: 243}
INFO [indexService] indexUris completed {workspace: '...', processed: 243, written: 24, errored: 219}
INFO [indexService] post-index counts {workspace: '...', totalFiles: 243, totalChunks: 1234}
INFO [ExtHostContext] context assembled {workspaceId: '...', itemsCount: 10, actualChars: 4523}
```

---

## ✅ **Success Criteria**

The system is working correctly if:

1. ✅ Full index builds complete without errors
2. ✅ File counts are accurate and persist across restarts
3. ✅ Embeddings are generated and match chunk counts
4. ✅ Context preview returns relevant results
5. ✅ Control buttons (pause/resume/rebuild) work
6. ✅ Real-time indexing updates on file changes
7. ✅ Status UI reflects actual index state
8. ✅ No console errors during normal operation

---

## 🎉 **Next Steps After Testing**

Once all tests pass:

1. **Use in production**: The indexing system is ready for use
2. **Integrate with agents**: Agent tools are registered and ready
3. **Monitor performance**: Watch for any performance issues with large workspaces
4. **Report issues**: If you find bugs, report them with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Console logs
   - Workspace size/file count

---

**Happy Testing! 🚀**

