# sudoNotes — Complete User Guide & Feature Manual

> **sudoNotes — A static, GitHub-hosted academic notes and STEM authoring platform.**  
> Featuring a real-time MarkText-style block editor, KaTeX math authoring with auto-conversions, interactive table and diagram generators, atomic Git version control, and offline local folder synchronization.

---

## Table of Contents

1. [Architecture & Core Concepts](#1-architecture--core-concepts)
2. [Getting Started & Admin Setup](#2-getting-started--admin-setup)
3. [Reading Experience](#3-reading-experience)
4. [Subject, Chapter & Topic Organization](#4-subject-chapter--topic-organization)
5. [The Mode Dock & Atomic Git Staging](#5-the-mode-dock--atomic-git-staging)
6. [MarkText-Style Live Block Editor](#6-marktext-style-live-block-editor)
7. [Speed-First Inline Formatting & Floating Toolbar](#7-speed-first-inline-formatting--floating-toolbar)
8. [Smart Typing, Auto-Pairing & Slash Menu](#8-smart-typing-auto-pairing--slash-menu)
9. [Math & LaTeX Authoring Suite](#9-math--latex-authoring-suite)
   - [Math Shortcuts & Auto-Conversions](#math-shortcuts--auto-conversions)
   - [Backslash Inline Auto-Suggestions](#backslash-inline-auto-suggestions)
   - [Symbol Palette, Recents & Favorites](#symbol-palette-recents--favorites)
   - [Fill-in Templates & Tab Field Navigation](#fill-in-templates--tab-field-navigation)
   - [Click-to-Edit Formula Popover](#click-to-edit-formula-popover)
   - [Searchable LaTeX Cheat Sheet](#searchable-latex-cheat-sheet)
10. [Tables, Media, Diagrams & Study Components](#10-tables-media-diagrams--study-components)
    - [Interactive Table Builder](#interactive-table-builder)
    - [Image Insertion & Live Resizing](#image-insertion--live-resizing)
    - [Mermaid Diagrams](#mermaid-diagrams)
    - [Footnotes](#footnotes)
    - [Q&A Interactive Study Blocks](#qa-interactive-study-blocks)
11. [Global Quick Search](#11-global-quick-search)
12. [Offline / Local Mode](#12-offline--local-mode)
13. [Complete Keyboard Shortcuts Reference](#13-complete-keyboard-shortcuts-reference)

---

## 1. Architecture & Core Concepts

sudoNotes is designed for zero maintenance, high speed, and complete data portability:

- **Static & Serverless**: Hosted on GitHub Pages with vanilla HTML, CSS, and modern modular JavaScript. Requires no backend server, database instances, or subscription services.
- **Dual-Repository Architecture**:
  - **Site Repository**: Houses the web application, CSS, and encrypted admin credentials (`auth.json`).
  - **Notes Repository**: A separate, public GitHub repository where all your markdown notes live. Because note edits are committed only to the notes repo, writing and updating notes **never triggers a rebuild of GitHub Pages**.
- **Pure Markdown & Portable Standards**: All notes are stored as standard `.md` files in clean directory hierarchies:
  ```text
  notes/
    └── <Subject>/
        └── Chapter 00 - Introduction/
            ├── 0.1 Welcome.md
            └── 0.2 Quick Start.md
  ```
- **Strictly Dark Aesthetic**: Inspired by Notion and GitHub Dark. Near-black background (`#0e0e11`), subtle surface layers (`#15151a`), thin hairline borders, Inter UI typography, and JetBrains Mono for code.

---

## 2. Getting Started & Admin Setup

### Public Reading vs. Admin Writing
- **R (Reading Mode)**: Default state for all visitors. Clean, distraction-free reading without any editing controls or clutter.
- **W (Writing Mode)**: Unlocks full editing, adding chapters, reordering topics, and saving changes. Accessible by clicking the **W** button in the mode dock.

### Creating Admin Credentials (`setup.html`)
To enable writing to your GitHub notes repository from the browser:
1. Open `setup.html` in your browser.
2. Enter your **Notes Repository** (`owner/repo`) and your **Site Repository**.
3. Generate a GitHub **Fine-Grained Personal Access Token (PAT)**:
   - Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
   - Select both your Notes repo and Site repo.
   - Set **Repository permissions → Contents** to **Read and write**.
4. Choose an **Admin Username** and **Password** (10+ characters).
5. Click **Generate auth.json**. The page derives an AES-GCM cryptographic key using **PBKDF2-SHA256 (600,000 iterations)** to securely encrypt your GitHub token.
6. Download or copy `auth.json` and commit it to the root of your **Site Repository**.
7. Now, clicking **W** on the site asks for your credentials. Once decrypted into browser memory, you can edit and commit directly. The decrypted token is never written to disk or sent to any server.

---

## 3. Reading Experience

- **Subject Tiles Grid**: The home page presents all subjects as clean, auto-wrapping cards with subtle hover elevations. The most recently opened subject features an active indicator dot.
- **Dual-Pane Workspace**: On subject pages, a resizable index sidebar (`clamp(320px, 26vw, 380px)`) stays docked alongside the reading canvas.
- **Accordion Chapters**: Clicking a chapter expands its topics while automatically collapsing the previously opened chapter, keeping the index tidy.
- **Sequential Navigation**: The bottom of each note provides "← Previous" and "Next →" buttons to navigate sequentially through the syllabus.
- **Automatic Table of Contents**: Notes with 4 or more H2/H3 headings automatically render a collapsible **On this page** table of contents at the top.
- **Code Highlighting & Copy**: Fenced code blocks (`js`, `py`, `cpp`, `bash`, `sql`, `html`, etc.) are styled in GitHub Dark with language labels and a one-click **Copy** button.

---

## 4. Subject, Chapter & Topic Organization

In writing mode (**W**), the entire hierarchy can be managed directly in the interface without opening git or terminal:

### Subjects
- **Create**: Click the `+` button next to "Subject List" on the home page.
- **Rename**: Open the subject, click the `⋯` menu next to the subject title in the sidebar, and choose **Rename subject**. All nested folders are moved automatically.
- **Delete**: Choose **Delete subject** from the `⋯` menu with full confirmation.

### Chapters
- **Auto-Numbering**: Chapters automatically number starting at `00`, then `01`, `02`, etc.
- **Insert**: Choose **Insert new chapter** from the subject `⋯` menu.
- **Rename**: Change the title while preserving the number.
- **Change Chapter Number**: Manually override the number; all internal topic files are renumbered automatically (e.g., `1.1` becomes `2.1`).
- **Move Up / Down**: Swaps numbers with the adjacent chapter.
- **Automatic Renumbering on Delete**: Deleting a middle chapter (e.g. Chapter 02) automatically shifts all higher chapters down by one (`03` becomes `02`), keeping numbering perfectly continuous.

### Topics
- **File Pattern**: Stored as `N.M Title.md` (e.g. `1.1 Variables.md`).
- **Add Topic**: Open chapter `⋯` → **Add topic**. The index auto-increments (e.g., `1.1`, `1.2`, `1.3`).
- **Reorder Topics**: Click `⋯` on any topic row to **Move up** or **Move down**.
- **Delete Topic**: Deleting a topic shifts subsequent topics down by one, keeping indexes gapless.

---

## 5. The Mode Dock & Atomic Git Staging

Traditional web editors commit to GitHub on every single keystroke or edit, creating cluttered commit logs and risk of broken states. sudoNotes uses a **two-phase virtual staging system**:

```text
┌────────────────────────────────────────────────────────┐
│                      Mode Dock                         │
├────────────────────────────────────────────────────────┤
│ [ R ] [ W ]                ● 3 unsaved changes         │
├────────────────────────────────────────────────────────┤
│ [   Save Changes   ]   [ Undo Last ]   [   Discard   ] │
└────────────────────────────────────────────────────────┘
```

1. **In-Memory Virtual Tree**: When you add chapters, reorder topics, or edit notes, changes are staged instantly in memory and rendered on a virtual file tree.
2. **Mode Dock**: Sits at the bottom of the sidebar (and bottom-left on the home page). Expands smoothly when changes are pending, displaying the count chip and action buttons:
   - **Save**: Folds all pending operations into **one atomic commit** using GitHub's Git Data Trees API.
   - **Undo last**: Reverts the most recent staged operation.
   - **Discard**: Drops all staged changes and reloads the repository state after confirmation.
3. **Smart Conflict Replay**: If the repository was modified elsewhere while you were editing, clicking Save re-fetches the latest branch head and **replays** your pending actions on top of it.
4. **Guards Against Lost Work**: The browser warns you if you attempt to close the tab with unsaved edits, and the app prompts you if you try to switch back to reading mode.

---

## 6. MarkText-Style Live Block Editor

The editor brings the fluidity of MarkText and Notion to Markdown:

- **WYSIWYG Block Rendering**: Notes are rendered as clean, formatted blocks. Clicking any paragraph, heading, list, or quote immediately transforms it into an auto-growing monospace editor for that exact block.
- **Instant Render on Blur**: Pressing `Ctrl+Enter` or clicking outside the block commits and renders that block immediately.
- **Byte-Exact Model**: Behind the scenes, the block parser ensures that your raw Markdown is preserved byte-for-byte, preventing unwanted syntax reformatting.
- **Block Action Menu (`⋮`)**: Hover over any rendered block to reveal the handle on the left:
  - **Move Up / Move Down** (or press `Alt+Up` / `Alt+Down`).
  - **Duplicate**: Creates an exact copy of the block.
  - **Delete**: Removes the block and triggers an 8-second **Undo** notification in the toast stack.
- **Source View Toggle**: Want full control? Click **Source** in the bottom action bar to switch from block view to a full-document raw Markdown editor.

---

## 7. Speed-First Inline Formatting & Floating Toolbar

### Keyboard Formatting Shortcuts
Formatting text requires zero Markdown syntax memorization:

| Format | Keyboard Shortcut | Markdown Output |
| :--- | :--- | :--- |
| **Bold** | `Ctrl + B` (or `Cmd + B`) | `**text**` |
| *Italic* | `Ctrl + I` (or `Cmd + I`) | `*text*` |
| <u>Underline</u> | `Ctrl + U` (or `Cmd + U`) | `<u>text</u>` |
| ~~Strikethrough~~ | `Ctrl + Shift + X` | `~~text~~` |
| `Inline Code` | `Ctrl + \`` | `` `text` `` |
| <mark>Highlight</mark> | `Ctrl + Shift + H` | `<mark>text</mark>` |
| <kbd>Keyboard Key</kbd> | `Ctrl + Shift + K` | `<kbd>key</kbd>` |
| <sup>Superscript</sup> | `Ctrl + Shift + .` | `<sup>text</sup>` |
| <sub>Subscript</sub> | `Ctrl + Shift + ,` | `<sub>text</sub>` |
| Link | `Ctrl + K` | `[text](url)` |
| Heading 1–6 | `Ctrl + Alt + 1` … `6` | `# `, `## `, etc. |
| Paragraph | `Ctrl + Alt + 0` | Strips `#` prefix |

*Tip: Pressing a formatting shortcut on text that is already formatted cleanly **unwraps** the formatting.*

### Floating Selection Toolbar (`NotesToolbar`)
Selecting any text inside a block or the Source editor reveals a floating toolbar right above your selection:
- **Style Picker (`Aa`)**: Switch between Paragraph and Headings H1 through H6.
- **Inline Styles**: Bold, Italic, Underline, Strikethrough, Code (`</>`), and Keyboard Key (`<kbd>`) buttons.
- **Color Swatches (`A`) & Highlight**: Choose from 25 rich color swatches (Yellow, Neon Lime, Emerald, Mint, Cyan, Sky Blue, Blue, Indigo, Violet, Purple, Pink, Rose, Crimson, Coral, Orange, Amber, Gold, Peach, Soft Ice, Lavender, Slate, Charcoal, etc.) or clear color.
- **Background Highlighter**: Apply background colors to text spans.
- **Block Alignment**: Left, Center, Right, or Justify paragraphs and headings.
- **More Menu (`⋯`)**: Keyboard key (`<kbd>`), Superscript, Subscript, and **Clear Formatting**.

---

## 8. Smart Typing, Auto-Pairing & Slash Menu

### Smart Typing Behavior
- **List Continuation**: Pressing `Enter` inside a bulleted list (`- `), numbered list (`1. `), or task list (`- [ ] `) continues the list with the correct indentation and incremented number.
- **Outdenting**: Pressing `Enter` on an empty list item removes the bullet or outdents one level; pressing `Enter` again creates a new block below.
- **Tab & Shift+Tab**: Indents or outdents list items and code block lines.
- **Code Fence Closure**: Typing ` ```python ` at the beginning of a line and pressing `Enter` automatically creates the closing ` ``` ` with your cursor positioned in the middle.
- **Auto-Pairing**: Typing `(`, `[`, `{`, `"`, or `` ` `` automatically inserts the closing character and places your cursor between them. Typing the closing character skips over it; pressing Backspace deletes both.
- **Smart Link Paste**: Selecting text and pasting a URL (`Ctrl+V`) turns the selection into `[Selected Text](https://url)` automatically.

### The Slash Menu (`/`)
In an empty block, type `/` to open the command palette. As you type, the menu filters instantly:
- `/p` → Paragraph
- `/h1` through `/h6` → Headings
- `/ul` or `/bullet` → Bulleted list
- `/ol` or `/num` → Numbered list
- `/task` or `/todo` → Checklist (`- [ ] `)
- `/code` → Code block with language selector
- `/math` → LaTeX display formula block (`$$`)
- `/table` → Visual table builder
- `/img` → Image insertion dialog
- `/mermaid` → Mermaid diagram starter
- `/qa` → Interactive Q&A study block

---

## 9. Math & LaTeX Authoring Suite

Built specifically for mathematics, computer science, physics, and discrete math, powered by **bundled KaTeX and mhchem**:

### Math Shortcuts & Auto-Conversions
- **Inline Math**: Press `Ctrl + M` to insert `$|$` (or wrap selected text).
- **Display Math Block**: Press `Ctrl + Shift + M` to insert:
  ```latex
  $$
  |
  $$
  ```
- **Context-Aware Auto-Conversions**: While your cursor is inside math (`$...$`, `$$...$$`, or ```` ```math ````), plain-text typing transforms into LaTeX symbols on the fly:
  - `->` $\longrightarrow$ `\to `
  - `<=` $\longrightarrow$ `\le `
  - `>=` $\longrightarrow$ `\ge `
  - `!=` $\longrightarrow$ `\ne `
  - `...` $\longrightarrow$ `\dots `
  - `inf` $\longrightarrow$ `\infty `
  - `=>` $\longrightarrow$ `\Rightarrow `
  - `~=` $\longrightarrow$ `\approx `

### Backslash Inline Auto-Suggestions
Type `\` followed by any letters while inside math (e.g. `\al`, `\in`, `\sig`) to open a dropdown of matching LaTeX symbols:
- Press **Arrow Down / Up** to highlight.
- Press **Tab** or **Enter** to insert (e.g. `\alpha`, `\int`, `\sigma`).
- Press **Esc** to dismiss.

### Symbol Palette, Recents & Favorites
Press `Ctrl + Alt + M` (or click **Math symbols palette** in the menu) to open the KaTeX Symbol Palette:
- **Searchable**: Search over 250 symbols by plain English (`alpha`, `integral`, `subset`, `matrix`, `infinity`, `h-bar`).
- **Category Filter Chips**: Greek, Operators, Relations, Arrows, Logic & Sets, Calculus, Linear Algebra, Physics & Chem, Computer Science, and Probability.
- **Recents Row**: Remembers your 16 most recently used commands.
- **Favorites Row**: Click the star (★) or press `F` on any symbol to pin it to your favorites.
- **Blur Guard**: Opening the palette will never blur or dismiss your active block editor!

### Fill-in Templates & Tab Field Navigation
Insert complex mathematical structures from the `+` or `/` menus:
- **Fraction**: `\frac{num}{den}`
- **Square Root**: `\sqrt{x}`
- **Summation**: `\sum_{i=1}^{n} {}`
- **Integral**: `\int_{a}^{b} {} \, dx`
- **Limit**: `\lim_{x \to \infty} {}`
- **Piecewise Cases**: `f(x) = \begin{cases} ... \end{cases}`
- **Matrix**: `\begin{pmatrix} ... \end{pmatrix}`

> ⚡ **Tab-Jump Feature**: After inserting a template, pressing **`Tab`** jumps your cursor directly to the next `{}` parameter field! Pressing **`Shift + Tab`** jumps back to the previous field.

### Click-to-Edit Formula Popover
When reviewing your notes in writing mode, **click any rendered formula** to open the Formula Editor modal:
- Real-time rendered preview at the top.
- LaTeX input textarea with live KaTeX syntax error inspection.
- Direct launcher for the Symbol Palette.
- Click **Apply Formula** to update the document.

### Searchable LaTeX Cheat Sheet
Open the LaTeX Cheat Sheet from the shortcut modal (`Ctrl + /`) or the math menu to view an indexed quick-reference of all symbols and environments.

---

## 10. Tables, Media, Diagrams & Study Components

### Interactive Table Builder
Click `+` or type `/table` to open the visual grid builder:
1. Move your mouse over the 8×8 grid to preview dimensions.
2. **Locking Dimensions**: Click inside any grid cell to lock the selected rows and columns so mouse movement does not change your choice. You can also fine-tune dimensions with the `+` / `−` buttons or input fields.
3. **Google Docs-Style Visual Table Editor**: Instead of hand-editing raw Markdown pipes and dashes, click **Visual Editor** to edit table headers and cell values in a rich spreadsheet-like modal with direct column alignment controls and dynamic row/column additions.
4. **In-Block Table Toolbar**: When viewing a table in Write mode, an interactive action strip provides instant **Visual Editor**, **+ Row**, and **+ Col** buttons directly above the table.

### Variable-Dimension Matrices (Custom Dimensions & Bracket Styles)
1. Choose `/matrix` or **Matrix (Custom / Variable)** from the insert menu.
2. Select any dimensions from $1 \times 1$ up to $8 \times 8$ using interactive row and column counters.
3. Choose your bracket style:
   - `pmatrix` — Parentheses $( \dots )$
   - `bmatrix` — Square brackets $[ \dots ]$
   - `vmatrix` — Determinant $| \dots |$
   - `Bmatrix` — Curly braces $\{ \dots \}$
   - `matrix` — Plain (no brackets)
4. Fill in cell values in the visual grid with real-time **KaTeX live preview**.

### Visual Mermaid Diagram Studio
Click `+` or type `/mermaid` to launch the **Interactive Diagram Studio**:
- **Interactive Flowchart Builder**: Add steps, customize shapes (Rectangle, Decision Diamond, Rounded Box, Circle), set arrow links and decision conditions without writing any Mermaid syntax.
- **Ready Diagram Starters**: One-click starters for Flowcharts, Sequence Diagrams, Class Diagrams, State Machines, Git Branching Graphs, and Pie Charts.
- **Live Visual Rendering**: Instant diagram rendering powered by Mermaid directly in the dialog before inserting.
- **In-Block Edit Button**: Any diagram rendered in Write mode features an action strip to reopen the visual studio and edit diagrams in place.

### Image Insertion & Live Resizing
1. Click `+` or type `/image` to open the Image modal.
2. Enter the image URL or relative path, alt text, and alignment (Center, Left, Right).
3. **Interactive Sizing in Write Mode**: Hovering over any rendered image reveals controls:
   - `−` Decrease width by 10%.
   - `+` Increase width by 10%.
   - **Left / Center / Right**: Switch image alignment and text wrapping.

### Footnotes
Type `/footnote` to insert a footnote anchor `[^1]` at your cursor and automatically append the reference definition `[^1]: Footnote text here.` at the bottom of the note.

### Q&A Interactive Study Blocks
Designed for active recall and exam preparation:
1. Choose `/qa` or **Q&A study block** from the insert menu.
2. Enter the **Question**, optional **Options**, and the **Answer**.
3. **Clean Display Without Bullets**: Options are rendered exactly as entered in styled cards without forcing bullet points or unwanted ordered list markers.
4. Renders with an elegant click-to-reveal toggle:
   ```markdown
   > **Question:** What is the time complexity of QuickSort average case?
   >
   > <div class="qa-opts">
   > <div class="qa-opt">A) O(n)</div>
   > <div class="qa-opt">B) O(n log n)</div>
   > <div class="qa-opt">C) O(n^2)</div>
   > </div>
   >
   > <details>
   > <summary>Show Answer</summary>
   >
   > **Answer:** B) O(n log n)
   > </details>
   ```

---

## 11. Global Quick Search

Press **`Ctrl + P`** or **`Ctrl + K`** (or `Cmd + P` / `Cmd + K` on Mac) from anywhere in the application to open the **Global Topic Search**:
- Instantly searches across all subjects, chapters, and topics.
- Type any keywords or topic numbers (e.g. `2.1` or `dijkstra` or `binary`).
- Click any search result to jump directly to that note.
- Press **Esc** to dismiss.

---

## 12. Offline / Local Mode

When you clone the repository to your computer and open `index.html` locally:
- **Direct Disk Synchronization**: Uses the browser's native **File System Access API** (`showDirectoryPicker`) in Chrome, Edge, and Brave.
- **No Token Required**: Edits and reorders write directly to your local `notes/` folder on disk.
- **Git Friendly**: When you are back online, simply run `git add . && git commit -m "Updated notes" && git push` from your terminal to publish your changes.
- **Zero Internet Needed**: All fonts (Inter, JetBrains Mono), icons, KaTeX, highlight.js, and marked parsers are bundled locally in the `/lib` directory.

---

## 13. Complete Keyboard Shortcuts Reference

### Global Navigation & Workflow
| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| **Save all changes** | `Ctrl + S` | `Cmd + S` |
| **Edit note / Done** | `Ctrl + E` | `Cmd + E` |
| **Quick topic search** | `Ctrl + P` or `Ctrl + K` | `Cmd + P` or `Cmd + K` |
| **Keyboard shortcuts guide** | `Ctrl + /` or `?` | `Cmd + /` or `?` |
| **Cancel / Close dialog** | `Esc` | `Esc` |

### Block Editor Navigation
| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| **Commit block & next** | `Ctrl + Enter` | `Cmd + Enter` |
| **Move block up** | `Alt + Up` | `Option + Up` |
| **Move block down** | `Alt + Down` | `Option + Down` |
| **Cancel block edit** | `Esc` | `Esc` |
| **Open slash menu** | `/` (in empty block) | `/` (in empty block) |

### Inline Formatting
| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| **Bold** | `Ctrl + B` | `Cmd + B` |
| **Italic** | `Ctrl + I` | `Cmd + I` |
| **Underline** | `Ctrl + U` | `Cmd + U` |
| **Strikethrough** | `Ctrl + Shift + X` | `Cmd + Shift + X` |
| **Inline Code** | `Ctrl + \`` | `Cmd + \`` |
| **Highlight** | `Ctrl + Shift + H` | `Cmd + Shift + H` |
| **Superscript** | `Ctrl + Shift + .` | `Cmd + Shift + .` |
| **Subscript** | `Ctrl + Shift + ,` | `Cmd + Shift + ,` |
| **Link** | `Ctrl + K` | `Cmd + K` |
| **Headings 1–6** | `Ctrl + Alt + 1` … `6` | `Cmd + Option + 1` … `6` |
| **Paragraph** | `Ctrl + Alt + 0` | `Cmd + Option + 0` |

### Math & STEM Authoring
| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| **Inline formula (`$`)** | `Ctrl + M` | `Cmd + M` |
| **Display block (`$$`)** | `Ctrl + Shift + M` | `Cmd + Shift + M` |
| **Open Symbol Palette** | `Ctrl + Alt + M` | `Cmd + Option + M` |
| **Jump to next `{}` field** | `Tab` | `Tab` |
| **Jump to previous `{}` field** | `Shift + Tab` | `Shift + Tab` |
| **Toggle Favorite Symbol** | `F` | `F` |
| **Auto-convert arrows/relations** | `->`, `<=`, `>=`, `!=`, `...`, `inf` | `->`, `<=`, `>=`, `!=`, `...`, `inf` |
| **Command auto-complete** | `\` + letters, then `Tab` / `Enter` | `\` + letters, then `Tab` / `Enter` |

---

*sudoNotes — Designed for scholars, researchers, and engineers who demand speed, aesthetics, and precision.*
