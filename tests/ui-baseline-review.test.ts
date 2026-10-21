/*
 * [INPUT]: 真实小尺寸旧/新PNG和冻结基线来源。
 * [OUTPUT]: 合同变化仍留原始diff；材料缺失、篡改和旧基线移动拒绝晋升。
 * [POS]: 基线独立审阅材料验证，不代替实际Electron截图场景。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Plain Node ESM CLI intentionally has no declaration file.
import { createBaselineReview, verifyBaselineReview } from '../scripts/ui-baseline-review.mjs'

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const png = (color: string) => { const canvas = createCanvas(2, 2), context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 2, 2); return canvas.toBuffer('image/png') }
let root: string, baseline: string, candidate: { cases: { a: { sha256: string; contract: string } } }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'boai-baseline-review-')); baseline = join(root, 'baseline')
  await mkdir(baseline); await mkdir(join(root, 'snapshots'))
  const old = png('#ffffff'), next = png('#fefefe')
  await writeFile(join(baseline, 'a.png'), old); await writeFile(join(root, 'snapshots/a.png'), next)
  await writeFile(join(baseline, 'manifest.json'), JSON.stringify({ cases: { a: { sha256: hash(old), contract: 'old-threshold' } } }))
  candidate = { cases: { a: { sha256: hash(next), contract: 'changed-threshold' } } }
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
it('比较阈值改变也保留全部真实像素差异和旧合同', async () => {
  const rows = await createBaselineReview(root, ['a'], baseline)
  expect(rows.a.changedPixels).toBe(4); expect(rows.a.oldContract).toBe('old-threshold')
  await expect(verifyBaselineReview(root, ['a'], baseline, candidate)).resolves.toBeUndefined()
})
it.each(['a-old.png', 'a-diff.png'])('缺少%s拒绝晋升', async file => {
  await createBaselineReview(root, ['a'], baseline); await rm(join(root, 'review', file))
  await expect(verifyBaselineReview(root, ['a'], baseline, candidate)).rejects.toThrow()
})
it('候选期间旧基线被改动不能接受过期审阅', async () => {
  await createBaselineReview(root, ['a'], baseline); await writeFile(join(baseline, 'a.png'), png('#000000'))
  await expect(verifyBaselineReview(root, ['a'], baseline, candidate)).rejects.toThrow(/旧\/新基线变化/)
})
it('同步伪造diff图片/hash/计数也不能冒充真实差异', async () => {
  await createBaselineReview(root, ['a'], baseline)
  const file = join(root, 'review/differences.json'), rows = JSON.parse(await readFile(file, 'utf8')), fake = png('#ffffff')
  await writeFile(join(root, 'review/a-diff.png'), fake)
  Object.assign(rows.cases.a, { diffSha256: hash(fake), changedPixels: 0 })
  await writeFile(file, JSON.stringify(rows))
  await expect(verifyBaselineReview(root, ['a'], baseline, candidate)).rejects.toThrow(/真实旧\/新像素/)
})
