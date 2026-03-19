import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'

type Direction = 'horizontal' | 'vertical'

interface SplitterProps {
  direction: Direction
  children: ReactNode[]
  defaultSize?: number
  defaultRatio?: number
  size?: number
  onSizeChange?: (size: number) => void
  minSize?: number
  reverse?: boolean
  className?: string
}

export default function Splitter({
  direction,
  children,
  defaultSize = 200,
  defaultRatio,
  size: controlledSize,
  onSizeChange,
  minSize = 80,
  reverse = false,
  className = '',
}: SplitterProps) {
  const [internalSize, setInternalSize] = useState(defaultSize)
  const initialized = useRef(false)
  const size = controlledSize ?? internalSize
  const updateSize = useCallback((s: number) => {
    if (onSizeChange) onSizeChange(s)
    else setInternalSize(s)
  }, [onSizeChange])

  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Set initial size from ratio on mount
  useEffect(() => {
    if (defaultRatio !== undefined && !initialized.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const total = direction === 'vertical' ? rect.height : rect.width
      if (total > 0) {
        setInternalSize(Math.round(total * defaultRatio))
        initialized.current = true
      }
    }
  })

  const isVertical = direction === 'vertical'

  const handleMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (isVertical) {
        const newSize = rect.bottom - e.clientY
        updateSize(Math.max(minSize, Math.min(newSize, rect.height - minSize)))
      } else if (reverse) {
        const newSize = rect.right - e.clientX
        updateSize(Math.max(minSize, Math.min(newSize, rect.width - minSize)))
      } else {
        const newSize = e.clientX - rect.left
        updateSize(Math.max(minSize, Math.min(newSize, rect.width - minSize)))
      }
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [isVertical, reverse, minSize, updateSize])

  const flexDir = isVertical ? 'column' : 'row'
  const cursor = isVertical ? 'row-resize' : 'col-resize'
  const gutterStyle = isVertical
    ? { height: 6, flexShrink: 0, cursor }
    : { width: 6, flexShrink: 0, cursor }

  // Fixed-size panel vs flex panel
  const fixedStyle = isVertical
    ? { height: size, flexShrink: 0, overflow: 'hidden' }
    : { width: size, minWidth: 0, flexShrink: 0, overflow: 'hidden' }
  const flexStyle = isVertical
    ? { flex: 1, minHeight: 0, overflow: 'hidden' }
    : { flex: 1, minWidth: 0, overflow: 'hidden' }

  // Default: first=fixed, second=flex. Reverse: first=flex, second=fixed.
  // Exception: vertical default is first=flex, second=fixed (bottom panel).
  const firstStyle = (isVertical !== reverse) ? flexStyle : fixedStyle
  const secondStyle = (isVertical !== reverse) ? fixedStyle : flexStyle

  const [first, second] = children as [ReactNode, ReactNode]

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ display: 'flex', flexDirection: flexDir, height: '100%', width: '100%' }}
    >
      <div style={firstStyle as React.CSSProperties}>{first}</div>
      <div
        className="bg-base-300 hover:bg-primary active:bg-primary"
        style={gutterStyle}
        onMouseDown={handleMouseDown}
      />
      <div style={secondStyle as React.CSSProperties}>{second}</div>
    </div>
  )
}
