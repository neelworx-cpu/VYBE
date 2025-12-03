# Panel Design Implementation Analysis

## Problem Summary

You want to implement:
1. **4px rounded corners** on panels
2. **4px vertical gap** between panels (when stacked vertically)
3. **4px horizontal gap** between editor and terminal (when panel is at bottom)

Previous issue: Panels would shift up by 4px when terminal was closed and a message was sent in AI panel.

## Root Cause Analysis

### VS Code Panel Structure

1. **Panel Container**: `.part.panel > .content` contains the panel content
2. **PaneView System**: Uses `SplitView` (`.monaco-pane-view`) to stack panes vertically
3. **Individual Panes**: Each pane has `.pane > .pane-body` structure
4. **Layout System**: The `Layout` class in `layout.ts` calculates sizes based on container dimensions

### Why the 4px Shift Happened

The shift occurred because:
1. **Gaps were conditionally applied** - When gaps (margins/padding) were only applied when panels were visible, the layout system didn't account for them
2. **SplitView size calculations** - The `SplitView` component calculates view sizes based on container dimensions. If gaps are added via margins/padding AFTER size calculations, it causes layout shifts
3. **Terminal visibility affecting layout** - When terminal closed, the gap calculation changed, causing the shift

## Safe Implementation Strategy

### 1. Rounded Corners (4px border-radius)

**Location**: Apply to `.pane > .pane-body` elements

**Implementation**:
- Use `border-radius: 4px` on `.pane-body` elements
- This is purely visual and doesn't affect layout calculations
- **Safe**: No layout impact

**Files to modify**:
- `src/vs/base/browser/ui/splitview/paneview.css` - Add border-radius to `.pane > .pane-body`

### 2. Vertical Gap Between Panes (4px)

**Location**: Between `.split-view-view` elements in `.monaco-pane-view`

**Critical Considerations**:
- The `SplitView` component uses absolute positioning for `.split-view-view` elements
- Gaps must be accounted for in the layout calculations, OR
- Use a wrapper approach with consistent spacing

**Two Approaches**:

#### Approach A: Margin on Split-View Views (Risky)
```css
.monaco-pane-view.vertical .split-view-view:not(:first-child) {
  margin-top: 4px;
}
```
**Problem**: This can cause layout shifts if not accounted for in size calculations.

#### Approach B: Padding on Container + Negative Margin (Safer)
```css
.monaco-pane-view.vertical {
  padding-top: 2px;
  padding-bottom: 2px;
}
.monaco-pane-view.vertical .split-view-view:first-child {
  margin-top: 2px;
}
.monaco-pane-view.vertical .split-view-view:not(:first-child) {
  margin-top: 4px;
}
```
**Better**: But still needs testing.

#### Approach C: Gap Property (Modern, but needs container changes)
Use CSS `gap` property, but requires changing the container to use flexbox/grid instead of absolute positioning.

**Recommended**: Approach B with careful testing, OR modify the SplitView component to account for gaps in its size calculations.

### 3. Horizontal Gap Between Editor and Panel (4px)

**Location**: Between editor area and panel when panel is at bottom

**Implementation Options**:

#### Option 1: Padding on Panel Container
```css
.monaco-workbench .part.panel.bottom {
  padding-top: 4px;
}
```
**Issue**: This reduces the panel's available height, which might cause issues.

#### Option 2: Margin on Panel Container
```css
.monaco-workbench .part.panel.bottom {
  margin-top: 4px;
}
```
**Issue**: The layout system calculates panel size, and margin might not be accounted for.

#### Option 3: Modify Layout Calculations (Safest)
Modify `layout.ts` to account for the gap when calculating editor/panel sizes:
- In `arrangeMiddleSectionNodes()`, subtract 4px from available height when panel is horizontal
- This ensures the layout system knows about the gap

**Recommended**: Option 3 - modify the layout calculations to explicitly account for the gap.

## Implementation Plan

### Phase 1: Rounded Corners (Low Risk)
1. Add `border-radius: 4px` to `.pane > .pane-body` in `paneview.css`
2. Test with multiple panels open
3. Verify no layout shifts

### Phase 2: Vertical Gaps (Medium Risk)
1. Implement Approach B (padding + margin)
2. **Critical**: Test with:
   - Terminal open/closed
   - Multiple panels stacked
   - AI panel sending messages
   - Panel resizing
3. Monitor for any 4px shifts
4. If shifts occur, modify `SplitView` size calculations

### Phase 3: Horizontal Gap (High Risk)
1. **First**: Modify `layout.ts` to account for 4px gap in calculations
2. Then add visual gap via CSS
3. Test extensively:
   - Panel open/closed
   - Panel maximized/restored
   - Terminal open/closed
   - AI panel interactions
   - Window resizing

## Key Files to Modify

1. **CSS Files**:
   - `src/vs/base/browser/ui/splitview/paneview.css` - Pane styling
   - `src/vs/workbench/browser/parts/panel/media/panelpart.css` - Panel container styling

2. **TypeScript Files** (if modifying layout calculations):
   - `src/vs/workbench/browser/layout.ts` - Layout size calculations
   - `src/vs/base/browser/ui/splitview/splitview.ts` - SplitView size calculations (if needed)

## Testing Checklist

- [ ] Terminal open, AI panel sends message - no shift
- [ ] Terminal closed, AI panel sends message - no shift
- [ ] Multiple panels stacked - gaps visible
- [ ] Panel resized - gaps maintained
- [ ] Panel maximized/restored - no layout issues
- [ ] Window resized - layout stable
- [ ] Panel opened/closed - smooth transitions
- [ ] Different panel positions (bottom, right, left, top) - gaps work correctly

## Critical Success Factors

1. **Consistency**: Gaps must be applied consistently, regardless of panel visibility
2. **Layout Awareness**: The layout system must account for gaps in size calculations
3. **Testing**: Extensive testing with AI panel + terminal combinations
4. **Incremental**: Implement one feature at a time, test thoroughly before moving on

## Alternative: Wrapper Approach

If the above approaches cause issues, consider:
- Wrapping each pane in a container div
- Applying gaps to wrapper containers
- Ensuring wrappers are part of layout calculations

This is more invasive but might be more stable.


