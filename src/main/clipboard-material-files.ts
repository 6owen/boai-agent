/*
 * [INPUT]: Electron 39 原生剪贴板的明确文件格式；macOS AppKit 的文件 URL 数组。
 * [OUTPUT]: 真实 paste 时的有界本地文件引用；不解释普通文本或网页 URL，Finder 多文件优先读取全部 NSURL。
 * [POS]: main 的只读剪贴板文件适配；不执行外部文件、不新增依赖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { execFile } from 'node:child_process'
import { isAbsolute, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Clipboard } from 'electron'

const MAX_CLIPBOARD_FILES = 32
const MAX_CLIPBOARD_BYTES = 64 * 1024
const run = promisify(execFile)
// AppKit reads each pasteboard item, unlike Electron readBuffer(public.file-url), which can expose only the first item.
// https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/PasteboardGuide106/Articles/pbReading.html
const MAC_FILE_URLS_SCRIPT = `ObjC.import('AppKit'); ObjC.import('Foundation');
var board = $.NSPasteboard.generalPasteboard;
var generation = board.changeCount;
var options = $.NSDictionary.dictionaryWithObjectForKey($.NSNumber.numberWithBool(true), $.NSPasteboardURLReadingFileURLsOnlyKey);
var urls = board.readObjectsForClassesOptions([$.NSURL], options);
var paths = [];
if (urls) { if (urls.count > 32) throw new Error('最多一次粘贴 32 个文件'); for (var i = 0; i < urls.count; i++) { var url = urls.objectAtIndex(i); if (url.isFileURL) paths.push(ObjC.unwrap(url.path)); } }
if (!paths.length) { var old = board.propertyListForType('NSFilenamesPboardType'); if (old) paths = ObjC.deepUnwrap(old); }
if (generation !== board.changeCount) throw new Error('剪贴板已改变，请重新粘贴');
JSON.stringify(paths);`

function fileUrls(text: string) {
  return text.split(/\r?\n|\0/).map(line => line.trim()).filter(line => /^file:/i.test(line)).map(value => {
    const url = new URL(value)
    if (url.hostname && url.hostname !== 'localhost') throw new Error('仅支持本机剪贴板文件')
    return fileURLToPath(url)
  })
}

export async function readClipboardMaterialPaths(clipboard: Pick<Clipboard, 'availableFormats' | 'readBuffer'>, platform = process.platform): Promise<string[]> {
  const formats = new Map(clipboard.availableFormats().map(format => [format.toLowerCase(), format]))
  const read = (name: string) => {
    const format = formats.get(name.toLowerCase())
    if (!format) return undefined
    const bytes = clipboard.readBuffer(format)
    if (bytes.length > MAX_CLIPBOARD_BYTES) throw new Error('剪贴板文件引用过多')
    return bytes
  }
  let paths: string[] = []
  if (platform === 'darwin' && (formats.has('public.file-url') || formats.has('nsfilenamespboardtype'))) {
    const { stdout } = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_FILE_URLS_SCRIPT], { timeout: 2_000, maxBuffer: MAX_CLIPBOARD_BYTES, encoding: 'utf8' })
    const values: unknown = JSON.parse(stdout)
    if (!Array.isArray(values) || !values.every(value => typeof value === 'string')) throw new Error('剪贴板文件引用无效')
    paths = values
  }
  if (!paths.length) {
    for (const format of ['text/uri-list', 'x-special/gnome-copied-files', 'public.file-url']) {
      const bytes = read(format)
      if (bytes) { paths = fileUrls(bytes.toString('utf8')); if (paths.length) break }
    }
  }
  if (!paths.length && platform === 'win32') {
    // DROPFILES.pFiles/fWide and a double-NUL-terminated UTF-16 filename list.
    // https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/ns-shlobj_core-dropfiles
    const drop = read('CF_HDROP')
    if (drop) {
      if (drop.length < 20 || !drop.readUInt32LE(16)) throw new Error('不支持此剪贴板文件编码')
      const offset = drop.readUInt32LE(0)
      if (offset < 20 || offset > drop.length || (drop.length - offset) % 2) throw new Error('剪贴板文件引用无效')
      paths = drop.subarray(offset).toString('utf16le').split('\0').filter(Boolean)
    } else {
      const name = read('FileNameW')
      if (name) paths = name.toString('utf16le').split('\0').filter(Boolean)
      else if (read('FileName')) throw new Error('请使用系统文件复制或直接拖入文件')
    }
  }
  const absolute = platform === 'win32' ? win32.isAbsolute : isAbsolute
  if (paths.length > MAX_CLIPBOARD_FILES || paths.some(path => !absolute(path) || path.length > 8000 || path.includes('\0'))) throw new Error('剪贴板文件引用无效或超过 32 个')
  return [...new Set(paths)]
}
