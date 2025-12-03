# VYBE Chat Spacing Inspection Test

## Instructions for Testing Agent

Please send a message in VYBE Chat, then run this command in the browser console:

```javascript
__vybeTestSpacing()
```

This will render a comprehensive test of all markdown elements so we can inspect the spacing.

## What to Inspect

After running the test, use browser DevTools (Inspect Element) to check the **orange margin boxes** around these elements:

### 1. **All Headings (H1-H6)**
- Inspect each heading level (H1, H2, H3, H4, H5, H6)
- Take screenshots showing the orange margin boxes above and below each heading
- Note the exact margin values (top and bottom)

### 2. **Paragraphs**
- Inspect regular paragraphs
- Check margins between consecutive paragraphs
- Screenshot the margin visualization

### 3. **Lists**
- Inspect unordered lists (bullet points)
- Inspect ordered lists (numbered)
- Check margins around list containers
- Check spacing between list items

### 4. **Code Blocks**
- Inspect inline code: `like this`
- Inspect code block fences:
```
like this
```
- Check margins around code blocks

### 5. **Tables**
- Inspect table margins
- Check spacing around table cells

### 6. **Blockquotes**
- Inspect blockquote margins
- Check the left border spacing

### 7. **Horizontal Rules**
- Inspect `<hr>` element margins
- Check spacing above and below

### 8. **Mixed Content Transitions**
- Inspect spacing between: paragraph → heading
- Inspect spacing between: heading → paragraph
- Inspect spacing between: list → paragraph
- Inspect spacing between: code block → paragraph

## How to Report

For each element type, provide:
1. **Screenshot** with orange margin boxes visible
2. **Computed margin values** (e.g., "margin-top: 8px, margin-bottom: 4px")
3. **Your assessment**: Is the spacing too large, too small, or just right?

## Current Goal

We want **minimal spacing** everywhere - content should feel tight and compact, not spread out. The orange margin boxes should be as small as possible while maintaining readability.

