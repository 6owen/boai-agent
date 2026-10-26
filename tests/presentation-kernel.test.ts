/*
 * [INPUT]: Migrated full presentation schema/compiler, real ZIP files and private revision storage.
 * [OUTPUT]: Editable OOXML, CAS/reopen, rejected revisions, tamper and cancellation evidence; no model or visual-quality claim.
 * [POS]: Presentation kernel regression. Actual LibreOffice rendering is a separate local probe.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'
import { afterEach, expect, test } from 'vitest'
import { PresentationProjects } from '../packages/runtime/src/modules/presentations/presentation-project'
import { f as layouts, c as icons } from '../packages/runtime/src/modules/presentations/alma/model.mjs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const contract = { title: '真实可编辑项目', theme: { name: 'Review', headFontFace: 'Arial', bodyFontFace: 'Arial' }, story: { audience: '项目成员', purpose: '核查实际产物', coreMessage: '保留原始数字和引用', narrative: ['结论', '证据'] }, design: { visualDirection: 'Simple typography', imageDirection: 'Native data', density: 'balanced' } }
const slide = (id: string, text = '已验证的内容') => ({ id, role: 'supporting', layoutKey: 'native-test', speakerNotes: '来源：https://example.test/source；此为受控样例。', elements: [{ type: 'text', id: 'title', x: 1, y: 1, w: 10, h: 1, text, fontSize: 36 }] })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-presentation-'))); roots.push(root)
  return { root, projects: new PresentationProjects(join(root, 'projects')) }
}
test('compiles editable text, charts and notes; reopens and revises one slide without losing the rest', async () => {
  const f = await fixture(), created = await f.projects.create(contract)
  const first = await f.projects.upsert(created.spec.id, 0, slide('intro'))
  const second = await f.projects.upsert(created.spec.id, 1, { id: 'data', role: 'data', layoutKey: 'chart-test', elements: [{ type: 'chart', id: 'sales', x: 1, y: 1, w: 10, h: 5, chartType: 'bar', categories: ['甲', '乙'], series: [{ name: '样例值', values: [7, 11] }] }] })
  const reopened = new PresentationProjects(join(f.root, 'projects'))
  expect((await reopened.get(created.spec.id)).fileHash).toBe(second.fileHash)
  const revised = await reopened.upsert(created.spec.id, 2, slide('intro', '仅修改这一页'))
  expect(revised.spec.slides[1]).toEqual(second.spec.slides[1])
  expect(await readFile(first.filePath)).not.toEqual(await readFile(revised.filePath))
  const zip = await JSZip.loadAsync(await readFile(revised.filePath))
  const text = await zip.file('ppt/slides/slide1.xml')!.async('text')
  expect(text).toContain('仅修改这一页'); expect(text).toContain('<a:t>')
  const chart = await zip.file('ppt/charts/chart1.xml')!.async('text')
  expect(chart).toContain('<c:v>7</c:v>'); expect(chart).toContain('<c:v>11</c:v>')
  expect(await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('text')).toContain('https://example.test/source')
  expect(Object.keys(zip.files).some(path => path.startsWith('ppt/embeddings/') && path.endsWith('.xlsx'))).toBe(true)
}, 30_000)
test('competing revisions admit one writer; invalid content and unconnected image paths never replace the last good deck', async () => {
  const f = await fixture(), created = await f.projects.create(contract), id = created.spec.id
  const outcomes = await Promise.allSettled([f.projects.upsert(id, 0, slide('one')), new PresentationProjects(join(f.root, 'projects')).upsert(id, 0, slide('two'))])
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
  const before = await f.projects.get(id)
  await expect(f.projects.upsert(id, 1, { ...slide('bad'), elements: [{ ...slide('bad').elements[0], x: 30 }] })).rejects.toThrow('off_canvas')
  await expect(f.projects.upsert(id, 1, { id: 'remote', layoutKey: 'image', elements: [{ id: 'image', type: 'image', x: 1, y: 1, w: 5, h: 3, path: '/private/file.png', altText: 'source' }] })).rejects.toThrow('not connected')
  await expect(f.projects.upsert(id, 1, { id: 'svg', layoutKey: 'vector', elements: [{ id: 'unsafe', type: 'svg', x: 1, y: 1, w: 5, h: 3, svg: '<svg><script>alert(1)</script></svg>', altText: 'unsafe' }] })).rejects.toThrow('unsafe_svg')
  expect((await f.projects.get(id)).fileHash).toBe(before.fileHash)
}, 30_000)
test('does not accept changed files, cancelled edits or invented project paths', async () => {
  const f = await fixture(), created = await f.projects.create(contract)
  await expect(f.projects.get('../escape')).rejects.toThrow()
  const controller = new AbortController(); controller.abort(new Error('stop'))
  await expect(f.projects.upsert(created.spec.id, 0, slide('cancelled'), controller.signal)).rejects.toThrow('stop')
  expect((await f.projects.get(created.spec.id)).spec.revision).toBe(0)
  await writeFile(created.filePath, 'external mutation')
  await expect(f.projects.get(created.spec.id)).rejects.toThrow('changed outside')
  expect(layouts({ role: 'hero', limit: 4 })).toHaveLength(4)
  expect(icons('chart', 3)).toHaveLength(3)
}, 30_000)
