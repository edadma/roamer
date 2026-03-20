// Place type — DB lives in main process, accessed via IPC
export interface Place {
  id: number
  name: string
  path: string
  icon: string | null
  sortOrder: number
  isDefault: boolean
}
