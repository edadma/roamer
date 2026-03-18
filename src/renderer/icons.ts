import {
  FolderIcon,
  DocumentIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  CodeBracketIcon,
  ArchiveBoxIcon,
  TableCellsIcon,
  PresentationChartBarIcon,
  CommandLineIcon,
  CubeIcon,
} from '@aster-ui/icons'

const iconByExtension: Record<string, React.FC<{ size?: string | number; className?: string }>> = {
  // Images
  png: PhotoIcon,
  jpg: PhotoIcon,
  jpeg: PhotoIcon,
  gif: PhotoIcon,
  svg: PhotoIcon,
  webp: PhotoIcon,
  bmp: PhotoIcon,
  ico: PhotoIcon,

  // Video
  mp4: VideoCameraIcon,
  mkv: VideoCameraIcon,
  avi: VideoCameraIcon,
  mov: VideoCameraIcon,
  webm: VideoCameraIcon,

  // Audio
  mp3: MusicalNoteIcon,
  wav: MusicalNoteIcon,
  flac: MusicalNoteIcon,
  ogg: MusicalNoteIcon,
  aac: MusicalNoteIcon,

  // Code
  ts: CodeBracketIcon,
  tsx: CodeBracketIcon,
  js: CodeBracketIcon,
  jsx: CodeBracketIcon,
  py: CodeBracketIcon,
  rs: CodeBracketIcon,
  go: CodeBracketIcon,
  java: CodeBracketIcon,
  c: CodeBracketIcon,
  cpp: CodeBracketIcon,
  h: CodeBracketIcon,
  rb: CodeBracketIcon,
  scala: CodeBracketIcon,
  html: CodeBracketIcon,
  css: CodeBracketIcon,
  scss: CodeBracketIcon,

  // Documents
  md: DocumentTextIcon,
  txt: DocumentTextIcon,
  pdf: DocumentTextIcon,
  doc: DocumentTextIcon,
  docx: DocumentTextIcon,
  rtf: DocumentTextIcon,

  // Spreadsheets
  csv: TableCellsIcon,
  xls: TableCellsIcon,
  xlsx: TableCellsIcon,

  // Presentations
  ppt: PresentationChartBarIcon,
  pptx: PresentationChartBarIcon,

  // Archives
  zip: ArchiveBoxIcon,
  tar: ArchiveBoxIcon,
  gz: ArchiveBoxIcon,
  rar: ArchiveBoxIcon,
  '7z': ArchiveBoxIcon,

  // Shell
  sh: CommandLineIcon,
  bash: CommandLineIcon,
  zsh: CommandLineIcon,

  // Data
  json: CubeIcon,
  yaml: CubeIcon,
  yml: CubeIcon,
  xml: CubeIcon,
  toml: CubeIcon,
}

export function getFileIcon(extension: string, isDirectory: boolean) {
  if (isDirectory) return FolderIcon
  return iconByExtension[extension.toLowerCase()] ?? DocumentIcon
}
