import React, { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// --- Types ---

export interface ContextMenuItem {
  key: string
  label?: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  danger?: boolean
  divider?: boolean
  children?: ContextMenuItem[]
  'data-testid'?: string
}

interface ContextMenuContextValue {
  onSelect: (key: string) => void
  onClose: () => void
  getTestId?: (suffix: string) => string | undefined
}

// --- Context ---

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null)

const useContextMenu = () => {
  const ctx = useContext(ContextMenuContext)
  if (!ctx) throw new Error('ContextMenu compound components must be used within a ContextMenu')
  return ctx
}

// --- Compound components ---

function Item({
  children,
  icon,
  disabled = false,
  danger = false,
  className = '',
  _key,
  'data-testid': testId,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  danger?: boolean
  className?: string
  _key?: string
  'data-testid'?: string
}) {
  const { onSelect, onClose, getTestId } = useContextMenu()
  const resolvedTestId = testId ?? (_key ? getTestId?.(`item-${_key}`) : undefined)

  return (
    <li className={className} role="none">
      <button
        onClick={() => {
          if (!disabled && _key) {
            onSelect(_key)
            onClose()
          }
        }}
        disabled={disabled}
        role="menuitem"
        aria-disabled={disabled}
        data-testid={resolvedTestId}
        className={`flex items-center gap-2 w-full px-4 py-2 text-left text-sm
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-base-200'}
          ${danger ? 'text-error hover:bg-error/10' : ''}`}
      >
        {icon && <span className="w-4 h-4" aria-hidden="true">{icon}</span>}
        <span className="flex-1">{children}</span>
      </button>
    </li>
  )
}

function Divider({ className = '', 'data-testid': testId }: { className?: string; 'data-testid'?: string }) {
  return <hr className={`border-base-300 my-1 ${className}`} role="separator" data-testid={testId} />
}

function SubMenu({
  label,
  icon,
  disabled = false,
  children,
  className = '',
  _key,
  'data-testid': testId,
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  children: React.ReactNode
  className?: string
  _key?: string
  'data-testid'?: string
}) {
  const { getTestId } = useContextMenu()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedTestId = testId ?? (_key ? getTestId?.(`submenu-${_key}`) : undefined)

  const enter = () => {
    if (disabled) return
    if (timer.current) clearTimeout(timer.current)
    setOpen(true)
  }
  const leave = () => {
    timer.current = setTimeout(() => setOpen(false), 100)
  }

  return (
    <li onMouseEnter={enter} onMouseLeave={leave} className={`relative ${className}`} role="none">
      <button
        disabled={disabled}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled}
        data-testid={resolvedTestId}
        className={`flex items-center gap-2 w-full px-4 py-2 text-left text-sm
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-base-200'}`}
      >
        {icon && <span className="w-4 h-4" aria-hidden="true">{icon}</span>}
        <span className="flex-1">{label}</span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <ul
          className="menu bg-base-100 rounded-box shadow-lg border border-base-300 absolute left-full top-0 min-w-[160px] z-50 p-1"
          onMouseEnter={enter}
          onMouseLeave={leave}
          role="menu"
          data-testid={resolvedTestId ? `${resolvedTestId}-menu` : undefined}
        >
          {children}
        </ul>
      )}
    </li>
  )
}

// --- Data-driven item renderer ---

function DataItem({
  item,
  onSelect,
  onClose,
  getTestId,
}: {
  item: ContextMenuItem
  onSelect: (key: string) => void
  onClose: () => void
  getTestId?: (suffix: string) => string | undefined
}) {
  const [subOpen, setSubOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const testId = item['data-testid'] ?? getTestId?.(`item-${item.key}`)

  if (item.divider) {
    return <hr className="border-base-300 my-1" role="separator" data-testid={getTestId?.(`separator-${item.key}`)} />
  }

  const hasChildren = item.children && item.children.length > 0
  const handleClick = () => {
    if (item.disabled || hasChildren) return
    onSelect(item.key)
    onClose()
  }
  const enter = () => {
    if (hasChildren) {
      if (timer.current) clearTimeout(timer.current)
      setSubOpen(true)
    }
  }
  const leave = () => {
    if (hasChildren) {
      timer.current = setTimeout(() => setSubOpen(false), 100)
    }
  }

  return (
    <li onMouseEnter={enter} onMouseLeave={leave} className="relative" role="none">
      <button
        onClick={handleClick}
        disabled={item.disabled}
        role="menuitem"
        aria-haspopup={hasChildren ? 'menu' : undefined}
        aria-expanded={hasChildren ? subOpen : undefined}
        aria-disabled={item.disabled}
        data-testid={testId}
        className={`flex items-center gap-2 w-full px-4 py-2 text-left text-sm
          ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-base-200'}
          ${item.danger ? 'text-error hover:bg-error/10' : ''}`}
      >
        {item.icon && <span className="w-4 h-4" aria-hidden="true">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        {hasChildren && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
      {hasChildren && subOpen && (
        <ul
          className="menu bg-base-100 rounded-box shadow-lg border border-base-300 absolute left-full top-0 min-w-[160px] z-50 p-1"
          onMouseEnter={enter}
          onMouseLeave={leave}
          role="menu"
          data-testid={testId ? `${testId}-menu` : undefined}
        >
          {item.children!.map((child) => (
            <DataItem key={child.key} item={child} onSelect={onSelect} onClose={onClose} getTestId={getTestId} />
          ))}
        </ul>
      )}
    </li>
  )
}

// --- Main ContextMenu ---

interface ContextMenuProps {
  children: React.ReactNode
  items?: ContextMenuItem[] | ((e: React.MouseEvent) => ContextMenuItem[])
  onSelect?: (key: string) => void
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

function ContextMenu({
  children,
  items,
  onSelect,
  disabled = false,
  className = '',
  'data-testid': testId,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [resolvedItems, setResolvedItems] = useState<ContextMenuItem[] | undefined>(undefined)
  const menuRef = useRef<HTMLUListElement>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      setPos({ x: e.clientX, y: e.clientY })
      if (typeof items === 'function') {
        setResolvedItems(items(e))
      } else {
        setResolvedItems(items)
      }
      setOpen(true)
    },
    [disabled, items]
  )

  const close = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (key: string) => {
      onSelect?.(key)
    },
    [onSelect]
  )

  // Reposition if menu overflows viewport
  useEffect(() => {
    if (open && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let { x, y } = pos
      if (x + rect.width > vw) x = vw - rect.width - 8
      if (y + rect.height > vh) y = vh - rect.height - 8
      if (x !== pos.x || y !== pos.y) setPos({ x, y })
    }
  }, [open, pos])

  // Close on click outside, escape, scroll
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onScroll = () => close()
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  // Process compound children — separate trigger from menu items
  const childArray = React.Children.toArray(children)
  const trigger = childArray[0]
  const compoundItems = childArray.slice(1).map((child) => {
    if (React.isValidElement(child)) {
      const key = child.key != null ? String(child.key) : undefined
      if (child.type === Item || child.type === SubMenu) {
        return React.cloneElement(child as React.ReactElement<any>, { _key: key })
      }
    }
    return child
  })

  const hasDataItems = resolvedItems && resolvedItems.length > 0
  const getTestIdFn = testId ? (suffix: string) => `${testId}-${suffix}` : undefined

  const ctxValue: ContextMenuContextValue = {
    onSelect: handleSelect,
    onClose: close,
    getTestId: getTestIdFn,
  }

  // Attach onContextMenu directly to the trigger via cloneElement
  const triggerWithHandler = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement<any>, {
        onContextMenu: (e: React.MouseEvent) => {
          // Call existing onContextMenu if present
          const existing = (trigger as React.ReactElement<any>).props.onContextMenu
          if (existing) existing(e)
          handleContextMenu(e)
        },
      })
    : trigger

  return (
    <>
      {triggerWithHandler}
      {open &&
        createPortal(
          <ContextMenuContext.Provider value={ctxValue}>
            <ul
              ref={menuRef}
              className={`menu bg-base-100 rounded-box shadow-lg border border-base-300 min-w-[160px] p-1 fixed z-[9999] ${className}`}
              style={{ left: pos.x, top: pos.y }}
              role="menu"
              aria-label="Context menu"
              data-testid={getTestIdFn?.('menu')}
            >
              {hasDataItems
                ? resolvedItems.map((item) => (
                    <DataItem
                      key={item.key}
                      item={item}
                      onSelect={handleSelect}
                      onClose={close}
                      getTestId={getTestIdFn}
                    />
                  ))
                : compoundItems}
            </ul>
          </ContextMenuContext.Provider>,
          document.body
        )}
    </>
  )
}

export default Object.assign(ContextMenu, {
  Item,
  Divider,
  SubMenu,
})
