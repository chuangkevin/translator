# Translator Browser Extension — Design Spec

**Date:** 2026-05-21  
**Repo:** `D:\Projects\_HomeProject\translator`  
**Goal:** 取代 Immersive Translate 的個人翻譯 browser extension

---

## 1. 功能範圍

| 功能 | 說明 |
|---|---|
| 雙語對照翻譯 | 頁面段落原文下方注入譯文，保留排版 |
| 選取文字翻譯 | 反白文字後顯示浮動 popup 譯文 |
| YouTube 字幕翻譯 | 自動字幕雙語疊加（原文 + 譯文） |
| 懸浮圖標 | 右下角浮動按鈕，展開開關選單 |
| 快捷鍵 | Alt+A 切換頁面雙語翻譯開/關 |
| 設定頁 | OpenCode Server URL、Provider、Model、目標語言 |

**本期不做：** AI Provider 進階設定 UI（provider 列表管理等）。

---

## 2. 技術選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| Extension 框架 | WXT (wxt.dev) | MV3 first-class、自動 manifest、Vite 驅動、TypeScript |
| UI | Vanilla TS + CSS | 無 React/Vue 依賴，bundle 小 |
| 目標瀏覽器 | Chrome + Edge | 同一套 MV3 build |
| Manifest | V3 | 現代 extension 標準 |

---

## 3. 架構

```
[Content Script]      ──chrome.runtime.sendMessage──>  [Background SW]
[YouTube CS]          ──chrome.runtime.sendMessage──>  [Background SW]
                                                              |
                                                    POST /v1/chat/completions
                                                              |
                                                    [OpenCode Server]
                                                    provider: openai
                                                    model: chatgpt5.5
```

所有 HTTP 請求集中在 Background Service Worker，Content Script 不直接呼叫外部 API。

---

## 4. Entrypoints

```
src/
  entrypoints/
    background.ts           # Service worker：HTTP 翻譯請求、訊息路由
    content.ts              # 所有頁面：雙語注入 + 選取翻譯 + 懸浮按鈕
    content-youtube.ts      # YouTube 專用：字幕 MutationObserver
    options/
      index.html
      index.ts              # 設定頁
    popup/
      index.html
      index.ts              # 點擊 extension icon 的 popup（快速開關）
  lib/
    opencode-client.ts      # HTTP client，呼叫 OpenCode server
    translator.ts           # 翻譯邏輯：rate limit、cache、重試
    storage.ts              # chrome.storage 型別安全封裝
    bilingual-injector.ts   # DOM：段落掃描 + 譯文節點注入
    youtube-caption.ts      # YouTube 字幕抓取與疊加
    selection-popup.ts      # 選取翻譯浮動 popup
    floating-button.ts      # 懸浮圖標與選單
```

---

## 5. 各功能設計

### 5.1 雙語對照翻譯

- **觸發：** Alt+A 或懸浮按鈕點擊
- **掃描對象：** `p, h1, h2, h3, h4, h5, h6, li, td, blockquote`（排除已翻譯節點）
- **注入方式：**  
  ```html
  <p>原文段落</p>
  <p class="xt-translation">譯文段落</p>  <!-- 灰色、較小字體 -->
  ```
- **並發限制：** 最多 5 個同時進行的翻譯請求
- **批次：** 每次最多 500 字元一批送出，減少請求數
- **關閉翻譯：** 移除所有 `.xt-translation` 節點

### 5.2 選取文字翻譯

- **觸發：** `mouseup` 事件，偵測 `window.getSelection()` 非空
- **顯示：** 選取區塊右下角出現浮動卡片
  ```
  ┌─────────────────┐
  │ 原文：Hello     │
  │ 譯文：你好      │
  └─────────────────│
  ```
- **關閉：** 點擊外部 / Escape / 新的選取
- **最小觸發長度：** 2 字元（避免單字母誤觸）

### 5.3 YouTube 字幕翻譯

- **目標元素：** `.ytp-caption-segment`
- **偵測機制：** `MutationObserver` 監聽字幕容器
- **疊加方式：** 在字幕容器下方插入譯文行，與原文分開顯示
- **快取：** 最近 200 條字幕 LRU cache，相同字幕不重複請求
- **去抖：** 字幕出現後 200ms 才送翻譯請求（避免中途截斷字幕）

### 5.4 懸浮圖標

- **位置：** 右下角固定，可拖移
- **展開選單圖示（參考 Immersive Translate 樣式）：**
  - 雙語翻譯：開/關
  - 選取翻譯：開/關
- **狀態持久化：** `chrome.storage.local`

### 5.5 快捷鍵

| 快捷鍵 | 動作 |
|---|---|
| Alt+A | 切換目前頁面雙語翻譯開/關 |

在 `manifest` 的 `commands` 宣告，background 接收並轉發給 active tab content script。

---

## 6. OpenCode Client

OpenCode server 使用 session-based API（非 `/v1/chat/completions`）。每次翻譯請求流程：

```
1. POST {serverUrl}/session
   Body: { title: "translator", agent: "general", model: { providerID, id, variant: "default" } }
   → 回傳 { id: sessionId }

2. POST {serverUrl}/session/{sessionId}/message
   Body: { agent: "general", model: { providerID, id, variant: "default" },
           system: "你是翻譯助手，將使用者的文字翻譯成{targetLang}，只輸出譯文，不加任何說明。",
           parts: [{ type: "text", text: "{originalText}" }] }
   → 回傳 { parts: [{ type: "text", text: "譯文" }] }

3. DELETE {serverUrl}/session/{sessionId}   (fire-and-forget cleanup)
```

Model 設定格式：`providerID = "openai"`、`id = "chatgpt5.5"`，對應 settings 的 Provider + Model 欄位。

- **Session create timeout：** 10 秒
- **Message timeout：** 30 秒（翻譯比一般 AI 任務快，不需要 120 秒）
- **重試：** 網路錯誤時最多 2 次，指數退避
- **錯誤處理：** server 不可達時，翻譯請求靜默失敗（不 alert 使用者），懸浮按鈕顯示警示圖示
- **無 token/auth**：不帶 Authorization header

---

## 7. Settings（Options 頁）

| 欄位 | 預設值 | 說明 |
|---|---|---|
| OpenCode Server URL | `http://localhost:3000` | 必填 |
| Provider | `openai` | 傳給 server 的 provider 參數 |
| Model | `chatgpt5.5` | 傳給 server 的 model 參數 |
| 目標語言 | `繁體中文` | 翻譯目標語言 |

---

## 8. Storage Schema

```typescript
interface ExtensionSettings {
  serverUrl: string;         // OpenCode server URL
  provider: string;          // default: "openai"
  model: string;             // default: "chatgpt5.5"
  targetLang: string;        // default: "繁體中文"
  bilingualEnabled: boolean; // default: false
  selectionEnabled: boolean; // default: true
}
```

---

## 9. 不在本期範圍

- Provider 列表管理 UI
- 多語言 UI（extension 介面固定繁體中文）
- Firefox 支援
- 雲端同步設定
- 翻譯記錄 / 歷史
