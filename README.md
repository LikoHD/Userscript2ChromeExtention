# Userscript2ChromeExtention

Convert UserScript (`.user.js`) into a Chrome Extension Manifest V3 package.
将 UserScript（`.user.js`）转换为 Chrome Extension Manifest V3 扩展包。

## Features

- Import script from Greasy Fork or paste source directly
- Convert to MV3 extension files
- Agent mode with dynamic file planning, check, and fix loop
- Download as `.zip` for loading in `chrome://extensions`

## 功能特性（中文）

- 支持从 Greasy Fork 链接导入，或直接粘贴脚本
- 转换为 Chrome MV3 扩展文件结构
- Agent 模式支持动态文件规划、检查与修复循环
- 一键下载 `.zip`，可在 `chrome://extensions` 直接加载

## Quick Start

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## 快速开始（中文）

```bash
npm install
npm run dev
```

构建产物：

```bash
npm run build
```

## Usage

1. Paste a UserScript (or import from Greasy Fork URL)
2. Click `Convert`
3. Review generated files and notes
4. Click `下载 .zip`
5. Load unpacked extension in Chrome developer mode

## 使用方式（中文）

1. 粘贴 UserScript，或输入 Greasy Fork 链接后导入
2. 点击 `Convert`
3. 检查右侧生成文件与提示
4. 点击 `下载 .zip`
5. 在 Chrome 开发者模式中加载已解压扩展

## License

MIT. See `LICENSE`.
