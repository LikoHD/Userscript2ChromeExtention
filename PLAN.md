# script2extension — UserScript → Chrome MV3 Converter

## 项目概述

构建一个纯前端 Web 工具，将 Tampermonkey/Greasemonkey 用户脚本（`.user.js`）自动转换为 Chrome Extension Manifest V3 格式，并打包成可直接加载的 ZIP 文件。

**核心价值**：开发者写好油猴脚本后，无需手动创建 `manifest.json`、处理 `GM_*` API 替换、搭建扩展文件结构，一键完成转换。

---

## Tech Stack

- **Vite + React + TypeScript**
- **ShadCN UI**（Tailwind CSS 基础）
- **JSZip** — 浏览器内生成 ZIP，无需后端
- **无后端**，纯静态应用

---

## 输入方式

### 方式 A：直接粘贴脚本

用户将 `.user.js` 完整内容粘贴到 textarea。

### 方式 B：Greasy Fork URL 导入

用户粘贴如 `https://greasyfork.org/zh-CN/scripts/446342-telegram-media-downloader/code` 的链接。

**获取流程（无 CORS 限制）：**

1. 正则提取脚本 ID：`/scripts/(\d+)/`
2. `fetch('https://update.greasyfork.org/scripts/{ID}.meta.js')` → 解析 `@name`
3. `fetch('https://update.greasyfork.org/scripts/{ID}/{encodedName}.user.js')` → 获取完整代码
4. 自动填充到 textarea，触发转换

---

## 项目结构

```
script2extension/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── components.json              # ShadCN 配置
│
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # 双栏布局
│   │
│   ├── lib/                     # 纯逻辑，无 React 依赖
│   │   ├── parser.ts            # 解析 UserScript 头部
│   │   ├── manifest.ts          # 生成 manifest.json v3
│   │   ├── transformer.ts       # 转换脚本 + 注入 shims
│   │   ├── background.ts        # 生成 background.js
│   │   ├── zipper.ts            # JSZip 打包
│   │   ├── fetcher.ts           # Greasy Fork URL 抓取
│   │   ├── icons.ts             # Canvas 生成占位图标
│   │   └── shims/
│   │       ├── gm-xmlhttprequest.ts  # (内容端 shim 字符串)
│   │       ├── gm-storage.ts
│   │       ├── gm-style.ts
│   │       └── gm-misc.ts
│   │
│   ├── hooks/
│   │   └── useConverter.ts      # 状态管理 + 编排所有 lib/ 调用
│   │
│   ├── components/
│   │   ├── ui/                  # ShadCN 生成的组件
│   │   ├── Header.tsx
│   │   ├── InputPanel.tsx       # URL 输入 + textarea + 按钮
│   │   └── PreviewPanel.tsx     # 文件预览 tabs
│   │
│   └── index.css
│
└── public/
```

---

## 核心模块 API

### `src/lib/parser.ts`

```typescript
interface UserScriptMeta {
  name: string;
  description: string;
  version: string;
  matches: string[];          // @match + @include（转换后）
  excludeMatches: string[];   // @exclude
  requires: string[];         // @require URLs
  grants: string[];           // @grant 值列表
  runAt: string;              // normalized: "document_idle" etc.
  icon: string | null;        // @icon URL
}

export function parseUserScript(text: string): UserScriptMeta
```

**关键处理：**
- `@include` glob → Chrome match pattern（尽力转换，不能精确转换时加 warning）
- `@run-at document-end` → `"document_end"`（hyphen 转 underscore）
- `@grant none` → grants 为空数组

---

### `src/lib/fetcher.ts`

```typescript
// 从 Greasy Fork 详情页 URL 抓取脚本代码
export async function fetchFromGreasyFork(url: string): Promise<string>
// 内部步骤：
// 1. 提取 scriptId
// 2. fetch meta.js → 解析 @name
// 3. fetch {ID}/{encodedName}.user.js → 返回完整源码

export function isGreasyForkUrl(url: string): boolean
```

---

### `src/lib/manifest.ts`

```typescript
export function buildManifest(meta: UserScriptMeta, opts: {
  hasBackground: boolean
}): ManifestV3
```

**@grant → permissions 映射表：**

| @grant 值 | permissions | host_permissions |
|---|---|---|
| `GM_xmlhttpRequest` | — | `["<all_urls>"]` |
| `GM_setValue` / `GM_getValue` | `["storage"]` | — |
| `GM_notification` | `["notifications"]` | — |
| `GM_setClipboard` | `["clipboardWrite"]` | — |
| `GM_openInTab` | `["tabs"]` | — |
| `GM_addStyle` | — | — |
| `none` / 其他 | — | — |

---

### `src/lib/shims/gm-xmlhttprequest.ts`

**架构（MV3 唯一合规方案）：**

Content script 中注入消息发送 shim：

```js
function GM_xmlhttpRequest(details) {
  // 通过 chrome.runtime.sendMessage 委托给 background service worker
  chrome.runtime.sendMessage({ __gmxhr: true, ...details }, (response) => {
    // 调用 details.onload / details.onerror
  });
}
```

Background service worker 中处理：

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg.__gmxhr) return false;
  fetch(msg.url, { method: msg.method, headers: msg.headers, body: msg.data })
    .then(async r => sendResponse({ status: r.status, responseText: await r.text() }))
    .catch(err => sendResponse({ error: err.message }));
  return true; // 保持异步通道，不可省略
});
```

> **关键**：`return true` 不可省略，MV3 service worker 异步响应必须。

---

### `src/lib/transformer.ts`

```typescript
interface TransformResult {
  contentJs: string;
  backgroundJs: string | null;
  shimLog: Array<{ original: string; replacement: string }>
}

export function transformScript(text: string, meta: UserScriptMeta): TransformResult
```

生成的 `content.js` 结构：

```js
(function() {
  'use strict';
  // ── GM_* SHIMS ──
  // [根据 @grant 选择性注入]
  // ── ORIGINAL SCRIPT ──
  // [去掉 UserScript 头部的原始代码]
})();
```

---

### `src/lib/zipper.ts`

```typescript
export async function buildZip(files: {
  manifestJson: string;
  contentJs: string;
  backgroundJs: string | null;
  requireUrls: string[];
  iconUrl: string | null;
}, name: string): Promise<Blob>
```

**ZIP 内容：**

```
{name}.zip
├── manifest.json
├── content.js
├── background.js          （仅当 GM_xmlhttpRequest 被使用时）
├── require_0_{name}.js    （尝试 fetch @require，失败则附 warning）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png        （Canvas 渲染首字母占位图）
```

`@require` 处理：尝试 `fetch()` 内联，失败则在 ZIP 内附 `NOTES.md` 说明手动步骤。

---

## UI 布局（ShadCN UI）

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "script2extension"         [↓ Download Extension]   │
├──────────────────────┬──────────────────────────────────────┤
│  InputPanel (40%)    │  PreviewPanel (60%)                  │
│                      │                                      │
│  [Greasy Fork URL]   │  Badges: GM_xmlhttpRequest→fetch     │
│  [Import →]          │         GM_setValue→storage          │
│                      │                                      │
│  ┌────────────────┐  │  [manifest.json][content.js][bg.js]  │
│  │ // ==UserScript│  │  ┌────────────────────────────────┐  │
│  │ // @name ...   │  │  │ {                              │  │
│  │ ...            │  │  │   "manifest_version": 3,       │  │
│  │                │  │  │   ...                          │  │
│  └────────────────┘  │  └────────────────────────────────┘  │
│                      │                                      │
│  [Convert →]         │  ⚠ Warnings (if any)                 │
└──────────────────────┴──────────────────────────────────────┘
```

**ShadCN 组件清单：**

| 组件 | 用途 |
|---|---|
| `Button` | Convert、Import、Download |
| `Textarea` | 脚本输入 |
| `Input` | Greasy Fork URL |
| `Card` / `CardHeader` / `CardContent` | 面板容器 |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | 文件预览 |
| `Badge` | GM_* 转换标记 |
| `Alert` / `AlertDescription` | 警告信息 |
| `Separator` | 分隔线 |

---

## 数据流

```
[URL 输入] → fetcher.fetchFromGreasyFork()
                    ↓（填充 textarea）
[粘贴/填充脚本] → useConverter state
                    ↓（点击 Convert）
parser.parseUserScript()      → UserScriptMeta
transformer.transformScript() → { contentJs, backgroundJs, shimLog }
manifest.buildManifest()      → ManifestV3 object
                    ↓
setResult({ manifestJson, contentJs, backgroundJs, shimLog, warnings })
                    ↓（点击 Download）
zipper.buildZip()     → Blob
URL.createObjectURL() → <a download> trigger
```

---

## 实现顺序

1. **项目脚手架** — Vite + React + TS + Tailwind + ShadCN 初始化
2. **`lib/parser.ts`** — UserScript 头部解析（其他模块的基础）
3. **`lib/fetcher.ts`** — Greasy Fork URL 抓取
4. **`lib/shims/`** — 各 GM_* shim 字符串
5. **`lib/transformer.ts`** + **`lib/background.ts`** — 脚本转换
6. **`lib/manifest.ts`** — manifest.json 生成
7. **`lib/zipper.ts`** + **`lib/icons.ts`** — ZIP 打包
8. **`hooks/useConverter.ts`** — 状态编排
9. **UI 组件** — Header、InputPanel、PreviewPanel

---

## 验证步骤

1. `npm run dev` 启动后在浏览器打开
2. 粘贴真实 Tampermonkey 脚本（含 `GM_xmlhttpRequest`）→ 点击 Convert → 检查预览
3. 输入 Greasy Fork URL → Import → 自动填充并转换
4. 点击 Download → 解压 ZIP → 在 `chrome://extensions` 开发者模式加载
5. 确认扩展正常加载无报错，match patterns 正确，permissions 完整
