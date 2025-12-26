# Phase 4 UI Widgets - Testing Guide

This guide explains how to test the **VybeDiffHunkWidget** (per-diff buttons) and **VybeFileCommandBar** (file-level command bar) that were implemented in Phase 4.

---

## Prerequisites

1. **Enable Diff Decorations** (required for widgets to appear):
   - Open VYBE Settings (Command Palette → "Preferences: Open VYBE Settings")
   - Go to **General** tab
   - Enable **"Enable Diff Decorations"** toggle
   - Or set via storage: `vybe.diffDecorations.enabled = true`

2. **Have a file open** in the editor that you want to test with

---

## Testing Method 1: Via Command Palette (Easiest) ✅

### Step 1: Enable Diff Decorations
- Open VYBE Settings (Command Palette → "Preferences: Open VYBE Settings")
- Go to **General** tab
- Enable **"Enable Diff Decorations"** toggle

### Step 2: Open a File
- Open any file in the editor (preferably one with some content)

### Step 3: Run Test Command
- Press `F1` or `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux)
- Type: **"Test Edit Widgets"** or **"vybe.testEditWidgets"**
- Press Enter

### Step 4: Verify Widgets Appear
After running the command, you should see:
- **Notification**: "✅ Test complete! Created transaction ... with X diff(s). Widgets should now be visible in the editor."
- **VybeDiffHunkWidget**: Accept/Reject buttons appear near each diff in the editor (right-aligned)
- **VybeFileCommandBar**: Command bar appears at the bottom of the editor with "Keep All" / "Undo All" buttons

### What the Command Does
The test command:
1. Gets the active editor and file content
2. Creates a test modification (adds a function at the end)
3. Creates an edit transaction
4. Computes diffs between original and modified content
5. Widgets automatically appear when diffs are created

---

## Testing Method 2: Manual Service Access (Advanced)

Create a test command that triggers the full flow:

### Create Test Command File
Create: `src/vs/workbench/contrib/vybeChat/browser/commands/testEditWidgetsCommand.ts`

```typescript
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { IVybeDiffService } from '../../common/vybeDiffService.js';
import { IModelService } from '../../../../editor/common/services/modelService.js';
import { URI } from '../../../../base/common/uri.js';

export async function testEditWidgets(accessor: ServicesAccessor): Promise<void> {
  const editService = accessor.get(IVybeEditService);
  const diffService = accessor.get(IVybeDiffService);
  const modelService = accessor.get(IModelService);
  const editorService = accessor.get(ICodeEditorService);

  // Get active editor
  const activeEditor = editorService.getFocusedCodeEditor();
  if (!activeEditor) {
    console.error('No active editor');
    return;
  }

  const uri = activeEditor.getModel()?.uri;
  if (!uri) {
    console.error('No URI for active editor');
    return;
  }

  const model = modelService.getModel(uri);
  if (!model) {
    console.error('No model for URI');
    return;
  }

  const originalContent = model.getValue();

  // Create test modifications
  const modifiedContent = originalContent + '\n\n// Test AI edit\nfunction testFunction() {\n  console.log("test");\n}';

  // Create transaction
  const transactionId = await editService.createEditTransaction(uri, originalContent, {
    streaming: false,
    source: 'agent'
  });

  // Compute diffs
  const result = await diffService.computeDiffs(uri, originalContent, modifiedContent, {
    diffAreaId: transactionId,
    ignoreWhitespace: false
  });

  console.log(`✅ Created transaction ${transactionId} with ${result.diffs.length} diffs`);
  console.log('Widgets should now be visible in the editor');
}
```

### Register Command
Add to your contribution file:
```typescript
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: 'vybe.testEditWidgets',
      title: 'Test Edit Widgets',
      category: 'VYBE',
      f1: true
    });
  }
  async run(accessor: ServicesAccessor) {
    await testEditWidgets(accessor);
  }
});
```

### Run Command
- Press `F1` or `Cmd+Shift+P`
- Type: "Test Edit Widgets"
- Execute the command

---

## What to Look For

### ✅ VybeDiffHunkWidget (Per-Diff Buttons)
- **Location**: Right-aligned, near the start line of each diff
- **Appearance**: Floating button bar with "Keep" and "Undo" buttons
- **Visibility**: Only visible for diffs with state `Pending` or `Streaming`
- **Behavior**:
  - Click "Keep" → Diff is accepted, button disappears
  - Click "Undo" → Diff is rejected, button disappears
  - Widgets reposition on scroll

### ✅ VybeFileCommandBar (File-Level Bar)
- **Location**: Bottom of the editor (12px from bottom)
- **Appearance**: Floating bar with:
  - Diff counter (e.g., "1 / 3") with up/down navigation
  - "Keep All" button (primary, blue)
  - "Undo All" button (outline)
  - File counter (e.g., "1 / 2 files") with left/right navigation
- **Visibility**: Only visible when file has pending diffs
- **Behavior**:
  - Click "Keep All" → All diffs in file accepted, bar disappears
  - Click "Undo All" → All diffs in file rejected, bar disappears
  - Navigation buttons update counters and navigate to diffs/files

---

## Testing Scenarios

### Scenario 1: Single Diff
1. Create transaction with one change
2. Compute diffs
3. Verify:
   - One hunk widget appears
   - File command bar shows "1 / 1"
   - Click "Keep" → Widget disappears
   - File command bar disappears

### Scenario 2: Multiple Diffs
1. Create transaction with multiple changes
2. Compute diffs
3. Verify:
   - Multiple hunk widgets appear (one per diff)
   - File command bar shows correct count (e.g., "2 / 5")
   - Navigation buttons work
   - "Keep All" accepts all diffs

### Scenario 3: Streaming Diffs
1. Create transaction with `streaming: true`
2. Compute initial diffs
3. Update diffs with `updateDiffsForStreaming()`
4. Verify:
   - Widgets update as new diffs arrive
   - Counters update in real-time

### Scenario 4: Accept/Reject Individual Diffs
1. Create transaction with multiple diffs
2. Click "Keep" on one diff widget
3. Verify:
   - That diff is accepted
   - Widget disappears
   - Other widgets remain
   - File command bar updates count

### Scenario 5: File-Level Operations
1. Create transaction with multiple diffs
2. Click "Keep All" in file command bar
3. Verify:
   - All diffs accepted
   - All widgets disappear
   - File command bar disappears
   - Checkpoint created (can undo)

---

## Debugging Tips

### Widgets Not Appearing?
1. **Check decorations are enabled**:
   ```javascript
   const storageService = accessor.get(IStorageService);
   const enabled = storageService.getBoolean('vybe.diffDecorations.enabled', StorageScope.APPLICATION, false);
   console.log('Decorations enabled:', enabled);
   ```

2. **Check diffs exist**:
   ```javascript
   const diffs = editService.getDiffsForFile(uri);
   console.log('Diffs for file:', diffs.length);
   ```

3. **Check zones exist**:
   ```javascript
   const zoneManager = accessor.get('vybeDiffZoneManager'); // If exposed
   // Or check editor has overlay widgets
   ```

4. **Check diff states**:
   ```javascript
   diffs.forEach(diff => {
     console.log(`Diff ${diff.diffId}: state=${diff.state}`);
   });
   // Only Pending/Streaming diffs show widgets
   ```

### Widgets Not Positioning Correctly?
- Check browser console for layout errors
- Verify editor layout info is available
- Check z-index conflicts

### Buttons Not Working?
- Check console for errors
- Verify `IVybeEditService` methods are being called
- Check event handlers are registered

---

## Quick Test (Recommended)

**Just use the command palette:**
1. Press `F1` or `Cmd+Shift+P`
2. Type: **"Test Edit Widgets"**
3. Press Enter
4. Widgets should appear!

That's it! The command handles everything automatically.

---

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Create transaction + compute diffs | Widgets appear for pending diffs |
| Click "Keep" on hunk widget | That diff accepted, widget removed |
| Click "Undo" on hunk widget | That diff rejected, widget removed |
| Click "Keep All" | All diffs accepted, all widgets removed |
| Click "Undo All" | All diffs rejected, all widgets removed |
| Accept diff via service | Widget disappears automatically |
| Reject diff via service | Widget disappears automatically |
| Scroll editor | Widgets reposition correctly |
| Close file | Widgets disposed |
| Switch files | Widgets only visible for files with diffs |

---

## Troubleshooting

**Issue**: Widgets don't appear at all
- ✅ Check diff decorations are enabled in settings
- ✅ Verify diffs are in `Pending` or `Streaming` state
- ✅ Check file is open in editor
- ✅ Verify `VybeDiffZoneManager` is running

**Issue**: Widgets appear but buttons don't work
- ✅ Check console for JavaScript errors
- ✅ Verify `IVybeEditService` is injected correctly
- ✅ Check event handlers are registered

**Issue**: Widgets positioned incorrectly
- ✅ Check editor layout calculations
- ✅ Verify scroll position is correct
- ✅ Check for CSS z-index conflicts

**Issue**: File command bar doesn't appear
- ✅ Verify file has pending diffs (`hasPendingDiffs === true`)
- ✅ Check file is the active editor
- ✅ Verify `VybeFileCommandBar` is created for the zone

---

**Happy Testing!** 🎉

