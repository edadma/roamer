import { useEffect, useState, useCallback, useRef } from 'react'
import { Typography, Button } from 'asterui'
import { useTheme } from 'asterui'
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, PencilSquareIcon, SunIcon, MoonIcon } from '@aster-ui/icons'
import { getFileIcon } from './icons'
import { initDb } from './db'
import type { FileEntry } from './types'

const { Text } = Typography

declare global {
  interface Window {
    roam: {
      platform: string
      readDirectory: (path: string) => Promise<FileEntry[]>
      getHome: () => Promise<string>
      getCwd: () => Promise<string>
    }
  }
}

function ThemeSwitcher() {
  const { isDark, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="square"
      icon={isDark ? <SunIcon /> : <MoonIcon />}
      onClick={() => setTheme?.(isDark ? 'light' : 'dark')}
    />
  )
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
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [forwardHistory, setForwardHistory] = useState<string[]>([])
  const [dbReady, setDbReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initDb().then(() => setDbReady(true))
    window.roam.getCwd().then((cwd) => {
      setCurrentPath(cwd)
    })
  }, [])

  useEffect(() => {
    if (!currentPath) return
    window.roam.readDirectory(currentPath).then((items) => {
      const sorted = items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    }).catch(() => {
      const badPath = currentPath
      // Revert to previous path
      if (history.length > 0) {
        const prev = history[history.length - 1]
        setHistory((h) => h.slice(0, -1))
        setCurrentPath(prev)
      }
      // Set error after revert so it doesn't get cleared
      setTimeout(() => setError(`Cannot open: ${badPath}`), 0)
    })
  }, [currentPath])

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

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowLeftIcon />}
          onClick={goBack}
          disabled={history.length === 0}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowRightIcon />}
          onClick={goForward}
          disabled={forwardHistory.length === 0}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowUpIcon />}
          onClick={goUp}
        />
        <PathBar currentPath={currentPath} onNavigate={navigate} onEditStart={() => setError(null)} />
        <div className="ml-auto flex items-center gap-1">
          <ThemeSwitcher />
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm shrink-0"
          style={{ backgroundColor: 'oklch(0.64 0.21 25)', color: '#fff' }}
        >
          <span className="flex-1">{error}</span>
          <button
            className="btn btn-ghost btn-xs"
            style={{ color: '#fff' }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File grid */}
      <div
        className="flex-1 overflow-auto p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: '2px',
          alignContent: 'start',
        }}
      >
        {visibleEntries.map((entry) => {
          const Icon = getFileIcon(entry.extension, entry.isDirectory)
          return (
            <button
              key={entry.name}
              onDoubleClick={() => {
                if (entry.isDirectory) navigate(entry.path)
              }}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 4px',
                height: 'auto',
                minHeight: '72px',
                cursor: entry.isDirectory ? 'pointer' : 'default',
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
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-base-300 text-xs shrink-0">
        <Text size="xs" type="secondary">
          {visibleEntries.length} items
          {!showHidden && entries.length !== visibleEntries.length &&
            ` (${entries.length - visibleEntries.length} hidden)`}
        </Text>
        <label className="ml-auto flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          <Text size="xs" type="secondary">Show hidden</Text>
        </label>
      </div>
    </div>
  )
}
