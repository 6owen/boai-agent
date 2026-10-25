/*
 * [INPUT]: 实际文件系统、两个独立员工私有原件与同会话共享成果目录。
 * [OUTPUT]: 用真实mkdir竞争屏障确定性验证首次同名并发发布各自原件/hash；抢先符号链接/文件及其他IO故障仍拒绝，零登记/零外部写入。
 * [POS]: 文件副作用边界模块验收；仅暂停真实mkdir调用，不替换文件结果或业务发布记录。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Artifact, DigitalAgent, SessionWorkspace } from '../packages/shared/src/domain'
import { publishArtifact } from '../packages/runtime/src/modules/workspaces/file-access'

const control = vi.hoisted(() => ({ beforeMkdir: undefined as ((target: string) => Promise<void>) | undefined }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, mkdir: (async (...args: Parameters<typeof actual.mkdir>) => { await control.beforeMkdir?.(String(args[0])); return actual.mkdir(...args) }) as typeof actual.mkdir }
})
const roots: string[] = []
afterEach(async () => { control.beforeMkdir = undefined; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const hash = (content: string) => createHash('sha256').update(content).digest('hex')
const employee = (id: string): DigitalAgent => ({ id, name: id, role: 'writer', instructions: '', color: '#79719a', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-file-access-'))); roots.push(root)
  const sharedPath = join(root, 'conversation'); await mkdir(sharedPath)
  const published: Artifact[] = []
  const participants = await Promise.all(['alice', 'bob'].map(async id => {
    const privateRoot = join(root, id), runId = `run-${id}`, runPath = join(privateRoot, 'runs', runId), content = `# ${id}的独立原件\n`
    await mkdir(runPath, { recursive: true }); await mkdir(join(privateRoot, 'work')); await writeFile(join(runPath, 'report.md'), content)
    const workspace: SessionWorkspace = { root: privateRoot, workPath: join(privateRoot, 'work'), runPath, sharedPath }
    const context = { agent: employee(id), runId, signal: new AbortController().signal, onArtifact: async (artifact: Artifact) => { published.push(artifact) } }
    return { content, workspace, publish: () => publishArtifact(context, workspace, `self:/runs/${runId}/report.md`, '同名报告.md') }
  }))
  return { root, sharedPath, artifactsPath: join(sharedPath, 'artifacts'), participants, published }
}

describe('共享成果目录首次发布的真实并发边界', () => {
  it('两个员工同时首次发布同名文件，各自保留真实原件hash和独立身份', async () => {
    const f = await fixture(); let reached = 0, release!: () => void
    const bothMissing = new Promise<void>(resolve => { release = resolve })
    control.beforeMkdir = async target => {
      if (target !== f.artifactsPath) return
      reached++; if (reached === 2) release()
      await bothMissing
    }
    // Both participants have observed the absent parent before either real mkdir proceeds.
    const results = await Promise.all(f.participants.map(participant => participant.publish()))
    expect(reached).toBe(2); expect(f.published).toHaveLength(2)
    expect(new Set(results.map(result => result.artifact.id)).size).toBe(2)
    expect(new Set(results.map(result => result.artifact.path)).size).toBe(2)
    expect(new Set(results.map(result => result.artifact.contentHash)).size).toBe(2)
    for (const [index, result] of results.entries()) {
      expect(result.artifact).toMatchObject({ name: '同名报告.md', ownerAgentId: ['alice', 'bob'][index], contentHash: hash(f.participants[index]!.content) })
      expect(await readFile(result.artifact.path, 'utf8')).toBe(f.participants[index]!.content)
      expect(await readFile(result.artifact.sourcePath!, 'utf8')).toBe(f.participants[index]!.content)
    }
    expect(await readdir(f.artifactsPath)).toHaveLength(2)
  })
  it.each(['inside', 'outside'] as const)('竞争者抢先放入%s符号链接时拒绝，不写入链接目标或登记成果', async placement => {
    const f = await fixture(), destination = placement === 'inside' ? join(f.sharedPath, 'other') : join(f.root, 'outside'); await mkdir(destination)
    control.beforeMkdir = async target => {
      if (target !== f.artifactsPath) return
      control.beforeMkdir = undefined; await symlink(destination, target)
    }
    await expect(f.participants[0]!.publish()).rejects.toThrow()
    expect(f.published).toEqual([]); expect(await readdir(destination)).toEqual([])
  })
  it('竞争者抢先放入普通文件时拒绝，保留原字节且不登记成果', async () => {
    const f = await fixture()
    control.beforeMkdir = async target => {
      if (target !== f.artifactsPath) return
      control.beforeMkdir = undefined; await writeFile(target, '外部原字节不得覆盖')
    }
    await expect(f.participants[0]!.publish()).rejects.toThrow()
    expect(await readFile(f.artifactsPath, 'utf8')).toBe('外部原字节不得覆盖'); expect(f.published).toEqual([])
  })
  it('其他真实IO错误继续拒绝，不递归重建被移除的会话根', async () => {
    const f = await fixture()
    control.beforeMkdir = async target => {
      if (target !== f.artifactsPath) return
      control.beforeMkdir = undefined; await rm(f.sharedPath, { recursive: true })
    }
    await expect(f.participants[0]!.publish()).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(realpath(f.sharedPath)).rejects.toMatchObject({ code: 'ENOENT' }); expect(f.published).toEqual([])
  })
})
