import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('packaged employee loads a bound skill, publishes a file and preserves its environment across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-environment-desktop-'))
  const skill = join(root, 'report-writer'); await mkdir(skill)
  await writeFile(join(skill, 'SKILL.md'), '---\nname: report-writer\ndescription: Write and publish a report\n---\nWrite the requested report and publish the finished file.')
  let modelCalls = 0
  const server = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk
    const input = JSON.parse(text), system = input.messages.filter((message: { role: string }) => message.role === 'system').map((message: { content: string }) => message.content).join('\n')
    modelCalls++
    let content = '报告已发布。', tool: { name: string; arguments: string } | undefined
    if (system.includes('Private participation decision')) content = JSON.stringify({ action: 'reply', responseKind: 'task' })
    else if (system.includes('Private memory maintenance')) content = JSON.stringify({ candidates: [] })
    else {
      const count = input.messages.filter((message: { role: string }) => message.role === 'tool').length
      const operations = [
        { name: 'skill', arguments: JSON.stringify({ name: 'report-writer' }) },
        { name: 'write_file', arguments: JSON.stringify({ path: 'self:/work/report.md', content: '# Packaged report\nSkill and workspace verified.' }) },
        { name: 'publish_artifact', arguments: JSON.stringify({ path: 'self:/work/report.md', name: 'report.md' }) },
      ]
      tool = operations[count]
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `response-${modelCalls}`, object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    emit({ role: 'assistant' })
    if (tool) { emit({ tool_calls: [{ index: 0, id: `tool-${modelCalls}`, type: 'function', function: tool }] }); emit({}, 'tool_calls') }
    else { emit({ content }); emit({}, 'stop') }
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  let desktop: ElectronApplication | undefined
  const launch = () => electron.launch({ ...(process.env.BOAI_TEST_PACKAGED_PATH ? { executablePath: process.env.BOAI_TEST_PACKAGED_PATH, args: [] } : { args: [resolve('.')] }), env: { ...process.env, BOAI_DATA_DIR: join(root, 'data'), NODE_ENV: 'test' } })
  try {
    desktop = await launch(); let page = await desktop.firstWindow()
    await desktop.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, skill)
    const imported = await page.evaluate(async () => {
      const path = await window.boai.request('choosePath', { kind: 'skill' })
      return window.boai.request('importResource', { kind: 'skill', path: path! })
    })
    const connection = await page.evaluate(port => window.boai.request('saveConnection', { name: 'Local fixture', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' }), port)
    await page.evaluate(async ({ skillId, connectionId }) => {
      const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, skillIds: [skillId], connectionId, expectedConfigVersion: configVersion })
    }, { skillId: imported.id, connectionId: connection.id })
    const conversation = await page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '技能文件验证', agentIds: ['researcher'] }))
    await page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: '请使用技能写一份报告并发布', mentionIds: [], requestId: 'environment-task' }), conversation.id)
    await expect.poll(async () => {
      const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
      return detail.turns?.at(-1)?.status
    }).toBe('completed')
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    const task = detail.runs.find(run => run.phase === 'execution')!
    expect(task.status).toBe('completed')
    expect(task.environment).toMatchObject({ version: 1, commandMode: 'disabled', resourceVersions: [{ id: imported.id }] })
    expect(task.toolEvents.filter(event => event.status === 'completed').map(event => event.name)).toEqual(['skill', 'write_file', 'publish_artifact'])
    expect(detail.artifacts).toHaveLength(1)
    const artifact = detail.artifacts[0]
    expect(await readFile(artifact.path, 'utf8')).toContain('Skill and workspace verified')
    await page.reload()
    await page.getByRole('button', { name: /技能文件验证/ }).click()
    await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
    await page.getByRole('button', { name: '工作区', exact: true }).click()
    await expect(page.locator('.detail-panel')).toContainText('说明可用')
    await expect(page.locator('.detail-panel')).toContainText('命令未启用')
    await page.screenshot({ path: 'test-results/s1-employee-environment.png', fullPage: true })
    const before = modelCalls
    await desktop.close(); desktop = await launch(); page = await desktop.firstWindow()
    const restored = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    expect(restored.artifacts[0].id).toBe(artifact.id)
    expect(restored.runs.find(run => run.id === task.id)?.environment).toEqual(task.environment)
    expect(await readFile(artifact.sourcePath!, 'utf8')).toContain('Skill and workspace verified')
    expect(modelCalls).toBe(before)
  } finally {
    await desktop?.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true })
  }
})
