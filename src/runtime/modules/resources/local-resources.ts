import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Artifact, Resource } from '../../../shared/domain'

export function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return !rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

async function inspectTree(path: string, budget = { count: 0, bytes: 0 }): Promise<void> {
  const stat = await lstat(path)
  if (stat.isSymbolicLink()) throw new Error('资源包不能包含符号链接')
  if (++budget.count > 2000) throw new Error('资源包最多包含 2000 个文件和目录')
  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) await inspectTree(join(path, entry), budget)
  } else if (stat.isFile()) {
    budget.bytes += stat.size
    if (budget.bytes > 100 * 1024 * 1024) throw new Error('资源包不能超过 100 MB')
  } else throw new Error('资源包只能包含普通文件和目录')
}

function frontmatter(text: string) {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error('SKILL.md 缺少 YAML frontmatter')
  const field = (name: string) => {
    const value = match[1].match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
    return value.replace(/^(["'])([\s\S]*)\1$/, '$2')
  }
  const name = field('name')
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('SKILL.md 的 name 必须为小写英文、数字和连字符组成的简单目录名，最多 64 字符')
  const description = field('description')
  return { name, description: description === '|' || description === '>' ? '' : description }
}

export async function importLocalResource(dataPath: string, kind: Resource['kind'], source: string): Promise<Resource> {
  if (!isAbsolute(source)) throw new Error('请选择资源的绝对路径')
  const stat = await lstat(source)
  if (stat.isSymbolicLink()) throw new Error('不能导入符号链接')
  if (kind === 'skill' && !stat.isDirectory()) throw new Error('Skill 必须是包含 SKILL.md 的目录')
  if (kind === 'knowledge' && (!stat.isFile() || !['.md', '.txt'].includes(extname(source).toLowerCase()))) throw new Error('当前知识库支持 Markdown 和 TXT 文件')
  await inspectTree(source)
  const metadata = kind === 'skill' ? frontmatter(await readFile(join(source, 'SKILL.md'), 'utf8')) : { name: basename(source), description: '本地知识文档' }
  const id = randomUUID()
  const parent = join(dataPath, kind === 'skill' ? 'skills' : 'knowledge')
  const destination = join(parent, id)
  if (isWithin(source, destination)) throw new Error('不能将资源复制到它自身的子目录')
  const temporary = join(parent, `.import-${id}`)
  await mkdir(parent, { recursive: true })
  try {
    await mkdir(temporary)
    if (kind === 'skill') await cp(source, join(temporary, metadata.name), { recursive: true, errorOnExist: true, force: false, dereference: false })
    else await cp(source, join(temporary, basename(source)), { errorOnExist: true, force: false })
    // Recheck the copied tree to reject symlinks introduced during the copy.
    await inspectTree(temporary)
    await rename(temporary, destination)
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error }
  return { id, kind, ...metadata, path: join(destination, kind === 'skill' ? metadata.name : basename(source)), createdAt: new Date().toISOString() }
}

export async function listArtifacts(workspace: string): Promise<Artifact[]> {
  const artifacts: Artifact[] = []
  const root = await realpath(workspace)
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (artifacts.length >= 2000) return
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      const resolved = await realpath(path)
      if (!isWithin(root, resolved)) continue
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        const stat = await lstat(path)
        const name = relative(root, path)
        artifacts.push({ name, path: join(workspace, name), size: stat.size })
      }
    }
  }
  await walk(root)
  return artifacts.sort((a, b) => a.name.localeCompare(b.name))
}
