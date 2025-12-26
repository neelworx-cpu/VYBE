# Phase 4 CSS Placeholders

**Purpose:** Drop-in CSS placeholders for Phase 4 UI widgets based on outerHTML structure.

---

## VybeDiffHunkWidget (Phase 4A)

### Root Container
```css
.acceptRejectPartialEditOverlay {
colorrgba(20, 20, 20, 0.92)
displaynone
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
heightauto
left73px
line-height18.2px
overflow-wrapnormal
pointer-eventsnone
positionabsolute
text-size-adjust100%
text-wrap-modewrap
top21438px
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width611px
z-index11

}
```

### Outer Container
```css
.inline-diff-outer-container {
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
heightauto
line-height18.2px
margin-top0px
overflow-wrapnormal
pointer-eventsnone
positionrelative
text-size-adjust100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width100%
z-index999
}
```

### Hover Container (Button Bar)
```css
.inline-diff-hover-container {
border-top-left-radius4px
border-top-right-radius4px
colorrgba(20, 20, 20, 0.92)
column-gap2px
displayflex
flex-directionrow
floatright
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
heightauto
line-height18.2px
margin-right18px
margin-top2px
opacity1
overflow-wrapnormal
overflow-xhidden
overflow-yhidden
pointer-eventsall
row-gap2px
text-size-adjust100%
text-wrap-modewrap
transformnone
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto
z-index999
}
```

### Button Base Styles
```css
.hoverButton.partialHoverButton {
appearanceauto
background-colorrgb(252, 252, 252)
border-bottom-colorrgb(252, 252, 252)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgb(252, 252, 252)
border-left-stylenone
border-left-width0px
border-right-colorrgb(252, 252, 252)
border-right-stylenone
border-right-width0px
border-top-colorrgb(252, 252, 252)
border-top-left-radius4px
border-top-right-radius4px
border-top-stylenone
border-top-width0px
box-sizingborder-box
colorrgb(252, 252, 252)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size13.3333px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
heightauto
letter-spacingnormal
line-heightnormal
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
overflow-wrapnormal
padding-block-end2px
padding-block-start2px
padding-bottom2px
padding-inline-end6px
padding-inline-start6px
padding-left6px
padding-right6px
padding-top2px
pointer-eventsall
positionrelative
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-size-adjust100%
text-transformnone
text-wrap-modewrap
transition-behaviornormal, normal, normal
transition-delay0s, 0s, 0s
transition-duration0.1s, 0.1s, 0.1s
transition-propertyopacity, background-color, border-color
transition-timing-functionease-in-out, ease-in-out, ease-in-out
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto
word-spacing0px
z-index0
-webkit-border-imagenone
}
```

### Secondary Button (Undo/Reject)
```css
.hoverButton.partialHoverButton.secondary-button {
appearanceauto
background-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-bottom-colorrgba(0, 0, 0, 0)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgba(0, 0, 0, 0)
border-left-stylesolid
border-left-width1px
border-right-colorrgba(0, 0, 0, 0)
border-right-stylesolid
border-right-width1px
border-top-colorrgba(0, 0, 0, 0)
border-top-left-radius4px
border-top-right-radius4px
border-top-stylesolid
border-top-width1px
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size13.3333px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height20px
letter-spacingnormal
line-heightnormal
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
overflow-wrapnormal
padding-block-end2px
padding-block-start2px
padding-bottom2px
padding-inline-end6px
padding-inline-start6px
padding-left6px
padding-right6px
padding-top2px
pointer-eventsall
positionrelative
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-size-adjust100%
text-transformnone
text-wrap-modewrap
transition-behaviornormal, normal, normal
transition-delay0s, 0s, 0s
transition-duration0.1s, 0.1s, 0.1s
transition-propertyopacity, background-color, border-color
transition-timing-functionease-in-out, ease-in-out, ease-in-out
user-selectnone
visibilityvisible
white-space-collapsecollapse
width68.25px
word-spacing0px
z-index0
-webkit-border-imagenone
}
```

### Primary Button (Keep/Accept)
```css
.hoverButton.partialHoverButton:not(.secondary-button) {
ppearanceauto
background-colorrgb(252, 252, 252)
border-bottom-colorrgb(252, 252, 252)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgb(252, 252, 252)
border-left-stylenone
border-left-width0px
border-right-colorrgb(252, 252, 252)
border-right-stylenone
border-right-width0px
border-top-colorrgb(252, 252, 252)
border-top-left-radius4px
border-top-right-radius4px
border-top-stylenone
border-top-width0px
box-sizingborder-box
colorrgb(252, 252, 252)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size13.3333px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height20px
letter-spacingnormal
line-heightnormal
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
overflow-wrapnormal
padding-block-end2px
padding-block-start2px
padding-bottom2px
padding-inline-end6px
padding-inline-start6px
padding-left6px
padding-right6px
padding-top2px
pointer-eventsall
positionrelative
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-size-adjust100%
text-transformnone
text-wrap-modewrap
transition-behaviornormal, normal, normal
transition-delay0s, 0s, 0s
transition-duration0.1s, 0.1s, 0.1s
transition-propertyopacity, background-color, border-color
transition-timing-functionease-in-out, ease-in-out, ease-in-out
user-selectnone
visibilityvisible
white-space-collapsecollapse
width63.3672px
word-spacing0px
z-index0
-webkit-border-imagenone
}
```

### Keyboard Shortcut Text
```css
.keyboard-shortcut {
colorrgb(252, 252, 252)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size12px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height14px
letter-spacingnormal
line-heightnormal
opacity0.7
overflow-wrapnormal
pointer-eventsall
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width18.8906px
word-spacing0px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(2 glyphs)
}
```

### Button Content Span
```css
.hoverButton.partialHoverButton > span {
align-itemscenter
colorrgb(252, 252, 252)
column-gap4px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size12px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height14px
letter-spacingnormal
line-heightnormal
overflow-wrapnormal
pointer-eventsall
row-gap4px
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width51.3672px
word-spacing0px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(6 glyphs)
}
```

---

## VybeFileCommandBar (Phase 4B)

### Root Container
```css
.aiFullFilePromptBarWidget {
	bottom12px
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height40px
justify-contentcenter
line-height18.2px
opacity1
overflow-wrapnormal
pointer-eventsnone
positionabsolute
text-size-adjust100%
text-wrap-modewrap
transformmatrix(1, 0, 0, 1, 0, 0)
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertytransform
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width775px
z-index10
}
```

### Outer Wrapper (First Level - Flex Container)
```css
.aiFullFilePromptBarWidget > div {
align-itemscenter
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height40px
justify-contentcenter
line-height18.2px
opacity1
overflow-wrapnormal
pointer-eventsnone
positionrelative
text-size-adjust100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width775px
z-index2530
	/* width: 100%; display: flex; justify-content: center; align-items: center; box-sizing: border-box; position: relative; z-index: 2530; */
}
```

### Inner Wrapper (Second Level)
```css
.aiFullFilePromptBarWidget > div > div {
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height40px
line-height18.2px
overflow-wrapnormal
pointer-eventsnone
text-size-adjust100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width775px

	/* height: 100%; width: 100%; */
}
```

### Main Prompt Bar Container
```css
.pure-ai-prompt-bar {
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap6px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height34px
justify-contentcenter
line-height18.2px
margin-bottom6px
overflow-wrapnormal
pointer-eventsnone
row-gap6px
text-size-adjust100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width775px

}
```

### Inner Flex Container (Button Bar - First Container)
```css
.pure-ai-prompt-bar.flex.items-center.gap-\[40px\] {
align-itemscenter
background-colorrgb(243, 243, 243)
border-bottom-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-bottom-left-radius6px
border-bottom-right-radius6px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-left-stylesolid
border-left-width1px
border-right-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-right-stylesolid
border-right-width1px
border-top-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-top-left-radius6px
border-top-right-radius6px
border-top-stylesolid
border-top-width1px
box-shadowrgba(255, 255, 255, 0.05) 0px 0px 4px 0px inset, color(srgb 0.0784314 0.0784314 0.0784314 / 0.0729412) 0px 0px 3px 0px, color(srgb 0.0784314 0.0784314 0.0784314 / 0.0364706) 0px 16px 24px 0px
colorrgba(20, 20, 20, 0.92)
column-gap20px
displayflex
flex-directionrow
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
min-widthfit-content
overflow-wrapnormal
padding-bottom6px
padding-left6px
padding-right6px
padding-top6px
pointer-eventsauto
row-gap20px
text-size-adjust100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width270.438px
	/* Note: The gap-[40px] class uses Tailwind syntax, adjust selector as needed */
	/* display: flex; flex-direction: row; padding: 6px; border: 1px solid var(--cursor-stroke-secondary); box-shadow: var(--cursor-box-shadow-lg); background-color: var(--vscode-editorWidget-background); border-radius: 6px; align-items: center; justify-content: center; min-width: fit-content; pointer-events: auto; gap: 20px; */
}
```

### Navigation Controls Container (Diff Counter)
```css
.flex.items-center.gap-1.ml-0\.5.min-w-\[72px\] {
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap4px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
line-height18.2px
margin-left2px
min-width72px
opacity0.7
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
overflow-wrapnormal
pointer-eventsauto
row-gap4px
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width73.5312px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(5 glyphs)
	/* Note: Tailwind classes, adjust selector as needed */
	/* tabindex="0" style="outline: none;" */
}
```

### Icon Button Base
```css
.anysphere-icon-button {
align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-stylenone
border-left-stylenone
border-right-stylenone
border-top-stylenone
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
opacity0.7
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
overflow-wrapnormal
pointer-eventsauto
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width20px
	/* bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center opacity-40 */
}
```

### Icon Button with Background Transparent
```css
.anysphere-icon-button.bg-\[transparent\] {
	/* Drop computed styles here */
}
```

### Icon Button Content (Codicon)
```css
.anysphere-icon-button .codicon {
	/* Drop computed styles here */
}
```

### Chevron Up Icon
```css
.codicon.codicon-chevron-up {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-familycodicon
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size16px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height16px
line-height16px
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-decoration-colorrgba(20, 20, 20, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px
-webkit-font-smoothingantialiased
Rendered Fonts
Family name: codicon
PostScript name: codicon
Font origin: Network resource(1 glyph)
}
```

### Chevron Up Icon with Text Size
```css
.codicon.codicon-chevron-up.!text-\[16px\] {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-familycodicon
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size16px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height16px
line-height16px
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-decoration-colorrgba(20, 20, 20, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px
-webkit-font-smoothingantialiased
Rendered Fonts
Family name: codicon
PostScript name: codicon
Font origin: Network resource(1 glyph)
}
```

### Chevron Down Icon
```css
.codicon.codicon-chevron-down {
align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-stylenone
border-left-stylenone
border-right-stylenone
border-top-stylenone
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
opacity0.7
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
overflow-wrapnormal
pointer-eventsauto
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width20px
}
```

### Chevron Down Icon with Text Size
```css
.codicon.codicon-chevron-down.!text-\[16px\] {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-familycodicon
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size16px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height16px
line-height16px
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-decoration-colorrgba(20, 20, 20, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px
-webkit-font-smoothingantialiased
Rendered Fonts
Family name: codicon
PostScript name: codicon
Font origin: Network resource(1 glyph)
}
```

### Diff Counter Text
```css
.flex.items-center.gap-1 .opacity-60 {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-feature-settings"tnum"
font-size12px
font-variant-numerictabular-nums
forced-color-adjustnone
height18.2031px
line-height18.2px
opacity0.7
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-size-adjust100%
text-wrap-modenowrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width25.5312px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(5 glyphs)
	/* Navigation counter text (e.g., "1 / 1") */
	/* font-size: 12px; color: var(--vscode-foreground); cursor: pointer; font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; */
}
```

### Actions Container
```css
.diff-review-trailing-actions {
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap6px
displayflex
flex-basisauto
flex-grow0
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
line-height18.2px
opacity0.7
overflow-wrapnormal
pointer-eventsauto
row-gap6px
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width174.906px
}
```

### Primary Actions Container
```css
.diff-review-primary-actions {
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
line-height18.2px
opacity0.7
overflow-wrapnormal
pointer-eventsauto
row-gap8px
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width174.906px
}
```

### Outline Button (Undo All)
```css
.anysphere-outline-button {
align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-top-left-radius4px
border-top-right-radius4px
box-shadowcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588) 0px 0px 0px 1px inset
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
column-gap4px
cursorpointer
displayflex
flex-shrink0
flex-wrapnowrap
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
justify-contentcenter
line-height16px
min-height20px
overflow-wrapnormal
padding-bottom2px
padding-left4px
padding-right4px
padding-top2px
pointer-eventsauto
positionrelative
row-gap4px
text-size-adjust100%
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width89.3672px
	/* data-click-ready="true" class="flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0" */
}
```

### Outline Button with Click Ready
```css
.anysphere-outline-button[data-click-ready="true"] {
	/* Drop computed styles here */
}
```

### Primary Button (Keep All)
```css
.anysphere-button {
align-itemscenter
background-colorrgb(60, 124, 171)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-top-left-radius4px
border-top-right-radius4px
box-sizingborder-box
colorrgb(252, 252, 252)
column-gap4px
cursorpointer
displayflex
flex-shrink0
flex-wrapnowrap
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
justify-contentcenter
line-height16px
min-height20px
overflow-wrapnormal
padding-bottom2px
padding-left4px
padding-right4px
padding-top2px
pointer-eventsauto
positionrelative
row-gap4px
text-size-adjust100%
text-wrap-modenowrap
transition-behaviornormal
transition-delay0s
transition-duration0.1s
transition-propertybackground-color
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width77.5391px
	/* data-click-ready="true" class="flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0" */
}
```

### Primary Button with Click Ready
```css
.anysphere-button[data-click-ready="true"] {
	/* Drop computed styles here */
}
```

### Button Content Span (Inner Flex)
```css
.anysphere-button > span,
.anysphere-outline-button > span {
align-itemsbaseline
colorrgba(20, 20, 20, 0.92)
column-gap2px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
min-width0px
overflow-wrapnormal
overflow-xhidden
overflow-yhidden
pointer-eventsauto
row-gap2px
text-size-adjust100%
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width81.3672px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(11 glyphs)
	/* class="inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden" */
}
```

### Button Content Span with Inline Flex
```css
.anysphere-button > span.inline-flex,
.anysphere-outline-button > span.inline-flex {
	/* Drop computed styles here */
}
```

### Button Text (Truncate)
```css
.anysphere-button .truncate,
.anysphere-outline-button .truncate {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
overflow-wrapnormal
overflow-xhidden
overflow-yhidden
pointer-eventsauto
text-overflowellipsis
text-size-adjust100%
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width47.8438px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(8 glyphs)
}
```

### Keyboard Shortcut Text
```css
.keybinding-font-settings {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-feature-settings"cv05"
font-size10px
forced-color-adjustnone
height13px
line-height13px
margin-left2px
opacity0.5
overflow-wrapnormal
pointer-eventsauto
text-size-adjust100%
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width29.5234px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(3 glyphs)
	/* text-[10px] opacity-50 keybinding-font-settings shrink-0 */
}
```

### File Navigation Container (File Counter - Second Container)
```css
.aiFullFilePromptBarWidget > div > div > div > div:last-child {
align-itemscenter
background-colorrgb(243, 243, 243)
border-bottom-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-bottom-left-radius6px
border-bottom-right-radius6px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-left-stylesolid
border-left-width1px
border-right-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-right-stylesolid
border-right-width1px
border-top-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.110588)
border-top-left-radius6px
border-top-right-radius6px
border-top-stylesolid
border-top-width1px
box-shadowrgba(255, 255, 255, 0.05) 0px 0px 4px 0px inset, color(srgb 0.0784314 0.0784314 0.0784314 / 0.0729412) 0px 0px 3px 0px, color(srgb 0.0784314 0.0784314 0.0784314 / 0.0364706) 0px 16px 24px 0px
colorrgba(20, 20, 20, 0.92)
column-gap4px
displayflex
flex-directionrow
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
min-widthfit-content
overflow-wrapnormal
padding-bottom6px
padding-left6px
padding-right6px
padding-top6px
pointer-eventsauto
row-gap4px
text-size-adjust100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width100.391px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(11 glyphs)
	/* File navigation container (e.g., "3 / 5 files") */
	/* display: flex; flex-direction: row; padding: 6px; border: 1px solid var(--cursor-stroke-secondary); box-shadow: var(--cursor-box-shadow-lg); background-color: var(--vscode-editorWidget-background); border-radius: 6px; align-items: center; justify-content: center; min-width: fit-content; pointer-events: auto; gap: 4px; */
}
```

### File Navigation Icon Buttons
```css
.aiFullFilePromptBarWidget > div > div > div > div:last-child .anysphere-icon-button {
align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-stylenone
border-left-stylenone
border-right-stylenone
border-top-stylenone
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
opacity0.7
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
overflow-wrapnormal
pointer-eventsauto
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width20px
	/* Chevron left/right buttons */
}
```

### Chevron Left Icon
```css
.codicon.codicon-chevron-left {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-familycodicon
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size16px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height16px
line-height16px
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-decoration-colorrgba(20, 20, 20, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px
-webkit-font-smoothingantialiased
Rendered Fonts
Family name: codicon
PostScript name: codicon
Font origin: Network resource(1 glyph)
}
```

### Chevron Left Icon with Text Size
```css
.codicon.codicon-chevron-left.!text-\[16px\] {
	/* Drop computed styles here */
}
```

### Chevron Right Icon
```css
.codicon.codicon-chevron-right {
align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-stylenone
border-left-stylenone
border-right-stylenone
border-top-stylenone
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
opacity0.7
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
overflow-wrapnormal
pointer-eventsauto
text-size-adjust100%
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width20px
}
```

### Chevron Right Icon with Text Size
```css
.codicon.codicon-chevron-right.!text-\[16px\] {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-familycodicon
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size16px
font-size-adjustnone
font-stretch100%
font-stylenormal
font-variant-alternatesnormal
font-variant-capsnormal
font-variant-east-asiannormal
font-variant-emojinormal
font-variant-ligaturesnormal
font-variant-numericnormal
font-variant-positionnormal
font-variation-settingsnormal
font-weight400
forced-color-adjustnone
height16px
line-height16px
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-decoration-colorrgba(20, 20, 20, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-size-adjust100%
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px
-webkit-font-smoothingantialiased
Rendered Fonts
Family name: codicon
PostScript name: codicon
Font origin: Network resource(1 glyph)
}
```

### File Counter Text
```css
.aiFullFilePromptBarWidget > div > div > div > div:last-child .opacity-60 {
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-feature-settings"tnum"
font-size12px
font-variant-numerictabular-nums
forced-color-adjustnone
height18.2031px
line-height18.2px
opacity0.7
overflow-wrapnormal
pointer-eventsauto
text-aligncenter
text-size-adjust100%
text-wrap-modenowrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyopacity
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width52.3906px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(11 glyphs)
	/* File counter text (e.g., "3 / 5 files") */
	/* font-size: 12px; color: var(--vscode-foreground); cursor: pointer; font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; */
}
```

### Generic Opacity-60 Class
```css
.opacity-60 {
	/* Drop computed styles here */
	/* Used for counter text in both diff counter and file counter */
}
```

### Generic Opacity-40 Class
```css
.opacity-40 {
	/* Drop computed styles here */
	/* Used for icon buttons */
}
```

### Generic Opacity-50 Class
```css
.opacity-50 {
	/* Drop computed styles here */
	/* Used for keyboard shortcuts */
}
```

---

## Notes

- All styles should use CSS variables where possible (no hardcoded colors)
- Hover states can be added with `:hover` pseudo-class
- Active states can be added with `:active` pseudo-class
- Visibility/opacity transitions can be added for show/hide animations
- Some classes use Tailwind syntax (e.g., `gap-[40px]`, `ml-0.5`, `!text-[16px]`) - adjust selectors as needed for your CSS
- The file command bar appears at the bottom of the editor (`bottom: 12px`)
- Icon buttons have `opacity-40` class for reduced opacity
- Counter text uses `opacity-60` class
- Keyboard shortcuts use `opacity-50` class

---

## Usage

1. Copy computed styles from browser DevTools
2. Paste into corresponding CSS placeholder above
3. Replace hardcoded colors with CSS variables if needed
4. Add hover/active states as needed
5. Test in both light and dark themes
6. Adjust Tailwind class selectors to match your CSS naming convention
