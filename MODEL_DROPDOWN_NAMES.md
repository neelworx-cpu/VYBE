# Model Dropdown Component Names

## 1. **Main Composer Model Dropdown** (Bottom Bar)
- **Location**: Bottom chat composer bar (left side, next to Agent dropdown)
- **Button Element**: `autoDropdownElement` (shows "Auto" or selected model name)
- **Class Instance**: `MessageComposer.modelDropdown`
- **File**: `messageComposer.ts` → `showModelDropdown()`
- **Component Class**: `ModelDropdown` (from `modelDropdown.ts`)
- **Visual**: Shows "Auto" when enabled, or model name like "llama2" when disabled

**Usage**: This is the primary model selector in the main chat composer at the bottom of the screen.

---

## 2. **Plan Document Model Dropdown** (Plan View)
- **Location**: Plan document view (right side controls, next to build button)
- **Button Element**: `modelDropdownButton` (in `VybeChatPlanDocumentPart`)
- **Class Instance**: `VybeChatPlanDocumentPart.modelDropdown`
- **File**: `vybeChatPlanDocumentPart.ts` → `createModelDropdownButton()`
- **Component Class**: `ModelDropdown` (same class, different instance)
- **Visual**: Shows model name in plan document header

**Usage**: This is the model selector in the plan document view (when viewing AI-generated plans).

---

## Shared Component
Both dropdowns use the same **`ModelDropdown`** class from:
- **File**: `src/vs/workbench/contrib/vybeChat/browser/components/composer/modelDropdown.ts`
- **Class**: `ModelDropdown extends Disposable`

---

## Dropdown States

### **Auto Mode (Collapsed)**
- Shows: "Auto" text
- Toggle: "Auto" switch is ON
- Model list: Hidden (scrollable section not shown)

### **Manual Mode (Expanded)**
- Shows: Selected model name (e.g., "llama2")
- Toggle: "Auto" switch is OFF
- Model list: Visible (shows all models - cloud + local)

---

## When You Select a Model

1. Click on a model item in the list
2. `ModelDropdown.renderModelItem()` click handler fires
3. Updates `state.selectedModelId`
4. Fires `onStateChange` event
5. Calls `hide()` to close dropdown
6. Parent component (`MessageComposer` or `VybeChatPlanDocumentPart`) receives state change
7. Updates button label via `updateModelLabel()`

---

## Current Issue (To Fix)

When selecting a model, the dropdown should **close completely**, but it's "minimizing" instead. This suggests:
- The dropdown is being recreated or toggled
- The click event is bubbling to the anchor button
- The `hide()` method isn't fully removing the dropdown


