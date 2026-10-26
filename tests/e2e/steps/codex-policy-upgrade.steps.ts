/*
 * [INPUT]: 已冻结的原v5完整应用、当前v6源码或新包、同一隔离数据与原Codex连接/员工UI。
 * [OUTPUT]: 原应用真实创建/复用的会话历史，两次受控重启零调用；只有新消息触发三阶段、签名换版重建线程，再次消息增量复用。
 * [OUTPUT]: 原profile/员工/程序、原始隔离目录字符串与实际快照签名因子核对；离线调用日志和真实profileCalls分源，逐次正常关闭/实际退出与最终只读状态留证，不注入旧映射或修改业务期限。
 * [OUTPUT]: 两条v6新消息使用同一短问句，首条实际映射记忆必须为空，次条保持原记忆/材料/消息来源资格；不承诺关闭记忆。
 * [POS]: Codex策略升级BDD，仅准备明确离线/真实与源码/包场景；模型只在原显式开关下运行。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header并上浮所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test as employeeTest } from './codex-employee.steps'
import type { Desktop } from '../support/desktop'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { AgentRun, ArtifactVersion, DigitalAgent, DiscussionTurn, LaunchProfile, Message } from '../../../packages/shared/src/domain'
import type { ProfileModelCall } from '../../../packages/runtime/src/modules/profile/profile-activity'

type Entry = { executable?: string; policyVersion: number; evidence: Record<string, unknown> }
type Upgrade = { old?: Entry; current?: Entry }
type Session = { id: string; conversationId: string; agentId: string; sourceVersion: number; fingerprint: string; runId: string; state: string; threadId: string; turnId: string; outputHash: string; resumeInvalidated?: string; inputMessageIds: string[]; memories: { id: string; hash: string }[]; materials: { id: string; hash: string }[]; sources: { id: string; hash: string }[] }
type Snapshot = { id: string; agent: DigitalAgent; runtimeProfile: LaunchProfile; memoryRecall?: { namespace: string; invalidationEpoch?: number } }
export const test = employeeTest.extend<{ codexPolicyUpgrade: Upgrade }>({ codexPolicyUpgrade: async ({}, use) => use({}) })
const { Given, Then } = createBdd(test)
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const oldReview = '.local/feature-review/native-work-goal-package-20261007'
const currentReview = '.local/feature-review/codex-system-proxy-20261007'

async function pinnedJson(path: string, expected: string) {
  const bytes = await readFile(resolve(path)); expect(hash(bytes)).toBe(expected)
  return JSON.parse(bytes.toString('utf8'))
}
async function launch(runtime: Desktop, entry: Entry, label: string) {
  const previous = process.env.BOAI_TEST_PACKAGED_PATH
  try {
    if (entry.executable) process.env.BOAI_TEST_PACKAGED_PATH = entry.executable
    else delete process.env.BOAI_TEST_PACKAGED_PATH
    await runtime.start()
    const actual = await runtime.app.evaluate(({ app }) => ({ applicationPath: app.getAppPath(), executablePath: process.execPath }))
    expect(await realpath(actual.applicationPath)).toBe(await realpath(entry.executable ? join(String(entry.evidence.packageDirectory), 'Contents/Resources/app.asar') : resolve('.')))
    if (entry.executable) expect(await realpath(actual.executablePath)).toBe(entry.executable)
    await runtime.reviewData(label + '实际启动来源', { ...entry.evidence, actual, policyVersion: entry.policyVersion, executable: entry.executable ?? 'Desktop args [resolve(.)]', dataRoot: runtime.root })
  } finally { if (previous === undefined) delete process.env.BOAI_TEST_PACKAGED_PATH; else process.env.BOAI_TEST_PACKAGED_PATH = previous }
}
Given('Codex策略升级使用{string}的原v5完整应用和{string}', async ({ runtime, codexEmployee, codexPolicyUpgrade }, mode: string, target: string) => {
  expect(['离线协议', '真实Codex']).toContain(mode); expect(['当前源码', '新应用包']).toContain(target)
  codexEmployee.real = mode === '真实Codex'
  test.skip(codexEmployee.real && process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机模型必须显式开启')
  test.info().annotations.push({ type: 'model-mode', description: codexEmployee.real ? 'real-provider' : 'offline-protocol-or-fixture' })
  test.setTimeout(900000)
  const oldManifestPath = oldReview + '/current-package-manifest.json', currentManifestPath = currentReview + '/current-package-manifest.json'
  const oldManifest = await pinnedJson(oldManifestPath, '36230e2f2224579099f5eafe9db25302d8e372b82ff0e000a4dc69bdceee2293')
  const currentManifest = await pinnedJson(currentManifestPath, 'bd58a0edea49e22769fae35e5a5bfba3f98f6ac05268185334769527721eff57')
  const oldFreeze = await pinnedJson(oldReview + '/current-input-baseline.json', 'f567586956fb46feacfd7e7b80368330a07183b3e51e8c5051fadcb88f61564a')
  const currentFreeze = await pinnedJson(currentReview + '/package-build-1/build-manifest.json', '20d65aa669b6182689b7d9f8b23e93ca069d071df447a1e7ea85b095e4d22999')
  expect(hash(await readFile(currentManifest.asar.sdkPackage.path))).toBe(currentManifest.asar.sdkPackage.sha256)
  const asar = createRequire(import.meta.url)(currentManifest.asar.sdk) as { extractFile(path: string, name: string): Buffer }
  const packaged = async (manifest: typeof oldManifest, freeze: typeof oldFreeze, version: number, requested?: string): Promise<Entry> => {
    const executable = await realpath(requested ?? join(manifest.directory, 'Contents/MacOS/BoAI Agent'))
    expect(executable).toBe(await realpath(join(manifest.directory, 'Contents/MacOS/BoAI Agent')))
    for (const path of ['Contents/MacOS/BoAI Agent', 'Contents/Resources/app.asar']) expect(hash(await readFile(join(manifest.directory, path)))).toBe(manifest.files[path])
    const map = JSON.parse(asar.extractFile(join(manifest.directory, 'Contents/Resources/app.asar'), 'dist/runtime/worker.mjs.map').toString('utf8'))
    const policySources = map.sources.map((path: string, index: number) => path.endsWith('/adapters/codex/policy.ts') ? map.sourcesContent[index] : undefined).filter((value: unknown) => value !== undefined)
    expect(policySources).toHaveLength(1)
    const policy = policySources[0] as string
    expect(hash(policy)).toBe(freeze.files['packages/runtime/src/adapters/codex/policy.ts'])
    expect(policy).toContain(`CODEX_EMPLOYEE_POLICY_VERSION = ${version}`)
    expect(policy).toContain("CODEX_VERIFIED_VERSION = '0.159.3'")
    expect(policy.match(/features\.respect_system_proxy=true/g) ?? []).toHaveLength(version === 6 ? 1 : 0)
    expect(policy.match(/respect_system_proxy: true/g) ?? []).toHaveLength(version === 6 ? 1 : 0)
    return { executable, policyVersion: version, evidence: { packageDirectory: manifest.directory, manifestPath: resolve(version === 5 ? oldManifestPath : currentManifestPath),
      manifestHash: version === 5 ? '36230e2f2224579099f5eafe9db25302d8e372b82ff0e000a4dc69bdceee2293' : 'bd58a0edea49e22769fae35e5a5bfba3f98f6ac05268185334769527721eff57',
      frozenInputsPath: resolve(version === 5 ? oldReview + '/current-input-baseline.json' : currentReview + '/package-build-1/build-manifest.json'),
      frozenInputsHash: version === 5 ? 'f567586956fb46feacfd7e7b80368330a07183b3e51e8c5051fadcb88f61564a' : '20d65aa669b6182689b7d9f8b23e93ca069d071df447a1e7ea85b095e4d22999',
      launcherHash: manifest.files['Contents/MacOS/BoAI Agent'], asarHash: manifest.files['Contents/Resources/app.asar'], policySourceHash: hash(policy), frozenPolicySourceHash: freeze.files['packages/runtime/src/adapters/codex/policy.ts'], nativeVersion: '0.159.3', proofScope: 'pinned whole-package manifest plus actual launcher/ASAR and embedded policy; no package replacement' } }
  }
  codexPolicyUpgrade.old = await packaged(oldManifest, oldFreeze, 5, process.env.BOAI_TEST_POLICY_UPGRADE_OLD_PATH)
  if (target === '新应用包') codexPolicyUpgrade.current = await packaged(currentManifest, currentFreeze, 6, process.env.BOAI_TEST_POLICY_UPGRADE_NEW_PATH ?? process.env.BOAI_TEST_PACKAGED_PATH)
  else {
    const files = Object.keys(currentFreeze.files).filter(path => path.startsWith('dist/'))
    for (const path of files) expect(hash(await readFile(resolve(path)))).toBe(currentFreeze.files[path])
    expect(hash(await readFile(resolve('packages/runtime/src/adapters/codex/policy.ts')))).toBe(currentFreeze.files['packages/runtime/src/adapters/codex/policy.ts'])
    codexPolicyUpgrade.current = { policyVersion: 6, evidence: { sourceBuildManifest: resolve(currentReview + '/package-build-1/build-manifest.json'), sourceBuildManifestHash: '20d65aa669b6182689b7d9f8b23e93ca069d071df447a1e7ea85b095e4d22999', builtFilesChecked: files.length, main: 'dist/main/main.cjs', policySourceHash: currentFreeze.files['packages/runtime/src/adapters/codex/policy.ts'], nativeVersion: '0.159.3' } }
  }
  const previous = process.env.BOAI_TEST_PACKAGED_PATH
  runtime.defer(async () => { if (previous === undefined) delete process.env.BOAI_TEST_PACKAGED_PATH; else process.env.BOAI_TEST_PACKAGED_PATH = previous })
  await launch(runtime, codexPolicyUpgrade.old, '原v5完整应用')
})

Then('原v5会话升级后两次重启不重放且明确新消息重建再复用', async ({ runtime, codexEmployee, codexPolicyUpgrade }) => {
  const id = codexEmployee.conversationId!, employeeId = codexEmployee.employeeId!, old = codexPolicyUpgrade.old!, current = codexPolicyUpgrade.current!
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ agents: await store.load<DigitalAgent>('agents'), profiles: await store.load<LaunchProfile>('launchProfiles'),
    messages: await store.load<Message>('messages'), turns: await store.load<DiscussionTurn>('turns'), runs: await store.load<AgentRun>('runs'),
    works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'),
    profileCalls: await store.load<ProfileModelCall>('profileModelCalls'), snapshots: await store.load<Snapshot>('snapshots'),
    sessions: await store.load<Session>('codexSessions'), installation: await store.load<{ id: string; root: string; restorePending: boolean }>('codexRuntime'),
    traces: await store.load('traceSpans'), artifacts: await store.load<ArtifactVersion>('artifacts') })
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const open = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  const home = await runtime.page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: employeeId, conversationId: id })
  const fileText = async (path: string) => { try { return await readFile(path, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error } }
  const fixture = async () => {
    if (codexEmployee.real) return undefined
    const requests = (await fileText(join(home.sessionPath!, 'work', 'turn-requests.txt'))).trim()
    const chat = await fileText(join(home.sessionPath!, 'work', 'employee-chat-v1-input.json'))
    return { requests: requests ? requests.split('\n') : [], chat: chat ? JSON.parse(JSON.parse(chat).input[0].text) : undefined }
  }
  const factors = (value: Awaited<ReturnType<typeof records>>, session: Session) => {
    const snapshot = value.snapshots.find(row => row.id === session.runId)!, run = value.runs.find(row => row.id === session.runId)!
    expect(snapshot).toBeDefined(); expect(run.bootstrap).toBeDefined()
    return [snapshot.runtimeProfile, snapshot.agent.configVersion, run.bootstrap!.hashes, run.bootstrap!.policyVersion, snapshot.memoryRecall?.namespace, snapshot.memoryRecall?.invalidationEpoch]
  }
  const session = (value: Awaited<ReturnType<typeof records>>) => { expect(value.sessions).toHaveLength(1); return value.sessions[0] }
  const code = `CHAT_CODE_${randomUUID()}`
  const send = async (content: string, count: number, version: number) => {
    const before = await records(), callsBefore = await fixture()
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    let sendFailed = false, sendFailure: unknown
    try {
      await expect.poll(async () => { const d = await read(); return d.messages.filter(message => message.senderId === employeeId && message.status === 'completed').length === count || d.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) }, { timeout: codexEmployee.real ? 260000 : 100000 }).toBe(true)
      expect((await read()).runs.filter(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))).toEqual([])
      await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)), { timeout: codexEmployee.real ? 130000 : 40000 }).toBe(true)
      await expect.poll(async () => { const value = await records(); return value.runs.filter(run => run.phase === 'memory' && run.status === 'completed').length === count && value.runs.every(run => run.status === 'completed') && value.profileCalls.every(call => !!call.finishedAt) }, { timeout: 130000 }).toBe(true)
      const after = await records(), detail = await read(), added = after.runs.filter(run => !before.runs.some(row => row.id === run.id)), mapping = session(after), actualFixture = await fixture()
      expect(added).toHaveLength(3); expect(added.map(run => run.phase).sort()).toEqual(['decision', 'execution', 'memory'])
      expect(added.every(run => run.status === 'completed' && !!run.finishedAt && run.backend?.kind === 'codex-local' && run.backend.externalInvocations === 1)).toBe(true)
      for (const run of added) {
        const actual = after.snapshots.find(row => row.id === run.id)!.runtimeProfile
        expect(run.backend).toMatchObject({ profileId: actual.id, profileRevision: actual.revision, program: { version: '0.159.3', executableHash: actual.executableHash } })
      }
      const calls = after.profileCalls.filter(call => !before.profileCalls.some(row => row.id === call.id))
      expect(calls).toHaveLength(3); expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && !!call.finishedAt && added.some(run => run.id === call.runId))).toBe(true)
      for (const name of ['messages', 'turns', 'runs', 'profileCalls'] as const) for (const row of before[name]) expect(after[name].find(value => value.id === row.id)).toEqual(row)
      for (const name of ['works', 'budgets', 'calls', 'artifacts'] as const) expect(after[name]).toEqual([])
      expect(detail.messages.filter(message => message.senderId === employeeId && message.status === 'completed').at(-1)?.content).toContain(code)
      expect(mapping).toMatchObject({ agentId: employeeId, conversationId: id, sourceVersion: 2, state: 'completed' })
      expect(mapping.resumeInvalidated).toBeUndefined(); expect(mapping.threadId).toBeTruthy(); expect(mapping.turnId).toBeTruthy()
      expect(mapping.fingerprint).toBe(hash(JSON.stringify([version, ...factors(after, mapping)])))
      const reply = detail.messages.find(message => message.runId === mapping.runId && message.senderId === employeeId && message.status === 'completed')!
      expect(hash(JSON.stringify(reply.content))).toBe(mapping.outputHash)
      if (actualFixture) { expect(actualFixture.requests).toHaveLength(callsBefore!.requests.length + 3); expect(actualFixture.requests.slice(0, callsBefore!.requests.length)).toEqual(callsBefore!.requests) }
      await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true })).not.toContainText('处理中', { timeout: 15000 })
      await runtime.reviewData(`策略v${version}第${count}条明确消息实际调用`, { before, after, fixture: actualFixture, code, internalModelCalls: 'unknown', fingerprintFactors: factors(after, mapping) })
      await runtime.reviewCheckpoint(`策略v${version}第${count}条普通聊天实际回复`)
      return { detail, records: after, mapping, fixture: actualFixture, reply }
    } catch (error) { sendFailed = true; sendFailure = error; throw error }
    finally {
      try { await runtime.reviewData(`策略v${version}第${count}条成功或失败原状态`, { detail: await read(), records: await records(), fixture: await fixture() }) }
      catch (error) { throw new AggregateError(sendFailed ? [sendFailure, error] : [error], '策略升级明确消息或原状态留证失败') }
    }
  }
  let scenarioFailed = false, scenarioFailure: unknown
  try {
    await open()
    const first = await send(`这是普通聊天。临时暗号为 ${code}，只回复暗号，不执行工具或工作，不保存长期记忆。`, 1, 5)
    const second = await send('刚才的临时暗号是什么？只回复暗号，不执行工作或保存长期记忆。', 2, 5)
    expect(second.mapping.id).toBe(first.mapping.id); expect(second.mapping.threadId).toBe(first.mapping.threadId)
    expect(second.mapping.fingerprint).toBe(first.mapping.fingerprint)
    const secondUser = second.detail.messages.filter(message => message.senderType === 'user').at(-1)!
    expect(second.mapping.inputMessageIds).toEqual([secondUser.id])
    if (second.fixture) { expect(second.fixture.chat.contextMode).toBe('incremental'); expect(second.fixture.chat.priorReply.messageId).toBe(first.reply.id) }
    const baseline = second.records, fixtureBaseline = await fixture(), originalFactors = factors(baseline, second.mapping)
    const employee = baseline.agents.find(row => row.id === employeeId)!
    if (employee.executionBackend?.kind !== 'codex-local') throw new Error('升级场景必须沿原本机Codex员工来源')
    const profileId = employee.executionBackend.profileId, profile = baseline.profiles.find(row => row.id === profileId)!
    expect(profile.verified).toMatchObject({ name: 'Codex', version: '0.159.3', protocolVersion: 2 })
    expect(baseline.installation).toContainEqual({ id: 'installation', root: join(runtime.root, 'v2'), restorePending: false })
    await archiveNativeFinalReview(runtime, { label: '原v5完整应用两轮基线', records })
    expect(await records()).toEqual(baseline)
    for (let restart = 0; restart <= 2; restart++) {
      await launch(runtime, current, restart ? `v6第${restart}次受控重启` : 'v6首次升级启动')
      await open()
      expect(await records()).toEqual(baseline); expect(await fixture()).toEqual(fixtureBaseline)
      await runtime.reviewData(`v6启动${restart}只读核对零调用`, { baseline, actual: await records(), fixture: await fixture(), oldEntry: old.evidence, currentEntry: current.evidence, explicitNewMessageSent: false })
      if (restart < 2) { await archiveNativeFinalReview(runtime, { label: `v6无新消息关闭${restart}`, records }); expect(await records()).toEqual(baseline) }
    }
    const third = await send('依据前文，答出先前约定的口令。', 3, 6)
    expect(third.mapping.id).toBe(second.mapping.id); expect(third.mapping.threadId).not.toBe(second.mapping.threadId)
    expect(third.mapping.fingerprint).not.toBe(second.mapping.fingerprint); expect(factors(third.records, third.mapping)).toEqual(originalFactors)
    expect(third.records.agents.find(row => row.id === employeeId)).toEqual(employee); expect(third.records.profiles.find(row => row.id === profile.id)).toEqual(profile)
    expect(third.mapping.memories).toEqual([])
    expect(third.mapping.materials).toEqual(second.mapping.materials)
    for (const source of second.mapping.sources) expect(third.mapping.sources).toContainEqual(source)
    const thirdUser = third.detail.messages.filter(message => message.senderType === 'user').at(-1)!
    expect(third.mapping.inputMessageIds).toEqual([...second.detail.messages.map(message => message.id), thirdUser.id])
    if (third.fixture) { expect(third.fixture.chat.contextMode).toBe('initial'); expect(third.fixture.chat.priorReply).toBeUndefined() }
    const fourth = await send('依据前文，答出先前约定的口令。', 4, 6)
    for (const memory of third.mapping.memories) expect(fourth.mapping.memories).toContainEqual(memory)
    expect(fourth.mapping.materials).toEqual(third.mapping.materials)
    for (const source of third.mapping.sources) expect(fourth.mapping.sources).toContainEqual(source)
    expect(hash(JSON.stringify(fourth.detail.messages.find(message => message.id === third.reply.id)!.content))).toBe(third.mapping.outputHash)
    expect(fourth.mapping.threadId).toBe(third.mapping.threadId); expect(fourth.mapping.fingerprint).toBe(third.mapping.fingerprint)
    expect(factors(fourth.records, fourth.mapping)).toEqual(originalFactors)
    const fourthUser = fourth.detail.messages.filter(message => message.senderType === 'user').at(-1)!
    expect(fourth.mapping.inputMessageIds).toEqual([fourthUser.id])
    if (fourth.fixture) { expect(fourth.fixture.chat.contextMode).toBe('incremental'); expect(fourth.fixture.chat.priorReply.messageId).toBe(third.reply.id) }
    expect(fourth.records.runs).toHaveLength(12); expect(fourth.records.profileCalls).toHaveLength(12)
    expect(runtime.errors).toEqual([])
    await runtime.reviewData('真实旧应用会话到v6的完整升级核对', { oldEntry: old.evidence, currentEntry: current.evidence, baseline, final: fourth.records, originalFactors, changedFactor: 'policyVersion: 5 -> 6', controlledRestarts: 2, injectedSession: false, realSupplier: !!codexEmployee.real })
  } catch (error) { scenarioFailed = true; scenarioFailure = error; throw error }
  finally {
    const failures: unknown[] = []
    try { await runtime.reviewData('策略升级关闭前页面原状态', await read()) } catch (error) { failures.push(error) }
    try { await archiveNativeFinalReview(runtime, { label: 'Codex策略升级最终', records }) } catch (error) { failures.push(error) }
    try { await runtime.close() } catch (error) { failures.push(error) }
    try { await store.close() } catch (error) { failures.push(error) }
    if (failures.length) throw new AggregateError(scenarioFailed ? [scenarioFailure, ...failures] : failures, 'Codex策略升级原场景或独立结束留证失败')
  }
})
