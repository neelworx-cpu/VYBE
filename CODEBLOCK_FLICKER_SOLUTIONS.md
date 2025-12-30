# Code Block Flickering Solutions

## Problem
Every streaming update calls `renderMarkdown()`, which:
1. Clears all DOM nodes
2. Disposes all code blocks
3. Recreates everything from scratch
→ Causes flicker as code blocks are destroyed/recreated

## Possible Solutions

### Solution 1: RequestAnimationFrame Batching (Recommended)
**Approach**: Batch updates using `requestAnimationFrame` to align with browser repaints.

**Pros**:
- Smooth updates aligned with browser refresh rate
- Reduces unnecessary re-renders
- Simple to implement

**Cons**:
- Slight delay (one frame ~16ms)
- May feel slightly less "real-time"

**Implementation**:
```typescript
private pendingRender: string | null = null;
private rafId: number | null = null;

updateContent(newContent: IVybeChatMarkdownContent): void {
    this.targetContent = newContent.content;
    this.isStreaming = newContent.isStreaming ?? false;
    this.pendingRender = newContent.content;

    if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
            if (this.pendingRender !== null) {
                this.currentContent = this.pendingRender;
                this.renderMarkdown(this.currentContent);
                this.pendingRender = null;
            }
            this.rafId = null;
        });
    }
}
```

---

### Solution 2: Debounce Updates
**Approach**: Only re-render after a short delay (e.g., 50-100ms) when updates stop coming.

**Pros**:
- Reduces render frequency significantly
- Simple implementation

**Cons**:
- Noticeable delay during fast streaming
- May feel laggy

**Implementation**:
```typescript
private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

updateContent(newContent: IVybeChatMarkdownContent): void {
    this.targetContent = newContent.content;
    this.isStreaming = newContent.isStreaming ?? false;

    if (this.renderDebounceTimer) {
        clearTimeout(this.renderDebounceTimer);
    }

    this.renderDebounceTimer = setTimeout(() => {
        this.currentContent = this.targetContent;
        this.renderMarkdown(this.currentContent);
        this.renderDebounceTimer = null;
    }, 50); // 50ms debounce
}
```

---

### Solution 3: Preserve Code Blocks + Incremental Updates
**Approach**: Keep code blocks alive and only update their content, not recreate them.

**Pros**:
- Eliminates flicker completely
- Most performant

**Cons**:
- More complex implementation
- Need to track code block positions
- Need to handle code block additions/removals

**Implementation**:
- Track code blocks by index/position
- When markdown structure changes, detect which code blocks are new/removed
- Update existing code blocks via `updateContent()` instead of recreating
- Only create new code blocks when needed

---

### Solution 4: Throttle Updates (Hybrid)
**Approach**: Limit updates to max N per second (e.g., 10-20 updates/sec).

**Pros**:
- Balanced between smoothness and responsiveness
- Predictable performance

**Cons**:
- May drop some updates during very fast streaming
- Slight delay

---

### Solution 5: Smart Re-render Detection
**Approach**: Only re-render when markdown structure actually changes (new code blocks, etc.).

**Pros**:
- Most efficient
- No unnecessary re-renders

**Cons**:
- Complex to detect structure changes
- Need to parse markdown to detect code blocks

---

## Recommendation

**Start with Solution 1 (RequestAnimationFrame)** - it's simple, effective, and aligns with browser rendering. If flicker persists, combine with Solution 3 (preserve code blocks).


