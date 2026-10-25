/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 用户明确允许的本机Codex登录、当前适配器与隔离验证目录。
 * [OUTPUT]: 真实握手/双轮续聊/员工会话隔离的独立JSON证据，失败保留；不复制凭据或读取个人会话。
 * [POS]: 第13组LR0真实运行时探测；不代替新建员工UI或Work验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

if (!process.argv.includes('--real')) throw new Error('真实模型探测需要显式 --real 参数')
const directory = await mkdtemp(join(tmpdir(), 'boai-codex-real-'))
const out = resolve(process.env.BOAI_CODEX_EVIDENCE ?? join(directory, 'result.json'))
const entry = join(directory, 'adapter.mjs')
await build({ stdin: { contents: "export { runCodexPhase, testCodexConnection } from './packages/runtime/src/adapters/codex/turn'; export { resolveProgram } from './packages/runtime/src/modules/backends/program'", resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, platform: 'node', format: 'esm', bundle: true, target: 'node22', logLevel: 'silent' })
const { runCodexPhase, testCodexConnection, resolveProgram } = await import(pathToFileURL(entry).href)
const file = resolveProgram(process.env.BOAI_CODEX_PROGRAM ?? 'codex')
const profile = { id: randomUUID(), name: 'BoAI Codex实际接入验证', protocol: 'codex-app-server', executable: file.path, executableHash: file.hash, runtime: file.runtime, args: [], revision: 1, useExistingLogin: true, hostAccessAcknowledged: true, ...(process.env.CODEX_HOME ? { codexHome: process.env.CODEX_HOME } : {}) }
const sourceHashes = Object.fromEntries(await Promise.all(['client.ts', 'policy.ts', 'turn.ts', 'catalog.ts'].map(async name => [name, createHash('sha256').update(await readFile(resolve('packages/runtime/src/adapters/codex', name))).digest('hex')])))
const evidence = { sourceHashes, createdAt: new Date().toISOString(), platform: process.platform, programHash: file.hash, kind: 'actual-codex-adapter-only', uiVerified: false, workVerified: false, steps: [] }
const signal = AbortSignal.timeout(150_000)
try {
  profile.verified = await testCodexConnection({ profile, cwd: join(directory, 'probe'), signal })
  evidence.program = profile.verified
  evidence.steps.push({ kind: 'connection', passed: true })
  const secret = `青竹-${randomUUID().slice(0, 8)}`
  const common = { profile, cwd: join(directory, 'employee-a'), signal, instructions: '你是BoAI接入验收员工。仅用中文回答当前用户；本阶段没有工具，不执行任务。', timeoutMs: 60_000 }
  const first = await runCodexPhase({ ...common, prompt: `这次验收的暗号是${secret}。请记住，仅回答“收到”。` })
  evidence.steps.push({ kind: 'first-turn', passed: true, threadId: first.threadId, turnId: first.turnId, text: first.text, usage: first.usage })
  const second = await runCodexPhase({ ...common, threadId: first.threadId, prompt: '上一条消息的暗号是什么？只写暗号。' })
  evidence.steps.push({ kind: 'resume', passed: second.threadId === first.threadId && second.text.includes(secret), threadId: second.threadId, turnId: second.turnId, text: second.text, usage: second.usage })
  const separate = await runCodexPhase({ ...common, cwd: join(directory, 'employee-b'), prompt: '另一名员工收到的验收暗号是什么？没有该上下文时只回答“不知道”，不要猜测。' })
  evidence.steps.push({ kind: 'employee-isolation', passed: separate.threadId !== first.threadId && !separate.text.includes(secret) && separate.text.includes('不知道'), threadId: separate.threadId, turnId: separate.turnId, text: separate.text, usage: separate.usage })
  evidence.passed = evidence.steps.every(step => step.passed)
} catch (error) {
  evidence.passed = false
  evidence.error = error instanceof Error ? error.message : 'Unknown probe failure'
  process.exitCode = 1
} finally {
  await mkdir(resolve(out, '..'), { recursive: true })
  await writeFile(out, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ passed: evidence.passed, steps: evidence.steps.map(({ kind, passed }) => ({ kind, passed })), error: evidence.error, evidence: out }))
  if (!evidence.passed) process.exitCode = 1
}
