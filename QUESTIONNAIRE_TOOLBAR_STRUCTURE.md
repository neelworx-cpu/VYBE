# Questionnaire Toolbar Structure

This document breaks down the HTML structure of the AI question-asking toolbar component that attaches to the top of the composer (similar to the expanded files edited toolbar).

## Overview

The questionnaire toolbar is a component that appears in **plan mode** when the AI needs to ask the user questions to clarify requirements or gather information. It uses the same container structure and outer border placement as the **files edited toolbar**, but is configured specifically for displaying questions with multiple choice options.

### Key Characteristics

1. **Always Expanded**: Unlike the files edited toolbar which can collapse/expand, the questionnaire toolbar is always in expanded state (no collapse functionality)
2. **Appearance**: Only appears when in plan mode and the AI needs to ask questions
3. **Dynamic Content**: Can display 1 to many questions, each with 2-4 options (minimum 2, maximum 4)
4. **Same Container Structure**: Uses identical outer container positioning and border styling as files edited toolbar
5. **Questions Replace Files**: The scrollable content area shows questions instead of file list items

### Comparison to Files Edited Toolbar

| Feature | Files Edited Toolbar | Questionnaire Toolbar |
|---------|---------------------|---------------------|
| Container Structure | ✅ Same | ✅ Same |
| Outer Border Placement | ✅ Same | ✅ Same |
| Header Section | Chevron + File count | Icon + "Questions" + Stepper |
| Expand/Collapse | ✅ Yes | ❌ No (always expanded) |
| Content Area | File list (scrollable) | Questions list (scrollable) |
| Action Buttons | Keep All, Undo All, Review | Skip, Continue |
| Height | Dynamic (based on files) | Fixed 200px scroll container |
| Stepper Navigation | ❌ No | ✅ Yes (1 of 3, 2 of 3, etc.) |

### Structure Hierarchy

```
Root Container (position: absolute, bottom: 0)
└── Outer Wrapper (position: relative, height: 0, z-index: 10)
    └── Absolute Wrapper (position: absolute, bottom: 100%, padding: 0px 9px)
        └── Main Toolbar Section (#composer-toolbar-section)
            ├── Questionnaire Toolbar Container
            │   ├── Header (Icon + Title + Stepper)
            │   └── Scroll Container (200px height)
            │       └── Questions List
            │           └── Question Items (1-many)
            │               ├── Question Label (Number + Text)
            │               └── Options Container
            │                   └── Option Items (2-4 per question)
            │                       ├── Option Letter Button (A, B, C, D)
            │                       └── Option Label Text
            └── Actions Container
                ├── Skip Button
                └── Continue Button
```

### Visual Reference

The toolbar appears attached to the top of the composer input area, with the same width and border styling as the files edited toolbar. The image shows:
- Header with question icon, "Questions" title, and stepper showing "1 of 3"
- Multiple questions displayed in a scrollable area (200px height)
- Each question has numbered label and 2-4 multiple choice options (A, B, C)
- Selected options are highlighted in orange/gold color
- Action buttons at the bottom: "Skip" (gray) and "Continue" (orange/gold with keybinding)

### Implementation Notes

1. **Positioning**: Uses the same positioning strategy as files edited toolbar:
   - Outer container: `position: relative; height: 0px; z-index: 10;`
   - Absolute wrapper: `position: absolute; bottom: 100%; left: 0px; right: 0px; padding: 0px 9px;`
   - This positions the toolbar above the composer input area

2. **Border Styling**: Matches files edited toolbar exactly:
   - `border-top-left-radius: 8px`
   - `border-top-right-radius: 8px`
   - `border-top`, `border-left`, `border-right`: 1px solid (theme-aware)
   - `border-bottom: none`
   - Background: `var(--composer-pane-background)`

3. **Scroll Container**: Fixed height of 200px with Monaco scrollable element for smooth scrolling

4. **Question States**:
   - `composer-questionnaire-toolbar-question-animate-in`: Animation class for question appearance
   - `composer-questionnaire-toolbar-question-active`: Marks the currently active/focused question

5. **Option States**:
   - Selected: `composer-questionnaire-toolbar-option-letter-selected` and `composer-questionnaire-toolbar-option-label-selected`
   - Unselected (when other options selected): `composer-questionnaire-toolbar-option-unselected-with-selections`

6. **Stepper Navigation**: Allows users to navigate between questions (previous/next) and shows current position (e.g., "1 of 3")

7. **Dynamic Content**: The toolbar must handle:
   - 1 to many questions (no upper limit, but typically 1-5)
   - 2 to 4 options per question (minimum 2, maximum 4)
   - Variable question text lengths
   - Variable option text lengths

---

## Root Container

**Element**: `div` (position: absolute, bottom: 0, left: 0, right: 0)

**Computed CSS**:
```css
bottom0px
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height276.5px
left0px
line-height18.2px
padding-bottom0px
padding-left9px
padding-right9px
padding-top0px
pointer-eventsauto
positionabsolute
right0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width483px
```

---

## Main Toolbar Section

**Element**: `div#composer-toolbar-section.composer-toolbar-section.hide-if-empty.has-pending-questionnaire`

**Computed CSS**:
```css
background-attachmentscroll
background-clipborder-box
background-colorrgb(248, 248, 248)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorcolor(srgb 0.74902 0.533333 0.0117647 / 0.2448)
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.74902 0.533333 0.0117647 / 0.2448)
border-left-stylesolid
border-left-width1px
border-right-colorcolor(srgb 0.74902 0.533333 0.0117647 / 0.2448)
border-right-stylesolid
border-right-width1px
border-top-colorcolor(srgb 0.74902 0.533333 0.0117647 / 0.2448)
border-top-left-radius8px
border-top-right-radius8px
border-top-stylesolid
border-top-width1px
colorrgb(59, 59, 59)
column-gap0px
displayflex
filternone
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height275.5px
line-height18.2px
opacity1
pointer-eventsauto
positionrelative
row-gap0px
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.3s
transition-propertyfilter
transition-timing-functionease-out
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width481px
```

**Children**:
1. `div.composer-questionnaire-toolbar` (toolbar content)
2. `div.composer-questionnaire-toolbar-actions` (action buttons)

---

## Questionnaire Toolbar Container

**Element**: `div.composer-questionnaire-toolbar`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
column-gap12px
container-typeinline-size
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height263.5px
line-height18.2px
padding-bottom6px
padding-left6px
padding-right6px
padding-top6px
pointer-eventsauto
row-gap12px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px
```

**Children**:
1. `div.composer-questionnaire-toolbar-header` (header with icon, title, stepper)
2. `div.composer-questionnaire-toolbar-scroll-container` (scrollable questions area)

---

## Toolbar Header

**Element**: `div.composer-questionnaire-toolbar-header`

**Computed CSS**:
```css
align-itemscenter
colorrgb(59, 59, 59)
column-gap8px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height19.5px
line-height19.5px
margin-left4px
pointer-eventsauto
positionrelative
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width465px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(9 glyphs)
```

**Children**:
1. `span.codicon.codicon-chat-question.composer-questionnaire-toolbar-icon` (question icon)
2. `span.composer-questionnaire-toolbar-title` (title text: "Questions")
3. `div.composer-questionnaire-toolbar-stepper` (stepper controls)

---

## Question Icon

**Element**: `span.codicon.codicon-chat-question.composer-questionnaire-toolbar-icon`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
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
margin-top2px
opacity0.7
pointer-eventsauto
text-aligncenter
text-decoration-colorrgb(59, 59, 59)
text-decoration-linenone
text-decoration-stylesolid
text-decoration-thicknessauto
text-renderingauto
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
```

---

## Toolbar Title

**Element**: `span.composer-questionnaire-toolbar-title`

**Text Content**: "Questions"

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height19.5px
line-height19.5px
pointer-eventsauto
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width61.1094px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(9 glyphs)
```

---

## Stepper Container

**Element**: `div.composer-questionnaire-toolbar-stepper`

**Computed CSS**:
```css
align-itemscenter
colorrgb(59, 59, 59)
column-gap4px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height19.5px
line-height19.5px
margin-left296.578px
margin-right2px
pointer-eventsauto
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width73.3125px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(6 glyphs)
```

**Children**:
1. `div.anysphere-icon-button` (chevron-up button)
2. `span.composer-questionnaire-toolbar-stepper-label` (label: "1 of 3")
3. `div.anysphere-icon-button` (chevron-down button)

---

## Stepper Up Button

**Element**: `div.anysphere-icon-button` (first one - chevron up)

**Computed CSS**:
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
font-size13px
forced-color-adjustnone
height16px
justify-contentcenter
line-height19.5px
opacity0.5
outline-colorrgb(59, 59, 59)
outline-stylenone
outline-width0px
pointer-eventsauto
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px

```

**Children**:
- `span.codicon.codicon-chevron-up.composer-questionnaire-toolbar-stepper-icon`

---

## Stepper Label

**Element**: `span.composer-questionnaire-toolbar-stepper-label`

**Text Content**: "1 of 3"

**Computed CSS**:
```css
colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-variant-numerictabular-nums
forced-color-adjustnone
height19.5px
line-height19.5px
pointer-eventsauto
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width33.3125px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(6 glyphs)
```

---

## Stepper Down Button

**Element**: `div.anysphere-icon-button` (second one - chevron down)

**Computed CSS**:
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
font-size13px
forced-color-adjustnone
height16px
justify-contentcenter
line-height19.5px
opacity0.5
outline-colorrgb(59, 59, 59)
outline-stylenone
outline-width0px
pointer-eventsauto
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width16px

```

**Children**:
- `span.codicon.codicon-chevron-down.composer-questionnaire-toolbar-stepper-icon`

---

## Scroll Container

**Element**: `div.composer-questionnaire-toolbar-scroll-container`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayblock
flex-basisauto
flex-grow0
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height200px
line-height18.2px
mask-imagelinear-gradient(rgb(0, 0, 0) calc(100% - 16px), rgba(0, 0, 0, 0.8) calc(100% - 14px), rgba(0, 0, 0, 0.4) calc(100% - 8px), rgba(0, 0, 0, 0))
pointer-eventsauto
positionrelative
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

```

**Children**:
1. `div` (height: 200px, overflow: hidden)
   - Contains the scrollable content area

---

## Scrollable Content Wrapper

**Element**: `div` (height: 200px, overflow: hidden)

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height200px
line-height18.2px
overflow-xhidden
overflow-yhidden
pointer-eventsauto
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

```

**Children**:
1. `div.scrollable-div-container`
   - Contains monaco-scrollable-element

---

## Monaco Scrollable Element

**Element**: `div.monaco-scrollable-element.mac`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height200px
line-height18.2px
overflow-xvisible
overflow-yvisible
pointer-eventsauto
positionrelative
scrollbar-widthnone
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

```

**Children**:
1. `div` (flex container with gap: 12px, height: 200px)
   - Contains questions
2. Scrollbars (horizontal, vertical)
3. Shadow divs

---

## Questions Container

**Element**: `div.composer-questionnaire-toolbar-questions`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
column-gap12px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height485.734px
line-height18.2px
pointer-eventsauto
row-gap12px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

```

**Children**:
- Multiple `div.composer-questionnaire-toolbar-question` items (one per question)

---

## Individual Question

**Element**: `div.composer-questionnaire-toolbar-question.composer-questionnaire-toolbar-question-animate-in.composer-questionnaire-toolbar-question-active`

**Classes**:
- `composer-questionnaire-toolbar-question-animate-in` (animation class)
- `composer-questionnaire-toolbar-question-active` (active question indicator)

**Computed CSS**:
```css
animation-delay0s
animation-directionnormal
animation-duration0.3s
animation-fill-modeforwards
animation-iteration-count1
animation-namefadeInSlideUp
animation-play-staterunning
animation-range-endnormal
animation-range-startnormal
animation-timelineauto
animation-timing-functionease-out
colorrgb(59, 59, 59)
column-gap2px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height139.641px
line-height18.2px
margin-left4px
opacity1
pointer-eventsauto
row-gap2px
text-wrap-modewrap
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width465px
will-changeopacity, transform
```

**Children**:
1. `label.composer-questionnaire-toolbar-question-label` (question text)
2. `div.composer-questionnaire-toolbar-options` (answer options)

---

## Question Label

**Element**: `label.composer-questionnaire-toolbar-question-label`

**Computed CSS**:
```css
align-itemsflex-start
colorrgb(59, 59, 59)
column-gap8px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
font-weight590
forced-color-adjustnone
height52.6406px
line-height17.55px
margin-left6px
pointer-eventsauto
row-gap8px
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.1s
transition-propertycolor
transition-timing-functionease-out
user-selectnone
visibilityvisible
white-space-collapsecollapse
width459px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght24E0000
Font origin: Local file(178 glyphs)
```

**Children**:
1. `div.composer-questionnaire-toolbar-question-number` (question number: "1.")
2. Question text (direct text node)

---

## Question Number

**Element**: `div.composer-questionnaire-toolbar-question-number`

**Text Content**: "1." (or "2.", "3.", etc.)

**Computed CSS**:
```css
colorrgb(59, 59, 59)
cursorpointer
displayblock
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size13px
font-weight590
forced-color-adjustnone
height17.5469px
line-height17.55px
min-width12px
pointer-eventsauto
text-alignleft
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.1s
transition-propertycolor
transition-timing-functionease-out
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width12px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght24E0000
Font origin: Local file(2 glyphs)
```

---

## Options Container

**Element**: `div.composer-questionnaire-toolbar-options`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height81px
line-height18.2px
margin-left-4px
margin-top4px
overflow-xhidden
overflow-yhidden
pointer-eventsauto
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

```

**Children**:
- Multiple `div.composer-questionnaire-toolbar-option` items (one per option)

---

## Individual Option

**Element**: `div.composer-questionnaire-toolbar-option` (with various state classes)

**State Classes**:
- `composer-questionnaire-toolbar-option-unselected-with-selections` (unselected when other options are selected)
- (no class) = selected option

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height81px
line-height18.2px
margin-left-4px
margin-top4px
overflow-xhidden
overflow-yhidden
pointer-eventsauto
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

align-itemsflex-start
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
colorrgb(59, 59, 59)
column-gap8px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height19px
line-height18.2px
overflow-xhidden
overflow-yhidden
padding-bottom3px
padding-left4px
padding-right4px
padding-top3px
pointer-eventsauto
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width459px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(37 glyphs)
```

**Children**:
1. `button.composer-questionnaire-toolbar-option-letter` (option letter: "A", "B", "C")
2. `span.composer-questionnaire-toolbar-option-label` (option text)

---

## Option Letter Button

**Element**: `button.composer-questionnaire-toolbar-option-letter`

**State Classes**:
- `composer-questionnaire-toolbar-option-letter-selected` (when option is selected)

**Text Content**: "A", "B", "C", etc.

**Computed CSS**:
```css
align-itemscenter
appearanceauto
background-attachmentscroll
background-clipborder-box
background-colorrgba(0, 0, 0, 0)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorrgb(229, 229, 229)
border-bottom-left-radius3px
border-bottom-right-radius3px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgb(229, 229, 229)
border-left-stylesolid
border-left-width1px
border-right-colorrgb(229, 229, 229)
border-right-stylesolid
border-right-width1px
border-top-colorrgb(229, 229, 229)
border-top-left-radius3px
border-top-right-radius3px
border-top-stylesolid
border-top-width1px
box-sizingborder-box
colorrgb(59, 59, 59)
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-feature-settingsnormal
font-kerningauto
font-optical-sizingauto
font-size10px
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
font-weight700
forced-color-adjustnone
height19px
justify-contentcenter
letter-spacingnormal
line-height10px
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
min-width19px
padding-block-end1px
padding-block-start1px
padding-bottom1px
padding-inline-end1px
padding-inline-start1px
padding-left1px
padding-right1px
padding-top1px
pointer-eventsauto
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width19px
word-spacing0px
-webkit-border-imagenone
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght2BC0000
Font origin: Local file(1 glyph)
```

---

## Option Label

**Element**: `span.composer-questionnaire-toolbar-option-label`

**State Classes**:
- `composer-questionnaire-toolbar-option-label-selected` (when option is selected)

**Text Content**: Option description text

**Computed CSS**:
```css
colorcolor(srgb 0.231373 0.231373 0.231373 / 0.6)
cursorpointer
displayblock
flex-basis0%
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height18.2031px
line-height18.2px
pointer-eventsauto
text-wrap-modewrap
transition-behaviornormal
transition-delay0s
transition-duration0.1s
transition-propertycolor
transition-timing-functionease-out
user-selectnone
visibilityvisible
white-space-collapsecollapse
width432px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(37 glyphs)
```

---

## Scrollbars

**Element**: `div.scrollbar` (horizontal and vertical)

**Classes**:
- `horizontal` or `vertical`
- `invisible` (when not needed)
- `fade` (for vertical scrollbar)

**Computed CSS**:
```css
colorrgb(59, 59, 59)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height200px
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
width10px

```

**Children**:
- `div.slider` (scrollbar thumb)
background-attachmentscroll
background-clipborder-box
background-colorrgba(100, 100, 100, 0.4)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgb(59, 59, 59)
containstrict
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height82px
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
width10px
---

## Shadow Elements

**Element**: `div.shadow` (multiple instances)

**Computed CSS**:
```css
box-shadowrgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px
colorrgb(59, 59, 59)
displaynone
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
heightauto
line-height18.2px
pointer-eventsauto
positionabsolute
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
widthauto

```

---

## Toolbar Actions

**Element**: `div.composer-questionnaire-toolbar-actions`

**Computed CSS**:
```css
colorrgb(59, 59, 59)
column-gap8px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height20px
justify-contentflex-end
line-height18.2px
pointer-eventsauto
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width469px

```

**Children**:
1. `div.composer-skip-button` (Skip button)
2. `div.composer-run-button` (Continue button)

---

## Skip Button

**Element**: `div.composer-skip-button` (with classes: `flex`, `flex-nowrap`, `items-center`, `justify-center`, `gap-[4px]`, `px-[6px]`, `rounded`, `cursor-pointer`, `whitespace-nowrap`, `shrink-0`, `anysphere-text-button`)

**Computed CSS**:
```css
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
pointer-eventsauto
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
```

**Children**:
- `span` (with "Skip" text)

---

## Continue Button

**Element**: `div.composer-run-button` (with classes: `flex`, `flex-nowrap`, `items-center`, `justify-center`, `gap-[4px]`, `px-[6px]`, `rounded`, `cursor-pointer`, `whitespace-nowrap`, `shrink-0`, `anysphere-button`)

**Attributes**:
- `data-disabled="false"`
- `data-click-ready="true"`

**Computed CSS**:
```css
align-itemscenter
background-colorrgb(191, 136, 3)
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
pointer-eventsauto
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
width77.0938px
```

**Children**:
- `span` (with "Continue" text and keybinding "⏎")

---

## Notes

### Positioning and Attachment
- The toolbar attaches to the **top** of the composer input area (not bottom)
- Uses `position: absolute; bottom: 100%` to position above the composer
- Same width as composer input area (minus 9px padding on each side)
- Same border placement and styling as the expanded files edited toolbar

### Content Structure
- Questions replace where files edited show in the files edited toolbar
- The scroll container has a fixed height of 200px
- Questions can be animated in with `composer-questionnaire-toolbar-question-animate-in`
- Active question is marked with `composer-questionnaire-toolbar-question-active`
- Options can be selected/unselected with corresponding classes
- Stepper allows navigation between questions (1 of 3, 2 of 3, etc.)

### Behavior
- **Always expanded**: No collapse functionality (unlike files edited toolbar)
- **Plan mode only**: Only appears when in plan mode and AI needs to ask questions
- **Dynamic questions**: Supports 1 to many questions
- **Dynamic options**: Each question can have 2-4 options (minimum 2, maximum 4)
- **Selection state**: Only one option can be selected per question
- **Stepper navigation**: Users can navigate between questions using up/down chevrons

### Styling
- Uses theme-aware colors (matches composer background and borders)
- Selected options use orange/gold highlight color
- Unselected options use default text color with reduced opacity
- Action buttons: Skip (text button style) and Continue (primary button style with keybinding)

Outerhtml
//
<div style="display: flex; flex-direction: column; align-items: stretch; justify-content: center; position: relative; margin: 0px 10px 10px;">
   <div style="position: relative; height: 0px; z-index: 10;">
      <div style="position: absolute; bottom: 0px; left: 0px; right: 0px; padding: 0px 9px; visibility: visible; pointer-events: auto;">
         <div id="composer-toolbar-section" class="hide-if-empty has-pending-questionnaire " style="background: var(--composer-pane-background); border-top-color: ; border-top-style: ; border-top-width: ; border-right-color: ; border-right-style: ; border-right-width: ; border-bottom: none; border-left-color: ; border-left-style: ; border-left-width: ; border-image-source: ; border-image-slice: ; border-image-width: ; border-image-outset: ; border-image-repeat: ; border-top-left-radius: 8px; border-top-right-radius: 8px; opacity: 1; pointer-events: auto; position: relative; display: flex; flex-direction: column; height: auto; gap: 0px; transition: filter 0.3s ease-out; filter: none;">
            <div class="composer-questionnaire-toolbar">
               <div class="composer-questionnaire-toolbar-header">
                  <span class="codicon codicon-chat-question composer-questionnaire-toolbar-icon"></span><span class="composer-questionnaire-toolbar-title">Questions</span>
                  <div class="composer-questionnaire-toolbar-stepper">
                     <div class="anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center  " style="width: 16px; height: 16px;"><span class="codicon codicon-chevron-up !text-[16px] composer-questionnaire-toolbar-stepper-icon "></span></div>
                     <span class="composer-questionnaire-toolbar-stepper-label">1 of 3</span>
                     <div class="anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center  " style="width: 16px; height: 16px;"><span class="codicon codicon-chevron-down !text-[16px] composer-questionnaire-toolbar-stepper-icon "></span></div>
                  </div>
               </div>
               <div class="composer-questionnaire-toolbar-scroll-container">
                  <div style="height: 200px; overflow: hidden;">
                     <div class="scrollable-div-container undefined   " style="height: 100%;">
                        <div class="monaco-scrollable-element  mac" role="presentation" style="position: relative; overflow-y: hidden; width: 100%; height: unset;">
                           <div style="width: 100%; display: flex; flex-direction: column; gap: 12px; overflow: hidden; height: 200px;">
                              <div style="display: inline-block; min-height: unset; width: 100%;">
                                 <div class="composer-questionnaire-toolbar-questions">
                                    <div class="composer-questionnaire-toolbar-question composer-questionnaire-toolbar-question-animate-in composer-questionnaire-toolbar-question-active">
                                       <label class="composer-questionnaire-toolbar-question-label">
                                          <div class="composer-questionnaire-toolbar-question-number">1.</div>
                                          What is the scope of this integration? Should I implement all components (repo_id, sessions, event streaming, panel envelopes, approval workflow) or focus on specific ones first?
                                       </label>
                                       <div class="composer-questionnaire-toolbar-options">
                                          <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-unselected-with-selections" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">A</button><span class="composer-questionnaire-toolbar-option-label">All components - complete integration</span></div>
                                          <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-unselected-with-selections" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">B</button><span class="composer-questionnaire-toolbar-option-label">Core only - repo_id, sessions, basic envelope rendering</span></div>
                                          <div class="composer-questionnaire-toolbar-option" role="button"><button class="composer-questionnaire-toolbar-option-letter composer-questionnaire-toolbar-option-letter-selected" type="button">C</button><span class="composer-questionnaire-toolbar-option-label composer-questionnaire-toolbar-option-label-selected">Let me specify priorities</span></div>
                                       </div>
                                    </div>
                                    <div class="composer-questionnaire-toolbar-question composer-questionnaire-toolbar-question-animate-in">
                                       <label class="composer-questionnaire-toolbar-question-label">
                                          <div class="composer-questionnaire-toolbar-question-number">2.</div>
                                          Do you have Supabase configured and ready? This affects which tools will work (cloud plane tools require Supabase).
                                       </label>
                                       <div class="composer-questionnaire-toolbar-options">
                                          <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-unselected-with-selections" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">A</button><span class="composer-questionnaire-toolbar-option-label">Yes, Supabase is configured</span></div>
                                          <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-unselected-with-selections" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">B</button><span class="composer-questionnaire-toolbar-option-label">No, focus on local tools only for now</span></div>
                                          <div class="composer-questionnaire-toolbar-option" role="button"><button class="composer-questionnaire-toolbar-option-letter composer-questionnaire-toolbar-option-letter-selected" type="button">C</button><span class="composer-questionnaire-toolbar-option-label composer-questionnaire-toolbar-option-label-selected">Will configure later, but include Supabase features</span></div>
                                       </div>
                                    </div>
                                    <div class="composer-questionnaire-toolbar-question composer-questionnaire-toolbar-question-animate-in">
                                       <label class="composer-questionnaire-toolbar-question-label">
                                          <div class="composer-questionnaire-toolbar-question-number">3.</div>
                                          How should patch approval work? Should patches require explicit approval or auto-apply?
                                       </label>
                                       <div class="composer-questionnaire-toolbar-options">
                                          <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-unselected-with-selections" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">A</button><span class="composer-questionnaire-toolbar-option-label">Explicit approval required (show UI, user clicks approve)</span></div>
                                          <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-unselected-with-selections" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">B</button><span class="composer-questionnaire-toolbar-option-label">Auto-apply patches (no approval UI needed)</span></div>
                                          <div class="composer-questionnaire-toolbar-option" role="button"><button class="composer-questionnaire-toolbar-option-letter composer-questionnaire-toolbar-option-letter-selected" type="button">C</button><span class="composer-questionnaire-toolbar-option-label composer-questionnaire-toolbar-option-label-selected">Configurable via settings (default: require approval)</span></div>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                           <div role="presentation" aria-hidden="true" class="invisible scrollbar horizontal" style="position: absolute; width: 459px; height: 10px; left: 0px; bottom: 0px;">
                              <div class="slider" style="position: absolute; top: 0px; left: 0px; height: 10px; transform: translate3d(0px, 0px, 0px); contain: strict; width: 459px;"></div>
                           </div>
                           <div role="presentation" aria-hidden="true" class="invisible scrollbar vertical fade" style="position: absolute; width: 10px; height: 200px; right: 0px; top: 0px;">
                              <div class="slider" style="position: absolute; top: 0px; left: 0px; width: 10px; transform: translate3d(0px, 0px, 0px); contain: strict; height: 82px;"></div>
                           </div>
                           <div class="shadow"></div>
                           <div class="shadow"></div>
                           <div class="shadow"></div>
                        </div>
                     </div>
                  </div>
               </div>
               <div class="composer-questionnaire-toolbar-actions">
                  <div data-click-ready="true" class="flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-text-button   composer-skip-button" style="font-size: 12px; line-height: 16px; box-sizing: border-box; min-height: 20px; padding-right: 0px;"><span class="inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden"><span class="truncate">Skip</span></span></div>
                  <div data-disabled="false" data-click-ready="true" class="flex flex-nowrap items-center justify-center gap-[4px] px-[6px] rounded cursor-pointer whitespace-nowrap shrink-0 anysphere-button   composer-run-button" style="font-size: 12px; line-height: 16px; box-sizing: border-box; min-height: 20px;"><span class="inline-flex items-baseline gap-[2px] min-w-0 overflow-hidden"><span class="truncate"><span>Continue</span></span><span class="text-[10px] opacity-50 keybinding-font-settings shrink-0">⏎</span></span></div>
               </div>
            </div>
         </div>
      </div>
   </div>
   <div class="composer-input-blur-wrapper " style="position: relative; border-radius: 6px;">
      <div class="ai-input-full-input-box full-input-box " style="--ai-input-full-input-box-border: 1px solid var(--cursor-stroke-primary); --ai-input-full-input-box-margin: 10px; contain: unset; background: color-mix(in srgb, var(--vscode-input-background) 90%, transparent); transition: box-shadow 100ms ease-in-out, border-color 100ms ease-in-out; position: relative; z-index: 1; margin: 0px; border: 1px solid var(--cursor-stroke-primary); opacity: 1; pointer-events: auto;">
         <div style="display: flex; flex-direction: column; align-items: stretch; gap: 0px; flex: unset; width: unset;">
            <div style="position: relative; padding-top: 0px; cursor: text; gap: 0px; flex: unset;">
               <div class="scrollable-div-container smooth-height   " style="height: 20px; min-height: 20px; width: 100%; max-height: 240px; transition: none; will-change: height;">
                  <div class="monaco-scrollable-element  mac" role="presentation" style="position: relative; overflow-y: hidden; width: 100%; height: unset;">
                     <div style="width: 100%; display: block; overflow: hidden; height: 20px;">
                        <div style="display: inline-block; width: 100%; min-height: 100%;">
                           <div style="width: 100%; overflow: visible; height: 100%; min-height: 20px; max-height: none;">
                              <div class="aislash-editor-grid" style="display: grid; position: relative; grid-template-columns: 1fr 1fr; width: 200%;">
                                 <div autocapitalize="off" class="aislash-editor-input" contenteditable="true" spellcheck="false" data-lexical-editor="true" role="textbox" style="resize: none; grid-area: 1 / 1 / 1 / 1; overflow: hidden; line-height: 1.5; font-family: inherit; font-size: 13px; color: var(--vscode-input-foreground); background-color: transparent; display: block; outline: none; scrollbar-width: none; box-sizing: border-box; border: none; overflow-wrap: break-word; word-break: break-word; padding: 0px; user-select: text; white-space: pre-wrap;">
                                    <p><br></p>
                                 </div>
                                 <div style="grid-area: 1 / 2 / 1 / 2;">
                                    <div class="aislash-editor-placeholder" style="position: relative; top: 0px; left: -100%; padding: 0px; pointer-events: none; user-select: none; line-height: 1.5; font-size: 13px; color: var(--vscode-input-placeholderForeground); opacity: 0.5;">Steer the plan, or add more details</div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div role="presentation" aria-hidden="true" class="invisible scrollbar horizontal" style="position: absolute; width: 473px; height: 10px; left: 0px; bottom: 0px;">
                        <div class="slider" style="position: absolute; top: 0px; left: 0px; height: 10px; transform: translate3d(0px, 0px, 0px); contain: strict; width: 473px;"></div>
                     </div>
                     <div role="presentation" aria-hidden="true" class="invisible scrollbar vertical" style="position: absolute; width: 10px; height: 20px; right: 0px; top: 0px;">
                        <div class="slider" style="position: absolute; top: 0px; left: 0px; width: 10px; transform: translate3d(0px, 0px, 0px); contain: strict; height: 20px;"></div>
                     </div>
                  </div>
               </div>
               <div class="ai-input-full-input-box-bottom-container" style="--ai-input-full-input-box-bottom-container-transition: none;">
                  <div style="flex: 1 0 0%; width: 100%; height: 100%; display: flex; align-items: center; flex-direction: column; margin-top: calc(1px + 0.5rem); gap: 4px; cursor: auto;">
                     <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.25rem; flex-shrink: 0; cursor: auto; width: 100%;">
                        <div class="composer-bar-input-buttons" data-mode="plan" style="display: grid; grid-template-columns: 4fr 1fr; align-items: center; height: 28px; box-sizing: border-box; flex: 1 1 0%; justify-content: space-between;">
                           <div class="flex gap-1" style="align-items: center; margin-right: 6px; flex-shrink: 1; flex-grow: 0; min-width: 0px; height: 20px;">
                              <div class="flex gap-1 items-center relative" style="min-width: 0px; max-width: 100%;">
                                 <div id="fe0b1b8e250a341bba68df15c61ad5698fd772eac7e4446b7a1bfd33d45d0f93eunifieddropdown" class="composer-unified-dropdown !border-none !rounded-full " data-mode="plan" style="display: flex; gap: 2px; font-size: 12px; align-items: center; line-height: 24px; min-width: 0px; max-width: 100%; padding: 2px 4px 2px 8px; border-radius: 24px; flex-shrink: 0; cursor: pointer;">
                                    <div style="display: flex; align-items: center; gap: 4px; min-width: 0px; max-width: 100%; overflow: hidden;">
                                       <div class="codicon codicon-todos" style="font-size: 16px; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; opacity: 0.5;"></div>
                                       <div style="min-width: 0px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 0px; height: 16px; font-weight: 400;"><span style="opacity: 0.8; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0px;">Plan</span></div>
                                    </div>
                                    <div class="codicon codicon-chevron-down" style="font-size: 14px; flex-shrink: 0; opacity: 0.5;"></div>
                                 </div>
                                 <div class="composer-unified-dropdown-model !border-none !px-1 !rounded-[8px]" id="fe0b1b8e250a341bba68df15c61ad56982e0515d8098044428693f2859ab30d31unifiedmodeldropdown" style="display: flex; gap: 2px; font-size: 12px; align-items: center; line-height: 12px; cursor: pointer; min-width: 0px; max-width: 100%; padding: 2px 6px; border-radius: 23px; border: none; background: transparent; flex-shrink: 1; overflow: hidden;">
                                    <div style="display: flex; align-items: center; color: var(--vscode-foreground); gap: 2px; min-width: 0px; max-width: 100%; overflow: hidden; flex-shrink: 1; flex-grow: 1;">
                                       <div style="min-width: 0px; text-overflow: ellipsis; vertical-align: middle; white-space: nowrap; line-height: 12px; color: var(--vscode-input-foreground); display: flex; align-items: center; gap: 4px; overflow: hidden; height: 16px; flex-shrink: 1; flex-grow: 1;">
                                          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; min-width: 0px; display: flex; align-items: baseline; gap: 4px;"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: normal; max-width: 100%; flex: 1 1 auto; min-width: 0px;">Auto</span></div>
                                       </div>
                                       <div class="codicon codicon-chevron-down" style="font-size: 14px; flex-shrink: 0; color: var(--vscode-foreground);"></div>
                                    </div>
                                 </div>
                                 <div data-custom-hover="true" role="button" tabindex="0" id="ensemble-toggle-button-aicsgj5fqf" class="anysphere-icon-button group ensemble-toggle-button opacity-hidden flex-shrink-0"><span class="text-[12px] tabular-nums font-normal" style="line-height: 14px; color: var(--vscode-input-foreground);">1×</span></div>
                              </div>
                           </div>
                           <div class="button-container composer-button-area" style="display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                              <div class="flex items-center" style="cursor: default; height: 20px; align-items: center; justify-content: center; display: flex; flex-direction: row;">
                                 <div style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding-top: 1px; margin-left: 1px;">
                                    <div class="inline-flex items-center justify-center" style="width: 15px; height: 15px;">
                                       <svg class="absolute" width="15" height="15">
                                          <circle fill="none" cx="7.5" cy="7.5" r="5.5" stroke="var(--cursor-stroke-tertiary)" stroke-width="2"></circle>
                                          <circle fill="none" stroke-linecap="round" cx="7.5" cy="7.5" r="5.5" stroke="var(--cursor-icon-secondary)" stroke-width="2" stroke-dasharray="34.55751918948772" stroke-dashoffset="23.226282341816784" transform="rotate(-90 7.5 7.5)"></circle>
                                       </svg>
                                    </div>
                                 </div>
                              </div>
                              <div id="composer-bottom-add-context-e0b1b8e2-50a3-41bb-a68d-f15c61ad5698">
                                 <div class="anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center  " style="width: 20px; height: 20px;"><span class="codicon codicon-mention !text-[16px] undefined "></span></div>
                              </div>
                              <div style="margin-top: 1px;">
                                 <div id="browser-selector-button">
                                    <div class="anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center  " data-variant="default" style="width: 20px; height: 20px;"><span class="codicon codicon-globe !text-[16px] undefined "></span></div>
                                 </div>
                              </div>
                              <div class="anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center  " style="margin-left: 1px; width: 20px; height: 20px;"><span class="codicon codicon-image-two !text-[16px] undefined "></span><input type="file" accept="image/*" multiple="" style="display: none;"></div>
                              <div class="send-with-mode" style="position: relative; display: inline-block;">
                                 <div class="anysphere-icon-button bg-[transparent] border-none text-[var(--cursor-text-primary)] flex w-4 items-center justify-center mic-icon-showing " data-variant="background" data-mode="plan" style="margin-left: 4px; width: 20px; height: 20px;" data-outlined="true"><span class="codicon codicon-mic !text-[16px] undefined "></span></div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
   </div>
</div>
//
