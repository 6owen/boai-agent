/*
 * [INPUT]: skills CLI 全局安装记录与宿主 home。
 * [OUTPUT]: 按目录名读取安装记录，精确名称优先，规范化名称只匹配唯一记录。
 * [POS]: resources 的本机技能目录与更新来源共用的只读锁文件索引。
 * [PROTOCOL]: 修改时同步 Header 与所属目录 .folder.md。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { githubRepository, skillWebUrl } from '../../adapters/skills/source'
import { boundedRead } from '../workspaces/file-access'

const normalizedName = (name: string) => name.toLowerCase().replace(/[^a-z0-9._]+/g, '-').replace(/^[.\-]+|[.\-]+$/g, '').slice(0, 255) || 'unnamed-skill'
const lockSchema = z.object({ skills: z.record(z.string(), z.object({ sourceType: z.string().optional(), source: z.string().optional(), sourceUrl: z.string().optional(), ref: z.string().optional(), skillPath: z.string().optional(), updatedAt: z.unknown().optional() })) })

export function lockSourceUrl(entry: z.infer<typeof lockSchema>['skills'][string]): string | undefined {
  if (entry.sourceType === 'local') return undefined
  if (entry.sourceType === 'github') {
    for (const value of [entry.source, entry.sourceUrl]) {
      if (!value) continue
      try { return githubRepository(value) } catch { /* Older CLI entries can use either field. */ }
    }
    return undefined
  }
  return skillWebUrl(entry.sourceUrl) ?? skillWebUrl(entry.source)
}

export async function readLocalSkillLock(home: string) {
  const path = home === homedir() && process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, 'skills/.skill-lock.json')
    : join(home, '.agents/.skill-lock.json')
  const { skills } = lockSchema.parse(JSON.parse(await boundedRead(path)))
  const exact = new Map(Object.entries(skills))
  const bySlug = new Map<string, (typeof skills)[string] | undefined>()
  for (const [name, entry] of exact) {
    const slug = normalizedName(name)
    bySlug.set(slug, bySlug.has(slug) ? undefined : entry)
  }
  return (slug: string) => exact.get(slug) ?? bySlug.get(slug)
}
