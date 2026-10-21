/*
 * [INPUT]: 已构建的固定ZCode插件checkout及第22组来源清单。
 * [OUTPUT]: 验证真实来源/完整构建字节；启动拒绝漂移，不安装全局插件。
 * [POS]: 开发Agent共用画板准备与可复现来源，不进入产品构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const pluginRelativePath = 'ui-plugins/excalidraw'
async function builtFiles(directory, prefix = '') {
  const files = []
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = prefix + item.name, absolute = join(directory, item.name)
    if (item.isSymbolicLink()) throw new Error('插件构建不能包含符号链接')
    if (item.isDirectory()) files.push(...await builtFiles(absolute, name + '/'))
    else if (item.isFile()) files.push({ path: name, sha256: hash(await readFile(absolute)) })
  }
  return files
}
async function inspect(root, upstream) {
  const references = JSON.parse(await readFile(join(root, 'ai-docs/spec/22.开发自动化与持续测试/reference-sources.json'), 'utf8'))
  const checkout = await realpath(upstream)
  const git = args => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim()
  if (git(['rev-parse', 'HEAD']) !== references.plugins.commit || git(['status', '--porcelain'])) throw new Error('Excalidraw上游必须是清单中的干净固定提交')
  for (const file of references.plugins.files) {
    const absolute = join(checkout, file.path)
    if (!(await lstat(absolute)).isFile() || hash(await readFile(absolute)) !== file.sha256) throw new Error(`上游文件身份变化：${file.path}`)
  }
  const plugin = join(checkout, pluginRelativePath), files = await builtFiles(join(plugin, 'dist'))
  if (!files.some(file => file.path === 'server.mjs') || !files.some(file => file.path === 'ui/panel.html')) throw new Error('请先按05构建固定上游插件')
  return { version: 1, checkout, plugin, commit: references.plugins.commit, files }
}
export async function prepareUpstream(root, upstream) {
  const receipt = await inspect(root, upstream)
  await mkdir(join(root, '.local/design'), { recursive: true })
  await writeFile(join(root, '.local/design/upstream.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
  return receipt
}
export async function verifyUpstream(root) {
  const receipt = JSON.parse(await readFile(join(root, '.local/design/upstream.json'), 'utf8'))
  const current = await inspect(root, resolve(receipt.checkout))
  if (JSON.stringify(current) !== JSON.stringify(receipt)) throw new Error('插件构建字节与准备记录不符，请核对后重新prepare')
  return current
}
