import { useEffect, useState, useCallback, useRef } from 'react'
import { Typography, Button } from 'asterui'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, PencilSquareIcon, HomeIcon, ComputerDesktopIcon, DocumentIcon, ArrowDownTrayIcon, FolderIcon, ViewColumnsIcon } from '@aster-ui/icons'
import Splitter from './Splitter'
import FilePanel, { useFilePanel, type FilePanelState } from './FilePanel'
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
      ptySpawn: (cwd: string) => Promise<void>
      ptyWrite: (data: string) => void
      ptyResize: (cols: number, rows: number) => void
      ptyKill: () => Promise<void>
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

  const leftPanel = useFilePanel(cwd)
  const rightPanel = useFilePanel(cwd)
  const active = activePanel === 'left' ? leftPanel : rightPanel

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
      // Don't steal focus from the path bar input
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      // Delay to let click handlers run first
      requestAnimationFrame(() => xtermRef.current?.focus())
    }
    document.addEventListener('mouseup', refocus)
    return () => document.removeEventListener('mouseup', refocus)
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

        {/* File grid(s) + terminal */}
        <Splitter direction="vertical" defaultSize={200} minSize={80}>
          {/* File grid area */}
          {splitView ? (
            <Splitter direction="horizontal" defaultSize={400} minSize={200}>
              <FilePanel panel={leftPanel} focused={activePanel === 'left'} onFocus={() => setActivePanel('left')} />
              <FilePanel panel={rightPanel} focused={activePanel === 'right'} onFocus={() => setActivePanel('right')} />
            </Splitter>
          ) : (
            <FilePanel panel={leftPanel} focused={true} onFocus={() => setActivePanel('left')} />
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
