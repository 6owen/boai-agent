/*
 * [OUTPUT]: 2026-11-24 第三阶段：Mastra 第三阶段回归覆盖原生文件/MCP/快照/Trace、实时补充、断流及 OM 致命失败退出；完整结果见实施记录。
 * [INPUT]: 真实业务文件、并发写入及固定字节。
 * [OUTPUT]: 业务分页、并发 hash 拒绝和原字节保持。
 * [POS]: 文件编辑边界测试；API SDK 接线另归 mastra-engine.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeWorkspaceText, fileContentHash, readFilePage } from '../packages/runtime/src/modules/workspaces/file-editing'
import { writeWorkspaceFile } from '../packages/runtime/src/modules/workspaces/file-access'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('keeps BOM, CRLF and Unicode intact and refuses malformed or binary decoding', () => {
  const content = '\ufeff甲😀\r\n乙'
  expect(decodeWorkspaceText(Buffer.from(content))).toBe(content)
  expect(readFilePage(content, 2, 1)).toMatchObject({ content: '😀', nextOffset: 3 })
  expect(() => decodeWorkspaceText(Buffer.from([0xe4, 0xb8]))).toThrow('not UTF-8')
  expect(() => decodeWorkspaceText(Buffer.from('binary\0data'))).toThrow('not UTF-8')
})
it('serializes two competing guarded writes so only one replaces the read version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-guarded-write-')); roots.push(root)
  const target = join(root, 'plan.md'); await writeFile(target, 'original')
  const hash = fileContentHash('original')
  const results = await Promise.allSettled([
    writeWorkspaceFile(root, 'plan.md', 'first update', hash),
    writeWorkspaceFile(root, 'plan.md', 'second update', hash),
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(['first update', 'second update']).toContain(await readFile(target, 'utf8'))
})
it('never clobbers a file created after the initial missing-file observation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-guarded-create-')); roots.push(root)
  await writeFile(join(root, 'plan.md'), 'someone else created this')
  await expect(writeWorkspaceFile(root, 'plan.md', 'overwrite', null)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe('someone else created this')
})
