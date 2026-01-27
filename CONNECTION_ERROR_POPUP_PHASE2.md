# Phase 2: Connection Error / Composer Warning Popup — Build Summary & Testing

This document describes **everything built for Phase 2** (the connection-error popup and composer warning UI) and **what real testing or checking needs to be done**.

---

## 1. What Was Built (Phase 2 in Entirety)

### 1.1 Backend / Error classification

| Component | Location | What was built |
|-----------|----------|----------------|
| **Error classification** | `vybeAgent/electron-main/vybeErrorRecovery.ts` | `classifyError()` returns `errorType: 'network' \| 'timeout' \| 'bad_request' \| 'crash' \| 'unknown'`. Network detection uses message/stack for e.g. ENOTFOUND, EHOSTUNREACH, getaddrinfo, "fetch failed", "network", "connection". Timeout and other types are also classified. Returns `canResume`, `canRetry`, `message`. |
| **Stream / IPC error handling** | `vybeAgent/electron-main/vybeLangGraphService.ts` | Errors from the LangGraph stream (including network/timeout from backend) are classified and sent to the renderer with `errorType`, `canResume`, `canRetry` so the UI can show the right popup and buttons. Stream timeout (e.g. 20s) and error payloads are wired for connection/timeout scenarios. |

### 1.2 Frontend — When the popup is shown

| Trigger | Location | What was built |
|---------|----------|----------------|
| **Offline before send** | `vybeChatViewPane.ts` | Before starting the agent, if `!navigator.onLine` the UI immediately shows the connection-error popup (title "Connection Error", message about checking internet/VPN) with Try Again, without calling the backend. |
| **Error event from backend** | `vybeChatViewPane.ts` | On stream/error event with classified payload (`errorType`, `canResume`, `canRetry`), the view calls `messagePage.showError()` with the right message; for `errorType === 'network'` the message is the standard connection-failure copy. Resume/retry callbacks are passed. |
| **Tool failure** | `vybeChatViewPane.ts` | Tool execution failures can surface via `showError` with appropriate message/code. |

### 1.3 Frontend — Popup API and data flow

| Component | Location | What was built |
|-----------|----------|----------------|
| **showError()** | `messagePage.ts` | `showError(message, code?, options?)` with `errorType`, `canResume`, `canRetry`, `onResume`, `onRetry`, `onCancel`. Builds button list (Resume, Try Again, Cancel/Dismiss), maps `errorType` to title (e.g. "Connection Error" for network, "Timeout Error" for timeout), then calls `composer.showWarning()`. |
| **showWarning() / hideWarning()** | `messageComposer.ts` | `showWarning(ComposerWarningOptions)` forwards to `ComposerWarningPopup.show()`. `hideWarning()` clears the popup. |

### 1.4 Frontend — Popup UI (composer warning popup)

| Area | Location | What was built |
|------|----------|----------------|
| **Position & layout** | `composerWarningPopup.ts` | Popup is a direct child of the composer’s `composer-input-blur-wrapper` (same parent as the AI input). Position: `absolute`, `left: 0`, `right: 0`, `bottom: 100%`, `marginBottom: 4px` so it sits above the composer and **width follows the composer** (no fixed width). If the popup would be off-screen above, `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` is used. |
| **Styling** | `composerWarningPopup.ts` | Background and border are taken from the AI input box’s computed styles (`getComposerBackgroundColor()`, `getComposerBorder()`) so they match in Vybe Light/Dark. Padding 8px; border radius 8px; title and message font 12px; theme colors via `--vscode-*` where applicable. |
| **Structure** | `composerWarningPopup.ts` | **Row 1 (header):** Title (left), Close button only (right, codicon-close). **Row 2 (details):** One row — description text (left, wraps), action buttons e.g. Try Again (right); `alignItems: flex-end` so when description wraps to multiple lines, buttons stay at **bottom-right**. Tertiary buttons (Copy Request, Dismiss, etc.) are not rendered. |
| **Actions** | `composerWarningPopup.ts` | Close hides the popup and runs `onClose`. Try Again / Resume etc. call their `action()` (which typically hides the popup and triggers retry/resume). |

### 1.5 Test hooks (no WiFi needed)

| Hook | Location | What was built |
|------|----------|----------------|
| **testConnectionErrorPopup()** | `vybeChatViewPane.ts` (globalThis) | Calls the same code path that shows the connection-error popup, so the UI can be tested without disconnecting the network. |
| **testComposerWarning(type)** | `vybeChatViewPane.ts` (globalThis) | Shows the generic composer warning popup with type `'error' \| 'warning' \| 'info'` for manual testing. |

### 1.6 Docs

| Doc | Purpose |
|-----|---------|
| **POPUP_STRUCTURE_BREAKDOWN.md** | Two-row layout, classes, and a short testing table. |
| **COMPOSER_WARNING_POPUP_DESIGN.md** | Full design reference (outerHTML, CSS, extensibility). |

---

## 2. What Needs to Be Done — Real Testing & Checking

### 2.1 Manual UI tests (no automation)

Do these with the app running and, where noted, DevTools open.

| # | What to do | What to verify |
|---|------------|----------------|
| 1 | Open chat so the bottom composer is visible. In DevTools console run `testConnectionErrorPopup()`. | Popup appears above the composer with small gap. Title "Connection Error". Message about connection/VPN. Try Again and Close (X) visible. No tertiary row; buttons on same row as message; if message is long, buttons at bottom-right. |
| 2 | Resize the window (wider/narrower). | Popup width tracks the composer width (no fixed width; “in family” with composer). |
| 3 | Switch theme to **Vybe Light**, then **Vybe Dark**. | Popup background and border match the AI input box in both themes. Text readable. |
| 4 | Click **Close**. | Popup dismisses. |
| 5 | Run `testConnectionErrorPopup()` again. Click **Try Again**. | Popup dismisses and whatever retry logic is wired runs (if any in the test path). |
| 6 | (Optional) Run `testComposerWarning('error')` and `testComposerWarning('warning')`. | Same layout and behavior; only title/copy may differ. |
| 7 | If the composer is scrolled so it’s not at the bottom of the viewport, trigger the popup. | Popup does not sit off-screen above; it scrolls into view or remains visible. |

### 2.2 Real connection / backend path

| # | What to do | What to verify |
|---|------------|----------------|
| 8 | **Offline before send:** Disconnect network (or simulate offline). In chat, type a message and try to send. | As per current implementation: user should see the connection-error popup immediately (offline check) with "Connection Error" and Try Again, without needing the backend to fail first. |
| 9 | **Backend network failure:** With network back on, force a scenario where the backend returns or classifies a network error (e.g. unreachable host, or a test that triggers ENOTFOUND/EHOSTUNREACH). | Error event from backend includes `errorType: 'network'` (or equivalent). UI shows the same connection-error popup with the standard message and Try Again. |
| 10 | **Try Again after real error:** After a real connection error, click Try Again (with network restored). | Popup closes and retry proceeds as implemented (e.g. re-send or resume). No duplicate popups or stuck state. |

### 2.3 Edge cases and regressions

| # | What to check |
|---|----------------|
| 11 | **Multiple errors:** Trigger error → dismiss → trigger again. Popup shows again and dismisses correctly. |
| 12 | **Long message:** Use a very long error message (or test payload). Description wraps; Try Again stays on the right and at bottom-right of the block. |
| 13 | **Recovery flow:** If the app has “Resume” for incomplete tasks, show that flow once and confirm the same popup component is used and layout remains correct. |

### 2.4 What you don’t need to do (unless you want to)

- **Automated tests:** Not required for Phase 2 sign-off; manual checklist above is the gate.
- **Formal accessibility audit:** Not in scope for this phase; DevTools + keyboard (Tab, Enter) is enough for a quick check.

---

## 3. Quick reference

- **Test from console:** `testConnectionErrorPopup()` or `testComposerWarning('error')`.
- **Popup structure:** See `POPUP_STRUCTURE_BREAKDOWN.md`.
- **Design reference:** See `COMPOSER_WARNING_POPUP_DESIGN.md`.
- **Backend classification:** `vybeErrorRecovery.ts` → `classifyError()`.
- **Where popup is shown:** `vybeChatViewPane.ts` (offline check + error event handler) → `messagePage.showError()` → `composer.showWarning()` → `ComposerWarningPopup.show()`.
