# Translator Extension — Multi-Server Failover + YouTube Translation

**Date:** 2026-05-28  
**Status:** Approved

---

## Overview

Three coordinated improvements to the Translator Chrome extension:

1. **Multi-Server Failover** — support a list of OpenCode server URLs; automatically try the next one when the current one fails.
2. **YouTube Caption Button** — a toggle button injected into the YouTube player controls to manually start/stop bilingual caption overlay.
3. **YouTube Comment Translation** — fix the FAB-driven bilingual translation so YouTube comments (including dynamically loaded ones) are correctly translated.

---

## A. Multi-Server Failover

### Data model

`ExtensionSettings` gains a new field:

```ts
serverUrls: string[]   // ordered list; index 0 is primary
```

The legacy `serverUrl: string` field is removed. `DEFAULT_SETTINGS.serverUrls` defaults to `['http://localhost:3000']`.

`storage.ts` migration: when loading settings, if `serverUrl` exists but `serverUrls` does not, migrate: `serverUrls = [serverUrl]` and drop `serverUrl`.

### Failover logic (background.ts)

Before creating `OpenCodeClient`, iterate `settings.serverUrls` in order:

```
for each url in serverUrls:
  try request → success → return result
  on HTTP 5xx or timeout → continue to next url
  on HTTP 4xx → break (config error, not transient)
if all exhausted → return { ok: false, error: '所有伺服器均無回應' }
```

`OpenCodeClient` is constructed with a single `serverUrl` per attempt — no changes to its interface required. The loop is in `background.ts`.

Both single-translate and batch-translate paths get the same failover loop.

### Options page UI

Replace the single server URL field with a list:

- Each entry: URL text input + "刪除" button + "↑/↓" reorder buttons
- "新增 Server" button appends a blank entry
- "載入 Models" button tests the **first** URL in the list (primary) to populate provider/model dropdowns
- Save persists the whole `serverUrls` array

---

## B. YouTube Caption Button

### Change from auto-start to manual

`content-youtube.ts` currently calls `captionTranslator.start()` immediately. Change: start in **stopped** state; let the button toggle it.

### Button injection

Target element: `.ytp-right-controls` (YouTube player's right control bar — stable selector for many years).  
Inject a `<button class="ytp-button xt-caption-btn">` with a translate icon (SVG or text "字幕").

- **Off state**: muted icon, title "開啟字幕翻譯"
- **On state**: highlighted icon, title "關閉字幕翻譯"

Inject timing: wait for `.ytp-right-controls` to appear (poll, up to 5 s), then inject.  
Re-inject on `yt-navigate-finish` (SPA navigation swaps the player DOM).

### Interaction

Click → toggle `captionTranslator.start()` / `captionTranslator.stop()`.  
Persist on-state across SPA navigations only in memory (no storage persistence needed).

---

## C. YouTube Comment Translation (FAB)

### Root causes

1. `SELECTOR` does not include `yt-attributed-string` (YouTube's newer comment text element).
2. YouTube adds comment container nodes to the DOM before populating their text content → `isTarget()` rejects them (empty `textContent`) → MutationObserver misses them.

### Fixes

**bilingual-injector.ts** — extend SELECTOR:

```
'p, h1, h2, h3, h4, h5, h6, li, td, blockquote,
 #content-text, #video-title,
 yt-attributed-string'
```

**content.ts** — MutationObserver improvement:  
Also observe `characterData: true` and `subtree: true` so text-insertion into existing elements (YouTube fills text after appending the node) triggers re-scan.  
When a `characterData` mutation fires, `mutation.target` is a text node. Walk up to `mutation.target.parentElement` and check it with `injector.getNewTargets()` to find the matching `#content-text` or `yt-attributed-string` ancestor. Debounce 200 ms is sufficient.

Additionally, when `yt-navigate-finish` fires, call `injector.clear()` before re-translating to avoid double injection on SPA nav.

---

## Data Flow

```
User action              → content script         → background SW           → OpenCode server(s)
─────────────────────────────────────────────────────────────────────────────────────────────────
FAB click (comments)     → translatePage()        → translate-batch msg     → serverUrls[0]
  element added by YT    → MutationObserver       → translate-batch msg     →   ↓ failover if 5xx
YT player btn click      → captionTranslator      → translate msg (single)  → serverUrls[0..n]
```

---

## Error Handling

- If all servers in `serverUrls` fail, the FAB shows error state with message "所有伺服器均無回應".
- If `serverUrls` is empty, treat as config error: show "請先設定 Server URL".
- The existing 500-retry guard in `translator.ts` (`status < 500` → no retry) now only applies **within a single server attempt**. Cross-server fallover happens in `background.ts`, not in `Translator`.

---

## Testing Plan

| Area | Test |
|------|------|
| Multi-server | Unit: failover skips server on 500, succeeds on second | 
| Multi-server | Unit: 4xx on first server → no fallover, return error |
| Multi-server | Unit: settings migration from `serverUrl` → `serverUrls` |
| YouTube button | Manual: button appears in player, toggle works, caption overlay appears |
| YouTube comments | Manual: FAB on YouTube, scroll to comments, verify bilingual injection |
| YouTube comments | Manual: expand reply thread, verify new replies translated |
| YouTube comments | Manual: SPA nav (video to video), verify no double-injection |

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/lib/types.ts` | Replace `serverUrl` with `serverUrls: string[]` |
| `src/lib/storage.ts` | Add migration from `serverUrl` → `serverUrls` |
| `src/entrypoints/background.ts` | Failover loop over `serverUrls`; remove single-server instantiation |
| `src/entrypoints/content-youtube.ts` | Add player button injection; change to manual-start |
| `src/lib/bilingual-injector.ts` | Extend SELECTOR; expose SELECTOR constant for tests |
| `src/entrypoints/content.ts` | Add `characterData` to MutationObserver; fix `yt-navigate-finish` clear |
| `src/entrypoints/options/index.html` | Replace single URL field with dynamic list UI |
| `src/entrypoints/options/main.ts` | Manage `serverUrls` array; save/load list |
| `src/__tests__/` | New unit tests for failover logic and settings migration |
