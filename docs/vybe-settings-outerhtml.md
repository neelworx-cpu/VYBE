# VYBE Settings Panel — Structured CSS Slots

Below mirrors the hierarchy of the provided outerHTML. Each element has its own CSS code block so you can paste computed styles (like `QUESTIONNAIRE_TOOLBAR_STRUCTURE.md`).

---
## OuterHTML (reference)
```html
<div class="editor-container" style="background-color: rgb(252, 252, 252); height: 659px;">
  <div class="editor-instance aichat-pane">
    <div class="aichat-container" tabindex="0" role="document" style="outline: none; width: 100%; height: 100%; background-color: rgb(252, 252, 252);">
      <div style="height: 100%; width: 100%;">
        <div class="cursor-settings-pane-outer-wrapper !outline-none" tabindex="-1">
          <div class="scrollable-div-container" style="height: 100%;">
            <div class="monaco-scrollable-element mac" role="presentation" style="position: relative; overflow-y: hidden; width: 100%; height: unset;">
              <div style="width: 100%; overflow: hidden; height: 659px;">
                <div style="display: inline-block; width: 100%; min-height: 100%;">
                  <div class="cursor-settings-layout-main">
                    <div class="cursor-settings-sidebar">
                      <div class="cursor-settings-sidebar-header">
                        <div class="cursor-settings-sidebar-avatar"><p class="cursor-settings-sidebar-avatar-initial">n</p></div>
                        <div class="cursor-settings-sidebar-header-content">
                          <p class="cursor-settings-sidebar-header-email">neel.ravi@particleblack.com</p>
                          <p class="cursor-settings-sidebar-header-plan">Pro+ Plan</p>
                        </div>
                      </div>
                      <div class="cursor-settings-sidebar-content">
                        <div><input type="text" placeholder="Search settings ⌘F"></div>
                        <div class="cursor-settings-sidebar-cells">
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-gear"></span><span class="cursor-settings-sidebar-cell-label" title="General">General</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-infinity"></span><span class="cursor-settings-sidebar-cell-label" title="Agents">Agents</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-tab"></span><span class="cursor-settings-sidebar-cell-label" title="Tab">Tab</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-cube"></span><span class="cursor-settings-sidebar-cell-label" title="Models">Models</span></div>
                          <div class="w-full my-2"><hr class="cursor-settings-sidebar-divider"></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-cloud-two"></span><span class="cursor-settings-sidebar-cell-label" title="Cloud Agents">Cloud Agents</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-cube-nodes"></span><span class="cursor-settings-sidebar-cell-label" title="Tools &amp; MCP">Tools &amp; MCP</span></div>
                          <div class="w-full my-2"><hr class="cursor-settings-sidebar-divider"></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-clipboard-list"></span><span class="cursor-settings-sidebar-cell-label" title="Rules and Commands">Rules and Commands</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-cylinder-split"></span><span class="cursor-settings-sidebar-cell-label" title="Indexing &amp; Docs">Indexing &amp; Docs</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-globe"></span><span class="cursor-settings-sidebar-cell-label" title="Network">Network</span></div>
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-chevron-forward-dotted"></span><span class="cursor-settings-sidebar-cell-label" title="Beta">Beta</span></div>
                        </div>
                        <hr class="cursor-settings-sidebar-divider">
                        <div class="cursor-settings-sidebar-footer">
                          <div class="cursor-settings-sidebar-cell"><span class="codicon codicon-book"></span><span class="cursor-settings-sidebar-cell-label" title="Docs">Docs</span><span class="codicon codicon-link-external"></span></div>
                        </div>
                      </div>
                    </div>
                    <div class="cursor-settings-pane-content">
                      <div class="cursor-settings-tab">
                        <div class="cursor-settings-tab-header"><div class="cursor-settings-tab-title">General</div></div>
                        <div class="cursor-settings-tab-content">
                          <div class="cursor-settings-section">
                            <div class="cursor-settings-section-list">
                              <div class="cursor-settings-sub-section">
                                <div class="cursor-settings-sub-section-list">
                                  <div class="cursor-settings-cell cursor-settings-cell-align-top">
                                    <div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Manage Account</p><div class="cursor-settings-cell-description">Manage your account and billing</div></div>
                                    <div class="cursor-settings-cell-trailing-items"><div class="cursor-button cursor-button-tertiary cursor-button-tertiary-clickable cursor-button-small">Open<div class="codicon codicon-link-external"></div></div></div>
                                  </div>
                                  <div class="cursor-settings-cell cursor-settings-cell-align-top">
                                    <div class="cursor-settings-cell-divider"></div>
                                    <div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Upgrade to Ultra</p><div class="cursor-settings-cell-description">Get maximum value with 20x usage limits and early access to advanced features.</div></div>
                                    <div class="cursor-settings-cell-trailing-items"><div class="cursor-button cursor-button-primary cursor-button-primary-clickable cursor-button-small"><div class="codicon codicon-arrow-circle-up"></div>Upgrade</div></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="cursor-settings-section">
                            <div class="cursor-settings-section-header"><div class="cursor-settings-section-header-leading-items"><div class="cursor-settings-section-header-title-row"><div class="cursor-settings-section-header-title">Preferences</div></div></div><div class="cursor-settings-section-header-trailing-items"></div></div>
                            <div class="cursor-settings-section-list">
                              <div class="cursor-settings-sub-section">
                                <div class="cursor-settings-sub-section-list">
                                  <div class="cursor-settings-cell cursor-settings-cell-align-top">
                                    <div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Default Layout</p><div class="cursor-settings-cell-description">Modify your default layout to focus Agent or the editor</div></div>
                                    <div class="cursor-settings-cell-trailing-items">
                                      <div class="flex gap-3 py-[3px] justify-center items-center">
                                        <!-- mini layout cards here (Agent / Editor) -->
                                      </div>
                                    </div>
                                  </div>
                                  <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-divider"></div><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Editor Settings</p><div class="cursor-settings-cell-description">Configure font, formatting, minimap and more</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-button cursor-button-tertiary cursor-button-tertiary-clickable cursor-button-small">Open</div></div></div>
                                  <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-divider"></div><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Keyboard Shortcuts</p><div class="cursor-settings-cell-description">Configure keyboard shortcuts</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-button cursor-button-tertiary cursor-button-tertiary-clickable cursor-button-small">Open</div></div></div>
                                  <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-divider"></div><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Import Settings from VS Code</p><div class="cursor-settings-cell-description">Import settings, extensions, and keybindings from VS Code</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-button cursor-button-tertiary cursor-button-tertiary-clickable cursor-button-small">Import</div></div></div>
                                </div>
                              </div>
                              <div class="cursor-settings-sub-section"><div class="cursor-settings-sub-section-list"><div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Reset "Don’t Ask Again" Dialogs</p><div class="cursor-settings-cell-description">See warnings and tips that you’ve hidden</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-button cursor-button-tertiary cursor-button-tertiary-clickable cursor-button-small">Show</div></div></div></div></div>
                            </div>
                          </div>
                          <div class="cursor-settings-section">
                            <div class="cursor-settings-section-header"><div class="cursor-settings-section-header-leading-items"><div class="cursor-settings-section-header-title-row"><div class="cursor-settings-section-header-title">Notifications</div></div></div><div class="cursor-settings-section-header-trailing-items"></div></div>
                            <div class="cursor-settings-section-list"><div class="cursor-settings-sub-section"><div class="cursor-settings-sub-section-list">
                              <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">System Notifications</p><div class="cursor-settings-cell-description">Show system notifications when Agent completes or needs attention</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-settings-cell-switch-container"><div class="solid-switch"><div class="solid-switch-toggle on"></div></div></div></div></div>
                              <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-divider"></div><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Menu Bar Icon</p><div class="cursor-settings-cell-description">Show Cursor in menu bar</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-settings-cell-switch-container"><div class="solid-switch"><div class="solid-switch-toggle on"></div></div></div></div></div>
                              <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-divider"></div><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label">Completion Sound</p><div class="cursor-settings-cell-description">Play a sound when Agent finishes responding</div></div><div class="cursor-settings-cell-trailing-items"><div class="cursor-settings-cell-switch-container"><div class="solid-switch"><div class="solid-switch-toggle on"></div></div></div></div></div>
                            </div></div></div>
                          </div>
                          <div class="cursor-settings-section">
                            <div class="cursor-settings-section-header"><div class="cursor-settings-section-header-leading-items"><div class="cursor-settings-section-header-title-row"><div class="cursor-settings-section-header-title">Privacy</div></div></div><div class="cursor-settings-section-header-trailing-items"></div></div>
                            <div class="cursor-settings-section-list"><div class="cursor-settings-sub-section"><div class="cursor-settings-sub-section-list">
                              <div class="cursor-settings-cell cursor-settings-cell-align-top"><div class="cursor-settings-cell-leading-items"><p class="cursor-settings-cell-label"><div><div class="codicon codicon-lock"></div>Privacy Mode</div></p><div class="cursor-settings-cell-description"><span>Your code data will not be trained on or used to improve the product. Code may be stored to provide features such as Background Agent.</span></div></div><div class="cursor-settings-cell-trailing-items"><div class="solid-dropdown"><button class="solid-dropdown-toggle"><div class="solid-dropdown-toggle-label">Privacy Mode</div><span class="codicon codicon-chevron-up-down"></span></button></div></div></div>
                            </div><div class="cursor-settings-sub-section-trailing-caption"></div></div></div>
                          </div>
                          <div class="cursor-settings-tab-footer-actions"><div class="cursor-button cursor-button-tertiary cursor-button-tertiary-clickable cursor-button-small">Log Out</div></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div role="presentation" aria-hidden="true" class="invisible scrollbar horizontal"><div class="slider"></div></div>
              <div role="presentation" aria-hidden="true" class="invisible scrollbar vertical fade"><div class="slider"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---
## CSS Blocks (drop computed CSS per element)

### Top-level
**`.editor-container`**
```css
background-colorrgb(252, 252, 252)
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height981px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px

```
**`.editor-instance.aichat-pane`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height981px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px

```
**`.aichat-container`**
```css
background-colorrgb(252, 252, 252)
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size13px
forced-color-adjustnone
height981px
line-height18.2px
outline-colorrgba(20, 20, 20, 0.92)
outline-stylenone
outline-width0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px

```
**`.cursor-settings-pane-outer-wrapper`**
```css
background-colorrgb(252, 252, 252)
colorrgba(20, 20, 20, 0.92)
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height981px
line-height18.2px
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
outline-colorrgba(0, 0, 0, 0)
outline-offset2px
outline-stylesolid
outline-width2px
positionrelative
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px

```
**`.scrollable-div-container`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height981px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px

```
**`.monaco-scrollable-element`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height981px
line-height18.2px
overflow-yhidden
positionrelative
scrollbar-widthnone
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px

```

### Layout root
**`.cursor-settings-layout-main`**
```css
align-itemsflex-start
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
column-gap48px
displayflex
flex-basis0%
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height1220px
line-height18.2px
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
max-width1000px
padding-bottom0px
padding-left48px
padding-right48px
padding-top0px
row-gap48px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width599px
```

### Sidebar
**`.cursor-settings-sidebar`**
```css
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
column-gap12px
displayflex
flex-basisauto
flex-directioncolumn
flex-grow0
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height456px
line-height18.2px
max-height1073px
min-width100px
overflow-xhidden
overflow-yhidden
padding-top48px
positionsticky
row-gap12px
text-wrap-modewrap
top0px
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px
```
**`.cursor-settings-sidebar-header`**
```css
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-directionrow
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height34px
line-height18.2px
overflow-xhidden
overflow-yhidden
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px
```
**`.cursor-settings-sidebar-avatar`**
```css
align-itemscenter
background-attachmentscroll
background-clipborder-box
background-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0368628)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-left-radius50%
border-bottom-right-radius50%
border-top-left-radius50%
border-top-right-radius50%
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.368627)
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height28px
justify-contentcenter
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width28px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(1 glyph)
```
**`.cursor-settings-sidebar-avatar-initial`**
```css
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.368627)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-weight400
forced-color-adjustnone
height18.2031px
line-height18.2px
margin-block-end0px
margin-block-start0px
margin-bottom0px
margin-inline-end0px
margin-inline-start0px
margin-left0px
margin-right0px
margin-top0px
text-aligncenter
text-transformuppercase
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width8.90625px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(1 glyph)
```
**`.cursor-settings-sidebar-header-content`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap2px
displayflex
flex-basisauto
flex-directioncolumn
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-weight400
forced-color-adjustnone
height34px
line-height16px
min-width0px
overflow-xhidden
overflow-yhidden
row-gap2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width89.75px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(50 glyphs)
```
**`.cursor-settings-sidebar-header-email`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-weight400
forced-color-adjustnone
height16px
line-height16px
margin-block-end0px
margin-block-start0px
margin-bottom0px
margin-inline-end0px
margin-inline-start0px
margin-left0px
margin-right0px
margin-top0px
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width89.75px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(41 glyphs)
```
**`.cursor-settings-sidebar-header-plan`**
```css
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.552941)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-weight400
forced-color-adjustnone
height16px
line-height16px
margin-block-end0px
margin-block-start0px
margin-bottom0px
margin-inline-end0px
margin-inline-start0px
margin-left0px
margin-right0px
margin-top0px
overflow-xhidden
overflow-yhidden
text-overflowellipsis
text-wrap-modenowrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width89.75px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(9 glyphs)
```
**`.cursor-settings-sidebar-content`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height362px
line-height18.2px
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px

```
**`input[placeholder="Search settings ⌘F"]`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height28px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px

appearanceauto
background-attachmentscroll
background-clipborder-box
background-colorrgb(252, 252, 252)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
border-bottom-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0745098)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0745098)
border-left-stylesolid
border-left-width1px
border-right-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0745098)
border-right-stylesolid
border-right-width1px
border-top-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0745098)
border-top-left-radius4px
border-top-right-radius4px
border-top-stylesolid
border-top-width1px
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
cursortext
displayinline-block
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
height28px
letter-spacingnormal
line-heightnormal
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
overflow-clip-margin0px
overflow-xclip
overflow-yclip
padding-block-end6px
padding-block-start6px
padding-bottom6px
padding-inline-end6px
padding-inline-start6px
padding-left6px
padding-right6px
padding-top6px
text-alignstart
text-indent0px
text-renderingauto
text-shadownone
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px
word-spacing0px
-webkit-rtl-orderinglogical
-webkit-border-imagenone
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(18 glyphs)
```
**`.cursor-settings-sidebar-cells`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap1px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height285px
line-height18.2px
row-gap1px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px

```
**`.cursor-settings-sidebar-cell`**
```css
align-itemscenter
background-colorrgba(20, 20, 20, 0.07)
border-bottom-left-radius4px
border-bottom-right-radius4px
border-top-left-radius4px
border-top-right-radius4px
colorrgba(20, 20, 20, 0.92)
column-gap6px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
padding-bottom4px
padding-left6px
padding-right6px
padding-top4px
row-gap6px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width113.75px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(7 glyphs)
```
**`.cursor-settings-sidebar-cell-label`**
```css
colorrgba(20, 20, 20, 0.92)
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
width43.8984px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(7 glyphs)
```
**`.cursor-settings-sidebar-divider`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height1px
line-height18.2px
margin-bottom8px
margin-top8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px

border-bottom-colorrgba(20, 20, 20, 0.92)
border-bottom-stylenone
border-bottom-width0px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorrgba(20, 20, 20, 0.92)
border-left-stylenone
border-left-width0px
border-right-colorrgba(20, 20, 20, 0.92)
border-right-stylenone
border-right-width0px
border-top-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0737255)
border-top-stylesolid
border-top-width1px
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height0px
line-height18.2px
margin-block-end0px
margin-block-start0px
margin-bottom0px
margin-inline-end0px
margin-inline-start0px
margin-left0px
margin-right0px
margin-top0px
overflow-xhidden
overflow-yhidden
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px
```
**`.cursor-settings-sidebar-footer`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height24px
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width125.75px
```
**`.cursor-settings-sidebar-cell .codicon`**
```css
align-itemscenter
border-bottom-left-radius4px
border-bottom-right-radius4px
border-top-left-radius4px
border-top-right-radius4px
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.552941)
column-gap6px
cursorpointer
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
line-height16px
padding-bottom4px
padding-left6px
padding-right6px
padding-top4px
row-gap6px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width113.75px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(4 glyphs)
```

### Pane / Tab
**`.cursor-settings-pane-content`**
```css
align-selfstretch
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
displayblock
flex-basis0px
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height1220px
line-height18.2px
min-width200px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px

```
**`.cursor-settings-tab`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap20px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height1124px
line-height18.2px
padding-bottom48px
padding-left0px
padding-right0px
padding-top48px
row-gap20px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px
```
**`.cursor-settings-tab-header`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap4px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height21px
line-height18.2px
padding-bottom0px
padding-left8px
padding-right8px
padding-top0px
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width313.25px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght1F40000
Font origin: Local file(7 glyphs)
```
**`.cursor-settings-tab-title`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size16px
font-stylenormal
font-weight500
forced-color-adjustnone
height21px
letter-spacing-0.32px
line-height21px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width313.25px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght1F40000
Font origin: Local file(7 glyphs)
```
**`.cursor-settings-tab-content`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap30px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height1083px
line-height18.2px
row-gap30px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px

```
**`.cursor-settings-tab-footer-actions`**
```css
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-directionrow
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height24px
justify-contentflex-start
line-height18.2px
padding-bottom0px
padding-left8px
padding-right8px
padding-top0px
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width313.25px

```

### Sections (repeat as needed)
**`.cursor-settings-section`**
```css
align-itemsflex-start
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height395px
line-height18.2px
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px


```
**`.cursor-settings-section-header`**
```css
align-itemsflex-end
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap20px
displayflex
flex-directionrow
flex-wrapwrap
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height25px
line-height18.2px
padding-bottom0px
padding-left8px
padding-right8px
padding-top0px
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width313.25px
```
**`.cursor-settings-section-header-leading-items`**
```css
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap2px
displayflex
flex-basisauto
flex-directioncolumn
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height14px
line-height18.2px
min-widthmin(300px, 100%)
row-gap2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width313.25px

```
**`.cursor-settings-section-header-title-row`**
```css
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap4px
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height14px
line-height18.2px
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width313.25px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(11 glyphs)
```
**`.cursor-settings-section-header-title`**
```css
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.552941)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-weight400
forced-color-adjustnone
height14px
letter-spacing0.07px
line-height14px
overflow-wrapbreak-word
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width68.6875px
word-breakbreak-word
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(11 glyphs)
```
**`.cursor-settings-section-header-trailing-items`**
```css
colorrgba(20, 20, 20, 0.92)
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height0px
line-height18.2px
padding-bottom3px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width0px

```
**`.cursor-settings-section-list`**
```css
align-itemsflex-start
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap12px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height362px
line-height18.2px
row-gap12px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px

```

### Sub-sections (repeat)
**`.cursor-settings-sub-section`**
```css
align-itemsflex-start
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height293px
line-height18.2px
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px

```
**`.cursor-settings-sub-section-list`**
```css
align-selfstretch
background-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0368628)
border-bottom-left-radius8px
border-bottom-right-radius8px
border-top-left-radius8px
border-top-right-radius8px
colorrgba(20, 20, 20, 0.92)
column-gap0px
displayflex
flex-directioncolumn
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height293px
line-height18.2px
row-gap0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width329.25px

```
**`.cursor-settings-sub-section-trailing-caption`**
```css

```

### Cells (repeat each row)
**`.cursor-settings-cell`**
```css
```
**`.cursor-settings-cell-align-top`**
```css
align-itemsflex-start
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap20px
displayflex
flex-directionrow
flex-wrapwrap
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height49px
line-height18.2px
outline-colorrgba(0, 0, 0, 0)
outline-offset2px
outline-stylesolid
outline-width2px
padding-bottom12px
padding-left12px
padding-right12px
padding-top12px
positionrelative
row-gap20px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width305.25px
```
**`.cursor-settings-cell-divider`**
```css
background-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.0737255)
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height1px
left12px
line-height18.2px
positionabsolute
right12px
text-wrap-modewrap
top0px
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width305.25px
```
**`.cursor-settings-cell-leading-items`**
```css
colorrgba(20, 20, 20, 0.92)
column-gap1px
displayflex
flex-basis0px
flex-directioncolumn
flex-grow1
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height49px
line-height18.2px
row-gap1px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width240.805px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(43 glyphs)
```
**`.cursor-settings-cell-label`**
```css
align-itemscenter
colorrgba(20, 20, 20, 0.92)
column-gap4px
displayflex
flex-wrapwrap
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-stylenormal
font-weight400
forced-color-adjustnone
height16px
line-height16px
margin-block-end0px
margin-block-start0px
margin-bottom0px
margin-inline-end0px
margin-inline-start0px
margin-left0px
margin-right0px
margin-top0px
overflow-xhidden
overflow-yhidden
row-gap4px
text-overflowellipsis
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width240.805px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(15 glyphs)
```
**`.cursor-settings-cell-description`**
```css
colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.552941)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
font-stylenormal
font-weight400
forced-color-adjustnone
height32px
line-height16px
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width240.805px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(43 glyphs)
```
**`.cursor-settings-cell-trailing-items`**
```css

```

### Buttons
**`.cursor-button.cursor-button-tertiary`**
```css
align-itemscenter
align-selfstretch
colorrgba(20, 20, 20, 0.92)
column-gap8px
displayflex
flex-basisauto
flex-directionrow
flex-grow0
flex-shrink1
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height49px
justify-contentflex-end
line-height18.2px
min-width0px
row-gap8px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width44.4453px

```
**`.cursor-button.cursor-button-primary`**
```css
align-itemscenter
background-colorrgb(60, 124, 171)
border-bottom-left-radius5px
border-bottom-right-radius5px
border-top-left-radius5px
border-top-right-radius5px
colorrgb(252, 252, 252)
column-gap4px
cursorpointer
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
justify-contentcenter
line-height16px
padding-bottom3px
padding-left6px
padding-right6px
padding-top3px
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width64.9062px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(7 glyphs)
```
**`.cursor-button.cursor-button-tertiary-clickable`**
```css
align-itemscenter
border-bottom-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-bottom-left-radius5px
border-bottom-right-radius5px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-left-stylesolid
border-left-width1px
border-right-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-right-stylesolid
border-right-width1px
border-top-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-top-left-radius5px
border-top-right-radius5px
border-top-stylesolid
border-top-width1px
colorrgba(20, 20, 20, 0.92)
column-gap4px
cursorpointer
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
justify-contentcenter
line-height16px
padding-bottom3px
padding-left6px
padding-right6px
padding-top3px
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width30.4453px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(4 glyphs)
```
**`.cursor-button.cursor-button-primary-clickable`**
```css
align-itemscenter
background-colorrgb(60, 124, 171)
border-bottom-left-radius5px
border-bottom-right-radius5px
border-top-left-radius5px
border-top-right-radius5px
colorrgb(252, 252, 252)
column-gap4px
cursorpointer
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height16px
justify-contentcenter
line-height16px
padding-bottom3px
padding-left6px
padding-right6px
padding-top3px
row-gap4px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width64.9062px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(7 glyphs)
```

### Switches
**`.cursor-settings-cell-switch-container`**
```css
align-itemscenter
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
displayflex
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18px
justify-contentflex-end
line-height18.2px
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width30px

```
**`.solid-switch`**
```css
align-itemscenter
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
displayflex
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18px
line-height18.2px
positionrelative
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width30px

```
**`.solid-switch-toggle`**
```css
background-colorrgb(85, 165, 131)
border-bottom-left-radius9px
border-bottom-right-radius9px
border-top-left-radius9px
border-top-right-radius9px
bottom0px
box-shadownone
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
cursorpointer
displayblock
flex-shrink0
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height18px
left0px
line-height18.2px
positionabsolute
right0px
text-wrap-modewrap
top0px
transition-behaviornormal
transition-delay0s
transition-duration0.2s
transition-propertyall
transition-timing-functionease
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width30px
```

### Dropdowns
**`.solid-dropdown`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height24px
line-height18.2px
positionrelative
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width112.461px

```
**`.solid-dropdown-toggle`**
```css
align-itemscenter
appearanceauto
background-colorrgba(0, 0, 0, 0)
border-bottom-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-bottom-left-radius6px
border-bottom-right-radius6px
border-bottom-stylesolid
border-bottom-width1px
border-image-outset0
border-image-repeatstretch
border-image-slice100%
border-image-sourcenone
border-image-width1
border-left-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-left-stylesolid
border-left-width1px
border-right-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-right-stylesolid
border-right-width1px
border-top-colorcolor(srgb 0.0784314 0.0784314 0.0784314 / 0.147451)
border-top-left-radius6px
border-top-right-radius6px
border-top-stylesolid
border-top-width1px
box-sizingborder-box
colorrgba(20, 20, 20, 0.92)
column-gap10px
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
height24px
letter-spacingnormal
line-heightnormal
margin-bottom0px
margin-left0px
margin-right0px
margin-top0px
padding-block-end3px
padding-block-start3px
padding-bottom3px
padding-inline-end2px
padding-inline-start6px
padding-left6px
padding-right2px
padding-top3px
row-gap10px
text-aligncenter
text-indent0px
text-renderingauto
text-shadownone
text-transformnone
text-wrap-modewrap
user-selectnone
visibilityvisible
white-space-collapsecollapse
width112.461px
word-spacing0px
-webkit-border-imagenone
```
**`.solid-dropdown-toggle-label`**
```css
align-itemscenter
colorrgba(20, 20, 20, 0.92)
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
text-alignleft
text-indent0px
text-renderingauto
text-shadownone
text-transformnone
text-wrap-modewrap
unicode-bidiisolate
user-selectnone
visibilityvisible
white-space-collapsecollapse
width76.4609px
word-spacing0px
Rendered Fonts
Family name: .SF NS
PostScript name: .SFNS-Regular_wdth_opsz110000_GRAD_wght
Font origin: Local file(12 glyphs)
```

### Mini Layout Cards (Default Layout)
**`.flex.gap-3.py-[3px].justify-center.items-center`**
```css
```
**`.flex.flex-col.items-center.gap-2.cursor-pointer`**
```css
```

### Icons
**`.codicon`**
```css
```
**`.codicon-gear, .codicon-infinity, .codicon-tab, .codicon-cube, .codicon-cloud-two, .codicon-cube-nodes, .codicon-clipboard-list, .codicon-cylinder-split, .codicon-globe, .codicon-chevron-forward-dotted, .codicon-link-external, .codicon-arrow-circle-up, .codicon-lock, .codicon-chevron-up-down`**
```css
```

### Scrollbars
**`.scrollbar.horizontal`**
```css
bottom0px
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
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
width589px

```
**`.scrollbar.vertical.fade`**
```css
colorrgba(20, 20, 20, 0.92)
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height981px
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
**`.scrollbar .slider`**
```css
background-attachmentscroll
background-clipborder-box
background-colorrgba(20, 20, 20, 0.12)
background-imagenone
background-originpadding-box
background-position-x0%
background-position-y0%
background-repeatrepeat
background-sizeauto
colorrgba(20, 20, 20, 0.92)
containstrict
displayblock
font-family-apple-system, "system-ui", sans-serif
font-size12px
forced-color-adjustnone
height788px
left0px
line-height18.2px
pointer-eventsnone
positionabsolute
text-wrap-modewrap
top193px
transformmatrix(1, 0, 0, 1, 0, 0)
unicode-bidiisolate
user-selectnone
visibilityhidden
white-space-collapsecollapse
width10px
```
