/*
 * [INPUT]: One reviewed bundled skill, its known previous body SHA-256 and an existing employee binding.
 * [OUTPUT]: Original shared-source save/check/update receipts and verified bound bytes; custom content is preserved.
 * [OUTPUT]: Source body hash is calculated from the actual skills.get content; that read API does not return a contentHash field.
 * [OUTPUT]: Explicit --adopt-matching-source refreshes stale install evidence only when the whole employee/source trees already match.
 * [POS]: Explicit migration utility using the application protocol, never a startup sync or direct employee-file overwrite.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [employeeId, name, previousHash, option] = process.argv.slice(2)
if (process.argv.length < 5 || process.argv.length > 6 || option && option !== '--adopt-matching-source' || !/^[a-zA-Z0-9_-]+$/.test(employeeId ?? '') || !/^boai-[a-z0-9-]+$/.test(name ?? '') || !/^[a-f0-9]{64}$/.test(previousHash ?? '')) throw new Error('Usage: node scripts/update-alma-skill.mjs EMPLOYEE SKILL PREVIOUS_BODY_SHA256 [--adopt-matching-source]')
const digest = content => createHash('sha256').update(content).digest('hex')
const content = await readFile(resolve(`resources/agent-skills/${name}/SKILL.md`), 'utf8'), nextHash = digest(content)
const output = resolve(`.local/personality-evaluation/skill-update-${Date.now()}.json`)
await mkdir(resolve('.local/personality-evaluation'), { recursive: true })
const record = { employeeId, name, previousHash, nextHash, adoptMatchingSource: !!option, status: 'preparing' }
const save = () => writeFile(output, JSON.stringify(record, null, 2) + '\n')
function call(operation, input, requestId) {
  const response = JSON.parse(execFileSync(process.execPath, ['dist/cli/index.mjs', 'app', 'call', operation, JSON.stringify(input), ...(requestId ? ['--request-id', requestId] : []), '--json'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))
  if (response.status !== 'succeeded') throw new Error(`${operation}: outcome ${response.status}; inspect recorded request before any retry`)
  return response.data
}
try {
  await save()
  const catalog = call('skills.list', { refresh: true }), matches = catalog.skills.filter(skill => skill.slug === name)
  if (matches.length !== 1) throw new Error('Source missing or ambiguous; no mutation performed')
  const source = call('skills.get', { id: matches[0].id })
  const sourceHash = digest(source.content)
  if (![previousHash, nextHash].includes(sourceHash)) throw new Error('Shared source has unreviewed changes; preserved')
  const employee = call('employees.get', { id: employeeId })
  const installations = call('skills.installations', {})
  const bound = installations.filter(item => item.localSkillId === source.skill.id && employee.skillIds.includes(item.resourceId))
  if (bound.length !== 1) throw new Error('Employee source binding missing or ambiguous; no mutation performed')
  const detail = call('skills.boundDetail', { id: bound[0].resourceId }), boundHash = digest(detail.content)
  if (![previousHash, nextHash].includes(boundHash)) throw new Error('Employee has custom content; preserved')
  Object.assign(record, { localSkillId: source.skill.id, resourceId: bound[0].resourceId, before: { configVersion: employee.configVersion, sourceHash, boundHash, boundTreeHash: detail.contentHash, installation: detail.installation } }); await save()
  if (sourceHash !== nextHash) {
    record.sourceRequestId = `alma-source-update-${source.skill.id.slice(-16)}-${previousHash.slice(0, 12)}-${nextHash.slice(0, 12)}`; await save()
    const saved = call('skills.save', { id: source.skill.id, content, expectedHash: sourceHash }, record.sourceRequestId)
    if (digest(saved.content) !== nextHash) throw new Error('Saved source not confirmed; inspect original receipt')
    record.sourceSaved = true; await save()
  }
  record.checkRequestId = randomUUID(); await save()
  const check = call('skills.checkUpdate', { id: record.resourceId }, record.checkRequestId)
  record.check = check; await save()
  if (check.status === 'available') {
    const adoptMatching = !!option && check.candidateHash === check.expectedHash && boundHash === nextHash
    if ((check.localModified || check.baselineUnknown) && !adoptMatching) throw new Error('Employee copy differs from its installation baseline; preserved for explicit review')
    if (check.expectedHash !== detail.contentHash) throw new Error('Employee copy changed while preparing; no update submitted')
    record.updateRequestId = `alma-copy-update-${record.resourceId}-${check.expectedRevision}-${nextHash.slice(0, 12)}`; await save()
    const operation = call('skills.update', { planId: check.planId, expectedRevision: check.expectedRevision, expectedHash: check.expectedHash, ...(adoptMatching ? { replaceLocalChanges: true } : {}) }, record.updateRequestId)
    record.operationId = operation.id; await save()
    const deadline = Date.now() + 60_000
    for (;;) {
      record.operation = call('skills.operation', { id: record.operationId }); await save()
      if (record.operation.status !== 'running') break
      if (Date.now() >= deadline) throw new Error('Original update is still running; poll recorded operation, do not resubmit')
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    if (record.operation.status !== 'completed') throw new Error('Original update did not complete; inspect preserved result')
  } else if (check.status !== 'current') throw new Error(`Update check is ${check.status}; source/copy state retained`)
  const after = call('skills.boundDetail', { id: record.resourceId }), current = call('employees.get', { id: employeeId })
  if (digest(after.content) !== nextHash || !current.skillIds.includes(record.resourceId) || after.contentHash !== after.installation?.contentHash) throw new Error('Updated employee content/installation not confirmed')
  record.after = { configVersion: current.configVersion, bodyHash: digest(after.content), treeHash: after.contentHash, installation: after.installation }
  record.status = check.status === 'current' ? 'already-current' : 'updated'; await save()
  process.stdout.write(`${name}: ${record.status}\nEvidence: ${output}\n`)
} catch (error) {
  record.status = 'inspect-original-result'; record.error = String(error.message); await save(); throw error
}
