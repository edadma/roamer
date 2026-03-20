# Roamer

A cross-platform file explorer inspired by Dolphin, with an integrated terminal panel. Built with Electron, React, and TypeScript. Works on any POSIX-compliant OS including macOS and Linux.

## Install (macOS)

```bash
brew install --cask edadma/tap/roamer
```

To update to the latest version:

```bash
brew update && brew upgrade --cask roamer
```

> **Note:** Roamer is not yet code-signed. On first launch, right-click the app and select "Open" to bypass Gatekeeper.

## Features

### File Management
- **Grid and list views** — toggle between icon grid and detailed list (name, size, ls-style permissions, owner, modified date)
- **Image thumbnails** — cached in PetraDB for instant loading (JPEG, PNG, GIF, WebP, BMP)
- **Symlink support** — shows link target (`→ target`) and `l` prefix in permissions
- **Dual panel** split view for side-by-side file browsing
- **Drag & drop** between panels — default is move, hold Cmd/Alt to copy
- **Copy/Cut/Paste** — Cmd+C, Cmd+X, Cmd+V (cut files appear dimmed until pasted)
- **Delete to Trash** — Backspace or Cmd+Backspace (files go to macOS Trash)
- **Undo** — Cmd+Z to undo moves, copies, and deletes
- **Rename** — F2 or right-click → Rename for inline editing
- **Create** — Cmd+N (new file), Cmd+Shift+N (new folder), or right-click → New File/Folder
- **Open files** — double-click opens in default app; executables run in the terminal
- **Run executables** — double-click or right-click → Run in Terminal
- **Copy Path** — right-click → Copy Path to clipboard
- **Selection** — click, Cmd+click (toggle), Shift+click (range), Cmd+A (select all), rubber band drag
- **Git status indicators** — files color-coded by status (modified, staged, untracked, deleted, renamed)
- **Hidden files toggle** in the status bar
- **Live directory watching** — panels auto-refresh when files change on disk

### Info Panel
- **Click a file** to show details panel on the right — image preview, text preview (first 4KB), file size, dates, ls-style permissions, owner, symlink target
- **Resizable** via splitter, dismiss with X or click empty space

### Navigation
- **Back/Forward/Up** buttons with tooltips
- **Editable breadcrumb path bar** — click segments to navigate, double-click or pencil icon to type a path
- **Places sidebar** — bookmarked locations (Home, Desktop, Documents, Downloads); right-click a folder → Add to Places
- **Persistent places** — custom bookmarks saved to PetraDB (file-backed in production)
- **Window title** shows current path
- **CLI launcher** — type `roamer` from any terminal to open in the current directory

### Integrated Terminal
- **Full shell** (zsh) at the bottom of the window, connected via node-pty
- **Auto cd** — terminal follows the active panel's directory
- **Always focused** — terminal accepts keyboard input regardless of UI interactions
- **Resizable** — drag the splitter bar to resize

### Layout
- **Resizable splitters** between sidebar, file panels, terminal, and info panel
- **Active panel indicator** — blue outline shows which panel has focus
- **Status bar** — git branch name, item count, selection count, hidden files toggle
- **Error auto-dismiss** — errors clear after 5 seconds

## Development

```bash
npm install
npm run dev:electron    # Dev mode with hot reload
npm run electron        # Production build + launch
npm run dist            # Build macOS DMG
```

## Tech Stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop app
- [React](https://react.dev/) + TypeScript — UI
- [AsterUI](https://asterui.com/) — component library (Button, Typography)
- [PetraDB](https://petradb.com/) + [Quarry](https://petradb.com/quarry/) — embedded database + query builder
- [xterm.js](https://xtermjs.org/) + [node-pty](https://github.com/microsoft/node-pty) — terminal emulator
- [DaisyUI](https://daisyui.com/) + [Tailwind CSS](https://tailwindcss.com/) — styling
- [Vite](https://vite.dev/) — build tooling
- [electron-builder](https://www.electron.build/) — packaging & distribution

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+C | Copy selected files |
| Cmd+X | Cut selected files (dimmed until pasted) |
| Cmd+V | Paste into active panel |
| Cmd+A | Select all files |
| Backspace / Delete | Move selected files to Trash |
| Cmd+Z | Undo last file operation |
| Cmd+N | New file |
| Cmd+Shift+N | New folder |
| F2 | Rename selected file |
| Click | Select file |
| Cmd+Click | Toggle file selection |
| Shift+Click | Range select |
| Double-click | Open file / enter folder |
