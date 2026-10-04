/*
 * [INPUT]: 已核验受管文件的名称和原件字节；不接受宿主路径或模型声明的正文。
 * [OUTPUT]: 有界严格 UTF-8 的 Markdown/代码/纯文本预览；字节/字符/行数门禁、未知文本回退、二进制/编码原因，HTML/SVG 仅为源码。
 * [POS]: 材料与成果共用的确定性预览合同；不改变材料解析、搜索、读取证据或执行文件内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export const FILE_PREVIEW_LIMITS = { bytes: 1024 * 1024, characters: 200_000, lines: 10_000 } as const
export interface FilePreview {
  kind: 'markdown' | 'code' | 'text' | 'unsupported'
  text: string
  language?: string
  reason?: string
}

const languages: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'jsonc', py: 'python', pyi: 'python', css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html', svg: 'xml', xml: 'xml',
  vue: 'vue', svelte: 'svelte', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', conf: 'ini', sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish',
  sql: 'sql', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  rb: 'ruby', php: 'php', swift: 'swift', r: 'r', lua: 'lua', pl: 'perl', dart: 'dart', diff: 'diff', patch: 'diff', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'dockerfile', makefile: 'makefile', cmake: 'cmake', tex: 'latex', log: 'log', csv: 'csv', env: 'dotenv',
}
const binaryExtensions = new Set('pdf doc docx xls xlsx ppt pptx odt ods odp rtf zip gz tgz bz2 xz 7z rar tar png jpg jpeg gif webp bmp avif ico icns heic tiff tif mp3 mp4 wav ogg flac aac mov avi webm woff woff2 ttf otf eot exe dll so dylib wasm sqlite sqlite3 db bin'.split(' '))
const unsupported = (reason: string): FilePreview => ({ kind: 'unsupported', text: '', reason })
const languageFor = (name: string) => Object.hasOwn(languages, name) ? languages[name] : undefined

/** Classification is presentation only: never use it to authorize, index or execute bytes. */
export function previewFile(name: string, bytes: Uint8Array): FilePreview {
  if (bytes.byteLength > FILE_PREVIEW_LIMITS.bytes) return unsupported('文件预览最多 1 MiB，请使用外部打开')
  const filename = name.split(/[/\\]/).pop()!.toLowerCase(), extension = filename.includes('.') ? filename.split('.').pop()! : ''
  if (binaryExtensions.has(extension)) return unsupported('该文件格式暂不支持正文预览，请使用外部打开')
  const signature = String.fromCharCode(...bytes.subarray(0, 16))
  if (/^(%PDF-|GIF8[79]a|PK\x03\x04|Rar!|\x1f\x8b|SQLite format 3|RIFF)/.test(signature)) return unsupported('该文件为二进制格式，暂不支持正文预览，请使用外部打开')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { return unsupported('文件必须是有效 UTF-8 文本才能预览，请使用外部打开') }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return unsupported('文件包含二进制或不支持的控制字符，请使用外部打开')
  if (text.length > FILE_PREVIEW_LIMITS.characters) return unsupported('文件预览最多 200000 个字符，请使用外部打开')
  if (text.split(/\r\n|\r|\n/).length > FILE_PREVIEW_LIMITS.lines) return unsupported('文件预览最多 10000 行，请使用外部打开')
  if (['md', 'markdown', 'mdown', 'mkd'].includes(extension)) return { kind: 'markdown', text }
  const language = languageFor(extension) ?? languageFor(filename) ?? (filename.startsWith('.env.') ? 'dotenv' : undefined)
  return language ? { kind: 'code', text, language } : { kind: 'text', text }
}
