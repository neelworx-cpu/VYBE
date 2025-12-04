# Terminal Tool Block - PENDING State Structure

## 1. Main Container

**Class:** `composer-tool-call-container composer-terminal-tool-call-block-container active composer-terminal-ping-border`

**Inline Styles:**
```
background: var(--vscode-editor-background);
border-radius: 8px;
border: 1px solid var(--vscode-commandCenter-inactiveBorder);
contain: paint;
padding: 6px 8px;
width: 100%;
box-sizing: border-box;
font-size: 12px;
margin: 6px 0px;
display: flex;
flex-direction: column;
gap: 4px;
```

**CSS:**
```css
animation-delay0s
animation-directionnormal
animation-duration2s
animation-fill-modenone
animation-iteration-countinfinite
animation-namecomposer-border-ping
animation-play-staterunning
animation-range-endnormal
animation-range-startnormal
animation-timelineauto
animation-timing-functioncubic-bezier(0, 0, 0.2, 1)
background-attachmentscroll
background-clipborder-box
background-colorrgb(255, 255, 255)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorrgba(139, 148, 158, 0.25)
border-bottom-left-radius8px
border-bottom-right-radius8px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgba(139, 148, 158, 0.25)
border-left-stylesolid
border-left-width1px
border-right-colorrgba(139, 148, 158, 0.25)
border-right-stylesolid
border-right-width1px
border-top-colorrgba(139, 148, 158, 0.25)
border-top-left-radius8px
border-top-right-radius8px
border-top-stylesolid
border-top-width1px
box-sizingborder-box
colorrgb(59, 59, 59)
column-gap6px
containpaint
container-typeinline-size
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height91px
line-height18.2px
margin-bottom6px
margin-left0px
margin-right0px
margin-top6px
outline-colorrgba(0, 95, 184, 0.482) opacity keeps changing here
outline-stylesolid
outline-width2px
overflow-xhidden
overflow-yhidden
padding-bottom6px
padding-left0px
padding-right0px
padding-top4px
positionrelative
row-gap6px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width583px
z-index2547
```

---

## 2. HEADER (Top Header)

**Class:** `composer-tool-call-top-header`

**Content:** "Run command: date"

**Inline Styles:**
```
display: flex;
justify-content: space-between;
```

**CSS:**
```css
border-bottom-colorcolor(srgb 0.231373 0.231373 0.231373 / 0.12)
border-bottom-stylesolid
border-bottom-width1px
colorrgb(59, 59, 59)
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size11px
forced-color-adjustnone
height20px
justify-contentspace-between
line-height18.2px
padding-bottom4px
padding-left8px
padding-right8px
padding-top0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px

```

### 2.1 Header Text (Left)

**HTML:**
```html
<div style="flex: 1 1 0%; min-width: 0px;">
  <div style="display: flex; gap: 6px; font-size: 12px; color: var(--cursor-text-secondary); padding-right: 4px; margin-top: 1px; margin-bottom: -1px;">
    <span>Run command: date</span>
  </div>
</div>
```

**CSS:**
```css
colorrgb(59, 59, 59)
displayblock
flex-basis0%
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size11px
forced-color-adjustnone
height20px
line-height18.2px
min-width0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width545px

colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
column-gap6px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
margin-bottom-1px
margin-top1px
padding-right4px
row-gap6px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width541px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(17 glyphs)

colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18.2031px
line-height18.2px
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width112.961px
```

### 2.2 Header Actions (Right)

**Buttons:** Copy, Menu

**HTML:**
```html
<div style="display: flex; gap: 2px; align-items: center; height: 20px;">
  <div class="anysphere-icon-button" style="width: 20px; height: 20px;">
    <span class="codicon codicon-copy"></span>
  </div>
  <div class="anysphere-icon-button" style="width: 20px; height: 20px;">
    <span class="codicon codicon-ellipsis"></span>
  </div>
</div>
```

**CSS:**
```css
align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-stylenone
border-left-stylenone
border-right-stylenone
border-top-stylenone
colorrgb(59, 59, 59)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size11px
forced-color-adjustnone
height20px
justify-contentcenter
line-height18.2px
opacity0.5
outline-colorrgb(59, 59, 59)
outline-stylenone
outline-width0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width20px
```

---

## 3. COMMAND LINE

**Class:** `composer-tool-call-header`

**Contains:** $ prefix + Monaco editor with command
align-itemscenter
colorrgb(59, 59, 59)
column-gap4px
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
min-width0px
positionrelative
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px
### 3.1 Wrapper

**Class:** `composer-tool-call-header-content`

**CSS:**
```css
align-itemsstart
colorrgb(59, 59, 59)
column-gap4px
displayflex
flex-basisauto
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
min-width0px
overflow-xhidden
overflow-yhidden
positionrelative
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width561px
```

### 3.2 Command Wrapper

**Class:** `composer-terminal-command-wrapper`

**CSS:**
```css
align-itemsflex-start
colorrgb(59, 59, 59)
column-gap6px
displayflex
flex-basisauto
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
max-width100%
min-height20px
min-width0px
row-gap6px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width561px

```

### 3.3 $ Prefix

**Class:** `terminal-command-prefix`

**Content:** `$`

**CSS:**
```css
align-itemsflex-start
colorrgb(59, 59, 59)
displayflex
flex-shrink0
font-familymonospace
font-size12px
forced-color-adjustnone
height20px
line-height20px
opacity0.95
padding-right8px
pointer-eventsnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width7.22656px
Rendered Fonts
Family name: Menlo
PostScript name: Menlo-Regular
Font origin: Local file(1 glyph)
```

### 3.4 Command Editor

**Class:** `simple-code-render show-only-on-hover-force composer-terminal-command-editor`

**Inline Styles:**
```
position: relative;
text-align: left;
width: 100%;
height: 18px;
```

**CSS:**
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
min-height20px
positionrelative
text-alignleft
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width561px

```

---

## 4. COMMAND OUTPUT

**Class:** `composer-tool-call-body non-compact`

**Note:** In pending state, output is collapsed (`height: 0px; overflow: hidden`)
colorrgb(59, 59, 59)
column-gap0px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height4px
line-height18.2px
row-gap0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px

### 4.1 Body Inner

**Class:** `composer-tool-call-body-inner`

**CSS:**
```css
box-sizingborder-box
colorrgb(59, 59, 59)
column-gap4px
displayflex
flex-basis0%
flex-directioncolumn
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height4px
line-height18.2px
min-height0px
min-width0px
positionrelative
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px
```

### 4.2 Body Content

**Class:** `composer-tool-call-body-content`

**CSS:**
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height0px
line-height18.2px
padding-top4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px

```

### 4.3 Scrollable Container

**Class:** `scrollable-div-container`

**CSS:**
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height0px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px
```

---

## 5. TERMINAL ACTIONS (Control Row)

**Class:** `composer-tool-call-control-row`

**CSS:**
```css
align-itemscenter
colorrgb(59, 59, 59)
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
justify-contentspace-between
line-height18.2px
padding-top4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width565px

```

### 5.1 Permission Dropdown (Left)

**Class:** `composer-tool-call-allowlist-controls-wide`

**Button Class:** `composer-tool-call-allowlist-button`

**Content:** "Ask Every Time" with chevron-down icon

**CSS:**
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width106.688px
```

### 5.2 Action Buttons (Right)

**Class:** `composer-tool-call-status-row`

**Buttons:** Skip, Run (with ⏎ keybinding)

**HTML:**
```html
<div class="composer-tool-call-status-row">
  <!-- Skip button -->
  <div style="display: inline-block;">
    <div class="anysphere-text-button composer-skip-button">
      <span>Skip</span>
    </div>
  </div>

  <!-- Run button -->
  <div>
    <div class="anysphere-button composer-run-button">
      <span>Run</span>
      <span class="keybinding-font-settings">⏎</span>
    </div>
  </div>
</div>
```

**CSS:**
```css
/* Skip button */
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width30.4531px

align-itemscenter
background-colorrgba(0, 0, 0, 0)
border-bottom-colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
border-left-stylenone
border-left-width0px
border-right-colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
border-right-stylenone
border-right-width0px
border-top-colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
border-top-left-radius4px
border-top-right-radius4px
border-top-stylenone
border-top-width0px
box-sizingborder-box
colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
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
opacity1
padding-left6px
padding-right0px
row-gap4px
text-wrap-modenowrap
transition-behaviornormal
transition-delay0s
transition-duration0.1s
transition-propertycolor
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width30.4531px

align-itemsbaseline
colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
column-gap2px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
min-width0px
overflow-xhidden
overflow-yhidden
row-gap2px
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width24.4531px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(4 glyphs)

colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width24.4531px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(4 glyphs)
/* Run button */
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height20px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width48.0703px

align-itemscenter
background-colorrgb(0, 95, 184)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-top-left-radius4px
border-top-right-radius4px
box-sizingborder-box
colorrgb(255, 255, 255)
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
padding-left6px
padding-right6px
positionrelative
row-gap4px
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
width48.0703px

align-itemsbaseline
colorrgb(255, 255, 255)
column-gap2px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
min-width0px
overflow-xhidden
overflow-yhidden
row-gap2px
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width36.0703px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(1 glyph)

colorrgb(255, 255, 255)
cursorpointer
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width21.8438px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(3 glyphs)



/* Keybinding hint */
colorrgb(255, 255, 255)
cursorpointer
displayblock
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-feature-settings"cv05"
font-size10px
forced-color-adjustnone
height13px
line-height13px
margin-bottom-2px
margin-left2px
margin-right0px
margin-top0px
opacity0.5
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width10.2266px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(1 glyph)
```

---

## State: PENDING

- Header text: "Run command:"
- Output: collapsed (height: 0)
- Control row: Permission dropdown + Skip/Run buttons
- Border: animated ping (`composer-terminal-ping-border`)

