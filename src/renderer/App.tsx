import { useEffect, useState, useCallback, useRef } from 'react'
import { Typography, Button } from 'asterui'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, PencilSquareIcon, HomeIcon, ComputerDesktopIcon, DocumentIcon, ArrowDownTrayIcon, FolderIcon, ViewColumnsIcon } from '@aster-ui/icons'
import Splitter from './Splitter'
import FilePanel, { useFilePanel, type FilePanelState } from './FilePanel'
import InfoPanel from './InfoPanel'
import { initDb, getPlaces, type Place } from './db'
import type { FileEntry } from './types'

const { Text } = Typography

const placeIconMap: Record<string, typeof HomeIcon> = {
  home: HomeIcon,
  desktop: ComputerDesktopIcon,
  documents: DocumentIcon,
  downloads: ArrowDownTrayIcon,
}

declare global {
  interface Window {
    roamer: {
      platform: string
      readDirectory: (path: string) => Promise<FileEntry[]>
      getHome: () => Promise<string>
      getCwd: () => Promise<string>
      openFile: (filePath: string) => Promise<void>
      renameFile: (oldPath: string, newPath: string) => Promise<void>
      createFolder: (dirPath: string) => Promise<void>
      createFile: (filePath: string) => Promise<void>
      getFileInfo: (filePath: string) => Promise<{ size: number; modifiedAt: string; createdAt: string; isDirectory: boolean; mode: number }>
      readFilePreview: (filePath: string, maxBytes: number) => Promise<string>
      startDrag: (filePaths: string[]) => void
      copyFiles: (sources: string[], destDir: string) => Promise<{ src: string; dest: string; error?: string }[]>
      moveFiles: (sources: string[], destDir: string) => Promise<{ src: string; dest: string; error?: string }[]>
      trashFiles: (paths: string[]) => Promise<{ path: string; error?: string }[]>
      restoreFromTrash: (items: { name: string; originalPath: string }[]) => Promise<{ path: string; error?: string }[]>
      watchDirectory: (dirPath: string, callback: () => void) => () => void
      ptySpawn: (cwd: string) => Promise<void>
      ptyWrite: (data: string) => void
      ptyResize: (cols: number, rows: number) => void
      ptyKill: () => Promise<void>
      onEscape: (callback: () => void) => () => void
      onPtyData: (callback: (data: string) => void) => () => void
    }
  }
}

function PathBar({
  currentPath,
  onNavigate,
  onEditStart,
}: {
  currentPath: string
  onNavigate: (path: string) => void
  onEditStart?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEditing = () => {
    onEditStart?.()
    setEditValue(currentPath)
    setEditing(true)
    setTimeout(() => {
      const input = inputRef.current
      if (input) {
        const len = input.value.length
        input.setSelectionRange(len, len)
      }
    }, 0)
  }

  const commitEdit = () => {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== currentPath) {
      onNavigate(trimmed)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="input input-sm input-bordered flex-1 font-mono text-sm"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitEdit()
          if (e.key === 'Escape') cancelEdit()
        }}
        onBlur={commitEdit}
        autoFocus
      />
    )
  }

  const pathSegments = currentPath.split('/').filter(Boolean)
  const breadcrumbItems = [
    { title: '/', path: '/' },
    ...pathSegments.map((seg, i) => ({
      title: seg,
      path: '/' + pathSegments.slice(0, i + 1).join('/'),
    })),
  ]

  return (
    <div className="flex items-center flex-1 gap-1 min-w-0">
      <nav className="breadcrumbs text-sm" onDoubleClick={startEditing}>
        <ul>
          {breadcrumbItems.map((item, i) => (
            <li key={i}>
              <a onClick={() => onNavigate(item.path)} className="cursor-pointer">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        icon={<PencilSquareIcon />}
        onClick={startEditing}
      />
    </div>
  )
}

export default function App() {
  const [cwd, setCwd] = useState('')
  const [dbReady, setDbReady] = useState(false)
  const [placesList, setPlacesList] = useState<Place[]>([])
  const [splitView, setSplitView] = useState(false)
  const [activePanel, setActivePanel] = useState<'left' | 'right'>('left')
  const [inspectedFile, setInspectedFile] = useState<FileEntry | null>(null)

  const leftPanel = useFilePanel(cwd)
  const rightPanel = useFilePanel(cwd)
  const active = activePanel === 'left' ? leftPanel : rightPanel

  // Internal clipboard for file operations
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null)

  // Undo stack
  type UndoEntry =
    | { type: 'move'; items: { src: string; dest: string }[] }
    | { type: 'copy'; created: string[] }
    | { type: 'trash'; paths: string[] }
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])

  const xtermRef = useRef<XTerm | null>(null)

  useEffect(() => {
    initDb().then(async () => {
      setDbReady(true)
      try {
        const rows = await getPlaces()
        setPlacesList(rows.sort((a, b) => a.sortOrder - b.sortOrder))
      } catch (e) {
        console.error('Failed to load places:', e)
      }
    })
    window.roamer.getCwd().then((c) => setCwd(c))
  }, [])

  // Initialize xterm when the container mounts
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const ptyCleanupRef = useRef<(() => void) | null>(null)

  const termContainerCallback = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      resizeObserverRef.current?.disconnect()
      ptyCleanupRef.current?.()
      xtermRef.current?.dispose()
      xtermRef.current = null
      return
    }

    if (xtermRef.current) return

    const term = new XTerm({
      fontSize: 13,
      convertEol: true,
      cursorBlink: true,
      theme: {
        background: '#1d232a',
        foreground: '#a6adbb',
      },
    })
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    term.open(node)
    requestAnimationFrame(() => { fitAddon.fit(); term.focus() })
    xtermRef.current = term

    term.onData((data) => window.roamer.ptyWrite(data))

    ptyCleanupRef.current = window.roamer.onPtyData((data) => {
      term.write(data)
    })

    const observer = new ResizeObserver(() => fitAddon.fit())
    observer.observe(node)
    resizeObserverRef.current = observer
  }, [])

  // Keep terminal focused after UI interactions
  useEffect(() => {
    const refocus = (e: MouseEvent) => {
      // Don't steal focus from inputs (path bar, modals, etc.)
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // Don't steal focus if an input is currently focused
      requestAnimationFrame(() => {
        const active = document.activeElement?.tagName
        if (active === 'INPUT' || active === 'TEXTAREA') return
        xtermRef.current?.focus()
      })
    }
    document.addEventListener('mouseup', refocus)
    return () => document.removeEventListener('mouseup', refocus)
  }, [])

  // Escape key — Electron/Chromium swallows it on macOS, so we get it via IPC
  // and re-dispatch as a synthetic event so all onKeyDown handlers work
  useEffect(() => {
    return window.roamer.onEscape(() => {
      const target = document.activeElement || document
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
  }, [])

  // File operation keyboard shortcuts (Cmd+C, Cmd+X, Cmd+V, Cmd+Backspace)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {

      // Don't intercept when typing in inputs (path bar, modals)
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      // F2 — rename selected file
      if (e.key === 'F2' && active.selected.size === 1) {
        e.preventDefault()
        e.stopPropagation()
        active.startRename([...active.selected][0])
        return
      }

      // Delete/Backspace — with or without modifiers
      if ((e.key === 'Backspace' || e.key === 'Delete') && active.selected.size > 0) {
        e.preventDefault()
        e.stopPropagation()
        const paths = [...active.selected]
        window.roamer.trashFiles(paths).then((results) => {
          const ok = results.filter((r) => !r.error)
          const errors = results.filter((r) => r.error)
          if (errors.length > 0) {
            active.setError(`Failed: ${errors.map((e) => e.error).join(', ')}`)
          }
          if (ok.length > 0) {
            setUndoStack((s) => [...s, { type: 'trash', paths: ok.map((r) => r.path) }])
          }
          active.setSelected(new Set())
          leftPanel.refresh()
          rightPanel.refresh()
        })
        return
      }

      if (!e.metaKey && !e.ctrlKey) return

      const key = e.key.toLowerCase()

      if (key === 'c' && active.selected.size > 0) {
        e.preventDefault()
        e.stopPropagation()
        setClipboard({ paths: [...active.selected], mode: 'copy' })
      } else if (key === 'x' && active.selected.size > 0) {
        e.preventDefault()
        e.stopPropagation()
        setClipboard({ paths: [...active.selected], mode: 'cut' })
      } else if (key === 'v' && clipboard) {
        e.preventDefault()
        e.stopPropagation()
        const dest = active.currentPath
        const isCut = clipboard.mode === 'cut'
        const op = isCut
          ? window.roamer.moveFiles(clipboard.paths, dest)
          : window.roamer.copyFiles(clipboard.paths, dest)
        op.then((results) => {
          const ok = results.filter((r) => !r.error)
          const errors = results.filter((r) => r.error)
          if (errors.length > 0) {
            active.setError(`Failed: ${errors.map((e) => e.error).join(', ')}`)
          }
          if (ok.length > 0) {
            if (isCut) {
              setUndoStack((s) => [...s, { type: 'move', items: ok.map((r) => ({ src: r.src, dest: r.dest })) }])
            } else {
              setUndoStack((s) => [...s, { type: 'copy', created: ok.map((r) => r.dest) }])
            }
          }
          if (isCut) setClipboard(null)
          leftPanel.refresh()
          rightPanel.refresh()
        })
      } else if (key === 'n' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        active.startNewItem('folder')
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        active.startNewItem('file')
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        setUndoStack((stack) => {
          if (stack.length === 0) return stack
          const entry = stack[stack.length - 1]
          const newStack = stack.slice(0, -1)
          if (entry.type === 'move') {
            // Reverse the moves
            const reversals = entry.items.map((i) => ({ src: i.dest, dest: i.src }))
            Promise.all(reversals.map((r) =>
              window.roamer.moveFiles([r.src], r.dest.split('/').slice(0, -1).join('/') || '/')
            )).then(() => {
              leftPanel.refresh()
              rightPanel.refresh()
            })
          } else if (entry.type === 'copy') {
            // Delete the copies
            window.roamer.trashFiles(entry.created).then(() => {
              leftPanel.refresh()
              rightPanel.refresh()
            })
          } else if (entry.type === 'trash') {
            // Restore from trash
            const items = entry.paths.map((p) => ({
              name: p.split('/').pop()!,
              originalPath: p,
            }))
            window.roamer.restoreFromTrash(items).then(() => {
              leftPanel.refresh()
              rightPanel.refresh()
            })
          }
          return newStack
        })
      }
    }
    // Use capture to intercept before xterm
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [active, clipboard, leftPanel, rightPanel])

  // Handle file drops (from panels or Finder)
  const handleFileDrop = useCallback((sourcePaths: string[], destDir: string, copy: boolean) => {
    const op = copy
      ? window.roamer.copyFiles(sourcePaths, destDir)
      : window.roamer.moveFiles(sourcePaths, destDir)
    op.then((results) => {
      const ok = results.filter((r) => !r.error)
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        active.setError(`Failed: ${errors.map((e) => e.error).join(', ')}`)
      }
      if (ok.length > 0) {
        if (copy) {
          setUndoStack((s) => [...s, { type: 'copy', created: ok.map((r) => r.dest) }])
        } else {
          setUndoStack((s) => [...s, { type: 'move', items: ok.map((r) => ({ src: r.src, dest: r.dest })) }])
        }
      }
      leftPanel.refresh()
      rightPanel.refresh()
      requestAnimationFrame(() => xtermRef.current?.focus())
    })
  }, [active, leftPanel, rightPanel])

  // Spawn PTY once we have a path
  const ptySpawned = useRef(false)
  useEffect(() => {
    if (!active.currentPath || ptySpawned.current) return
    ptySpawned.current = true
    window.roamer.ptySpawn(active.currentPath)
  }, [active.currentPath])

  // cd terminal when active panel's path changes
  const prevPath = useRef('')
  useEffect(() => {
    if (!active.currentPath || !prevPath.current) {
      prevPath.current = active.currentPath
      return
    }
    if (active.currentPath !== prevPath.current) {
      prevPath.current = active.currentPath
      window.roamer.ptyWrite(`cd ${active.currentPath.replace(/ /g, '\\ ')}\n`)
    }
  }, [active.currentPath])

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowLeftIcon />}
          onClick={active.goBack}
          disabled={active.history.length === 0}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowRightIcon />}
          onClick={active.goForward}
          disabled={active.forwardHistory.length === 0}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowUpIcon />}
          onClick={active.goUp}
        />
        <PathBar currentPath={active.currentPath} onNavigate={active.navigate} onEditStart={() => active.setError(null)} />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ViewColumnsIcon />}
          onClick={() => setSplitView((v) => !v)}
          className={splitView ? 'btn-active' : ''}
        />
      </div>

      {/* Error bar */}
      {active.error && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm shrink-0"
          style={{ backgroundColor: 'oklch(0.64 0.21 25)', color: '#fff' }}
        >
          <span className="flex-1">{active.error}</span>
          <button
            className="btn btn-ghost btn-xs"
            style={{ color: '#fff' }}
            onClick={() => active.setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content: sidebar + file grids + terminal */}
      <Splitter direction="horizontal" defaultSize={180} minSize={120} className="flex-1 min-h-0">
        {/* Places panel */}
        <div className="h-full overflow-auto border-r border-base-300">
          <div className="px-2 py-2">
            <Text size="xs" type="secondary" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px' }}>
              Places
            </Text>
          </div>
          <ul className="menu menu-sm px-1 py-0">
            {placesList.map((place) => {
              const PlaceIcon = placeIconMap[place.icon ?? ''] ?? FolderIcon
              const isActive = active.currentPath === place.path
              return (
                <li key={place.id}>
                  <a
                    className={isActive ? 'active' : ''}
                    onClick={() => active.navigate(place.path)}
                  >
                    <PlaceIcon size="sm" />
                    {place.name}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>

        {/* File grid(s) + info panel + terminal */}
        <Splitter direction="vertical" defaultSize={200} minSize={80}>
          {/* File grids + info panel */}
          {inspectedFile ? (
            <Splitter direction="horizontal" defaultSize={280} minSize={200} reverse>
              {/* File grids */}
              <div style={{ height: '100%' }}>
                {splitView ? (
                  <Splitter direction="horizontal" defaultRatio={0.5} minSize={200}>
                    <FilePanel panel={leftPanel} focused={activePanel === 'left'} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} />
                    <FilePanel panel={rightPanel} focused={activePanel === 'right'} onFocus={() => setActivePanel('right')} onDrop={handleFileDrop} onFileClick={setInspectedFile} />
                  </Splitter>
                ) : (
                  <FilePanel panel={leftPanel} focused={true} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} />
                )}
              </div>
              {/* Info panel */}
              <InfoPanel entry={inspectedFile} onDismiss={() => setInspectedFile(null)} />
            </Splitter>
          ) : splitView ? (
            <Splitter direction="horizontal" defaultRatio={0.5} minSize={200}>
              <FilePanel panel={leftPanel} focused={activePanel === 'left'} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} />
              <FilePanel panel={rightPanel} focused={activePanel === 'right'} onFocus={() => setActivePanel('right')} onDrop={handleFileDrop} onFileClick={setInspectedFile} />
            </Splitter>
          ) : (
            <FilePanel panel={leftPanel} focused={true} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} />
          )}
          {/* Terminal panel */}
          <div ref={termContainerCallback} className="h-full" />
        </Splitter>
      </Splitter>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-base-300 text-xs shrink-0">
        <Text size="xs" type="secondary">
          {active.visibleEntries.length} items
          {active.selected.size > 0 && ` (${active.selected.size} selected)`}
          {!active.showHidden && active.entries.length !== active.visibleEntries.length &&
            ` (${active.entries.length - active.visibleEntries.length} hidden)`}
        </Text>
        <label className="ml-auto flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={active.showHidden}
            onChange={(e) => active.setShowHidden(e.target.checked)}
          />
          <Text size="xs" type="secondary">Show hidden</Text>
        </label>
      </div>
    </div>
  )
}
