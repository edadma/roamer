# Roamer

A cross-platform file explorer inspired by Dolphin, with an integrated terminal panel. Built with Electron, React, and TypeScript.

## Install (macOS)

```bash
brew install --cask edadma/tap/roamer
```

> **Note:** Roamer is not yet code-signed. On first launch, right-click the app and select "Open" to bypass Gatekeeper.

## Features

### File Management
- **Grid view** with extension-based icons (images, video, audio, code, documents, archives, etc.)
- **Dual panel** split view for side-by-side file browsing (toggle with toolbar button)
- **Drag & drop** between panels — default is move, hold Cmd/Alt to copy
- **Copy/Cut/Paste** — Cmd+C, Cmd+X, Cmd+V
- **Delete to Trash** — Cmd+Backspace (files go to macOS Trash, not permanent delete)
- **Undo** — Cmd+Z to undo moves, copies, and deletes
- **Selection** — click, Cmd+click (toggle), Shift+click (range), rubber band drag select
- **Hidden files toggle** in the status bar
- **Live directory watching** — panels auto-refresh when files change on disk

### Navigation
- **Back/Forward/Up** buttons
- **Editable breadcrumb path bar** — click segments to navigate, double-click or pencil icon to type a path
- **Places sidebar** — bookmarked locations (Home, Desktop, Documents, Downloads)

### Integrated Terminal
- **Full shell** (zsh) at the bottom of the window, connected via node-pty
- **Auto cd** — terminal follows the active panel's directory
- **Always focused** — terminal accepts keyboard input regardless of UI interactions
- **Resizable** — drag the splitter bar to resize

### Layout
- **Resizable splitters** between sidebar, file panels, and terminal
- **Active panel indicator** — blue outline shows which panel has focus
- **Status bar** — item count, selection count, hidden files toggle

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
| Cmd+X | Cut selected files |
| Cmd+V | Paste into active panel |
| Cmd+Backspace | Move selected files to Trash |
| Cmd+Z | Undo last file operation |
| Click | Select file |
| Cmd+Click | Toggle file selection |
| Shift+Click | Range select |
