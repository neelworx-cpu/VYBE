# E2E Testing Guide for Accept/Reject System

## Quick Start

1. **Open Command Palette** (Cmd+Shift+P / Ctrl+Shift+P)
2. **Run**: `Vybe: Simulate AI Edits (E2E Test)`
3. **Check the console** - you'll see:
   - Original content
   - Modified content
   - All diffs that were created
   - Exact ranges and code for each diff

## What the Test Does

The test command:
- ✅ Creates its own test file (`untitled:vybe-test-file.ts`)
- ✅ Uses **known, predictable content** (not repo files)
- ✅ Generates **known diffs** (we know exactly what should happen)
- ✅ Logs **everything** to console for debugging

## Test File Content

### Original Content:
```typescript
// VYBE E2E Test File - Original Content
function calculateSum(a: number, b: number): number {
    return a + b;
}

function calculateProduct(x: number, y: number): number {
    return x * y;
}

// This is a comment that will be modified
const greeting = "Hello";

export { calculateSum, calculateProduct, greeting };
```

### Modified Content (what diffs should apply):
```typescript
// VYBE E2E Test File - Modified Content
function calculateSum(a: number, b: number): number {
    // Added: Better implementation with validation
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Invalid arguments');
    }
    return a + b;
}

// NEW FUNCTION ADDED
function calculateDifference(x: number, y: number): number {
    return x - y;
}

function calculateProduct(x: number, y: number): number {
    return x * y;
}

// This comment was modified
const greeting = "Hello, World!";

export { calculateSum, calculateProduct, calculateDifference, greeting };
```

### Expected Diffs:
1. **Line 2-4**: Modified `calculateSum` (added validation)
2. **Line 8-11**: Inserted new function `calculateDifference`
3. **Line 15**: Modified comment
4. **Line 16**: Modified greeting string

## How to Report Issues

When something goes wrong, please report:

### 1. What You Did
- [ ] Ran `Simulate AI Edits` command
- [ ] Clicked "Keep" on a diff widget
- [ ] Clicked "Undo" on a diff widget
- [ ] Clicked "Keep All" in file command bar
- [ ] Clicked "Undo All" in file command bar
- [ ] Typed between diffs
- [ ] Other: _______________

### 2. What Happened
- [ ] Code was added in wrong place
- [ ] Code was removed when it shouldn't be
- [ ] Code was modified incorrectly
- [ ] Diff decorations moved to wrong location
- [ ] Widgets disappeared
- [ ] Multiple things happened at once
- [ ] Other: _______________

### 3. Console Output
Copy the console output, especially:
- The "DETAILED DIFFS" section
- Any error messages
- The exact diff IDs and ranges

### 4. File State
After the action, what does the file look like?
- Copy the file content
- Note which lines changed
- Note what should have happened vs what did happen

### 5. Specific Example
If possible, provide:
- **Diff ID** that caused the issue
- **Original code** from that diff
- **Modified code** from that diff
- **What you clicked** (Keep/Undo)
- **What the file looked like before**
- **What the file looked like after**

## Example Report

```
ISSUE: Clicking "Keep" on diff widget adds code in wrong place

WHAT I DID:
- Ran "Simulate AI Edits" command
- Clicked "Keep" on the first diff widget (calculateSum function)

WHAT HAPPENED:
- The validation code was added at line 20 instead of line 2
- The original function code was duplicated
- File now has two calculateSum functions

CONSOLE OUTPUT:
[VYBE E2E] DIFF COMPUTATION RESULTS
1. Diff ID: abc12345...
   Type: EDIT
   Original Range: Line 2-4
   Modified Range: Line 2-6
   Original Code:
      1: function calculateSum(a: number, b: number): number {
      2:     return a + b;
      3: }
   Modified Code:
      1: function calculateSum(a: number, b: number): number {
      2:     // Added: Better implementation with validation
      3:     if (typeof a !== 'number' || typeof b !== 'number') {
      4:         throw new Error('Invalid arguments');
      5:     }
      6:     return a + b;
      7: }

FILE STATE AFTER:
- Line 2-4: Original function (unchanged)
- Line 20-26: Modified function (wrong location)
```

## Testing Checklist

Use this checklist to systematically test:

- [ ] **Basic Accept**: Click "Keep" on a single diff → Code should be applied correctly
- [ ] **Basic Reject**: Click "Undo" on a single diff → Code should be reverted correctly
- [ ] **Accept All**: Click "Keep All" → All diffs should be applied
- [ ] **Reject All**: Click "Undo All" → All diffs should be reverted
- [ ] **Undo Accept**: After accepting, use Cmd+Z → Should undo the accept
- [ ] **Redo Accept**: After undoing, use Cmd+Shift+Z → Should redo the accept
- [ ] **Type Between Diffs**: Type code between two diffs → Decorations should stay with their diffs
- [ ] **Multiple Accepts**: Accept diff 1, then diff 2 → Both should work independently
- [ ] **Accept Then Reject**: Accept a diff, then reject it → Should revert correctly
- [ ] **Reject Then Accept**: Reject a diff, then accept it → Should apply correctly

## Console Commands for Debugging

After running the test, you can also check in console:

```javascript
// Get all diffs for the test file
const editService = await accessor.get(IVybeEditService);
const diffs = editService.getDiffsForFile(URI.parse('untitled:vybe-test-file.ts'));
console.log('All diffs:', diffs);

// Get diff areas
const diffService = await accessor.get(IVybeDiffService);
const areas = diffService.getDiffAreasForUri(URI.parse('untitled:vybe-test-file.ts'));
console.log('Diff areas:', areas);
```

