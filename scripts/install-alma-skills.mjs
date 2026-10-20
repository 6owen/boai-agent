/*
 * [OUTPUT]: 显式迁移与默认分发共用技能源清单，原请求留证及自定义保护保持。
 * [OUTPUT]: programmatic-tools接入原员工脚本工具协议，共24份适配源。
 * [OUTPUT]: video-reader进入原单项安装流程，共23份适配源；原生视频提供方仍按实际能力。
 * [OUTPUT]: 可指定单个新增技能，计划请求身份先留证；未知回执不重复提交。
 * [OUTPUT]: 二十二项适配技能沿原安装/绑定协议，新增截图与音频分析；已有内容冲突保持用户文件。
 * [OUTPUT]: 反思较早漏日/当日笔记与来源失效、十技能绑定；实际与撤回候选归架构§11.22。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [INPUT]: Reviewed BOAI-adapted bundled skills and an explicitly selected employee (default bobo).
 * [OUTPUT]: Original application receipts for shared skill creation and independent employee binding; custom content is preserved.
 * [POS]: One-time migration utility, not a parallel installer or startup auto-rebinding policy.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const employeeId = process.argv[2] ?? 'bobo'
if (process.argv.length > 4 || !/^[a-zA-Z0-9_-]+$/.test(employeeId)) throw new Error('Usage: node scripts/install-alma-skills.mjs [EMPLOYEE_ID] [SKILL_NAME]')
const names = JSON.parse(await readFile(new URL('../resources/agent-skills/manifest.json', import.meta.url), 'utf8')).skills, records = []
const selectedName = process.argv[3]
if (selectedName && !names.includes(selectedName)) throw new Error('Unknown bundled skill')
const output = resolve(`.local/personality-evaluation/skill-install-${Date.now()}.json`)
await mkdir(resolve('.local/personality-evaluation'), { recursive: true })
const save = () => writeFile(output, JSON.stringify({ employeeId, records }, null, 2) + '\n')
function invoke(args) { return JSON.parse(execFileSync(process.execPath, ['dist/cli/index.mjs', ...args, '--json'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })) }
function call(operation, input, requestId) {
  const result = invoke(['app', 'call', operation, JSON.stringify(input), ...(requestId ? ['--request-id', requestId] : [])])
  if (result.status !== 'succeeded') throw new Error(`${operation}: ${JSON.stringify(result)}`)
  return result.data
}
try {
  for (const name of selectedName ? [selectedName] : names) {
    const content = await readFile(resolve(`resources/agent-skills/${name}/SKILL.md`), 'utf8')
    const hash = createHash('sha256').update(content).digest('hex')
    const record = { name, hash, status: 'preparing' }; records.push(record); await save()
    const catalog = call('skills.list', { refresh: true })
    const found = catalog.skills.filter(skill => skill.slug === name)
    if (found.length > 1) throw new Error(`Ambiguous existing skill: ${name}`)
    let detail
    if (found.length) {
      detail = call('skills.get', { id: found[0].id })
      if (detail.content !== content) throw new Error(`Existing custom content preserved: ${name}`)
    } else {
      record.createRequestId = `alma-skill-source-${name}-${hash.slice(0, 20)}`; await save()
      detail = call('skills.save', { name, content, expectedHash: null }, record.createRequestId)
    }
    record.localSkillId = detail.skill.id; await save()
    const employee = call('employees.get', { id: employeeId })
    record.planRequestId = randomUUID(); await save()
    const plan = call('skills.bindingPlan', { agentId: employeeId, localSkillId: detail.skill.id, expectedConfigVersion: employee.configVersion }, record.planRequestId)
    if (plan.existingResourceId && employee.skillIds.includes(plan.existingResourceId)) {
      record.resourceId = plan.existingResourceId; record.configVersion = employee.configVersion; record.status = 'already-bound'; await save()
      process.stdout.write(`${name}: already bound\n`); continue
    }
    record.bindRequestId = `alma-bind-${employeeId}-${hash.slice(0, 16)}-${employee.configVersion}`; await save()
    call('skills.bind', { agentId: employeeId, localSkillId: detail.skill.id, expectedConfigVersion: employee.configVersion, planId: plan.id, contentHash: plan.contentHash }, record.bindRequestId)
    const deadline = Date.now() + 60000
    for (;;) {
      const receipt = invoke(['app', 'receipt', record.bindRequestId])
      if (receipt.status !== 'succeeded') throw new Error('Binding receipt is not confirmed; inspect original request')
      const operation = receipt.data
      record.receiptId = receipt.receiptId; record.operationId = operation.id; record.operationStatus = operation.status; await save()
      if (operation.status !== 'running') {
        const resourceId = operation.resource?.id
        const current = call('employees.get', { id: employeeId })
        if (operation.status !== 'completed' || !resourceId || !current.skillIds.includes(resourceId)) throw new Error(`Binding not confirmed: ${name}`)
        record.resourceId = resourceId; record.configVersion = current.configVersion; record.status = 'bound'; await save()
        break
      }
      if (Date.now() > deadline) throw new Error('Binding outcome pending; inspect recorded request ID before any new mutation')
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    process.stdout.write(`${name}: bound\n`)
  }
} catch (error) {
  records.push({ error: String(error.message), outcome: 'inspect recorded receipt; no automatic write retry' }); await save(); throw error
}
process.stdout.write(`Evidence: ${output}\n`)
