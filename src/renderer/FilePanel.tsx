import { useEffect, useState, useCallback, useRef } from 'react'
import { Typography } from 'asterui'
import { getFileIcon } from './icons'
import type { FileEntry } from './types'

const { Text } = Typography

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatPermissions(mode: number): string {
  const perms = mode & 0o777
  const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  return chars[(perms >> 6) & 7] + chars[(perms >> 3) & 7] + chars[perms & 7]
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function gitStatusColor(status: string | undefined): string | undefined {
  if (!status) return undefined
  if (status === '??') return 'oklch(0.6 0.1 150)' // untracked — muted green
  if (status.startsWith('M') || status.endsWith('M')) return 'oklch(0.75 0.15 60)' // modified — orange
  if (status.startsWith('A')) return 'oklch(0.7 0.2 150)' // staged/added — green
  if (status.startsWith('D') || status.endsWith('D')) return 'oklch(0.65 0.2 25)' // deleted — red
  if (status.startsWith('R')) return 'oklch(0.7 0.15 250)' // renamed — blue
  if (status.includes('U')) return 'oklch(0.65 0.2 25)' // conflict — red
  return 'oklch(0.75 0.15 60)' // any other change — orange
}

export type ViewMode = 'grid' | 'list'

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
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  gitStatus: Record<string, string>
  gitBranch: string | null
  error: string | null
  setError: (e: string | null) => void
  newItem: { type: 'file' | 'folder' } | null
  startNewItem: (type: 'file' | 'folder') => void
  commitNewItem: (name: string) => Promise<void>
  cancelNewItem: () => void
  renamingPath: string | null
  lastRenamedTo: React.RefObject<string | null>
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

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({})
  const [gitBranch, setGitBranch] = useState<string | null>(null)

  // Fetch git status when directory changes or entries refresh
  useEffect(() => {
    if (!currentPath) return
    window.roamer.gitStatus(currentPath).then((result) => {
      if (result) {
        setGitStatus(result.files)
        setGitBranch(result.branch)
      } else {
        setGitStatus({})
        setGitBranch(null)
      }
    })
  }, [currentPath, refreshCounter])

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

  const lastRenamedTo = useRef<string | null>(null)

  const commitRename = useCallback(async (oldPath: string, newName: string) => {
    if (!newName.trim()) { setRenamingPath(null); return }
    const dir = oldPath.split('/').slice(0, -1).join('/')
    const newPath = `${dir}/${newName.trim()}`
    if (newPath !== oldPath) {
      try {
        await window.roamer.renameFile(oldPath, newPath)
        lastRenamedTo.current = newPath
        setSelected(new Set([newPath]))
      } catch (e: any) {
        setError(e.message || 'Failed to rename')
      }
    }
    setRenamingPath(null)
  }, [])

  // Refocus terminal after rename input closes
  useEffect(() => {
    if (!renamingPath) {
      requestAnimationFrame(() => {
        const active = document.activeElement?.tagName
        if (active === 'INPUT' || active === 'TEXTAREA') return
        document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus()
      })
    }
  }, [renamingPath])

  const cancelRename = useCallback(() => setRenamingPath(null), [])

  return {
    currentPath, entries, visibleEntries, showHidden, history, forwardHistory,
    selected, setSelected,
    navigate, goBack, goForward, goUp, setShowHidden, refresh,
    viewMode, setViewMode,
    gitStatus, gitBranch,
    error, setError,
    newItem, startNewItem, commitNewItem, cancelNewItem,
    renamingPath, lastRenamedTo, startRename, commitRename, cancelRename,
  }
}

interface FilePanelProps {
  panel: FilePanelState
  focused: boolean
  onFocus: () => void
  onDrop?: (sourcePaths: string[], destDir: string, copy: boolean) => void
  onFileClick?: (entry: FileEntry | null) => void
  cutPaths?: Set<string>
}

export default function FilePanel({ panel, focused, onFocus, onDrop, onFileClick, cutPaths }: FilePanelProps) {
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

  // Shared item event props
  const itemProps = (entry: FileEntry, index: number) => ({
    'data-path': entry.path,
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => handleDragStart(e, entry),
    onDragOver: (e: React.DragEvent<HTMLElement>) => handleFolderDragOver(e, entry),
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: React.DragEvent<HTMLElement>) => handleFolderDrop(e, entry),
    onClick: (e: React.MouseEvent) => handleItemClick(e, entry, index),
    onDoubleClick: () => handleDoubleClick(entry),
    onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, entry),
  })

  const renameInput = (entry: FileEntry) => (
    <input
      className="input input-xs input-bordered"
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
  )

  const containerProps = {
    ref: containerRef,
    onClick: handleBackgroundClick,
    onMouseDown: handleMouseDown,
    onDragOver: handlePanelDragOver,
    onDragLeave: handlePanelDragLeave,
    onDrop: handlePanelDrop,
    onContextMenu: (e: React.MouseEvent) => handleContextMenu(e),
  }

  const outlineStyle = {
    outline: focused ? '2px solid oklch(0.65 0.2 250)' : '2px solid transparent',
    outlineOffset: '-2px',
  }

  return (
    <div
      {...containerProps}
      className="h-full overflow-auto"
      style={{
        ...outlineStyle,
        position: 'relative',
        ...(panel.viewMode === 'grid' ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: '2px',
          alignContent: 'start',
          padding: 12,
        } : {
          display: 'flex',
          flexDirection: 'column' as const,
        }),
      }}
    >
      {panel.viewMode === 'list' && (
        <div
          className="flex items-center gap-2 px-3 py-1 border-b border-base-300 text-xs shrink-0"
          style={{ color: 'oklch(0.6 0 0)', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: 'var(--fallback-b1,oklch(var(--b1)))', zIndex: 1 }}
        >
          <span style={{ width: 28 }} />
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: 80, textAlign: 'right' }}>Size</span>
          <span style={{ width: 80, textAlign: 'right' }}>Permissions</span>
          <span style={{ width: 70, textAlign: 'right' }}>Owner</span>
          <span style={{ width: 160, textAlign: 'right' }}>Modified</span>
        </div>
      )}
      {panel.visibleEntries.length === 0 && (
        <div style={{
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          color: 'oklch(0.5 0 0)',
          fontSize: 13,
        }}>
          This folder is empty
        </div>
      )}
      {panel.visibleEntries.map((entry, index) => {
        const Icon = getFileIcon(entry.extension, entry.isDirectory)
        const isSelected = panel.selected.has(entry.path)
        const isDropTarget = dropTarget === entry.path
        const isCut = cutPaths?.has(entry.path) ?? false
        const gitColor = gitStatusColor(panel.gitStatus[entry.path])
        const bgColor = isSelected
          ? 'oklch(0.65 0.2 250 / 0.2)'
          : isDropTarget
          ? 'oklch(0.65 0.2 150 / 0.2)'
          : undefined

        if (panel.viewMode === 'list') {
          return (
            <div
              key={entry.name}
              {...itemProps(entry, index)}
              className="flex items-center gap-2 px-3 py-1 cursor-default"
              style={{
                backgroundColor: bgColor,
                borderRadius: 4,
                outline: isDropTarget ? '2px solid oklch(0.65 0.2 150)' : undefined,
                fontSize: 13,
                opacity: isCut ? 0.4 : undefined,
              }}
            >
              <Icon size="sm" className={entry.isDirectory ? 'text-warning' : 'text-base-content'} />
              {panel.renamingPath === entry.path ? (
                <div style={{ flex: 1 }}>{renameInput(entry)}</div>
              ) : (
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: gitColor }}>
                  {entry.name}
                </span>
              )}
              <span style={{ width: 80, textAlign: 'right', color: 'oklch(0.6 0 0)', fontSize: 12 }}>
                {entry.isDirectory ? '' : formatSize(entry.size)}
              </span>
              <span style={{ width: 80, textAlign: 'right', color: 'oklch(0.6 0 0)', fontSize: 12, fontFamily: 'monospace' }}>
                {formatPermissions(entry.mode)}
              </span>
              <span style={{ width: 70, textAlign: 'right', color: 'oklch(0.6 0 0)', fontSize: 12 }}>
                {entry.owner}
              </span>
              <span style={{ width: 160, textAlign: 'right', color: 'oklch(0.6 0 0)', fontSize: 12 }}>
                {formatDate(entry.modifiedAt)}
              </span>
            </div>
          )
        }

        return (
          <button
            key={entry.name}
            {...itemProps(entry, index)}
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
              backgroundColor: bgColor,
              borderRadius: 8,
              outline: isDropTarget ? '2px solid oklch(0.65 0.2 150)' : undefined,
              opacity: isCut ? 0.4 : undefined,
            }}
          >
            <Icon
              size="xl"
              className={entry.isDirectory ? 'text-warning' : 'text-base-content'}
            />
            {panel.renamingPath === entry.path ? (
              <div style={{ textAlign: 'center' }}>{renameInput(entry)}</div>
            ) : (
              <Text
                size="xs"
                style={{
                  textAlign: 'center',
                  wordBreak: 'break-all',
                  lineHeight: '1.2',
                  maxWidth: '100%',
                  color: gitColor,
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
