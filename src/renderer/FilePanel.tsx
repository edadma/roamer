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

  return {
    currentPath, entries, visibleEntries, showHidden, history, forwardHistory,
    selected, setSelected,
    navigate, goBack, goForward, goUp, setShowHidden, refresh, error, setError,
  }
}

interface FilePanelProps {
  panel: FilePanelState
  focused: boolean
  onFocus: () => void
  onDrop?: (sourcePaths: string[], destDir: string, copy: boolean) => void
}

export default function FilePanel({ panel, focused, onFocus, onDrop }: FilePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastClickedIndex = useRef<number>(-1)
  const wasRubberBand = useRef(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null) // path of folder being hovered

  // Rubber band state
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const rbStart = useRef<{ x: number; y: number } | null>(null)
  const itemRects = useRef<Map<string, DOMRect>>(new Map())

  const handleItemClick = (e: React.MouseEvent, entry: FileEntry, index: number) => {
    e.stopPropagation()
    onFocus()

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
    } else {
      // Single select
      panel.setSelected(new Set([entry.path]))
      lastClickedIndex.current = index
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
    // If dragging an unselected item, select just that one
    const paths = panel.selected.has(entry.path)
      ? [...panel.selected]
      : [entry.path]

    if (!panel.selected.has(entry.path)) {
      panel.setSelected(new Set([entry.path]))
    }

    e.dataTransfer.setData('application/x-roamer-paths', JSON.stringify(paths))
    e.dataTransfer.effectAllowed = 'copyMove'
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
            onDoubleClick={() => {
              if (entry.isDirectory) panel.navigate(entry.path)
            }}
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
          </button>
        )
      })}
      {rbStyle && <div style={rbStyle} />}
    </div>
  )
}
