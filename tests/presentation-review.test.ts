/*
 * [INPUT]: Dedicated review protocol, actual raster fixtures, OOXML and process fixtures.
 * [OUTPUT]: Coverage/score/revision gates, source extraction and actual owned-child cancellation evidence.
 * [OUTPUT]: Process fixtures create their observation file before starting and always drain cancellation.
 * [POS]: Controlled module regression only; generated review responses are not real visual-quality certification.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { afterEach, expect, test, vi } from 'vitest'
import { p as specSchema } from '../packages/runtime/src/modules/presentations/alma/model.mjs'
import { listDesigns } from '../packages/runtime/src/modules/presentations/alma/designs.mjs'
import { PresentationProjects } from '../packages/runtime/src/modules/presentations/presentation-project'
import { PresentationMaterials } from '../packages/runtime/src/modules/presentations/presentation-materials'
import { reviewSlides, type VisionReviewer } from '../packages/runtime/src/modules/presentations/visual-review'
import { probePresentationRenderer } from '../packages/runtime/src/modules/presentations/renderer-probe'
import { presentationWorker } from '../packages/runtime/src/modules/presentations/worker-client'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function root() { const value = await realpath(await mkdtemp(join(tmpdir(), 'boai-ppt-review-'))); roots.push(value); return value }
const contract = { title: 'Evidence', author: 'Fixture Author', theme: { name: 'Native', headFontFace: 'Arial', bodyFontFace: 'Arial' }, story: { audience: 'Reviewers', purpose: 'Inspect evidence', coreMessage: 'Review real revisions', narrative: ['Claim', 'Evidence'] }, design: { visualDirection: 'Precise typography', imageDirection: 'Native data', density: 'balanced' } }
const slide = (id: string) => ({ id, role: 'supporting', layoutKey: 'fixture', speakerNotes: 'Source: https://example.test/fixture', elements: [{ id: 'title', type: 'text', x: 1, y: 1, w: 10, h: 1, fontSize: 36, text: id }] })
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function samples(count: number) {
  const now = new Date().toISOString(), spec = specSchema.parse({ ...contract, version: 1, id: randomUUID(), revision: 3, outputPath: '/private/fixture.pptx', assetBasePath: '/private', createdAt: now, updatedAt: now, slides: Array.from({ length: count }, (_, i) => slide(`s${i}`)) })
  const bytes = await createCanvas(120, 80).encode('png')
  return { spec, images: spec.slides.map(slide => ({ slideId: slide.id, bytes, sha256: hash(bytes) })) }
}
function reviewer(generate?: VisionReviewer['generate']): VisionReviewer {
  return { model: 'controlled-vision', selectionId: 'fixture:1', verify: async () => {}, generate: generate ?? (async ({ images }) => ({ requestId: randomUUID(), text: JSON.stringify({ slides: images.map(image => ({ slideId: image.slideId, score: 90, issues: [] })), deckIssues: [] }) })) }
}
test('dedicated review batches six with one overlap and binds receipts and actual image hashes', async () => {
  const { spec, images } = await samples(12), sizes: string[][] = []
  const result = await reviewSlides(spec, 'fixture-hash', images, reviewer(async input => {
    sizes.push(input.images.map(image => image.slideId))
    expect(input.prompt).toContain('Judge the actual pixels')
    return reviewer().generate(input)
  }))
  expect(sizes).toEqual([['s0','s1','s2','s3','s4','s5'],['s5','s6','s7','s8','s9','s10'],['s10','s11']])
  expect(result.passed).toBe(true); expect(result.requests).toHaveLength(3)
  expect(result.images[0].sha256).toBe(hash(images[0].bytes))
  expect(result.reviewedRevision).toBe(3)
})
test.each(['omitted', 'duplicate', 'unknown', 'major', 'score', 'element', 'deck'] as const)('fails closed on %s reviewer defects', async defect => {
  const { spec, images } = await samples(7)
  let batch = 0
  const result = await reviewSlides(spec, 'fixture-hash', images, reviewer(async input => {
    const slides = input.images.map(image => ({ slideId: image.slideId, score: 90, issues: [] as unknown[] })), deckIssues: unknown[] = []
    if (batch++ === 0) {
      if (defect === 'omitted') slides.pop() // s5 appears later; that must not hide its first missing review.
      if (defect === 'duplicate') slides.push({ ...slides[0] })
      if (defect === 'unknown') slides.push({ slideId: 'invented', score: 95, issues: [] })
      if (defect === 'major') slides.at(-1)!.issues.push({ severity: 'major', category: 'clipping', description: 'Clipped', suggestedRepair: 'Increase height' })
      if (defect === 'score') slides.at(-1)!.score = 84
      if (defect === 'element') slides[0].issues.push({ severity: 'minor', category: 'overlap', description: 'Overlap', suggestedRepair: 'Move', elementIds: ['invented'] })
      if (defect === 'deck') deckIssues.push({ severity: 'major', category: 'consistency', description: 'Mismatch', suggestedRepair: 'Align', slideIds: ['s0', 's1'] })
    }
    return { requestId: randomUUID(), text: JSON.stringify({ slides, deckIssues }) }
  }))
  expect(result.passed).toBe(false)
})
test('rejects missing vision, changed PNGs, invalid JSON and selection revocation without fallback', async () => {
  const { spec, images } = await samples(1)
  await expect(reviewSlides(spec, 'hash', images, undefined)).rejects.toThrow('dedicated vision')
  await expect(reviewSlides(spec, 'hash', [{ ...images[0], sha256: 'bad' }], reviewer())).rejects.toThrow('hash mismatch')
  await expect(reviewSlides(spec, 'hash', images, reviewer(async () => ({ requestId: 'bad', text: 'not JSON' })))).rejects.toThrow()
  let revoked = false
  const selected = reviewer(async input => { revoked = true; return reviewer().generate(input) })
  selected.verify = async () => { if (revoked) throw new Error('selection revoked') }
  await expect(reviewSlides(spec, 'hash', images, selected)).rejects.toThrow('selection revoked')
})
test('extracts actual PPTX notes/data, inspects its template and rechecks permission on cache hits', async () => {
  const directory = await root(), projects = new PresentationProjects(join(directory, 'projects')), materials = new PresentationMaterials(join(directory, 'materials'))
  const created = await projects.create(contract), current = await projects.upsert(created.spec.id, 0, { ...slide('contents'), elements: [...slide('contents').elements, { id: 'chart', type: 'chart', chartType: 'bar', x: 1, y: 2.5, w: 8, h: 3, categories: ['A', 'B'], series: [{ name: 'Values', values: [7, 11] }] }] })
  expect(current.spec.author).toBe('Fixture Author')
  let allowed = true
  const source = { name: 'input.pptx', bytes: await readFile(current.filePath), verify: async () => { if (!allowed) throw new Error('source revoked') } }
  const template = await materials.inspect(source), first = await materials.extract(source), second = await materials.extract(source)
  expect(template.slideCount).toBe(1); expect(template.headFontFace).toBe('Arial'); expect(template.widthInches).toBeCloseTo(13.333, 2)
  expect(first.cacheHit).toBe(false); expect(second.cacheHit).toBe(true)
  expect(first.manifest.slides[0].speakerNotes.join(' ')).toContain('https://example.test/fixture')
  expect(first.manifest.slides[0].charts[0].series[0].values).toEqual([7, 11])
  expect(first.manifest.slides[0].text).toContain('contents')
  allowed = false
  await expect(materials.extract(source)).rejects.toThrow('source revoked')
  allowed = true
  const tampered = JSON.parse(await readFile(first.manifestPath, 'utf8')); tampered.slides[0].text = ['Invented replacement']
  await writeFile(first.manifestPath, JSON.stringify(tampered))
  await expect(materials.extract(source)).rejects.toThrow('manifest changed')
  const designs = listDesigns('research academic', 4)
  expect(designs).toHaveLength(4); expect(designs[0].id).toBe('academic-clean')
}, 30_000)
test('approved export requires the exact reviewed revision and rejects later changes', async () => {
  const directory = await root(), projects = new PresentationProjects(join(directory, 'projects'))
  const created = await projects.create(contract), current = await projects.upsert(created.spec.id, 0, slide('review'))
  const file = join(directory, 'controlled.png'); await writeFile(file, await createCanvas(120, 80).encode('png'))
  // This fixture tests receipt/revision gates, never the actual renderer or model quality.
  vi.spyOn(projects, 'render').mockResolvedValue({ revision: 1, fileHash: current.fileHash, images: [file], renderer: { path: 'fixture', version: 'fixture' }, reviewed: false })
  await expect(projects.approvedBytes(created.spec.id)).rejects.toThrow()
  const reviewed = await projects.review(created.spec.id, 'fixture', reviewer())
  expect(reviewed.report.passed).toBe(true)
  expect(hash((await projects.approvedBytes(created.spec.id)).bytes)).toBe(current.fileHash)
  await projects.upsert(created.spec.id, 1, slide('changed'))
  await expect(projects.approvedBytes(created.spec.id)).rejects.toThrow('has not passed')
}, 30_000)
test('extracts DOCX, XLSX, PDF and text sources through the actual worker', async () => {
  const directory = await root(), materials = new PresentationMaterials(join(directory, 'materials'))
  const load = async (name: string, bytes: Uint8Array) => materials.extract({ name, bytes, verify: async () => {} })
  const docx = new JSZip()
  docx.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Original source 2026 &amp; exact value 17</w:t></w:r></w:p></w:body></w:document>')
  const document = await load('source.docx', await docx.generateAsync({ type: 'uint8array' }))
  expect(document.manifest.slides[0].text).toEqual(['Original source 2026 & exact value 17'])
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([['Name', 'Value'], ['A', 7], ['B', 11]])
  XLSX.utils.book_append_sheet(book, sheet, '原始数据')
  const spreadsheet = await load('source.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
  expect(spreadsheet.manifest.slides[0].tables[0]).toEqual([['Name', 'Value'], ['A', '7'], ['B', '11']])
  const stream = 'BT /F1 20 Tf 30 150 Td (Verified PDF value: 17) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const documentPdf = await load('source.pdf', Buffer.from(pdf))
  expect(documentPdf.manifest.slides[0].text.join(' ')).toContain('Verified PDF value: 17')
  for (const extension of ['txt', 'md', 'csv', 'json']) {
    const value = await load(`source.${extension}`, Buffer.from('Original 17\nSecond line'))
    expect(value.manifest.slides[0].text).toEqual(['Original 17', 'Second line'])
  }
}, 30_000)
test('imports actual authorized image bytes and rejects cross-project reuse, revocation and changed assets', async () => {
  const directory = await root(), projects = new PresentationProjects(join(directory, 'projects'))
  const first = await projects.create(contract), other = await projects.create(contract), bytes = await createCanvas(120, 80).encode('png')
  const source = { name: 'figure.png', bytes, verify: async () => {} }
  const image = await projects.importImage(first.spec.id, source)
  const content = { id: 'image', role: 'supporting', layoutKey: 'image', elements: [{ id: 'picture', type: 'image', x: 1, y: 1, w: 6, h: 4, path: image.path, altText: 'Controlled blank raster' }] }
  const changed = await projects.upsert(first.spec.id, 0, content)
  const zip = await JSZip.loadAsync(await readFile(changed.filePath))
  expect(Object.keys(zip.files).some(name => name.startsWith('ppt/media/') && name.endsWith('.png'))).toBe(true)
  await expect(projects.upsert(other.spec.id, 0, content)).rejects.toThrow('authorized imported asset')
  await writeFile(image.path, 'external mutation')
  await expect(projects.upsert(first.spec.id, 1, content)).rejects.toThrow('outside its checkpoint')
  let checks = 0
  await expect(projects.importImage(other.spec.id, { ...source, verify: async () => { if (++checks === 2) throw new Error('revoked during import') } })).rejects.toThrow('revoked during import')
  await expect(readFile(join(directory, 'projects', other.spec.id, 'assets', `${hash(bytes)}.png`))).rejects.toThrow()
}, 30_000)
test('startup failure and cancellation wait for owned renderer processes to exit', async () => {
  const directory = await root(), executable = join(directory, 'renderer'), pidsPath = join(directory, 'pids.jsonl')
  await writeFile(pidsPath, '')
  await writeFile(executable, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(pidsPath)},JSON.stringify({pid:process.pid,args:process.argv.slice(2)})+'\\n');setInterval(()=>{},1000);\n`)
  await chmod(executable, 0o700)
  await expect(probePresentationRenderer(executable, undefined, 50)).rejects.toThrow('timed out')
  await expect(presentationWorker('renderer', { input: { rendererPath: join(directory, 'missing'), presentationPath: 'unused.pptx', outputDir: join(directory, 'missing-output'), slideIds: ['s'] } })).rejects.toThrow('ENOENT')
  const controller = new AbortController()
  const rendered = presentationWorker('renderer', { input: { rendererPath: executable, presentationPath: 'unused.pptx', outputDir: join(directory, 'output'), slideIds: ['s'], timeoutMs: 10_000 } }, controller.signal)
  const stopped = expect(rendered).rejects.toThrow('cancel')
  const deadline = Date.now() + 6000
  let records: Array<{pid: number; args: string[]}> = []
  try {
    while (Date.now() < deadline) {
      records = (await readFile(pidsPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      if (records.some(item => item.args.includes('--convert-to'))) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  } finally { controller.abort(new Error('cancel requested')); await stopped }
  expect(records.some(item => item.args.includes('--convert-to'))).toBe(true)
  for (const item of records) expect(() => process.kill(item.pid, 0)).toThrow()
}, 15_000)
