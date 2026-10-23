/*
 * [INPUT]: 固定中文双字/长词/多词/英文标识符/名称与正文混合语料及 SQLite FTS5 默认中文行为；15000 条历史和 32 份正文的确定性规模。
 * [OUTPUT]: 原连续 instr、精确多词 AND、双字拆分及默认 FTS 的独立命中质量对比、名称/短语/重复词排名及稳定分页、正文索引规模/查询 p95 实测；不使用 embedding 或模型。
 * [POS]: tests/search-quality.test.ts；R1/Q2 固定质量与有界性能证据，来源真实文件安全由 conversation-search.test.ts 独立覆盖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ConversationSearchRepository } from '../src/runtime/modules/conversations/search-repository'
import type { SearchBodyRecord } from '../src/runtime/modules/conversations/search-index-sql'
import type { ArtifactVersion } from '../src/shared/domain/artifacts'
import type { ConversationSearchQuery } from '../src/shared/domain/reading'

const corpus = [
  { id: 'a', name: '报告.md', text: '苹果浏览器中文官网更新。' },
  { id: 'b', name: '研究.md', text: '浏览器插件研究。苹果设备可用。' },
  { id: 'c', name: '苹果 浏览器 调研.md', text: '查找词只出现在文件名。' },
  { id: 'd', name: '干扰.md', text: '苹果水果、果电拼字和电脑，不能当成那个连续长词。' },
  { id: 'e', name: '倒序.md', text: '浏览器 苹果' },
  { id: 'f', name: '工具.md', text: 'browser_tool agent workspace read_file' },
  { id: 'g', name: '重复.md', text: '苹果 浏览器 苹果 浏览器 苹果 浏览器' },
  { id: 'h', name: 'Chrome插件.md', text: 'Google Chrome browser_tool' },
  { id: 'i', name: '写作计划.md', text: '戏剧人物的写作计划。' },
  { id: 'j', name: '公告.md', text: '中文公告，官网更新。' },
]
const cases: { query: string; expected: string[] }[] = [
  { query: '苹果', expected: ['a', 'b', 'c', 'd', 'e', 'g'] }, { query: '官网', expected: ['a', 'j'] },
  { query: '苹果浏览器', expected: ['a'] }, { query: '苹果 浏览器', expected: ['a', 'b', 'c', 'e', 'g'] },
  { query: '浏览器 苹果', expected: ['a', 'b', 'c', 'e', 'g'] }, { query: 'browser_tool', expected: ['f', 'h'] },
  { query: 'workspace read_file', expected: ['f'] }, { query: 'Chrome browser_tool', expected: ['h'] },
  { query: '苹果电脑', expected: [] }, { query: '苹果 不存在', expected: [] }, { query: '苹果苹果', expected: [] },
  { query: '中文官网', expected: ['a'] }, { query: '人物 写作', expected: ['i'] }, { query: '插件 苹果', expected: ['b'] },
  { query: '苹果浏览器 官网', expected: ['a'] }, { query: 'BROWSER_TOOL', expected: ['f', 'h'] },
]
const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const query = (keyword: string, extra: Partial<ConversationSearchQuery> = {}): ConversationSearchQuery => ({ keyword, scope: 'all', ...extra })
const textOf = (entry: typeof corpus[number]) => `${entry.name}\n${entry.text}`.toLowerCase()
const idsFor = (predicate: (value: string) => boolean) => corpus.filter(entry => predicate(textOf(entry))).map(entry => entry.id).sort()
const terms = (keyword: string) => keyword.trim().toLowerCase().split(/\s+/u)
const bigrams = (keyword: string) => terms(keyword).flatMap(term => /^[\p{Script=Han}]+$/u.test(term) && [...term].length > 1 ? [...term].slice(0, -1).map((letter, i) => letter + [...term][i + 1]) : [term])
function quality(results: string[][]) {
  let truePositive = 0, falsePositive = 0, falseNegative = 0
  for (const [i, actual] of results.entries()) { const expected = cases[i].expected; truePositive += actual.filter(id => expected.includes(id)).length; falsePositive += actual.filter(id => !expected.includes(id)).length; falseNegative += expected.filter(id => !actual.includes(id)).length }
  return { truePositive, falsePositive, falseNegative, precision: truePositive / Math.max(1, truePositive + falsePositive), recall: truePositive / Math.max(1, truePositive + falseNegative) }
}
const p95 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * .95) - 1]
async function database() {
  const root = await mkdtemp(join(tmpdir(), 'boai-search-quality-')); roots.push(root)
  const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  await store.write([{ collection: 'conversations', id: 'chat', value: { id: 'chat', title: '固定质量语料', kind: 'group', agentIds: ['writer'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' } }])
  return store
}
const artifact = (entry: typeof corpus[number], i: number): ArtifactVersion => ({ id: entry.id, conversationId: 'chat', name: entry.name, path: `/fixture/${entry.id}`, size: Buffer.byteLength(entry.text), ownerAgentId: 'writer', publishedAt: new Date(Date.UTC(2026, 9, 2, 0, 0, i)).toISOString(), logicalArtifactId: entry.id, contentVersion: 1, contentHash: digest(entry.text), contentStatus: 'ready', managedRelativePath: `artifacts/${entry.id}/${entry.name}`, registrationSource: 'publication' })

describe('Q2 fixed Chinese quality and scale evidence', () => {
  it('compares exact substrings, whitespace AND, Chinese bigrams and default SQLite FTS against a frozen intended corpus', async () => {
    const store = await database(), bodies = new Map(corpus.map(value => [value.id, value.text]))
    await store.write(corpus.map((entry, i) => ({ collection: 'artifacts', id: entry.id, value: artifact(entry, i) })))
    const search = new ConversationSearchRepository(store, { validateMessage: async () => {}, validateMaterial: async () => {}, validateArtifact: async value => { expect(value.contentHash).toBe(digest(bodies.get(value.id)!)) }, readArtifactText: async value => bodies.get(value.id)! })
    const baseline = cases.map(value => idsFor(content => content.includes(value.query.toLowerCase()))), exactAnd = cases.map(value => idsFor(content => terms(value.query).every(term => content.includes(term)))), splitBigrams = cases.map(value => idsFor(content => bigrams(value.query).every(term => content.includes(term))))
    const fts = createClient({ url: 'file::memory:' }), ftsResults: string[][] = []
    try {
      await fts.execute('CREATE VIRTUAL TABLE docs USING fts5(id UNINDEXED,text,tokenize="unicode61")')
      for (const entry of corpus) await fts.execute({ sql: 'INSERT INTO docs(id,text) VALUES(?,?)', args: [entry.id, textOf(entry)] })
      for (const value of cases) { const result = await fts.execute({ sql: 'SELECT id FROM docs WHERE docs MATCH ? ORDER BY id', args: [terms(value.query).map(term => `"${term.replaceAll('"', '""')}"`).join(' AND ')] }); ftsResults.push(result.rows.map(row => String(row.id))) }
    } finally { fts.close() }
    const actual: string[][] = []
    for (const value of cases) { const page = await search.search(query(value.query, { kinds: ['artifact'] })); const ids = page.results.map(result => result.id).sort(); expect(ids, value.query).toEqual(value.expected); actual.push(ids) }
    const evidence = { cases: cases.length, documents: corpus.length, baseline: quality(baseline), exactAnd: quality(exactAnd), bigrams: quality(splitBigrams), ftsUnicode61: quality(ftsResults), sqliteProduct: quality(actual) }
    expect(evidence.sqliteProduct).toMatchObject({ precision: 1, recall: 1, falsePositive: 0, falseNegative: 0 })
    expect(evidence.exactAnd.recall).toBeGreaterThan(evidence.baseline.recall); expect(evidence.bigrams.falsePositive).toBeGreaterThan(0); expect(evidence.ftsUnicode61.recall).toBeLessThan(1)
    const ranking = await search.search(query('苹果 浏览器', { kinds: ['artifact'] })); expect(ranking.results[0].id).toBe('c'); expect(ranking.results.findIndex(value => value.id === 'g')).toBeLessThan(ranking.results.findIndex(value => value.id === 'a'))
    const first = await search.search(query('苹果 浏览器', { kinds: ['artifact'], limit: 2 })), second = await search.search(query('苹果 浏览器', { kinds: ['artifact'], limit: 3, before: first.nextCursor }))
    expect([...first.results, ...second.results].map(value => value.id)).toEqual(ranking.results.map(value => value.id))
    process.stdout.write(`SEARCH_QUALITY ${JSON.stringify(evidence)}\n`)
  })

  it('measures bounded SQL relevance pages over 15000 messages and 32 indexed text files with stable score cursors', async () => {
    const store = await database(), sourceText = '规模正文。'.repeat(2000) + '苹果 浏览器 固定证据', files = Array.from({ length: 32 }, (_, i) => ({ id: `file-${String(i).padStart(3, '0')}`, name: '正文.md', text: sourceText }))
    await store.write([...Array.from({ length: 15_000 }, (_, i) => ({ collection: 'messages', id: `m-${String(i).padStart(5, '0')}`, value: { id: `m-${String(i).padStart(5, '0')}`, conversationId: 'chat', senderType: 'agent', senderId: 'writer', senderName: '作者', content: i % 1000 === 0 ? '规模历史 苹果 浏览器 固定证据' : `普通历史 ${i} ` + '无关内容。'.repeat(12), sequence: i, createdAt: new Date(Date.UTC(2026, 9, 2, 0, 0, i)).toISOString(), status: 'completed' } })), ...files.map((entry, i) => ({ collection: 'artifacts', id: entry.id, value: artifact(entry, i) }))])
    const search = new ConversationSearchRepository(store, { validateMessage: async () => {}, validateMaterial: async () => {}, validateArtifact: async () => {}, readArtifactText: async () => sourceText })
    let batches = 0
    while ((await store.searchBodyCoverage(query('苹果 浏览器'))).pending) { const page = await search.search(query('苹果 浏览器')); expect(page.coverage!.batchProcessed).toBeLessThanOrEqual(12); batches++; expect(batches).toBeLessThan(50) }
    const samples: number[] = [], allIds: string[] = []; let before: ConversationSearchQuery['before']
    for (let i = 0; i < 10; i++) { const started = performance.now(); const page = await search.search(query('苹果 浏览器', { limit: 5, ...(before ? { before } : {}) })); samples.push(performance.now() - started); allIds.push(...page.results.map(value => `${value.kind}:${value.id}`)); before = page.nextCursor; if (!before) break }
    expect(allIds).toHaveLength(47); expect(new Set(allIds).size).toBe(47)
    expect(p95(samples)).toBeLessThan(1500)
    const bodies = await store.load<SearchBodyRecord>('conversationSearchBodies'), indexBytes = bodies.reduce((sum, body) => sum + Buffer.byteLength(JSON.stringify(body)), 0)
    expect(indexBytes).toBeLessThan(2 * 1024 * 1024); expect(bodies).toHaveLength(32)
    process.stdout.write(`SEARCH_SCALE ${JSON.stringify({ messages: 15000, textFiles: 32, indexedBytes: indexBytes, batches, pages: samples.length, hits: allIds.length, p95Milliseconds: Math.round(p95(samples) * 100) / 100, maximumMilliseconds: Math.round(Math.max(...samples) * 100) / 100 })}\n`)
  }, 30_000)
})
