# 📓 sudoNotes

<div align="center">

**A static, GitHub-hosted academic notes platform & STEM Markdown authoring environment.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![KaTeX](https://img.shields.io/badge/LaTeX-KaTeX%20%2B%20mhchem-green.svg)](https://katex.org)
[![Mermaid](https://img.shields.io/badge/Diagrams-Mermaid-ff69b4.svg)](https://mermaid.js.org)
[![Offline](https://img.shields.io/badge/Offline-File%20System%20Access-orange.svg)](#offline--local-mode)
[![Dark Mode](https://img.shields.io/badge/Theme-Strictly%20Dark-111111.svg)](#design-philosophy)

[**Read the Full User Guide & Manual (USER_GUIDE.md)**](USER_GUIDE.md)

</div>

---

## 🌟 Key Features

- **⚡ MarkText-Style Live Block Editor**: Click any block in your rendered note to edit its Markdown in place; blur or `Ctrl+Enter` re-renders instantly.
- **📐 Comprehensive Math Suite (Phases 10B–10F)**:
  - Bundled **KaTeX** and **mhchem** chemistry support.
  - Shortcuts: `Ctrl+M` (inline `$`), `Ctrl+Shift+M` (display `$$`), `Ctrl+Alt+M` (symbol palette).
  - Live auto-conversions inside math (`->` to `\to`, `<=` to `\le`, `!=` to `\ne`, `inf` to `\infty`).
  - Backslash auto-complete suggestions (`\al` $\to$ `\alpha`).
  - Searchable Symbol Palette with ~250 symbols, Recents, and starred Favorites.
  - Interactive Fill-in Templates (Fractions, Roots, Summations, Integrals, Matrices, Cases) with **`Tab` jumping** between parameter fields.
  - Click any rendered formula to edit it in a focused popover.
- **📊 Interactive Table Builder (Phase 11)**: Visual $R \times C$ grid selector in the insert menu.
- **🖼️ Image Management (Phase 12)**: Easy image insertion with live `+` / `−` scaling and alignment controls.
- **📈 Mermaid & Footnotes (Phase 13)**: Interactive diagram starter gallery and automated footnotes.
- **💡 Active Recall Q&A Blocks (Phase 14)**: Question, Options, and collapsible click-to-reveal Answer in styled blockquotes.
- **🔍 Global Quick Search (Phase 15)**: Press `Ctrl+P` or `Ctrl+K` from anywhere to jump to any subject or topic.
- **🔒 Zero-Server Admin Auth**: PBKDF2-SHA256 (600,000 iterations) + AES-GCM encrypted PAT in `auth.json`. The token lives only in browser memory and auto-locks after 30 minutes of inactivity.
- **💾 Atomic Git Staging Dock**: Make multiple additions, renames, and note edits; review them in the sidebar dock and commit them as **one single atomic Git commit**.
- **🔌 Offline Local Mode**: Open locally in Chrome/Edge/Brave and synchronize directly to your computer's cloned `notes/` folder using the native File System Access API.

---

## 🚀 Quick Start

### 1. View Notes
Simply open `index.html` in any modern web browser or host on **GitHub Pages**.

### 2. Configure Notes Repository
In `config.js`:
```javascript
window.NOTES_CONFIG = {
  owner: "your-username",
  repo: "your-notes-repo",
  branch: "main",
  root: "notes",
};
```

### 3. Unlock Writing Mode (Admin)
1. Run `setup.html` in your browser.
2. Enter your GitHub token and credentials to generate `auth.json`.
3. Commit `auth.json` to the root of your site repository.
4. Click **W** in the mode dock, enter your password, and start writing!

---

## ⌨️ Common Shortcuts

| Action | Shortcut |
| :--- | :--- |
| **Save all changes** | `Ctrl + S` |
| **Edit note / Done** | `Ctrl + E` |
| **Global topic search** | `Ctrl + P` or `Ctrl + K` |
| **Inline math formula** | `Ctrl + M` |
| **Display math block** | `Ctrl + Shift + M` |
| **Symbol palette** | `Ctrl + Alt + M` |
| **Jump between template fields** | `Tab` / `Shift + Tab` |
| **Slash command menu** | `/` (in empty block) |
| **Cheat sheet & help** | `Ctrl + /` or `?` |

---

## 📖 Complete Documentation

For an exhaustive, step-by-step breakdown of every feature, formatting rule, and shortcut, see the [**User Guide (USER_GUIDE.md)**](USER_GUIDE.md).
