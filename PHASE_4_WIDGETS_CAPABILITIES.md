# Phase 4 UI Widgets - Capabilities & Integration Guide

## Overview

The Phase 4 UI widgets (`VybeDiffHunkWidget` and `VybeFileCommandBar`) are **fully implemented and functional**, but they are **not yet integrated** with the AI/agent system. They currently only appear when manually triggered via the test command.

---

## Current Capabilities

### 1. **VybeDiffHunkWidget** (Per-Diff Buttons)
**Location:** `src/vs/workbench/contrib/vybeChat/browser/widgets/vybeDiffHunkWidget.ts`

**What it does:**
- Displays "Keep" and "Undo" buttons for each individual diff
- Positioned at the bottom-right corner of each diff range
- Shows keyboard shortcuts: ⌘Y (Keep) and ⌘N (Undo)
- Automatically appears when a diff is in `Pending` or `Streaming` state
- Automatically disappears when diff is accepted/rejected

**Actions:**
- **Keep button (⌘Y):** Calls `IVybeEditService.acceptDiff(diffId)` → Applies the diff to the model
- **Undo button (⌘N):** Calls `IVybeEditService.rejectDiff(diffId)` → Reverts the diff

**Lifecycle:**
- Created when `VybeDiffZoneManager` detects pending/streaming diffs
- Disposed when diff is accepted/rejected or zone is disposed
- Updates automatically during streaming (via `updateDiffsForStreaming`)

---

### 2. **VybeFileCommandBar** (File-Level Bar)
**Location:** `src/vs/workbench/contrib/vybeChat/browser/widgets/vybeFileCommandBar.ts`

**What it does:**
- Displays at the bottom of the editor when file has pending diffs
- Shows two containers:
  1. **Diff navigation + actions:** "1 / 1" counter, "Undo All" (⇧⌘⌫), "Keep All" (⌘⏎)
  2. **File navigation:** "< 1 / 1 files >" counter for multi-file edits

**Actions:**
- **Keep All (⌘⏎):** Calls `IVybeEditService.acceptFile(uri)` → Accepts all diffs in the file
- **Undo All (⇧⌘⌫):** Calls `IVybeEditService.rejectFile(uri)` → Rejects all diffs in the file
- **Diff navigation (↑/↓):** Navigates to next/previous diff (not yet fully implemented)
- **File navigation (←/→):** Navigates to next/previous file with diffs (not yet fully implemented)

**Lifecycle:**
- Created when `VybeDiffZoneManager` creates a zone for a file with diffs
- Automatically shows/hides based on `IVybeEditService.getEditedFile(uri).hasPendingDiffs`
- Updates counters when diffs change

---

## Current Integration Status

### ✅ **What Works:**
1. **Widget rendering** - Widgets appear correctly with proper styling
2. **Button actions** - All buttons call the correct `IVybeEditService` methods
3. **Event-driven updates** - Widgets update when diffs are accepted/rejected
4. **Lifecycle management** - Widgets are created/disposed correctly
5. **Visual decorations** - Diff backgrounds (green/red) appear correctly

### ❌ **What's Missing for Real Usage:**
1. **AI/Agent Integration** - No code path from AI responses → `createEditTransaction` → `computeDiffs`
2. **Streaming Support** - Widgets support streaming, but no streaming source is wired up
3. **Navigation Implementation** - Diff/file navigation buttons exist but don't actually navigate yet
4. **Keyboard Shortcuts** - Shortcuts are displayed but not bound to actual commands

---

## How It Currently Works (Test Command)

**Current trigger:** `vybe.testEditWidgets` command

**Flow:**
```
1. User runs "Test Edit Widgets" command
2. Command gets active editor + model
3. Creates test modification (appends function)
4. Calls: editService.createEditTransaction(uri, originalContent)
5. Calls: diffService.computeDiffs(uri, originalContent, modifiedContent)
6. DiffZoneManager detects new diffs → creates zones → creates widgets
7. Widgets appear in editor
```

**Test Command Location:** `src/vs/workbench/contrib/vybeChat/browser/commands/testEditWidgetsCommand.ts`

---

## What's Needed for Real AI Integration

### Option 1: **AI Agent Tool/Function**
The AI agent would need to call a tool/function that:
```typescript
// Pseudo-code for AI tool
async function applyCodeEdits(uri: string, originalContent: string, modifiedContent: string) {
  const editService = getService(IVybeEditService);
  const diffService = getService(IVybeDiffService);

  // Create transaction
  const txId = await editService.createEditTransaction(URI.parse(uri), originalContent, {
    streaming: false,
    source: 'agent'
  });

  // Compute diffs
  const result = await diffService.computeDiffs(URI.parse(uri), originalContent, modifiedContent);

  return { transactionId: txId, diffCount: result.diffs.length };
}
```

### Option 2: **Streaming Integration**
For streaming edits (as AI generates code):
```typescript
// Start streaming transaction
const txId = await editService.createEditTransaction(uri, originalContent, {
  streaming: true,
  source: 'agent'
});

// As AI generates content incrementally:
for (const chunk of aiStream) {
  const currentContent = originalContent + chunk;
  await diffService.updateDiffsForStreaming(diffAreaId, currentContent);
  // Widgets automatically update via onDidUpdateDiffArea event
}
```

### Option 3: **Chat Response Integration**
Similar to how VS Code's chat editing works:
- Hook into chat response parsing
- Detect code edit blocks in AI responses
- Automatically create transactions and compute diffs

---

## End-to-End Testing Strategy

### **Manual Testing (Current)**
1. Open a file in editor
2. Run `F1` → "Test Edit Widgets"
3. Verify:
   - ✅ Green/red diff backgrounds appear
   - ✅ Hunk widgets appear at bottom-right of diffs
   - ✅ File command bar appears at bottom
   - ✅ Buttons are clickable
   - ✅ Accept/reject works
   - ✅ Widgets disappear after accept/reject

### **Automated Testing (Recommended)**
Create test scenarios:

1. **Unit Tests:**
   - Test widget creation/disposal
   - Test button click handlers
   - Test visibility logic

2. **Integration Tests:**
   - Test full flow: `createEditTransaction` → `computeDiffs` → widget appearance
   - Test accept/reject operations
   - Test streaming updates

3. **E2E Tests:**
   - Simulate AI agent calling edit service
   - Verify widgets appear
   - Verify user interactions work
   - Verify undo/redo integration

### **Test Command Enhancement**
The current test command could be enhanced to:
- Support multiple files
- Support streaming simulation
- Support different diff types (insert/edit/delete)

---

## Integration Points Needed

### **1. AI Agent → Edit Service Bridge**
**Location:** TBD (new file or existing agent service)

**What it needs:**
- Access to `IVybeEditService` and `IVybeDiffService`
- Parse AI responses for code edits
- Create transactions and compute diffs
- Handle streaming updates

**Example:**
```typescript
// In agent service or chat response handler
async function handleAIEditResponse(uri: URI, aiGeneratedCode: string) {
  const model = modelService.getModel(uri);
  const originalContent = model.getValue();

  // Create transaction
  const txId = await editService.createEditTransaction(uri, originalContent, {
    source: 'agent'
  });

  // Compute diffs
  await diffService.computeDiffs(uri, originalContent, aiGeneratedCode);

  // Widgets will automatically appear via DiffZoneManager
}
```

### **2. Keyboard Shortcut Bindings**
**Location:** `src/vs/workbench/contrib/vybeChat/browser/actions/vybeChatActions.ts` or new keybindings file

**What it needs:**
- Register commands for ⌘Y (accept diff) and ⌘N (reject diff)
- Register commands for ⌘⏎ (accept file) and ⇧⌘⌫ (reject file)
- Commands should work contextually (only when widgets are visible)

### **3. Navigation Implementation**
**Location:** `vybeFileCommandBar.ts` and `vybeDiffHunkWidget.ts`

**What it needs:**
- `_goToDiff()` - Navigate editor to specific diff range
- `_navigateToNextFile()` - Switch to next file with pending diffs
- `_navigateToPreviousFile()` - Switch to previous file with pending diffs

---

## Summary

**Current State:**
- ✅ Widgets are fully implemented and functional
- ✅ All button actions work correctly
- ✅ Visual styling is complete
- ❌ Not integrated with AI/agent system
- ❌ Only accessible via test command

**Next Steps for Real Usage:**
1. Create AI agent integration point (tool/function)
2. Wire up keyboard shortcuts
3. Implement navigation functionality
4. Add streaming support for incremental AI generation
5. Create E2E tests

**When Will It Appear in Reality?**
- Currently: Only via `vybe.testEditWidgets` command
- After integration: When AI agent calls `createEditTransaction` + `computeDiffs`
- The widgets will automatically appear once diffs are created, no additional UI code needed

