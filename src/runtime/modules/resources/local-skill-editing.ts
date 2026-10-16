/*
 * [INPUT]: 本地技能目录、明确内容/hash、宿主写锁与当前用户授权。
 * [OUTPUT]: 共享技能SKILL.md创建/核源修改、核源移出目录；不修改插件/其他Agent来源或员工独立副本。
 * [POS]: 技能管理文件边界，供手动IPC和bobo普通会话共用。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { realpath, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { z } from 'zod'
import type { ProductStore } from '../../adapters/storage/product-store'
import { LocalSkillCatalogService, localSkillId } from './local-skill-catalog'
import { inspectResourceTree, parseSkillDocument } from './local-resources'
import { detachSkillRecords } from './skill-collections'
import { workspaceTarget, writeWorkspaceFile } from '../workspaces/file-access'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const saveLocalSkillSchema = z.object({ id: z.string().min(1).max(200).optional(), name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(), content: z.string().min(1).max(250000), expectedHash: digest.nullable() }).strict().refine(value => value.id ? value.expectedHash !== null : !!value.name && value.expectedHash === null, '新增需要name和空hash，修改需要id和原内容hash')
export const removeLocalSkillSchema = z.object({ id: z.string().min(1).max(200), expectedHash: digest }).strict()

export class LocalSkillEditing {
  constructor(private catalog: LocalSkillCatalogService, private store: ProductStore, private changed: () => void, private home = homedir(), private assertAvailable: (id: string) => void = () => {}) {}
  async read(id: string) {
    const detail = await this.catalog.detail(id)
    const tree = await inspectResourceTree(await this.catalog.source(id))
    return { ...detail, contentHash: hash(detail.content), treeHash: tree.hash }
  }
  private async writable(id: string) {
    this.assertAvailable(id)
    const detail = await this.catalog.detail(id), directory = await this.catalog.source(id)
    const root = await realpath(join(this.home, '.agents/skills'))
    if (detail.skill.source !== 'global' || dirname(directory) !== root || basename(directory).startsWith('.')) throw new Error('此来源仅可读取；请先复制安装到本地共享技能再修改')
    await workspaceTarget(this.home, relative(this.home, directory))
    return { detail, directory }
  }
  async save(raw: unknown, validate: () => Promise<void> = async () => {}, signal?: AbortSignal) {
    const input = saveLocalSkillSchema.parse(raw)
    const metadata = parseSkillDocument(input.content, { strictName: !input.id })
    if (!input.id && metadata.name !== input.name) throw new Error('技能目录名称与SKILL.md中的name必须一致')
    const directory = input.id ? (await this.writable(input.id)).directory : await workspaceTarget(this.home, `.agents/skills/${input.name}`, true)
    await validate(); signal?.throwIfAborted()
    try { await writeWorkspaceFile(this.home, relative(this.home, join(directory, 'SKILL.md')), input.content, input.expectedHash, signal) }
    finally { this.catalog.invalidate(); this.changed() }
    return this.read(localSkillId(await realpath(directory)))
  }
  async remove(raw: unknown, validate: () => Promise<void> = async () => {}) {
    const input = removeLocalSkillSchema.parse(raw), { directory } = await this.writable(input.id)
    if ((await inspectResourceTree(directory)).hash !== input.expectedHash) throw new Error('技能文件已变化，请重新读取后删除')
    // A same-volume move removes the catalog entry without destroying the user's files.
    const archive = await workspaceTarget(this.home, `.agents/skills/.boai-removed-${randomUUID()}`, true)
    await validate()
    if ((await inspectResourceTree(directory)).hash !== input.expectedHash) throw new Error('技能文件已变化，请重新读取后删除')
    await rename(directory, archive)
    try { await this.store.transaction(tx => detachSkillRecords(tx, input.id)) }
    finally { this.catalog.invalidate(); this.changed() }
    return { removed: true, id: input.id, name: basename(directory) }
  }
}
