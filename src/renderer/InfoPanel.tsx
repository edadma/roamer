import { useEffect, useState } from 'react'
import { Typography, Button } from 'asterui'
import { XMarkIcon } from '@aster-ui/icons'
import { getFileIcon } from './icons'
import type { FileEntry } from './types'

const { Text } = Typography

const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])
const textExts = new Set([
  'txt', 'md', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv',
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
  'rb', 'scala', 'html', 'css', 'scss', 'sh', 'bash', 'zsh',
  'sql', 'graphql', 'proto', 'dockerfile', 'makefile',
  'rtf', 'log', 'env', 'gitignore', 'editorconfig',
])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function formatPermissions(mode: number, isDirectory: boolean, isSymlink: boolean): string {
  const prefix = isSymlink ? 'l' : isDirectory ? 'd' : '-'
  const perms = mode & 0o777
  const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  return prefix + chars[(perms >> 6) & 7] + chars[(perms >> 3) & 7] + chars[perms & 7]
}

interface InfoPanelProps {
  entry: FileEntry
  onDismiss: () => void
}

export default function InfoPanel({ entry, onDismiss }: InfoPanelProps) {
  const [info, setInfo] = useState<{
    size: number; modifiedAt: string; createdAt: string; isDirectory: boolean; mode: number
  } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  const ext = entry.extension.toLowerCase()
  const isImage = imageExts.has(ext)
  const isText = textExts.has(ext) || entry.name.startsWith('.')

  useEffect(() => {
    setInfo(null)
    setPreview(null)
    setImageSrc(null)
    window.roamer.getFileInfo(entry.path).then(setInfo).catch(() => {})
    if (isImage && !entry.isDirectory) {
      window.roamer.readImageAsDataUrl(entry.path).then(setImageSrc).catch(() => {})
    }
    if (isText && !entry.isDirectory) {
      window.roamer.readFilePreview(entry.path, 4096).then(setPreview).catch(() => {})
    }
  }, [entry.path])

  const Icon = getFileIcon(entry.extension, entry.isDirectory)

  return (
    <div className="h-full border-l border-base-300" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header — fixed */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300" style={{ flexShrink: 0 }}>
        <Icon size="sm" className={entry.isDirectory ? 'text-warning' : 'text-base-content'} />
        <Text size="sm" style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </Text>
        <Button variant="ghost" size="sm" shape="square" icon={<XMarkIcon />} onClick={onDismiss} />
      </div>

      {/* Preview area — scrollable, takes remaining space */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {/* Image preview */}
        {isImage && imageSrc && (
          <div className="p-3 border-b border-base-300" style={{ display: 'flex', justifyContent: 'center' }}>
            <img
              src={imageSrc}
              style={{ maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }}
            />
          </div>
        )}

        {/* Text preview */}
        {isText && preview !== null && (
          <div className="p-3 border-b border-base-300">
            <pre style={{
              fontSize: 11,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              color: 'oklch(0.7 0 0)',
            }}>
              {preview}
            </pre>
          </div>
        )}
      </div>

      {/* File details — fixed at bottom */}
      {info && (
        <div className="p-3 border-t border-base-300" style={{ flexShrink: 0 }}>
          <table style={{ fontSize: 12, width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Type</td>
                <td style={{ padding: '2px 0' }}>{info.isDirectory ? 'Folder' : ext.toUpperCase() || 'File'}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Size</td>
                <td style={{ padding: '2px 0' }}>{formatSize(info.size)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Modified</td>
                <td style={{ padding: '2px 0' }}>{formatDate(info.modifiedAt)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Created</td>
                <td style={{ padding: '2px 0' }}>{formatDate(info.createdAt)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Permissions</td>
                <td style={{ padding: '2px 0', fontFamily: 'monospace' }}>{formatPermissions(info.mode, info.isDirectory, entry.isSymlink)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Owner</td>
                <td style={{ padding: '2px 0' }}>{entry.owner}</td>
              </tr>
              {entry.isSymlink && entry.linkTarget && (
                <tr>
                  <td style={{ padding: '2px 8px 2px 0', color: 'oklch(0.6 0 0)' }}>Link</td>
                  <td style={{ padding: '2px 0' }}>→ {entry.linkTarget}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
