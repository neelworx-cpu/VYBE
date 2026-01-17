# Cursor Notification HTML Structure Breakdown

This document breaks down the Cursor notification HTML structure as a tree, with CSS entry points for each element.

## HTML Tree Structure

```
notifications-toasts.visible
├── notification-toast-container
    ├── notification-toast.notification-fade-in-done
        ├── notifications-list-container
            ├── notification-offset-helper
            ├── monaco-list.list_id_3.mouse-support.selection-none
                ├── monaco-scrollable-element
                    ├── monaco-list-rows
                        ├── monaco-list-row
                            ├── notification-list-item.expanded
                                ├── notification-list-item-details-row
                                    ├── notification-list-item-source
                                    └── notification-list-item-buttons-container
                                        ├── monaco-button.secondary.monaco-text-button (Show Recommendations)
                                        └── monaco-button.monaco-text-button (Install)
                                └── notification-list-item-main-row
                                    ├── notification-list-item-icon.codicon.codicon-info-two
                                    ├── notification-list-item-message
                                        └── span
                                    └── notification-list-item-toolbar-container
                                        └── monaco-action-bar
                                            └── ul.actions-container
                                                ├── li.action-item
                                                    └── monaco-dropdown
                                                        └── dropdown-label
                                                            └── a.action-label.codicon.codicon-notifications-configure
                                                └── li.action-item
                                                    └── a.action-label.codicon.codicon-notifications-clear
                            └── monaco-progress-container.done
                                └── progress-bit
                    ├── scrollbar.horizontal.invisible
                        └── slider
                    ├── scrollbar.vertical.invisible
                        └── slider
                    ├── shadow
                    ├── shadow
                    └── shadow
                └── style (inline styles)
```

---

## CSS Entry Points

### 1. `.notifications-toasts.visible`

**Selector:** `.notifications-toasts.visible`

**Computed CSS:**
```css
bottom25px
colorrgba(228, 228, 228, 0.92)
displayflex
flex-directioncolumn
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height108px
left3px
line-height18.2px
overflow-xhidden
overflow-yhidden
positionabsolute
right882px
unicode-bidiisolate
user-selectnone
visibilityvisible
width351.99px
z-index1000


```

---

### 2. `.notification-toast-container`

**Selector:** `.notification-toast-container`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height108px
line-height18.2px
overflow-xhidden
overflow-yhidden
unicode-bidiisolate
user-selectnone
visibilityvisible
width351.99px
```

---

### 3. `.notification-toast.notification-fade-in-done`

**Selector:** `.notification-toast.notification-fade-in-done`

**Computed CSS:**
```css
backdrop-filterblur(40px)
background-attachmentscroll
background-clipborder-box
background-colorrgb(20, 20, 20)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorrgba(228, 228, 228, 0.92)
border-bottom-left-radius6px
border-bottom-right-radius6px
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgba(228, 228, 228, 0.92)
border-left-stylenone
border-left-width0px
border-right-colorrgba(228, 228, 228, 0.92)
border-right-stylenone
border-right-width0px
border-top-colorrgba(228, 228, 228, 0.92)
border-top-left-radius6px
border-top-right-radius6px
border-top-stylenone
border-top-width0px
box-shadowrgba(0, 0, 0, 0.4) 0px 0px 8px 2px
box-sizingborder-box
colorrgba(228, 228, 228, 0.92)
column-gap10px
displayflex
flex-directioncolumn
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
isolationisolate
line-height18.2px
margin-bottom6px
margin-left6px
margin-right6px
margin-top6px
opacity1
overflow-xhidden
overflow-yhidden
positionrelative
row-gap10px
transformnone
transition-behaviornormal
transition-delay0s
transition-duration0s
transition-propertynone
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
width339.99px
```

---

### 4. `.notifications-list-container`

**Selector:** `.notifications-list-container`

**Computed CSS:**
```css
ackground-attachmentscroll
background-clipborder-box
background-colorrgb(24, 24, 24)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-left-radius0px
border-bottom-right-radius0px
border-top-left-radius0px
border-top-right-radius0px
box-shadowrgba(0, 0, 0, 0.4) 0px 0px 8px 2px
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
line-height18.2px
outline-colorrgba(228, 228, 228, 0.92)
unicode-bidiisolate
user-selectnone
visibilityvisible
width339.99px
```

---

### 5. `.notification-offset-helper`

**Selector:** `.notification-offset-helper`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size12px
forced-color-adjustnone
height0px
line-height16px
opacity0
overflow-wrapbreak-word
positionabsolute
unicode-bidiisolate
user-selectnone
visibilityvisible
width249.99px
```

---

### 6. `.monaco-list.list_id_3.mouse-support.selection-none`

**Selector:** `.monaco-list.list_id_3.mouse-support.selection-none`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
line-height18.2px
positionrelative
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width339.99px
```

---

### 7. `.monaco-scrollable-element`

**Selector:** `.monaco-scrollable-element`

**Computed CSS:**
```css
border-bottom-left-radius6px
border-bottom-right-radius6px
border-top-left-radius6px
border-top-right-radius6px
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
line-height18.2px
overflow-xhidden
overflow-yhidden
positionrelative
scrollbar-widthnone
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width339.99px
```

---

### 8. `.monaco-list-rows`

**Selector:** `.monaco-list-rows`

**Computed CSS:**
```css
background-attachmentscroll
background-clipborder-box
background-colorrgba(0, 0, 0, 0)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgba(228, 228, 228, 0.92)
containstrict
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
left0px
line-height18.2px
overflow-xhidden
overflow-yhidden
positionrelative
text-wrap-modenowrap
top0px
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width339.99px
```

---

### 9. `.monaco-list-row`

**Selector:** `.monaco-list-row`

**Computed CSS:**
```css
border-bottom-left-radius6px
border-bottom-right-radius6px
border-top-left-radius6px
border-top-right-radius6px
box-sizingborder-box
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
line-height18.2px
overflow-xhidden
overflow-yhidden
positionabsolute
text-wrap-modenowrap
top0px
touch-actionnone
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width339.99px
-webkit-user-dragnone
```

---

### 10. `.notification-list-item.expanded`

**Selector:** `.notification-list-item.expanded`

**Computed CSS:**
```css
border-bottom-colorcolor(srgb 0.894118 0.894118 0.894118 / 0.0352941)
border-bottom-left-radius6px
border-bottom-right-radius6px
border-bottom-stylesolid
border-bottom-width0.96px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.894118 0.894118 0.894118 / 0.0352941)
border-left-stylesolid
border-left-width0.96px
border-right-colorcolor(srgb 0.894118 0.894118 0.894118 / 0.0352941)
border-right-stylesolid
border-right-width0.96px
border-top-colorcolor(srgb 0.894118 0.894118 0.894118 / 0.0352941)
border-top-left-radius6px
border-top-right-radius6px
border-top-stylesolid
border-top-width0.96px
box-sizingborder-box
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
flex-directioncolumn-reverse
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
justify-contentcenter
line-height18.2px
padding-bottom8px
padding-left8px
padding-right8px
padding-top8px
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width339.99px
```

---

### 11. `.notification-list-item-details-row`

**Selector:** `.notification-list-item-details-row`

**Computed CSS:**
```css
align-itemscenter
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height19.98px
line-height18.2px
overflow-xvisible
overflow-yvisible
padding-left4px
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width318.09px
```

---

### 12. `.notification-list-item-source`

**Selector:** `.notification-list-item-source`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
flex-basis0%
flex-grow1
flex-shrink1
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size11px
forced-color-adjustnone
height0px
line-height18.2px
opacity0.7
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width121.215px
```

---

### 13. `.notification-list-item-buttons-container`

**Selector:** `.notification-list-item-buttons-container`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height19.98px
line-height18.2px
overflow-xhidden
overflow-yhidden
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width196.875px
```

---

### 14. `.monaco-button.secondary.monaco-text-button` (Show Recommendations)

**Selector:** `.monaco-button.secondary.monaco-text-button`

**Computed CSS:**
```css
align-itemscenter
background-attachmentscroll
background-clipborder-box
background-colorrgb(98, 98, 98)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorrgba(228, 228, 228, 0.92)
border-bottom-left-radius3px
border-bottom-right-radius3px
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgba(228, 228, 228, 0.92)
border-left-stylenone
border-left-width0px
border-right-colorrgba(228, 228, 228, 0.92)
border-right-stylenone
border-right-width0px
border-top-colorrgba(228, 228, 228, 0.92)
border-top-left-radius3px
border-top-right-radius3px
border-top-stylenone
border-top-width0px
box-sizingborder-box
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size12px
font-weight500
forced-color-adjustnone
height19.98px
justify-contentcenter
line-height18px
margin-bottom0px
margin-left2px
margin-right2px
margin-top0px
outline-offset1.995px
overflow-xhidden
overflow-yhidden
padding-bottom1px
padding-left6px
padding-right6px
padding-top1px
text-aligncenter
text-decoration-colorrgba(228, 228, 228, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-overflowellipsis
text-wrap-modenowrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertybackground-color
transition-timing-functionease
user-selectnone
visibilityvisible
white-space-collapsecollapse
width146.34px
```

---

### 15. `.monaco-button.monaco-text-button` (Install)

**Selector:** `.monaco-button.monaco-text-button`

**Computed CSS:**
```css
align-itemscenter
background-attachmentscroll
background-clipborder-box
background-colorrgb(129, 161, 193)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorrgb(25, 28, 34)
border-bottom-left-radius3px
border-bottom-right-radius3px
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgb(25, 28, 34)
border-left-stylenone
border-left-width0px
border-right-colorrgb(25, 28, 34)
border-right-stylenone
border-right-width0px
border-top-colorrgb(25, 28, 34)
border-top-left-radius3px
border-top-right-radius3px
border-top-stylenone
border-top-width0px
box-sizingborder-box
colorrgb(25, 28, 34)
cursorpointer
displayblock
flex-shrink0
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size12px
font-weight500
forced-color-adjustnone
height19.98px
justify-contentcenter
line-height18px
margin-bottom0px
margin-left2px
margin-right0px
margin-top0px
outline-offset1.995px
overflow-xhidden
overflow-yhidden
padding-bottom1px
padding-left6px
padding-right6px
padding-top1px
text-aligncenter
text-decoration-colorrgb(25, 28, 34)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-overflowellipsis
text-wrap-modenowrap
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertybackground-color
transition-timing-functionease
user-selectnone
visibilityvisible
white-space-collapsecollapse
width44.55px
```

---

### 16. `.notification-list-item-main-row`

**Selector:** `.notification-list-item-main-row`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
column-gap6px
cursorpointer
displayflex
flex-grow1
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height58.11px
line-height18.2px
padding-left2px
row-gap6px
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width320.085px
```

---

### 17. `.notification-list-item-icon.codicon.codicon-info-two`

**Selector:** `.notification-list-item-icon.codicon.codicon-info-two`

**Computed CSS:**
```css
align-itemscenter
background-position-x50%
background-position-y50%
background-repeatno-repeat
colorrgb(55, 148, 255)
cursorpointer
displayflex
flex-basis14px
flex-grow0
flex-shrink0
font-familycodicon
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
height15.99px
justify-contentcenter
line-height12px
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
text-aligncenter
text-decoration-colorrgb(55, 148, 255)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-transformnone
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width13.995px
-webkit-font-smoothingantialiased
```

---

### 18. `.notification-list-item-message`

**Selector:** `.notification-list-item-message`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
flex-basis0%
flex-grow1
flex-shrink1
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size12px
forced-color-adjustnone
height58.11px
line-height16px
overflow-wrapbreak-word
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modewrap
unicode-bidiisolate
user-selecttext
visibilityvisible
white-space-collapsecollapse
width250.11px
```

---

### 19. `.notification-list-item-message span`

**Selector:** `.notification-list-item-message span`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayinline
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size12px
forced-color-adjustnone
heightauto
line-height16px
overflow-wrapbreak-word
text-wrap-modewrap
user-selecttext
visibilityvisible
white-space-collapsecollapse
widthauto
```

---

### 20. `.notification-list-item-toolbar-container`

**Selector:** `.notification-list-item-toolbar-container`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height15.99px
line-height18.2px
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width43.98px
```

---

### 21. `.monaco-action-bar`

**Selector:** `.monaco-action-bar`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height15.99px
line-height18.2px
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width43.98px

```

---

### 22. `.actions-container`

**Selector:** `.actions-container`

**Computed CSS:**
```css
align-itemscenter
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height15.99px
line-height18.2px
list-style-typedisc
margin-block-end0px
margin-block-start0px
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
padding-bottom0px
padding-inline-start0px
padding-left0px
padding-right0px
padding-top0px
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width43.98px
```

---

### 23. `.action-item`

**Selector:** `.action-item`

**Computed CSS:**
```css
align-itemscenter
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height18px
justify-contentcenter
line-height18.2px
list-style-typedisc
margin-left4px
margin-right0px
positionrelative
text-alignleft
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width18px
```

---

### 24. `.monaco-dropdown`

**Selector:** `.monaco-dropdown`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height18px
line-height18.2px
list-style-typedisc
padding-bottom0px
padding-left0px
padding-right0px
padding-top0px
text-alignleft
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width18px
```

---

### 25. `.dropdown-label`

**Selector:** `.dropdown-label`

**Computed CSS:**
```css
align-itemscenter
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height18px
justify-contentcenter
line-height18.2px
list-style-typedisc
text-alignleft
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width18px
```

---

### 26. `.action-label.codicon.codicon-notifications-configure`

**Selector:** `.action-label.codicon.codicon-notifications-configure`

**Computed CSS:**
```css
align-itemscenter
border-bottom-left-radius5px
border-bottom-right-radius5px
border-top-left-radius5px
border-top-right-radius5px
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
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
height12px
line-height16px
list-style-typedisc
padding-bottom3px
padding-left3px
padding-right3px
padding-top3px
text-aligncenter
text-decoration-colorrgba(228, 228, 228, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-transformnone
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width12px
-webkit-font-smoothingantialiased
```

---

### 27. `.action-label.codicon.codicon-notifications-clear`

**Selector:** `.action-label.codicon.codicon-notifications-clear`

**Computed CSS:**
```css
align-itemscenter
border-bottom-left-radius5px
border-bottom-right-radius5px
border-top-left-radius5px
border-top-right-radius5px
colorrgba(228, 228, 228, 0.92)
cursorpointer
displayflex
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
height12px
line-height16px
list-style-typedisc
padding-bottom3px
padding-left3px
padding-right3px
padding-top3px
text-aligncenter
text-decoration-colorrgba(228, 228, 228, 0.92)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
text-transformnone
text-wrap-modenowrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width12px
-webkit-font-smoothingantialiased
```

---

### 28. `.monaco-progress-container.done`

**Selector:** `.monaco-progress-container.done`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
cursorpointer
displaynone
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height2px
line-height18.2px
overflow-xhidden
overflow-yhidden
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width100%
```

---

### 29. `.progress-bit`

**Selector:** `.progress-bit`

**Computed CSS:**
```css
background-colorrgb(63, 162, 102)
bottom0px
colorrgba(228, 228, 228, 0.92)
cursorpointer
displaynone
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height2px
left0px
line-height18.2px
opacity1
positionabsolute
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width100%
```

---

### 30. `.scrollbar.horizontal.invisible`

**Selector:** `.scrollbar.horizontal.invisible`

**Computed CSS:**
```css
bottom0px
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height9.99px
left0px
line-height18.2px
opacity0
pointer-eventsnone
positionabsolute
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width0px
```

---

### 31. `.scrollbar.horizontal.invisible .slider`

**Selector:** `.scrollbar.horizontal.invisible .slider`

**Computed CSS:**
```css
background-attachmentscroll
background-clipborder-box
background-colorrgba(228, 228, 228, 0.07)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgba(228, 228, 228, 0.92)
containstrict
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height9.99px
left0px
line-height18.2px
pointer-eventsnone
positionabsolute
text-wrap-modenowrap
top0px
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width0px
```

---

### 32. `.scrollbar.vertical.invisible`

**Selector:** `.scrollbar.vertical.invisible`

**Computed CSS:**
```css
colorrgba(228, 228, 228, 0.92)
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
line-height18.2px
opacity0
pointer-eventsnone
positionabsolute
right0px
text-wrap-modenowrap
top0px
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width0px
z-index14
```

---

### 33. `.scrollbar.vertical.invisible .slider`

**Selector:** `.scrollbar.vertical.invisible .slider`

**Computed CSS:**
```css
background-attachmentscroll
background-clipborder-box
background-colorrgba(228, 228, 228, 0.07)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgba(228, 228, 228, 0.92)
containstrict
displayblock
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
height96px
left0px
line-height18.2px
pointer-eventsnone
positionabsolute
text-wrap-modenowrap
top0px
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width9.99px
```

---

### 34. `.shadow`

**Selector:** `.shadow`

**Computed CSS:**
```css
box-shadowrgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px
colorrgba(228, 228, 228, 0.92)
displaynone
font-family"Segoe WPC", "Segoe UI", sans-serif
font-size13px
forced-color-adjustnone
heightauto
line-height18.2px
positionabsolute
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto

```

---

## Notes

- All selectors are based on the Cursor notification HTML structure
- Each element has a dedicated CSS entry point for computed styles
- The structure follows the exact hierarchy from the provided HTML
- Inline styles from the HTML are not included in the selectors (they should be captured in computed styles)

