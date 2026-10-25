/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 锁定的真实Claude程序、生产输入适配器、合成图片与本地Anthropic协议服务。
 * [OUTPUT]: 首次/续聊/文本接续/员工隔离的实际媒体请求hash与无工具证据；不存图片正文，不冒充真实视觉模型或UI验收。
 * [POS]: 第13组Claude媒体传输探测，保留独立失败和源码hash。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildWorkspace as build } from './workspace-packages.mjs'

if (!process.env.BOAI_CLAUDE_PROGRAM || !process.env.BOAI_CLAUDE_EVIDENCE) throw new Error('需要明确的程序路径和新证据文件')
const out = resolve(process.env.BOAI_CLAUDE_EVIDENCE)
await mkdir(dirname(out), { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'boai-claude-media-')), bundle = join(root, 'adapter.cjs')
const built = await build({ stdin: { contents: "export { verifyClaudeProgram, runClaudeNoTools } from './packages/runtime/src/adapters/claude/turn'", resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node22', metafile: true, logLevel: 'silent' })
const { verifyClaudeProgram, runClaudeNoTools } = await import(pathToFileURL(bundle).href)
const hash = value => createHash('sha256').update(value).digest('hex')
const sources = [...Object.keys(built.metafile.inputs).filter(path => path !== '<stdin>'), 'scripts/probe-claude-media.mjs', 'package.json', 'pnpm-lock.yaml']
const evidence = { kind: 'actual-claude-cli-local-media-protocol', createdAt: new Date().toISOString(), platform: process.platform, realProvider: false, uiVerified: false, workVerified: false,
  sourceHashes: Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(path))]))), requests: [], steps: [] }
// Fixed synthetic eight-pixel square fixtures; no user image content.
const mediaFixtures = {"image/png":"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOUil7LgA0wYRUdtBIA5sEBMgyGMq4AAAAASUVORK5CYII=","image/jpeg":"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK+uPnD//Z","image/gif":"R0lGODdhCAAIAIEAABpbrQAAAAAAAAAAACwAAAAACAAIAAAIDwABCBxIsKDBgwgTKkwYEAA7","image/webp":"UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoIAAgAAUAmJaACdLoB+AAEgwAA/vFNr/0JPwSfgk/dP/+YJX5BuuQAAAA="}
const images = Object.entries(mediaFixtures).map(([mime,data]) => `data:${mime};base64,${data}`)
const hashes = Object.values(mediaFixtures).map(data => hash(Buffer.from(data, 'base64')))
const image = images[0], expectedHash = hashes[0]
const key = `synthetic-${randomUUID()}`, token = `media-${randomUUID()}`
let stage = 'first', serverFailure
const server = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString()
    if (!request.url.includes('/messages') || request.url.includes('count_tokens')) { response.writeHead(404); response.end('{}'); return }
    const body = JSON.parse(raw), media = []
    for (const [messageIndex, message] of body.messages.entries()) for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block.type === 'image') media.push({ messageIndex, mime: block.source.media_type, sourceType: block.source.type, hash: hash(Buffer.from(block.source.data, 'base64')) })
    }
    evidence.requests.push({ stage, model: body.model, tools: (body.tools ?? []).map(tool => tool.name), media, containsInitialToken: JSON.stringify(body.messages).includes(token) })
    assert.equal(request.headers['x-api-key'], key)
    assert.equal(body.stream, true)
    const number = evidence.requests.length
    response.setHeader('content-type', 'text/event-stream')
    for (const event of [
      { type: 'message_start', message: { id: `msg_media_${number}`, type: 'message', role: 'assistant', content: [], model: body.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '收到图片传输' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }, { type: 'message_stop' },
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    response.end()
  } catch {
    serverFailure = '本地协议服务未满足认证或消息结构断言'
    response.writeHead(500); response.end('{}')
  }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
try {
  const signal = AbortSignal.timeout(90_000), cwd = join(root, 'employee-a'), configDirectory = join(root, 'config-a')
  const program = await verifyClaudeProgram({ executable: process.env.BOAI_CLAUDE_PROGRAM, cwd, configDirectory, signal })
  evidence.program = program
  const common = { program, cwd, configDirectory, signal, baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: key, model: 'deepseek-v4-pro', instructions: '媒体协议探测；不要调用工具。', timeoutMs: 20_000 }
  let deltas = ''
  const first = await runClaudeNoTools({ ...common, prompt: token, images, onDelta: text => { deltas += text } })
  assert.equal(deltas, '收到图片传输'); assert.equal(first.text, deltas)
  assert.deepEqual(evidence.requests.at(-1).media.map(item => item.hash), hashes)
  evidence.steps.push({ kind: 'first-four-native-formats', passed: true, sessionId: first.sessionId, usage: first.usage })
  stage = 'resume-image'
  const next = await runClaudeNoTools({ ...common, sessionId: first.sessionId, prompt: '这是本轮新增图片', images: [image] })
  assert.equal(next.sessionId, first.sessionId)
  assert.deepEqual(evidence.requests.at(-1).media.map(item => item.hash), [...hashes, expectedHash])
  evidence.steps.push({ kind: 'resume-adds-one-image', passed: true, usage: next.usage })
  stage = 'resume-text'
  const text = await runClaudeNoTools({ ...common, sessionId: first.sessionId, prompt: '这轮只有文字' })
  assert.equal(text.sessionId, first.sessionId)
  assert.deepEqual(evidence.requests.at(-1).media.map(item => item.hash), [...hashes, expectedHash])
  evidence.steps.push({ kind: 'text-resume-keeps-existing-images-once', passed: true, usage: text.usage })
  stage = 'separate-employee'
  const other = await runClaudeNoTools({ ...common, cwd: join(root, 'employee-b'), configDirectory: join(root, 'config-b'), prompt: '独立员工图片', images: [image] })
  assert.notEqual(other.sessionId, first.sessionId)
  assert.equal(evidence.requests.at(-1).containsInitialToken, false)
  assert.deepEqual(evidence.requests.at(-1).media.map(item => item.hash), [expectedHash])
  evidence.steps.push({ kind: 'independent-employee-image', passed: true })
  const count = evidence.requests.length
  await assert.rejects(runClaudeNoTools({ ...common, prompt: '无效附件不可静默省略', images: ['data:image/svg+xml;base64,PHN2Zz4='] }), /当前仅支持/)
  assert.equal(evidence.requests.length, count)
  assert.equal(serverFailure, undefined)
  assert.equal(count, 4)
  assert.ok(evidence.requests.every(request => request.tools.length === 0 && request.media.every(item => Object.hasOwn(mediaFixtures, item.mime) && item.sourceType === 'base64')))
  evidence.steps.push({ kind: 'invalid-image-not-sent-and-no-tools', passed: true })
  evidence.passed = true
} catch (error) {
  evidence.passed = false; evidence.error = error instanceof Error ? error.message : 'Unknown probe error'; process.exitCode = 1
} finally {
  server.closeAllConnections(); await new Promise(done => server.close(done))
  evidence.changedSources = []
  for (const [path, before] of Object.entries(evidence.sourceHashes)) if (hash(await readFile(path)) !== before) evidence.changedSources.push(path)
  if (evidence.changedSources.length) { evidence.passed = false; process.exitCode = 1 }
  await writeFile(out, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' })
  await rm(root, { recursive: true, force: true })
  console.log(JSON.stringify({ passed: evidence.passed, steps: evidence.steps, error: evidence.error, evidence: out }))
}
