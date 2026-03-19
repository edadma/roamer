import { useEffect, useState, useCallback, useRef } from 'react'
import { Typography } from 'asterui'
import { getFileIcon } from './icons'
import type { FileEntry } from './types'

const { Text } = Typography

export interface FilePanelState {
  currentPath: string
  entries: FileEntry[]
  visibleEntries: FileEntry[]
  showHidden: boolean
  history: string[]
  forwardHistory: string[]
  selected: Set<string>
  setSelected: (s: Set<string>) => void
  navigate: (path: string) => void
  goBack: () => void
  goForward: () => void
  goUp: () => void
  setShowHidden: (v: boolean) => void
  refresh: () => void
  error: string | null
  setError: (e: string | null) => void
  newItem: { type: 'file' | 'folder' } | null
  startNewItem: (type: 'file' | 'folder') => void
  commitNewItem: (name: string) => Promise<void>
  cancelNewItem: () => void
  renamingPath: string | null
  startRename: (path: string) => void
  commitRename: (oldPath: string, newName: string) => Promise<void>
  cancelRename: () => void
}

export function useFilePanel(initialPath: string): FilePanelState {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [forwardHistory, setForwardHistory] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [refreshCounter, setRefreshCounter] = useState(0)

  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), [])

  useEffect(() => {
    if (!currentPath) return
    window.roamer.readDirectory(currentPath).then((items) => {
      const sorted = items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
      setSelected(new Set()) // clear selection on directory change
    }).catch(() => {
      const badPath = currentPath
      if (history.length > 0) {
        const prev = history[history.length - 1]
        setHistory((h) => h.slice(0, -1))
        setCurrentPath(prev)
      }
      setTimeout(() => setError(`Cannot open: ${badPath}`), 0)
    })
  }, [currentPath, refreshCounter])

  useEffect(() => {
    if (initialPath && !currentPath) setCurrentPath(initialPath)
  }, [initialPath])

  // Watch current directory for changes
  useEffect(() => {
    if (!currentPath) return
    return window.roamer.watchDirectory(currentPath, refresh)
  }, [currentPath, refresh])

  const visibleEntries = showHidden
    ? entries
    : entries.filter((e) => !e.name.startsWith('.'))

  const navigate = useCallback(
    (path: string) => {
      setHistory((prev) => [...prev, currentPath])
      setForwardHistory([])
      setCurrentPath(path)
    },
    [currentPath],
  )

  const goBack = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setForwardHistory((f) => [...f, currentPath])
    setCurrentPath(prev)
  }, [history, currentPath])

  const goForward = useCallback(() => {
    if (forwardHistory.length === 0) return
    const next = forwardHistory[forwardHistory.length - 1]
    setForwardHistory((f) => f.slice(0, -1))
    setHistory((h) => [...h, currentPath])
    setCurrentPath(next)
  }, [forwardHistory, currentPath])

  const goUp = useCallback(() => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    if (parent !== currentPath) navigate(parent)
  }, [currentPath, navigate])

  const [newItem, setNewItem] = useState<{ type: 'file' | 'folder' } | null>(null)

  const startNewItem = useCallback((type: 'file' | 'folder') => {
    setNewItem({ type })
  }, [])

  const commitNewItem = useCallback(async (name: string) => {
    if (!name.trim()) { setNewItem(null); return }
    const fullPath = `${currentPath}/${name.trim()}`
    try {
      if (newItem?.type === 'folder') {
        await window.roamer.createFolder(fullPath)
      } else {
        await window.roamer.createFile(fullPath)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create')
    }
    setNewItem(null)
  }, [currentPath, newItem])

  const cancelNewItem = useCallback(() => setNewItem(null), [])

  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  const startRename = useCallback((path: string) => setRenamingPath(path), [])

  const commitRename = useCallback(async (oldPath: string, newName: string) => {
    if (!newName.trim()) { setRenamingPath(null); return }
    const dir = oldPath.split('/').slice(0, -1).join('/')
    const newPath = `${dir}/${newName.trim()}`
    if (newPath !== oldPath) {
      try {
        await window.roamer.renameFile(oldPath, newPath)
      } catch (e: any) {
        setError(e.message || 'Failed to rename')
      }
    }
    setRenamingPath(null)
  }, [])

  const cancelRename = useCallback(() => setRenamingPath(null), [])

  return {
    currentPath, entries, visibleEntries, showHidden, history, forwardHistory,
    selected, setSelected,
    navigate, goBack, goForward, goUp, setShowHidden, refresh, error, setError,
    newItem, startNewItem, commitNewItem, cancelNewItem,
    renamingPath, startRename, commitRename, cancelRename,
  }
}

interface FilePanelProps {
  panel: FilePanelState
  focused: boolean
  onFocus: () => void
  onDrop?: (sourcePaths: string[], destDir: string, copy: boolean) => void
  onFileClick?: (entry: FileEntry | null) => void
}

export default function FilePanel({ panel, focused, onFocus, onDrop, onFileClick }: FilePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastClickedIndex = useRef<number>(-1)
  const wasRubberBand = useRef(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null) // path of folder being hovered

  // Rubber band state
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const rbStart = useRef<{ x: number; y: number } | null>(null)
  const itemRects = useRef<Map<string, DOMRect>>(new Map())

  const wasDragging = useRef(false)

  const handleItemClick = (e: React.MouseEvent, entry: FileEntry, index: number) => {
    e.stopPropagation()
    onFocus()

    // After a drag, don't change selection
    if (wasDragging.current) {
      wasDragging.current = false
      return
    }

    const isMeta = e.metaKey || e.ctrlKey
    const isShift = e.shiftKey

    if (isShift && lastClickedIndex.current >= 0) {
      // Range select
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const newSet = new Set(panel.selected)
      for (let i = start; i <= end; i++) {
        newSet.add(panel.visibleEntries[i].path)
      }
      panel.setSelected(newSet)
    } else if (isMeta) {
      // Toggle individual
      const newSet = new Set(panel.selected)
      if (newSet.has(entry.path)) {
        newSet.delete(entry.path)
      } else {
        newSet.add(entry.path)
      }
      panel.setSelected(newSet)
      lastClickedIndex.current = index
    } else if (panel.selected.has(entry.path) && panel.selected.size > 1) {
      // Clicking a selected item in a multi-selection: narrow to just this one
      panel.setSelected(new Set([entry.path]))
      lastClickedIndex.current = index
    } else {
      // Single select
      panel.setSelected(new Set([entry.path]))
      lastClickedIndex.current = index
    }
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => onFileClick?.(entry), 250)
  }

  const handleDoubleClick = (entry: FileEntry) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (entry.isDirectory) {
      panel.navigate(entry.path)
    } else {
      window.roamer.openFile(entry.path)
    }
  }

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (wasRubberBand.current) {
      wasRubberBand.current = false
      return
    }
    if (e.target === containerRef.current) {
      panel.setSelected(new Set())
      lastClickedIndex.current = -1
      onFileClick?.(null)
    }
    onFocus()
  }

  // Rubber band selection
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start rubber band on background (not on items)
    if (e.target !== containerRef.current) return
    if (e.button !== 0) return

    const rect = containerRef.current!.getBoundingClientRect()
    const scrollTop = containerRef.current!.scrollTop
    const scrollLeft = containerRef.current!.scrollLeft
    const x = e.clientX - rect.left + scrollLeft
    const y = e.clientY - rect.top + scrollTop
    rbStart.current = { x, y }

    // Snapshot item positions
    const rects = new Map<string, DOMRect>()
    containerRef.current!.querySelectorAll('[data-path]').forEach((el) => {
      const path = (el as HTMLElement).dataset.path!
      const r = el.getBoundingClientRect()
      rects.set(path, new DOMRect(
        r.left - rect.left + scrollLeft,
        r.top - rect.top + scrollTop,
        r.width,
        r.height,
      ))
    })
    itemRects.current = rects

    if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
      panel.setSelected(new Set())
    }

    const onMove = (me: MouseEvent) => {
      if (!rbStart.current) return
      wasRubberBand.current = true
      const cx = me.clientX - rect.left + containerRef.current!.scrollLeft
      const cy = me.clientY - rect.top + containerRef.current!.scrollTop
      const band = {
        startX: rbStart.current.x,
        startY: rbStart.current.y,
        x: cx,
        y: cy,
      }
      setRubberBand(band)

      // Calculate which items intersect
      const left = Math.min(band.startX, band.x)
      const right = Math.max(band.startX, band.x)
      const top = Math.min(band.startY, band.y)
      const bottom = Math.max(band.startY, band.y)

      const newSet = new Set<string>()
      itemRects.current.forEach((r, path) => {
        if (r.left < right && r.left + r.width > left && r.top < bottom && r.top + r.height > top) {
          newSet.add(path)
        }
      })
      panel.setSelected(newSet)
    }

    const onUp = () => {
      rbStart.current = null
      setRubberBand(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Drag start — HTML5 drag for panel-to-panel
  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    wasDragging.current = true

    // If dragging an unselected item, select just that one
    const paths = panel.selected.has(entry.path)
      ? [...panel.selected]
      : [entry.path]

    if (!panel.selected.has(entry.path)) {
      panel.setSelected(new Set([entry.path]))
    }

    e.dataTransfer.setData('application/x-roamer-paths', JSON.stringify(paths))
    e.dataTransfer.effectAllowed = 'copyMove'

    // Custom drag image showing count
    if (paths.length > 1) {
      const ghost = document.createElement('div')
      ghost.style.cssText = 'position:absolute;top:-1000px;display:flex;align-items:center;gap:6px;padding:6px 12px;background:oklch(0.25 0.02 250);border:1px solid oklch(0.4 0.1 250);border-radius:8px;color:#fff;font-size:13px;white-space:nowrap;'
      ghost.textContent = `${paths.length} items`
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 0, 0)
      requestAnimationFrame(() => document.body.removeChild(ghost))
    }
  }

  // Drop handling — panel background = drop into current dir
  const handlePanelDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.metaKey || e.altKey ? 'copy' : 'move'
    setDropTarget(panel.currentPath)
  }

  const handlePanelDragLeave = () => {
    setDropTarget(null)
  }

  const handlePanelDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null)
    const copy = e.metaKey || e.altKey

    // Check for internal roamer paths first
    const roamerData = e.dataTransfer.getData('application/x-roamer-paths')
    if (roamerData) {
      const paths = JSON.parse(roamerData) as string[]
      onDrop?.(paths, panel.currentPath, copy)
      return
    }

    // External files (from Finder)
    const files = [...e.dataTransfer.files]
    if (files.length > 0) {
      const paths = files.map((f) => (f as any).path as string).filter(Boolean)
      if (paths.length > 0) {
        onDrop?.(paths, panel.currentPath, true) // always copy from external
      }
    }
  }

  // Drop on a specific folder
  const handleFolderDragOver = (e: React.DragEvent, entry: FileEntry) => {
    if (!entry.isDirectory) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = e.metaKey || e.altKey ? 'copy' : 'move'
    setDropTarget(entry.path)
  }

  const handleFolderDrop = (e: React.DragEvent, entry: FileEntry) => {
    if (!entry.isDirectory) return
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const copy = e.metaKey || e.altKey

    const roamerData = e.dataTransfer.getData('application/x-roamer-paths')
    if (roamerData) {
      const paths = JSON.parse(roamerData) as string[]
      onDrop?.(paths, entry.path, copy)
      return
    }

    const files = [...e.dataTransfer.files]
    if (files.length > 0) {
      const paths = files.map((f) => (f as any).path as string).filter(Boolean)
      if (paths.length > 0) {
        onDrop?.(paths, entry.path, true)
      }
    }
  }

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry?: FileEntry } | null>(null)

  const handleContextMenu = (e: React.MouseEvent, entry?: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    onFocus()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const rbStyle = rubberBand ? {
    position: 'absolute' as const,
    left: Math.min(rubberBand.startX, rubberBand.x),
    top: Math.min(rubberBand.startY, rubberBand.y),
    width: Math.abs(rubberBand.x - rubberBand.startX),
    height: Math.abs(rubberBand.y - rubberBand.startY),
    border: '1px solid oklch(0.65 0.2 250)',
    backgroundColor: 'oklch(0.65 0.2 250 / 0.15)',
    pointerEvents: 'none' as const,
  } : null

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto p-3"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: '2px',
        alignContent: 'start',
        outline: focused ? '2px solid oklch(0.65 0.2 250)' : '2px solid transparent',
        outlineOffset: '-2px',
        position: 'relative',
      }}
      onClick={handleBackgroundClick}
      onMouseDown={handleMouseDown}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      {panel.visibleEntries.map((entry, index) => {
        const Icon = getFileIcon(entry.extension, entry.isDirectory)
        const isSelected = panel.selected.has(entry.path)
        const isDropTarget = dropTarget === entry.path
        return (
          <button
            key={entry.name}
            data-path={entry.path}
            draggable
            onDragStart={(e) => handleDragStart(e, entry)}
            onDragOver={(e) => handleFolderDragOver(e, entry)}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => handleFolderDrop(e, entry)}
            onClick={(e) => handleItemClick(e, entry, index)}
            onDoubleClick={() => handleDoubleClick(entry)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
            className="btn btn-ghost"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '6px',
              padding: '8px 4px',
              height: 'auto',
              minHeight: '72px',
              cursor: 'default',
              backgroundColor: isSelected
                ? 'oklch(0.65 0.2 250 / 0.2)'
                : isDropTarget
                ? 'oklch(0.65 0.2 150 / 0.2)'
                : undefined,
              borderRadius: 8,
              outline: isDropTarget ? '2px solid oklch(0.65 0.2 150)' : undefined,
            }}
          >
            <Icon
              size="xl"
              className={entry.isDirectory ? 'text-warning' : 'text-base-content'}
            />
            {panel.renamingPath === entry.path ? (
              <input
                className="input input-xs input-bordered text-center"
                style={{ width: '100%', fontSize: 11 }}
                defaultValue={entry.name}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') panel.commitRename(entry.path, (e.target as HTMLInputElement).value)
                  if (e.key === 'Escape') panel.cancelRename()
                  e.stopPropagation()
                }}
                onBlur={(e) => panel.commitRename(entry.path, e.target.value)}
              />
            ) : (
              <Text
                size="xs"
                style={{
                  textAlign: 'center',
                  wordBreak: 'break-all',
                  lineHeight: '1.2',
                  maxWidth: '100%',
                }}
              >
                {entry.name}
              </Text>
            )}
          </button>
        )
      })}
      {rbStyle && <div style={rbStyle} />}
      {/* New item modal */}
      {panel.newItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'oklch(0 0 0 / 0.4)',
            zIndex: 2000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) panel.cancelNewItem() }}
        >
          <div className="bg-base-100 rounded-lg shadow-xl p-4" style={{ minWidth: 300 }}>
            <Text size="sm" style={{ fontWeight: 600, marginBottom: 12, display: 'block' }}>
              {panel.newItem.type === 'folder' ? 'New Folder' : 'New File'}
            </Text>
            <input
              className="input input-sm input-bordered w-full"
              placeholder={panel.newItem.type === 'folder' ? 'Folder name' : 'File name'}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') panel.commitNewItem((e.target as HTMLInputElement).value)
                if (e.key === 'Escape') panel.cancelNewItem()
              }}
            />
          </div>
        </div>
      )}
      {/* Context menu */}
      {contextMenu && (
        <ul
          className="menu menu-sm bg-base-200 rounded-box shadow-lg"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            minWidth: 160,
          }}
        >
          {contextMenu.entry ? (
            <>
              <li><a onClick={() => { panel.startRename(contextMenu.entry!.path); setContextMenu(null) }}>Rename</a></li>
              <li><a onClick={() => {
                window.roamer.trashFiles([contextMenu.entry!.path])
                setContextMenu(null)
              }}>Delete</a></li>
            </>
          ) : (
            <>
              <li><a onClick={() => { panel.startNewItem('folder'); setContextMenu(null) }}>New Folder</a></li>
              <li><a onClick={() => { panel.startNewItem('file'); setContextMenu(null) }}>New File</a></li>
            </>
          )}
        </ul>
      )}
    </div>
  )
}
