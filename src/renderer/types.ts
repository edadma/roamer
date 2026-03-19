export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
  mode: number
  owner: string
  extension: string
}
