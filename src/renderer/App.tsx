import { useEffect, useState, useCallback, useRef } from 'react'
import { Typography, Button, Input, ThemeController, Splitter, Breadcrumb, Menu, notification, Checkbox } from 'asterui'
import { Terminal, type TerminalRef } from 'asterui/terminal'
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, PencilSquareIcon, HomeIcon, ComputerDesktopIcon, DocumentIcon, ArrowDownTrayIcon, FolderIcon, ViewColumnsIcon, ListBulletIcon, Squares2X2Icon } from '@aster-ui/icons'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import FilePanel, { useFilePanel, type FilePanelState } from './FilePanel'
import InfoPanel from './InfoPanel'
import type { Place } from './db'
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
      dbInit: () => Promise<void>
      dbGetPlaces: () => Promise<Place[]>
      dbAddPlace: (name: string, path: string) => Promise<void>
      dbDeletePlace: (path: string) => Promise<void>
      readDirectory: (path: string) => Promise<FileEntry[]>
      getHome: () => Promise<string>
      getCwd: () => Promise<string>
      getThumbnail: (filePath: string, mtime: string) => Promise<string | null>
      gitStatus: (dirPath: string) => Promise<{ files: Record<string, string>; branch: string } | null>
      openFile: (filePath: string) => Promise<void>
      renameFile: (oldPath: string, newPath: string) => Promise<void>
      createFolder: (dirPath: string) => Promise<void>
      createFile: (filePath: string) => Promise<void>
      getFileInfo: (filePath: string) => Promise<{ size: number; modifiedAt: string; createdAt: string; isDirectory: boolean; mode: number }>
      readFilePreview: (filePath: string, maxBytes: number) => Promise<string>
      readImageAsDataUrl: (filePath: string) => Promise<string>
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
      onWindowShown: (callback: () => void) => void
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
      <Input
        ref={inputRef}
        size="sm"
        bordered
        className="flex-1 font-mono text-sm"
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
    <div className="flex items-center flex-1 gap-1 min-w-0" onDoubleClick={startEditing}>
      <Breadcrumb
        items={breadcrumbItems.map((item) => ({
          title: item.title,
          onClick: () => onNavigate(item.path),
        }))}
      />
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

  const placesContextRef = useRef<string | null>(null)
  const leftPanel = useFilePanel(cwd)
  const rightPanel = useFilePanel(cwd)
  const active = activePanel === 'left' ? leftPanel : rightPanel

  // Update or clear inspected file when entries change
  useEffect(() => {
    if (!inspectedFile) return
    // Check if file still exists
    const byPath = active.visibleEntries.find((e) => e.path === inspectedFile.path)
    if (byPath) {
      setInspectedFile(byPath)
      return
    }
    // Check if it was renamed
    const renamed = active.lastRenamedTo.current
    if (renamed) {
      const renamedEntry = active.visibleEntries.find((e) => e.path === renamed)
      if (renamedEntry) {
        setInspectedFile(renamedEntry)
        active.lastRenamedTo.current = null
        return
      }
    }
    // File is gone
    setInspectedFile(null)
  }, [active.visibleEntries])

  // Internal clipboard for file operations
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null)

  // Undo stack
  type UndoEntry =
    | { type: 'move'; items: { src: string; dest: string }[] }
    | { type: 'copy'; created: string[] }
    | { type: 'trash'; paths: string[] }
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])

  const cutPathsSet = clipboard?.mode === 'cut' ? new Set(clipboard.paths) : undefined

  const termRef = useRef<TerminalRef>(null)
  const ptyCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.roamer.dbInit().then(async () => {
      setDbReady(true)
      try {
        const rows = await window.roamer.dbGetPlaces()
        setPlacesList(rows.sort((a: Place, b: Place) => a.sortOrder - b.sortOrder))
      } catch (e) {
        console.error('Failed to load places:', e)
      }
    })
    window.roamer.getCwd().then((c) => setCwd(c))
  }, [])

  // Focus terminal on startup — need both window shown and terminal ready
  const rawTermRef = useRef<any>(null)
  const windowShownRef = useRef(false)
  const tryFocusTerminal = useCallback(() => {
    if (rawTermRef.current && windowShownRef.current) {
      rawTermRef.current.focus()
    }
  }, [])
  useEffect(() => {
    window.roamer.onWindowShown(() => {
      windowShownRef.current = true
      tryFocusTerminal()
    })
  }, [])

  // Keep terminal focused — refocus after any interaction that loses focus
  useEffect(() => {
    const refocus = () => {
      requestAnimationFrame(() => {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        termRef.current?.focus()
      })
    }
    document.addEventListener('mouseup', refocus)
    document.addEventListener('focusout', refocus)
    return () => {
      document.removeEventListener('mouseup', refocus)
      document.removeEventListener('focusout', refocus)
    }
  }, [])

  // Update window title with current path
  useEffect(() => {
    if (!active.currentPath) return
    const home = active.currentPath.replace(/^\/Users\/[^/]+/, '~')
    document.title = `Roamer — ${home}`
  }, [active.currentPath])

  // Show error notification
  useEffect(() => {
    if (!active.error) return
    notification.error({
      message: 'Error',
      description: active.error,
      duration: 5,
      placement: 'bottomRight',
    })
    active.setError(null)
  }, [active.error])

  // Escape key — Electron/Chromium swallows it on macOS, so we get it via IPC
  // and re-dispatch as a synthetic event so all onKeyDown handlers work
  useEffect(() => {
    return window.roamer.onEscape(() => {
      const target = document.activeElement || document
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      // Refocus terminal after escape
      requestAnimationFrame(() => termRef.current?.focus())
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

      if (key === 'a') {
        e.preventDefault()
        e.stopPropagation()
        active.setSelected(new Set(active.visibleEntries.map((e) => e.path)))
      } else if (key === 'c' && active.selected.size > 0) {
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
      requestAnimationFrame(() => termRef.current?.focus())
    })
  }, [active, leftPanel, rightPanel])

  // Add to places
  const handleAddPlace = useCallback(async (name: string, placePath: string) => {
    await window.roamer.dbAddPlace(name, placePath)
    const rows = await window.roamer.dbGetPlaces()
    setPlacesList(rows.sort((a: Place, b: Place) => a.sortOrder - b.sortOrder))
  }, [])

  // Delete place
  const handleDeletePlace = useCallback(async (placePath: string) => {
    await window.roamer.dbDeletePlace(placePath)
    const rows = await window.roamer.dbGetPlaces()
    setPlacesList(rows.sort((a: Place, b: Place) => a.sortOrder - b.sortOrder))
  }, [])

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
          title="Back"
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowRightIcon />}
          onClick={active.goForward}
          disabled={active.forwardHistory.length === 0}
          title="Forward"
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowUpIcon />}
          onClick={active.goUp}
          title="Up"
        />
        <PathBar currentPath={active.currentPath} onNavigate={active.navigate} onEditStart={() => active.setError(null)} />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={active.viewMode === 'grid' ? <ListBulletIcon /> : <Squares2X2Icon />}
          onClick={() => active.setViewMode(active.viewMode === 'grid' ? 'list' : 'grid')}
          title={active.viewMode === 'grid' ? 'List view' : 'Grid view'}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ViewColumnsIcon />}
          onClick={() => setSplitView((v) => !v)}
          className={splitView ? 'btn-active' : ''}
          title="Split view"
        />
        <ThemeController.Swap className="ml-auto scale-50" />
      </div>

      {/* Main content: sidebar + file grids + terminal */}
      <Splitter defaultSizes={[15, 85]} minSize={120} className="flex-1 min-h-0">
        {/* Places panel */}
        <Splitter.Panel minSize={120}>
        <ContextMenu
          items={(e) => {
            const target = (e.target as HTMLElement).closest('[data-place-path]')
            const placePath = target?.getAttribute('data-place-path')
            const place = placePath ? placesList.find((p) => p.path === placePath) : undefined
            if (place && !place.isDefault) {
              return [{ key: 'remove', label: 'Remove from Places', danger: true }]
            }
            return []
          }}
          onSelect={(key) => {
            if (key === 'remove') {
              const path = placesContextRef.current
              if (path) handleDeletePlace(path)
            }
          }}
        >
        <div className="h-full overflow-auto border-r border-base-300" onContextMenu={(e) => {
          const target = (e.target as HTMLElement).closest('[data-place-path]')
          placesContextRef.current = target?.getAttribute('data-place-path') ?? null
        }}>
          <div className="px-2 py-2">
            <Text size="xs" type="secondary" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px' }}>
              Places
            </Text>
          </div>
          <Menu
            size="sm"
            selectedKeys={[active.currentPath]}
            onSelect={(key) => active.navigate(key)}
            className="px-1 py-0"
          >
            {placesList.map((place) => {
              const PlaceIcon = placeIconMap[place.icon ?? ''] ?? FolderIcon
              return (
                <div key={place.path} data-place-path={place.path}>
                  <Menu.Item key={place.path} icon={<PlaceIcon size="sm" />}>
                    {place.name}
                  </Menu.Item>
                </div>
              )
            })}
          </Menu>
        </div>
        </ContextMenu>

        </Splitter.Panel>
        {/* File grid(s) + info panel + terminal */}
        <Splitter.Panel>
        <Splitter direction="vertical" defaultSizes={[70, 30]} minSize={80}>
          {/* File grids + info panel */}
          <Splitter.Panel minSize={80}>
          {inspectedFile ? (
            <Splitter defaultSizes={[70, 30]} minSize={200}>
              {/* File grids */}
              <Splitter.Panel minSize={200}>
              <div style={{ height: '100%' }}>
                {splitView ? (
                  <Splitter defaultSizes={[50, 50]} minSize={200}>
                    <Splitter.Panel minSize={200}>
                    <FilePanel panel={leftPanel} focused={activePanel === 'left'} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} onAddPlace={handleAddPlace} cutPaths={cutPathsSet} />
                    </Splitter.Panel>
                    <Splitter.Panel minSize={200}>
                    <FilePanel panel={rightPanel} focused={activePanel === 'right'} onFocus={() => setActivePanel('right')} onDrop={handleFileDrop} onFileClick={setInspectedFile} onAddPlace={handleAddPlace} cutPaths={cutPathsSet} />
                    </Splitter.Panel>
                  </Splitter>
                ) : (
                  <FilePanel panel={leftPanel} focused={true} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} onAddPlace={handleAddPlace} cutPaths={cutPathsSet} />
                )}
              </div>
              </Splitter.Panel>
              {/* Info panel */}
              <Splitter.Panel minSize={200}>
              <InfoPanel entry={inspectedFile} onDismiss={() => setInspectedFile(null)} />
              </Splitter.Panel>
            </Splitter>
          ) : splitView ? (
            <Splitter defaultSizes={[50, 50]} minSize={200}>
              <Splitter.Panel minSize={200}>
              <FilePanel panel={leftPanel} focused={activePanel === 'left'} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} onAddPlace={handleAddPlace} cutPaths={cutPathsSet} />
              </Splitter.Panel>
              <Splitter.Panel minSize={200}>
              <FilePanel panel={rightPanel} focused={activePanel === 'right'} onFocus={() => setActivePanel('right')} onDrop={handleFileDrop} onFileClick={setInspectedFile} onAddPlace={handleAddPlace} cutPaths={cutPathsSet} />
              </Splitter.Panel>
            </Splitter>
          ) : (
            <FilePanel panel={leftPanel} focused={true} onFocus={() => setActivePanel('left')} onDrop={handleFileDrop} onFileClick={setInspectedFile} onAddPlace={handleAddPlace} cutPaths={cutPathsSet} />
          )}
          </Splitter.Panel>
          {/* Terminal panel */}
          <Splitter.Panel minSize={80}>
          <Terminal
            ref={termRef}
            className="h-full"
            onData={(data) => window.roamer.ptyWrite(data)}
            onReady={(term) => {
              ptyCleanupRef.current = window.roamer.onPtyData((data) => {
                termRef.current?.write(data)
              })
              rawTermRef.current = term
              tryFocusTerminal()
            }}
            options={{ fontSize: 13, cursorBlink: true }}
          />
          </Splitter.Panel>
        </Splitter>
        </Splitter.Panel>
      </Splitter>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-base-300 text-xs shrink-0">
        {active.gitBranch && (
          <Text size="xs" style={{ fontFamily: 'monospace', color: 'oklch(0.7 0.15 250)' }}>
            ⎇ {active.gitBranch}
          </Text>
        )}
        <Text size="xs" type="secondary">
          {active.visibleEntries.length} items
          {active.selected.size > 0 && ` (${active.selected.size} selected)`}
          {!active.showHidden && active.entries.length !== active.visibleEntries.length &&
            ` (${active.entries.length - active.visibleEntries.length} hidden)`}
        </Text>
        <Checkbox
          size="xs"
          checked={active.showHidden}
          onChange={(e) => active.setShowHidden(e.target.checked)}
          className="ml-auto"
        >
          <Text size="xs" type="secondary">Show hidden</Text>
        </Checkbox>
      </div>
    </div>
  )
}
