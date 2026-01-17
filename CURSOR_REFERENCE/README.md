# Cursor Reference Files

Reference extracts from Cursor's compiled code for debugging VYBE chat UI.

## Source Files (DO NOT COMMIT)
- `workbench.desktop.main.js` - 1,404,650 lines
- `workbench.desktop.main.css` - 68,061 lines

## Extraction Files

| File | Purpose | Source Lines |
|------|---------|--------------|
| `cursor-animations.css` | Animation keyframes & styles | CSS: search for @keyframes |

## How to Extract

### In DevTools Console:
```javascript
// Extract specific JS lines (adjust range as needed)
const code = document.querySelector('script[src*="workbench.desktop.main"]');
// Or use Sources panel > right-click > Save as...
```

### Search Patterns for CSS:
- `@keyframes` - All animations
- `.tool-` - Tool-related styles
- `shine` - Shine/loading effects
- `streaming` - Streaming states
- `progress` - Progress indicators

## Key Sections to Look For

1. **Tool Call Rendering** - How Cursor renders tool calls
2. **Status Transitions** - How "Reading..." → "Read" works
3. **Streaming Animations** - Loading/progress animations
4. **Content Part Management** - How markdown/tool parts are ordered


