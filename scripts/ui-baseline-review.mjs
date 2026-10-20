/*
 * [INPUT]: 旧期望PNG、独立候选PNG、逐case合同和对应manifest。
 * [OUTPUT]: 不受比较容差影响的旧/新/原始像素差异及hash，接受前重新核对。
 * [POS]: 开发侧基线审阅材料；合同变化仍可审阅，普通检查仍拒绝合同错配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const optional = file => readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
async function rawDifference(before, after) {
  const old = await loadImage(before), next = await loadImage(after), width = Math.max(old.width, next.width), height = Math.max(old.height, next.height)
  const a = createCanvas(width, height), b = createCanvas(width, height), diff = createCanvas(width, height)
  a.getContext('2d').drawImage(old, 0, 0); b.getContext('2d').drawImage(next, 0, 0)
  const left = a.getContext('2d').getImageData(0, 0, width, height), right = b.getContext('2d').getImageData(0, 0, width, height), pixels = diff.getContext('2d').createImageData(width, height)
  let changedPixels = 0
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const different = [0, 1, 2, 3].some(channel => left.data[offset + channel] !== right.data[offset + channel])
    if (different) changedPixels++
    const shade = Math.round((right.data[offset] + right.data[offset + 1] + right.data[offset + 2]) / 6 + 127)
    pixels.data.set(different ? [255, 0, 64, 255] : [shade, shade, shade, 255], offset)
  }
  diff.getContext('2d').putImageData(pixels, 0, 0)
  return { bytes: diff.toBuffer('image/png'), changedPixels, beforeSize: [old.width, old.height], afterSize: [next.width, next.height] }
}
export async function createBaselineReview(directory, ids, baseline) {
  const review = join(directory, 'review'); await mkdir(review)
  const manifest = JSON.parse((await optional(join(baseline, 'manifest.json')))?.toString() ?? 'null')
  const cases = {}
  for (const id of ids) {
    const before = await optional(join(baseline, `${id}.png`)), after = await readFile(join(directory, 'snapshots', `${id}.png`))
    if (manifest?.cases[id] && (!before || hash(before) !== manifest.cases[id].sha256)) throw new Error(`旧基线损坏，不能生成审阅：${id}`)
    await writeFile(join(review, `${id}-new.png`), after)
    const next = await loadImage(after)
    const row = { oldSha256: before ? hash(before) : null, newSha256: hash(after), oldContract: manifest?.cases[id]?.contract ?? null, diffSha256: null, changedPixels: null, beforeSize: null, afterSize: [next.width, next.height] }
    if (before) {
      await writeFile(join(review, `${id}-old.png`), before)
      const { bytes, ...measurements } = await rawDifference(before, after)
      await writeFile(join(review, `${id}-diff.png`), bytes)
      Object.assign(row, measurements, { diffSha256: hash(bytes) })
    }
    cases[id] = row
  }
  await writeFile(join(review, 'differences.json'), JSON.stringify({ version: 1, comparison: 'raw-rgba-without-threshold', cases }, null, 2) + '\n')
  return cases
}

export async function verifyBaselineReview(directory, ids, baseline, candidate) {
  const review = join(directory, 'review'), rows = JSON.parse(await readFile(join(review, 'differences.json'), 'utf8')).cases
  const manifest = JSON.parse((await optional(join(baseline, 'manifest.json')))?.toString() ?? 'null')
  for (const id of ids) {
    const row = rows[id], before = await optional(join(baseline, `${id}.png`))
    if (!row || row.newSha256 !== candidate.cases[id]?.sha256 || hash(await readFile(join(review, `${id}-new.png`))) !== row.newSha256 || (before ? hash(before) : null) !== row.oldSha256 || (manifest?.cases[id]?.contract ?? null) !== row.oldContract) throw new Error(`审阅材料缺失或旧/新基线变化：${id}`)
    if (row.oldSha256 && (hash(await readFile(join(review, `${id}-old.png`))) !== row.oldSha256 || !row.diffSha256 || hash(await readFile(join(review, `${id}-diff.png`))) !== row.diffSha256)) throw new Error(`旧/差异图缺失或变化：${id}`)
    if (before) {
      const actual = await rawDifference(before, await readFile(join(review, `${id}-new.png`)))
      if (hash(actual.bytes) !== row.diffSha256 || actual.changedPixels !== row.changedPixels || JSON.stringify(actual.beforeSize) !== JSON.stringify(row.beforeSize) || JSON.stringify(actual.afterSize) !== JSON.stringify(row.afterSize)) throw new Error(`差异材料与真实旧/新像素不符：${id}`)
    }
  }
}
