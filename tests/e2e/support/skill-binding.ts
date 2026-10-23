/*
 * [INPUT]: 场景独立 Desktop、实际本机技能目录、原应用包与生产发现路径、真实 Mastra 技能协议及主进程 IPC。
 * [OUTPUT]: 开发目录隔离或应用包唯一受控测试技能/按字节清理，不改 HOME/CODEX_HOME；显式授权/真实读取与丢回执故障、模型和脚本副作用核对。
 * [OUTPUT]: 取证读取使用已有库只读连接，不执行启动迁移或使正文索引失效。
 * [POS]: D4 员工技能绑定 Electron 支撑；不替换导入、绑定或文件事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { lstat, mkdir, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Desktop } from './desktop'
import { localSkillsEntry } from './local-skills'
import { startSkillDeliveryModel } from '../../fixtures/skills/delivery-model'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { DigitalAgent, Resource } from '../../../src/shared/domain'
import type { BindLocalSkillInput } from '../../../src/shared/domain/skills'

export async function prepareSkillBindingDesktop(runtime: Desktop) {
  const packaged = Boolean(process.env.BOAI_TEST_PACKAGED_PATH), skillName = packaged ? `boai-d4-${randomUUID()}` : 'report-helper'
  const source = join(packaged ? join(homedir(), '.agents/skills') : join(runtime.root, 'local-user/.agents/skills'), skillName)
  const marker = 'SKILL_EVIDENCE_d4binding', executionMarker = join(runtime.root, 'unrequested-script-execution')
  const document = `---\nname: ${skillName}\ndescription: 核对资料并输出真实报告\n---\n# 报告助手\n只读取明确授权的参考资料。\n`
  const expectedFiles = new Map<string, string>()
  if (packaged) {
    // Use the unchanged package's supported global discovery root; own only a unique leaf.
    const parent = join(homedir(), '.agents/skills'), entry = await lstat(parent)
    if (!entry.isDirectory() || entry.isSymbolicLink() || await realpath(parent) !== parent) throw new Error('应用包场景需要真实且非链接的全局技能目录')
    await mkdir(source, { mode: 0o700 })
    runtime.defer(async () => {
      if (!(await lstat(source)).isDirectory() || await realpath(source) !== source) throw new Error(`测试技能目录已变化，保留核对：${source}`)
      for (const [relative, expected] of expectedFiles) {
        const path = join(source, relative), stat = await lstat(path)
        if (!stat.isFile() || stat.isSymbolicLink() || await readFile(path, 'utf8') !== expected) throw new Error(`测试技能文件已外改，保留核对：${path}`)
        await unlink(path)
      }
      await rmdir(join(source, 'references')); await rmdir(source)
    })
  }
  const put = async (relative: string, content: string) => { await writeFile(join(source, relative), content); expectedFiles.set(relative, content) }
  await mkdir(join(source, 'references'), { recursive: true })
  await put('SKILL.md', document)
  await put('references/evidence.md', marker)
  await put('never-run.mjs', `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(executionMarker)}, '仅发现或绑定不能执行脚本');`)
  const endpoint = await startSkillDeliveryModel(skillName, { reportWork: true }); runtime.trackServer(endpoint.server)
  await runtime.start(packaged ? {} : { mainEntry: await localSkillsEntry(runtime) })
  const setup = await runtime.page.evaluate(async ({ baseUrl, source }) => {
    const connection = await window.boai.request('saveConnection', { name: '绑定离线协议', provider: 'openai-compatible', baseUrl, defaultModel: 'fixture' })
    const snapshot = await window.boai.request('snapshot', undefined), current = snapshot.agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = current
    const agent = await window.boai.request('saveAgent', { ...definition, connectionId: connection.id, expectedConfigVersion: configVersion })
    const catalog = await window.boai.request('listLocalSkills', undefined)
    return { agent, localSkill: catalog.skills.find(skill => skill.path === source)!, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, { baseUrl: endpoint.url, source })
  return { ...setup, endpoint, source, marker, document, executionMarker, skillName, replaceSource: (content: string) => put('SKILL.md', content) }
}

export async function openBindingEmployee(runtime: Desktop, name = '研究员') {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('tab', { name: '配置', exact: true }).click()
}

type FaultState = { submissions: BindLocalSkillInput[]; lookups: string[]; receipts: unknown[]; unavailable: boolean }
type FaultGlobals = typeof globalThis & { __boaiSkillBindingFault: FaultState }
/** Admission really commits first. Only acknowledgement/receipt transport is lost. */
export async function loseBindingReply(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state: FaultState = { submissions: [], lookups: [], receipts: [], unavailable: true }; Object.assign(globalThis, { __boaiSkillBindingFault: state })
    let lost = false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'bindLocalSkill') state.submissions.push(structuredClone(payload.input))
      if (payload.method === 'getSkillBindingReceipt') state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'bindLocalSkill') { state.receipts.push(structuredClone(result)); if (!lost) { lost = true; throw new Error('验收：绑定已受理但回复丢失') } }
      if (payload.method === 'getSkillBindingReceipt' && state.unavailable) throw new Error('验收：原绑定回执暂不可读')
      return result
    })
  })
  return {
    inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as FaultGlobals).__boaiSkillBindingFault)),
    allowLookup: () => runtime.app.evaluate(() => { (globalThis as FaultGlobals).__boaiSkillBindingFault.unavailable = false }),
  }
}

export async function bindingRecords(dataPath: string) {
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try { return { resources: await store.load<Resource>('resources'), agents: await store.load<DigitalAgent>('agents'), operations: await store.load<{ id: string; kind?: string; status: string }>('skillOperations'), messages: await store.load('messages'), works: await store.load('workItems') } }
  finally { await store.close() }
}
export const boundOriginal = (resource: Resource) => readFile(join(resource.path, 'SKILL.md'), 'utf8')
