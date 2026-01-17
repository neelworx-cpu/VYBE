# Cursor "Listed" Tool UI Reference

## Key Observations (from user)
- When "Listing" turns to "Listed", it has an **expand** feature
- Expand shows a couple of files inside
- "Listed" does NOT show the full path - only shows the **last item** in the path (folder name)

---

## 📋 COLLAPSED STATE - Element Hierarchy

### Level 1: Root Container
```html
<div
  tabindex="0"
  data-tool-call-id="tool_8371945d-d24f-49ac-8b52-4c8803d1af5"
  data-tool-status="completed"
  data-message-index="9"
  data-message-id="8d4c9ea2-24ea-4846-89eb-4b64efe9ad21"
  data-message-role="ai"
  data-message-kind="tool"
  class="relative composer-rendered-message hide-if-empty composer-message-blur composer-grouped-toolformer-message"
  id="bubble-4b64efe9ad21"
  style="display: block; outline: none; padding: 0px; background-color: var(--composer-pane-background); opacity: 1; z-index: 99;"
>
```
background-colorrgb(252, 252, 252)
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
opacity1
outline-colorrgba(20, 20, 20, 0.68)
outline-stylenone
outline-width0px
padding-bottom0px
padding-left0px
padding-right0px
padding-top0px
positionrelative
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px
z-index99

---

### Level 2: Transparent Background Wrapper
```html
<div class="" style="background-color: transparent;">
```
background-colorrgba(0, 0, 0, 0)
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px

---

### Level 3: Tool Former Message Container
```html
<div class="composer-tool-former-message" style="padding: 0px;">
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
margin-bottom0px
margin-top0px
padding-bottom0px
padding-left0px
padding-right0px
padding-top0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px

---

### Level 4: Empty Wrapper
```html
<div>
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
padding-bottom0px
padding-left0px
padding-right0px
padding-top0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 5: Collapsible Container
```html
<div
  class="collapsible-clean undefined"
  style="display: flex; flex-direction: column; gap: 2px; overflow-anchor: none;"
>
```
colorrgba(20, 20, 20, 0.68)
column-gap2px
cursordefault
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
margin-bottom0px
margin-top0px
overflow-anchornone
row-gap2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px

---

### Level 6: Header Row (Clickable)
```html
<div
  style="display: flex; flex-direction: row; align-items: center; gap: 4px; cursor: pointer; width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;"
>
```
align-itemscenter
box-sizingborder-box
colorrgba(20, 20, 20, 0.68)
column-gap4px
cursorpointer
displayflex
flex-directionrow
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
max-width100%
overflow-xhidden
overflow-yhidden
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px

---

### Level 7: Flex Gap Container
```html
<div style="display: flex; gap: 4px; overflow: hidden;">
```
colorrgba(20, 20, 20, 0.68)
column-gap4px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
overflow-xhidden
overflow-yhidden
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width164.164px


---

### Level 8: Header Text Container
```html
<div
  class="collapsible-header-text"
  style="flex: 0 1 auto; min-width: 0px; display: flex; align-items: center; overflow: hidden; gap: 4px; color: var(--cursor-text-tertiary); transition: opacity 0.1s ease-in; font-size: 12px;"
>
```
align-itemscenter
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.368627)
column-gap4px
cursorpointer
displayflex
flex-basisauto
flex-grow0
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
min-width0px
overflow-xhidden
overflow-yhidden
row-gap4px
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.1s
transition-propertyopacity
transition-timing-functionease-in
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width164.164px

---

### Level 9: Text Span Wrapper
```html
<span
  class=""
  style="flex: 0 1 auto; min-width: 0px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;"
>
```
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.368627)
cursorpointer
displayblock
flex-basisauto
flex-grow0
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
min-width0px
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width164.164px


---

### Level 10: Inner Flex Container
```html
<div style="display: flex; align-items: center; overflow: hidden;">
```
align-itemscenter
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.368627)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
overflow-xhidden
overflow-yhidden
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width164.164px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(22 glyphs)

---

### Level 11: "Listed" Verb Text
```html
<span
  style="color: var(--cursor-text-secondary); white-space: nowrap; flex-shrink: 0;"
>
  Listed
</span>
```
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.552941)
cursorpointer
displayblock
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width34.5px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(6 glyphs)

---

### Level 12: Path Text (Folder Name Only)
```html
<span
  style="color: var(--cursor-text-tertiary); margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0px;"
>
  CURSOR_REFERENCE
</span>
```
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.368627)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
margin-left4px
min-width0px
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.664px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(16 glyphs)

---

## 📂 EXPANDED STATE - Element Hierarchy

### Levels 1-12: Same as Collapsed State Above

---

### Level 13: Chevron Icon (ADDED IN EXPANDED STATE)
```html
<div
  class="codicon codicon-chevron-right !text-[18px] chevron-right"
  style="color: var(--vscode-foreground); line-height: 14px; width: 21px; height: auto; display: flex; justify-content: flex-start; align-items: center; transform-origin: 45% 55%; transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out, color 0.1s ease-in; flex-shrink: 0; cursor: pointer; --chevron-opacity: 0.6; transform: rotate(90deg); animation: 0.1s ease-in 0s 1 normal forwards running chevronFadeIn;"
>
</div>
```
align-itemscenter
animation-delay0s
animation-directionnormal
animation-duration0.1s
animation-fill-modeforwards
animation-iteration-count1
animation-namechevronFadeIn
animation-play-staterunning
animation-range-endnormal
animation-range-startnormal
animation-timelineauto
animation-timing-functionease-in
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
flex-shrink0
font-familycodicon
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size18px
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
justify-contentflex-start
line-height14px
text-aligncenter
text-decoration-colorrgba(20, 20, 20, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-transformnone
text-wrap-modewrap
transformmatrix(0, 1, -1, 0, 0, 0)
transform-origin9.45px 7.7px
transition-behaviornormal, normal, normal
transition-delay0s, 0s, 0s
transition-duration0.15s, 0.2s, 0.1s
transition-propertytransform, opacity, color
transition-timing-functionease-in-out, ease-in-out, ease-in
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width21px
-webkit-font-smoothingantialiased
Rendered Fonts
Family name: codicon
PostScript name: codicon
Font origin: Network resource(1 glyph)

---

### Level 14: Collapsible Children Container (ADDED IN EXPANDED STATE)
```html
<div
  class="collapsible-clean-children undefined"
  style="padding-left: 0px; overflow-anchor: none; margin-top: 4px; margin-bottom: 4px;"
>
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
margin-bottom4px
margin-top4px
overflow-anchornone
padding-bottom0px
padding-left0px
padding-right0px
padding-top0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px

---

### Level 15: Height Container
```html
<div style="height: 120px;">
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 16: Overflow Container
```html
<div style="height: 120px; overflow: hidden;">
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
overflow-xhidden
overflow-yhidden
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 17: Scrollable Container
```html
<div class="scrollable-div-container undefined   " style="height: 100%;">
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 18: Monaco Scrollable Element
```html
<div
  class="monaco-scrollable-element  mac"
  role="presentation"
  style="position: relative; overflow-y: hidden; width: 100%; height: unset;"
>
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
overflow-xhidden
overflow-yhidden
positionrelative
scrollbar-widthnone
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 19: Scrollable Content Wrapper
```html
<div style="width: 100%; overflow: hidden; height: 120px;">
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
overflow-xhidden
overflow-yhidden
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 20: Inline Block Container
```html
<div style="display: inline-block; width: 100%; min-height: 100%;">
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayinline-block
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height121.016px
line-height18.2px
min-height100%
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 21: Empty Wrapper
```html
<div>
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height121.016px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width404px


---

### Level 22: Context List Container
```html
<div
  class="context-list--new-conversation"
  style="flex-shrink: 0; border-radius: 0px; padding-right: 8px;"
>
```
border-bottom-left-radius0px
border-bottom-right-radius0px
border-top-left-radius0px
border-top-right-radius0px
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height121.016px
line-height18.2px
outline-colorrgba(20, 20, 20, 0.68)
outline-stylenone
outline-width0px
padding-right8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width396px

---

### Level 23: File Item (REPEATED FOR EACH FILE)
```html
<div
  class="context-list-item "
  role="button"
  tabindex="0"
>
```
align-itemscenter
border-bottom-left-radius6px
border-bottom-right-radius6px
border-top-left-radius6px
border-top-right-radius6px
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
overflow-xhidden
overflow-yhidden
padding-bottom3px
padding-left16px
padding-right0px
padding-top3px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width380px

---

### Level 24: File Icon Container
```html
<div class="show-file-icons" style="height: 14px;">
```
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height14px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width22px

---

### Level 25: Icon Wrapper
```html
<div
  style="position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;"
>
```
align-itemscenter
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height14px
justify-contentcenter
line-height18.2px
positionrelative
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width22px


---

### Level 26: Monaco Icon Label (File Icon)
```html
<div
  class="monaco-icon-label file-icon vybe-name-dir-icon cursor-animations.css-name-file-icon name-file-icon css-ext-file-icon ext-file-icon css-lang-file-icon height-override-important !pr-0"
  style="height: 100%;"
>
</div>
```
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height14px
line-height18.2px
overflow-xhidden
overflow-yhidden
padding-right0px
text-overflowellipsis
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width22px

---

### Level 27: File Content Container
```html
<div class="context-list-item-content">
```
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap4px
cursorpointer
displayflex
flex-grow1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
overflow-xhidden
overflow-yhidden
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width358px


---

### Level 28: File Title
```html
<span
  class="context-list-item-title"
  style="flex-shrink: 1;"
>
  <span class="monaco-highlighted-label ">
    cursor-animations.css
  </span>
</span>
```
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
max-width85%
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.141px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(21 glyphs)

colorrgba(20, 20, 20, 0.92)
cursorpointer
displayinline
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
heightauto
line-height18.2px
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(21 glyphs)

---

### Level 29: File Subtitle (Full Path)
```html
<span class="context-list-item-subtitle">
  <span style="direction: ltr; unicode-bidi: embed;">
    <span class="monaco-highlighted-label ">
      VYBE/CURSOR_REFERENCE
    </span>
  </span>
</span>
```
colorrgba(20, 20, 20, 0.92)
cursorpointer
directionrtl
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size10px
forced-color-adjustnone
height18.2031px
line-height18.2px
opacity0.8
overflow-xhidden
overflow-yhidden
text-alignright
text-overflowellipsis
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width136.047px

colorrgba(20, 20, 20, 0.92)
cursorpointer
directionltr
displayinline
font-family-apple-system, "system-ui", sans-serif
font-size10px
forced-color-adjustnone
heightauto
line-height18.2px
text-alignright
text-wrap-modenowrap
unicode-bidiembed
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(21 glyphs)

colorrgba(20, 20, 20, 0.92)
cursorpointer
directionltr
displayinline
font-family-apple-system, "system-ui", sans-serif
font-size10px
forced-color-adjustnone
heightauto
line-height18.2px
text-alignright
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(21 glyphs)
---

### Level 30: Horizontal Scrollbar (Hidden)
```html
<div
  role="presentation"
  aria-hidden="true"
  class="invisible scrollbar horizontal"
  style="position: absolute; width: 400px; height: 10px; left: 0px; bottom: 0px;"
>
  <div
    class="slider"
    style="position: absolute; top: 0px; left: 0px; height: 10px; transform: translate3d(0px, 0px, 0px); contain: strict; width: 400px;"
  >
  </div>
</div>
```
bottom0px
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height10px
left0px
line-height18.2px
opacity0
pointer-eventsnone
positionabsolute
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width400px

background-attachmentscroll
background-clipborder-box
background-colorrgba(20, 20, 20, 0.12)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgba(20, 20, 20, 0.68)
containstrict
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height10px
left0px
line-height18.2px
pointer-eventsnone
positionabsolute
text-wrap-modewrap
top0px
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width400px
---

### Level 31: Vertical Scrollbar (Hidden)
```html
<div
  role="presentation"
  aria-hidden="true"
  class="invisible scrollbar vertical fade"
  style="position: absolute; width: 4px; height: 120px; right: 0px; top: 0px;"
>
  <div
    class="slider"
    style="position: absolute; top: 1px; left: 0px; width: 4px; transform: translate3d(0px, 0px, 0px); contain: strict; height: 119px;"
  >
  </div>
</div>
```
colorrgba(20, 20, 20, 0.68)
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height120px
line-height18.2px
opacity0
pointer-eventsnone
positionabsolute
right0px
text-wrap-modewrap
top0px
transition-behaviornormal
transition-delay0s
transition-duration0.8s
transition-propertyopacity
transition-timing-functionlinear
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width4px

background-attachmentscroll
background-clipborder-box
background-colorrgba(20, 20, 20, 0.12)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgba(20, 20, 20, 0.68)
containstrict
cursordefault
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height119px
left0px
line-height18.2px
pointer-eventsnone
positionabsolute
text-wrap-modewrap
top0px
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width4px

---

## 🔍 Key Implementation Notes

### Expand/Collapse Behavior
- **Chevron**: Rotates 90deg when expanded (`transform: rotate(90deg)`)
- **Animation**: `chevronFadeIn` animation on expand
- **Children**: `collapsible-clean-children` div appears/disappears
- **Height**: Fixed 120px for file list container

### File List Structure
- Each file is a `context-list-item` with:
  - Icon (Monaco file icon with language/extension classes)
  - Title (filename)
  - Subtitle (full path)
- Scrollable container with max height 120px
- Uses Monaco's scrollable element component

### CSS Variables Used
- `--composer-pane-background`
- `--cursor-text-secondary` (for "Listed" verb)
- `--cursor-text-tertiary` (for path text)
- `--vscode-foreground` (for chevron)

### Path Display Logic
- **Header shows**: Only last folder name (`CURSOR_REFERENCE`)
- **File items show**: Full path in subtitle (`VYBE/CURSOR_REFERENCE`)
