# Phase 4 UI Binding Audit

**Date:** 2025-01-XX
**Purpose:** Audit existing VS Code patterns for diff hunk widgets and editor overlays before implementing Phase 4
**Status:** Analysis Only

---

## Executive Summary

**Key Finding:** VS Code's Chat Editing uses `IOverlayWidget` for both per-diff hunk widgets and file-level command bars. The pattern is well-established and can be directly adapted for VYBE. Widget pooling, positioning, and lifecycle management patterns are reusable.

---

## A. Existing VS Code Diff Hunk Widget Patterns

### 1. DiffHunkWidget (Chat Editing) ✅

**Location:** `src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingCodeEditorIntegration.ts` (lines 721-847)

**Key Features:**
- **Implements:** `IOverlayWidget`, `IModifiedFileEntryChangeHunk`
- **Widget Type:** Overlay widget (not content widget)
- **Positioning:** Uses `IOverlayWidgetPosition` with `preference: { top, left }` coordinates
- **Lifecycle:** Created/updated/removed in `_updateDiffRendering()` method
- **Pooling:** Uses `ObjectPool<DiffHunkWidget>` for performance (reuse widgets)
- **Visibility:** Toggled based on cursor position and hover (`toggle(show: boolean)`)

**Widget Structure:**
```typescript
class DiffHunkWidget implements IOverlayWidget {
  private readonly _domNode: HTMLElement;
  private _position: IOverlayWidgetPosition | undefined;
  private _lastStartLineNumber: number | undefined;

  getId(): string
  getDomNode(): HTMLElement
  getPosition(): IOverlayWidgetPosition | null
  layout(startLineNumber: number): void
  toggle(show: boolean): void
  remove(): void
  dispose(): void
}
```

**Positioning Logic:**
- Uses `editor.getTopForLineNumber(startLineNumber)` for vertical position
- Uses `editor.getLayoutInfo()` for horizontal position (right-aligned)
- Calculates: `left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)`
- Updates on scroll/layout changes

**Button Implementation:**
- Uses `MenuWorkbenchToolBar` with `MenuId.ChatEditingEditorHunk`
- Buttons wired to `accept()` / `reject()` methods
- For VYBE: Can use simple DOM buttons calling `IVybeEditService.acceptDiff/rejectDiff`

**Widget Management:**
- Created per diff change in `_updateDiffRendering()`
- Stored in `_diffHunkWidgets: DiffHunkWidget[]`
- Pooled via `_diffHunkWidgetPool` (reuse widgets when diffs change)
- Disposed via `_diffHunksRenderStore`

---

### 2. Widget Lifecycle in Chat Editing ✅

**Creation Pattern:**
1. In `_updateDiffRendering()`, iterate through `diff.changes`
2. For each change, get/create widget from pool
3. Call `widget.update()` or create new instance
4. Call `widget.layout(startLineNumber)` to position
5. Add to `_diffHunkWidgets` array
6. Register disposal in `_diffHunksRenderStore`

**Update Pattern:**
- Widgets updated when diff changes (streaming, accept/reject)
- `_updateDiffRendering()` called on diff changes
- Widgets repositioned via `layout()` on scroll/layout changes

**Removal Pattern:**
- Widgets removed when diff is accepted/rejected
- Pooled widgets returned to pool via `putBack()`
- Unused widgets hidden via `remove()` (not disposed, for reuse)

**Visibility Toggle:**
- Widgets shown/hidden based on cursor position
- `toggleWidget()` function shows widget when cursor in range
- Also toggles on hover (`onMouseMove`)

---

### 3. File-Level Overlay Widgets ✅

**Location:** `src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingEditorOverlay.ts`

**Pattern:**
- `ChatEditorOverlayWidget` implements `IOverlayWidget`
- Positioned at top of editor (`top: 0`)
- Shows file-level actions (Accept All, Reject All, etc.)
- Created per editor group
- Managed via `DisposableMap<IEditorGroup>`

**For VYBE Phase 4B:**
- Similar pattern: `VybeFileCommandBar` implementing `IOverlayWidget`
- Position at top (`preference: { top: 0, left: 0 }` or center)
- Buttons: Keep (acceptFile), Undo (rejectFile), Review (navigate to next diff)
- Show/hide based on pending diffs for active file

---

## B. IOverlayWidget Interface ✅

**Location:** `src/vs/editor/browser/editorBrowser.ts`

**Interface:**
```typescript
export interface IOverlayWidget {
  getId(): string;
  getDomNode(): HTMLElement;
  getPosition(): IOverlayWidgetPosition | null;
  getMinContentWidthInPx?(): number;
  allowEditorOverflow?: boolean;
}

export interface IOverlayWidgetPosition {
  preference: IOverlayWidgetPositionPreference | IOverlayWidgetPositionCoordinates;
  stackOrdinal?: number;
}

export interface IOverlayWidgetPositionCoordinates {
  top: number;
  left: number;
}
```

**Editor Methods:**
- `editor.addOverlayWidget(widget)` - Add widget
- `editor.removeOverlayWidget(widget)` - Remove widget
- `editor.layoutOverlayWidget(widget)` - Update layout

**Positioning:**
- `preference: { top, left }` - Absolute coordinates relative to editor
- `stackOrdinal` - Z-order stacking
- Coordinates calculated from `editor.getTopForLineNumber()` and `editor.getLayoutInfo()`

---

## C. Widget Pooling Pattern ✅

**Location:** `chatEditingCodeEditorIntegration.ts` (lines 55-74)

**ObjectPool Implementation:**
```typescript
class ObjectPool<T extends IDisposable> {
  private readonly _free = new LinkedList<T>();
  get(): T | undefined
  putBack(obj: T): void
  dispose(): void
}
```

**Usage:**
- Get widget from pool: `let widget = this._diffHunkWidgetPool.get()`
- If none available, create new: `widget = new DiffHunkWidget(...)`
- When done, return to pool: `this._diffHunkWidgetPool.putBack(widget)`
- Hide unused widgets: `widget.remove()` (keeps in pool for reuse)

**For VYBE:**
- Can use same pooling pattern for performance
- Or simpler: create/dispose widgets directly (acceptable for Phase 4)

---

## D. Widget Positioning Details ✅

**Vertical Position:**
- `editor.getTopForLineNumber(lineNumber)` - Gets pixel position of line
- `editor.getScrollTop()` - Current scroll offset
- Final top: `getTopForLineNumber(startLineNumber) - scrollTop - (lineHeight * lineDelta)`

**Horizontal Position:**
- `editor.getLayoutInfo()` provides:
  - `contentLeft` - Left edge of content area
  - `contentWidth` - Width of content area
  - `verticalScrollbarWidth` - Scrollbar width
- Right-aligned: `left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)`

**Layout Updates:**
- Listen to `editor.onDidScrollChange` and `editor.onDidLayoutChange`
- Recalculate position and call `editor.layoutOverlayWidget(widget)`

---

## E. What VYBE Needs

### Phase 4A: Diff Hunk Widget

**Requirements:**
1. `VybeDiffHunkWidget` implementing `IOverlayWidget`
2. One widget per `Diff` (Pending/Streaming state only)
3. Buttons: Accept (calls `IVybeEditService.acceptDiff(diffId)`) and Reject (calls `rejectDiff(diffId)`)
4. Positioned near diff range (right-aligned, at start line)
5. Created/removed in `VybeDiffZoneManager.refreshDecorationsForEditor()`
6. Toggled on cursor position/hover

**Reusable Patterns:**
- ✅ `IOverlayWidget` interface
- ✅ Positioning logic (`getTopForLineNumber`, `getLayoutInfo`)
- ✅ Widget lifecycle (create/update/remove)
- ✅ Visibility toggle pattern

**New/Simplified:**
- Simple DOM buttons (no MenuWorkbenchToolBar needed)
- Direct calls to `IVybeEditService` methods
- Widget creation tied to decoration refresh

---

### Phase 4B: File Command Bar

**Requirements:**
1. `VybeFileCommandBar` implementing `IOverlayWidget`
2. Positioned at top of editor (floating bar)
3. Buttons: Keep (acceptFile), Undo (rejectFile), Review (navigate to next diff)
4. Show only when file has pending diffs
5. Created/disposed by `VybeDiffZoneManager` per editor/uri

**Reusable Patterns:**
- ✅ `IOverlayWidget` interface
- ✅ Top positioning (`top: 0`)
- ✅ Show/hide based on state

**New:**
- Simple DOM buttons
- Subscribe to `IVybeEditService.onDidChangeEditedFiles`
- Navigation to next diff (can reuse cursor position logic)

---

## F. Integration Points

### VybeDiffZoneManager

**Current State:**
- Manages `DiffZone` lifecycle
- Creates/disposes zones on editor open/close
- Refreshes decorations on diff changes
- Already has `refreshDecorationsForEditor()` method

**Phase 4A Integration:**
- In `refreshDecorationsForEditor()`:
  - After computing decorations, also create/update hunk widgets
  - One widget per pending/streaming diff
  - Store widgets in `DiffZone` (add `hunkWidgets: VybeDiffHunkWidget[]` field)
  - Dispose widgets when diff accepted/rejected

**Phase 4B Integration:**
- Create `VybeFileCommandBar` per zone (or per editor)
- Show/hide based on `hasPendingDiffs` from `IVybeEditService.getEditedFile(uri)`
- Subscribe to `onDidChangeEditedFiles` to update visibility

---

## G. File Structure Proposal

### Phase 4A Files

1. **NEW:** `src/vs/workbench/contrib/vybeChat/browser/widgets/vybeDiffHunkWidget.ts`
   - `VybeDiffHunkWidget` class implementing `IOverlayWidget`
   - Accept/Reject button handlers
   - Positioning logic

2. **NEW:** `src/vs/workbench/contrib/vybeChat/browser/media/vybeDiffHunkWidget.css`
   - Styles for hunk widget
   - Button styles
   - Hover states

3. **MODIFY:** `src/vs/workbench/contrib/vybeChat/browser/vybeDiffZoneManager.ts`
   - Add widget creation/removal in `refreshDecorationsForEditor()`
   - Store widgets in `DiffZone` (extend interface)
   - Handle widget lifecycle

4. **MODIFY:** `src/vs/workbench/contrib/vybeChat/common/vybeEditTypes.ts`
   - Add `hunkWidgets?: VybeDiffHunkWidget[]` to `DiffZone` interface (optional)

---

### Phase 4B Files

1. **NEW:** `src/vs/workbench/contrib/vybeChat/browser/widgets/vybeFileCommandBar.ts`
   - `VybeFileCommandBar` class implementing `IOverlayWidget`
   - Keep/Undo/Review button handlers
   - Show/hide logic

2. **NEW:** `src/vs/workbench/contrib/vybeChat/browser/media/vybeFileCommandBar.css`
   - Styles for command bar
   - Button styles

3. **MODIFY:** `src/vs/workbench/contrib/vybeChat/browser/vybeDiffZoneManager.ts`
   - Create/dispose command bar per zone
   - Subscribe to `onDidChangeEditedFiles` for visibility updates

---

## H. Implementation Approach

### Phase 4A Steps

1. **Create VybeDiffHunkWidget:**
   - Implement `IOverlayWidget` interface
   - Create DOM node with Accept/Reject buttons
   - Implement `layout(lineNumber)` for positioning
   - Implement `toggle(show)` for visibility

2. **Wire into VybeDiffZoneManager:**
   - In `refreshDecorationsForEditor()`:
     - Get pending/streaming diffs
     - Create/update widgets for each diff
     - Remove widgets for accepted/rejected diffs
   - Store widgets in `DiffZone` (or separate map)

3. **Handle Widget Lifecycle:**
   - Dispose widgets when zone disposed
   - Update widgets on scroll/layout changes
   - Toggle widgets on cursor position/hover

---

### Phase 4B Steps

1. **Create VybeFileCommandBar:**
   - Implement `IOverlayWidget` interface
   - Create DOM node with Keep/Undo/Review buttons
   - Position at top (`top: 0`)
   - Show/hide based on pending diffs

2. **Wire into VybeDiffZoneManager:**
   - Create command bar per zone (or per editor)
   - Subscribe to `IVybeEditService.onDidChangeEditedFiles`
   - Update visibility based on `getEditedFile(uri).hasPendingDiffs`

3. **Implement Review Button:**
   - Navigate to next pending diff
   - Can reuse cursor position logic from Phase 4A
   - Or simple: `editor.setPosition(nextDiffRange.startPosition)`

---

## I. Constraints & Simplifications

**For Phase 4:**
- ✅ Use `IOverlayWidget` (proven pattern)
- ✅ Simple DOM buttons (no MenuWorkbenchToolBar)
- ✅ Direct service calls (no command system)
- ✅ Widget pooling optional (can create/dispose directly)
- ✅ Positioning logic from Chat Editing (reusable)

**Not Needed:**
- ❌ MenuWorkbenchToolBar (overkill for Phase 4)
- ❌ Observable-based reactivity (simple event-driven is fine)
- ❌ Complex widget pooling (can add later if needed)
- ❌ View zones for deleted content (Phase 4A is buttons only)

---

## J. Items Requiring outerHTML/CSS

After audit, the following UI components need outerHTML/CSS:

1. **VybeDiffHunkWidget:**
   - Widget container (floating button bar)
   - Accept button
   - Reject button
   - Hover/active states

2. **VybeFileCommandBar:**
   - Command bar container (top floating bar)
   - Keep button
   - Undo button
   - Review button
   - Show/hide transitions

---

**End of Audit Report**

