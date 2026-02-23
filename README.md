# Userscript2ChromeExtention

Convert UserScript (`.user.js`) into a Chrome Extension Manifest V3 package.

## Features

- Import script from Greasy Fork or paste source directly
- Convert to MV3 extension files
- Agent mode with dynamic file planning, check, and fix loop
- Download as `.zip` for loading in `chrome://extensions`

## Quick Start

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Usage

1. Paste a UserScript (or import from Greasy Fork URL)
2. Click `Convert`
3. Review generated files and notes
4. Click `下载 .zip`
5. Load unpacked extension in Chrome developer mode

## License

MIT. See `LICENSE`.
