export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  linkTarget: string | null
  size: number
  modifiedAt: string
  mode: number
  owner: string
  extension: string
}
