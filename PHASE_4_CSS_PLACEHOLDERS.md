# Phase 4 CSS Placeholders

**Purpose:** Drop-in CSS placeholders for Phase 4 UI widgets based on outerHTML structure.

---

## VybeDiffHunkWidget (Phase 4A)

### Root Container
```css
.acceptRejectPartialEditOverlay {
	/* Drop computed styles here */
}
```

### Outer Container
```css
.inline-diff-outer-container {
	/* Drop computed styles here */
}
```

### Hover Container (Button Bar)
```css
.inline-diff-hover-container {
	/* Drop computed styles here */
}
```

### Button Base Styles
```css
.hoverButton.partialHoverButton {
	/* Drop computed styles here */
}
```

### Secondary Button (Undo/Reject)
```css
.hoverButton.partialHoverButton.secondary-button {
	/* Drop computed styles here */
}
```

### Primary Button (Keep/Accept)
```css
.hoverButton.partialHoverButton:not(.secondary-button) {
	/* Drop computed styles here */
}
```

### Keyboard Shortcut Text
```css
.keyboard-shortcut {
	/* Drop computed styles here */
}
```

### Button Content Span
```css
.hoverButton.partialHoverButton > span {
	/* Drop computed styles here */
}
```

---

## VybeFileCommandBar (Phase 4B)

### Root Container
```css
.aiFullFilePromptBarWidget {
	/* Drop computed styles here */
}
```

### Main Prompt Bar Container
```css
.pure-ai-prompt-bar {
	/* Drop computed styles here */
}
```

### Inner Flex Container (Button Bar)
```css
.pure-ai-prompt-bar.flex.items-center.gap-\[40px\] {
	/* Drop computed styles here */
	/* Note: The gap-[40px] class uses Tailwind syntax, adjust selector as needed */
}
```

### Navigation Controls Container (Diff Counter)
```css
.flex.items-center.gap-1.ml-0\.5.min-w-\[72px\] {
	/* Drop computed styles here */
	/* Note: Tailwind classes, adjust selector as needed */
}
```

### Icon Button Base
```css
.anysphere-icon-button {
	/* Drop computed styles here */
}
```

### Icon Button Content (Codicon)
```css
.anysphere-icon-button .codicon {
	/* Drop computed styles here */
}
```

### Diff Counter Text
```css
.flex.items-center.gap-1 .opacity-60 {
	/* Drop computed styles here */
	/* Navigation counter text (e.g., "1 / 1") */
}
```

### Actions Container
```css
.diff-review-trailing-actions {
	/* Drop computed styles here */
}
```

### Primary Actions Container
```css
.diff-review-primary-actions {
	/* Drop computed styles here */
}
```

### Outline Button (Undo All)
```css
.anysphere-outline-button {
	/* Drop computed styles here */
}
```

### Primary Button (Keep All)
```css
.anysphere-button {
	/* Drop computed styles here */
}
```

### Button Content Span
```css
.anysphere-button > span,
.anysphere-outline-button > span {
	/* Drop computed styles here */
}
```

### Button Text
```css
.anysphere-button .truncate,
.anysphere-outline-button .truncate {
	/* Drop computed styles here */
}
```

### Keyboard Shortcut Text
```css
.keybinding-font-settings {
	/* Drop computed styles here */
}
```

### File Navigation Container (File Counter)
```css
.aiFullFilePromptBarWidget > div > div > div > div:last-child {
	/* Drop computed styles here */
	/* File navigation container (e.g., "27 / 28 files") */
}
```

### File Counter Text
```css
.aiFullFilePromptBarWidget .opacity-60 {
	/* Drop computed styles here */
	/* File counter text */
}
```

---

## Notes

- All styles should use CSS variables where possible (no hardcoded colors)
- Hover states can be added with `:hover` pseudo-class
- Active states can be added with `:active` pseudo-class
- Visibility/opacity transitions can be added for show/hide animations
- Some classes use Tailwind syntax (e.g., `gap-[40px]`, `ml-0.5`) - adjust selectors as needed for your CSS
- The file command bar appears at the bottom of the editor (`bottom: 12px`)

---

## Usage

1. Copy computed styles from browser DevTools
2. Paste into corresponding CSS placeholder above
3. Replace hardcoded colors with CSS variables if needed
4. Add hover/active states as needed
5. Test in both light and dark themes
6. Adjust Tailwind class selectors to match your CSS naming convention

