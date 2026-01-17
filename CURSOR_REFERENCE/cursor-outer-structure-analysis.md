# Cursor Outer Structure Analysis

## Key Finding: Common Wrapper Pattern

**ALL four tool types (List, Search, Grep, Thoughts) share the EXACT same outer wrapper structure!**

This wrapper is **NOT** created by the individual content parts - it's added by the **message page/container** that wraps all content parts.

## Common Outer Structure (All 4 Types)

```html
<!-- Level 1: Outermost container -->
<div class="composer-message-group">

  <!-- Level 2: Padding wrapper (18px horizontal padding) -->
  <div style="padding: 0px 18px; opacity: 1;">

    <!-- Level 3: Conversation summary wrapper -->
    <div class="composer-message-group composer-new-convo-summary"
         style="padding: 0px 2px; cursor: pointer;">

      <!-- Level 4: Message bubble (the actual content part starts here) -->
      <div tabindex="0"
           data-tool-call-id="tool_..." (for tools) OR data-message-id="..." (for thoughts)
           data-tool-status="completed" (for tools only)
           data-message-index="..."
           data-message-id="..."
           data-message-role="ai"
           data-message-kind="tool" (for tools) OR "thinking" (for thoughts)
           class="relative composer-rendered-message hide-if-empty composer-message-blur composer-grouped-toolformer-message composer-summary-single-message"
           id="bubble-..."
           style="display: block; outline: none; padding: 0px; background-color: var(--composer-pane-background); opacity: 1; z-index: 99;">

        <!-- Level 5: Transparent wrapper -->
        <div class="" style="background-color: transparent;">

          <!-- Level 6: Tool/Think container (content part starts here) -->
          <!-- Tools: <div class="composer-tool-former-message" style="padding: 0px;"> -->
          <!-- Thoughts: <div class="markdown-jsx markdown-think" style="padding: 2px 0px;"> -->
```

## Naming Convention Analysis

### Class Names Pattern:
1. **`composer-message-group`** - Outer container (appears twice: outermost and inner)
2. **`composer-new-convo-summary`** - Conversation summary wrapper
3. **`composer-rendered-message`** - The actual message bubble
4. **`composer-message-blur`** - Blur effect class
5. **`composer-grouped-toolformer-message`** - Indicates grouped tool/thinking messages
6. **`composer-summary-single-message`** - Single message in summary view

### Data Attributes Pattern:
- **`data-tool-call-id`** - For tools (List, Search, Grep)
- **`data-message-id`** - For all (unique identifier)
- **`data-tool-status`** - For tools only ("completed")
- **`data-message-index`** - Message position in conversation
- **`data-message-role`** - Always "ai" for these
- **`data-message-kind`** - "tool" for tools, "thinking" for thoughts

### Style Pattern:
- **Level 2**: `padding: 0px 18px; opacity: 1;` - Horizontal padding
- **Level 3**: `padding: 0px 2px; cursor: pointer;` - Minimal padding, clickable
- **Level 4**: `display: block; outline: none; padding: 0px; background-color: var(--composer-pane-background); opacity: 1; z-index: 99;` - Message bubble styles
- **Level 5**: `background-color: transparent;` - Transparent wrapper

## Implications for VYBE

### What This Means:
1. **The outer wrapper is NOT created by content parts** - it's added by `messagePage.ts` or similar
2. **Content parts should only create from Level 6 onwards** (the tool/think container)
3. **The wrapper provides:**
   - Consistent spacing (18px horizontal padding)
   - Message grouping and styling
   - Data attributes for tracking
   - Blur effects and animations

### Current VYBE Implementation:
- Content parts are creating their own outer containers
- We need to check if `messagePage.ts` is adding this wrapper
- If not, we need to add it to match Cursor's structure

### Action Items:
1. Check `messagePage.ts` to see if it wraps content parts
2. If not, add the wrapper structure there
3. Update content parts to only create from Level 6 (tool/think container)
4. Ensure data attributes are set correctly

## Differences After Level 6:

### Tools (List, Search, Grep):
```html
<div class="composer-tool-former-message" style="padding: 0px;">
  <div>
    <div class="collapsible-clean undefined" ...>
      <!-- Header + Content -->
    </div>
  </div>
</div>
```

### Thoughts:
```html
<div class="markdown-jsx markdown-think" style="padding: 2px 0px;">
  <div class="collapsible-clean collapsible-thought" ...>
    <!-- Header + Content -->
  </div>
</div>
```

The only difference is:
- Tools use `composer-tool-former-message` with `padding: 0px`
- Thoughts use `markdown-jsx markdown-think` with `padding: 2px 0px`
- Thoughts have `collapsible-thought` class in addition to `collapsible-clean`
