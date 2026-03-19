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
  navigate: (path: string) => void
  goBack: () => void
  goForward: () => void
  goUp: () => void
  setShowHidden: (v: boolean) => void
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

  useEffect(() => {
    if (!currentPath) return
    window.roamer.readDirectory(currentPath).then((items) => {
      const sorted = items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    }).catch(() => {
      const badPath = currentPath
      if (history.length > 0) {
        const prev = history[history.length - 1]
        setHistory((h) => h.slice(0, -1))
        setCurrentPath(prev)
      }
      setTimeout(() => setError(`Cannot open: ${badPath}`), 0)
    })
  }, [currentPath])

  // Update path when initialPath changes (e.g. first load)
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
    navigate, goBack, goForward, goUp, setShowHidden, error, setError,
  }
}

interface FilePanelProps {
  panel: FilePanelState
  focused: boolean
  onFocus: () => void
}

export default function FilePanel({ panel, focused, onFocus }: FilePanelProps) {
  return (
    <div
      className="h-full overflow-auto p-3"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: '2px',
        alignContent: 'start',
        outline: focused ? '2px solid oklch(0.65 0.2 250)' : '2px solid transparent',
        outlineOffset: '-2px',
      }}
      onClick={onFocus}
    >
      {panel.visibleEntries.map((entry) => {
        const Icon = getFileIcon(entry.extension, entry.isDirectory)
        return (
          <button
            key={entry.name}
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
  )
}
