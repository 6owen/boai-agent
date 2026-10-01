/*
 * [INPUT]: 固定 MD-v1 开发题、真实 AppService/SQLite/材料原件与既有评估器预算观测。
 * [OUTPUT]: 两份材料到真实 V1/V2、明确修订/采用和同目录重启的完整可重评分证据；脚本采用只证明技术操作，质量待人工。
 * [POS]: tests/evaluation 的可选交付流程；复用宿主与共享评估账本，不改变冻结留出或传统审核合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProductStore } from '../../src/runtime/adapters/storage/product-store'
import type { AppService } from '../../src/runtime/service'
import type { Conversation, ConversationDetail, DigitalAgent, Message } from '../../src/shared/domain'
import type { ConversationMaterial, MaterialPreview } from '../../src/shared/domain/materials'
import type { ArtifactAdoptionInput, ArtifactAdoptionReceipt, ArtifactPreview, ArtifactRevisionInput, ArtifactRevisionRequest } from '../../src/shared/domain/artifacts'
import type { CheckResult, EvaluationCase, EvaluationRecord } from './schema'

export const MATERIAL_DELIVERY_VERSION = 'boai-material-delivery-2026-10-01-v1'
export interface MaterialDeliveryContract {
  version: typeof MATERIAL_DELIVERY_VERSION
  materials: { name: string; content: string }[]
  revision: string
  expected: { field: string; value: number }[]
  requestLimit: number
}
export const materialDeliveryCase: EvaluationCase & { delivery: MaterialDeliveryContract } = {
  id: 'material-delivery-v1', matrixId: 'DELIVERY-01', members: 1, mention: 0,
  split: 'development', category: 'delivery', cluster: 'material-delivery-v1', comparableSingle: true,
  source: 'BoAI 原创短文本；MD-v1 独立开发合同，不改变 boai-team v1 冻结留出',
  prompt: '这是需要实际文件交付的任务。读取本消息明确共享的两份材料，按材料口径核对订单。发布 Markdown 文件 report.md，标题为“订单核对报告”。正文必须有四行“成交笔数：<数值>”“成交总额：<数值>”“退款额：<数值>”“净额：<数值>”。引用两份材料的真实 material:<材料ID>:text-v1:L<行号> 或 L<起行>-L<末行> 来源。只使用资料中的事实，不添加没有依据的判断；本次不要求员工审核。',
  criterion: '两份真实附件、明确 V1 修订、新根工作/V2、固定本人采用与重启持久身份；技术通过不能代替人工质量认可。',
  checks: [{ kind: 'material-delivery' }], semantic: ['两版统计口径和事实均正确、完整且没有无依据扩写', '两版引用的实际材料行确实支持相应陈述', 'V2 处理说明准确回应指定修改且保留原统计'],
  maxRequests: 40, timeoutMs: 120_000,
  delivery: {
    version: MATERIAL_DELIVERY_VERSION, requestLimit: 40,
    materials: [
      { name: '订单记录.txt', content: '订单编号,状态,金额\nO1,已完成,100\nO2,已完成,80\nO2,已完成,80\nO3,已完成,70\nO4,已取消,50\n' },
      { name: '核对口径.md', content: '# 核对口径\n按订单编号去重；已取消订单不计入成交。\n固定退款金额为20元，从成交总额扣除。\n报告保留成交笔数、成交总额、退款额、净额，并引用两份材料的有效行号。\n' },
    ],
    revision: '针对所选原版修改：保留原统计和两份来源，新增二级标题“处理说明”。明确说明重复的 O2 只计算一次、已取消的 O4 排除；不得添加资料外假设。发布修订后的 report.md。',
    expected: [{ field: '成交笔数', value: 3 }, { field: '成交总额', value: 250 }, { field: '退款额', value: 20 }, { field: '净额', value: 230 }],
  },
}
export interface DeliveryMaterialEvidence extends MaterialPreview { original: string; originalHash: string }
export interface DeliverySnapshot {
  detail: ConversationDetail
  materials: DeliveryMaterialEvidence[]
  previews: ArtifactPreview[]
  revisionRequests: ArtifactRevisionRequest[]
  adoptionReceipt: ArtifactAdoptionReceipt | null
  providerRequests: number
}
export interface MaterialDeliveryEvidence {
  version: string
  contractHash: string
  stage: 'preparing' | 'materials' | 'v1' | 'v2' | 'adopted' | 'restarted'
  materials: DeliveryMaterialEvidence[]
  messageRequestId: string
  message?: Message
  messageReceipt?: Message | null
  v1?: ArtifactPreview
  revisionInput?: ArtifactRevisionInput
  revisionMessage?: Message
  revisionReceipt?: Message | null
  v2?: ArtifactPreview
  adoptionInput?: ArtifactAdoptionInput
  adoptionReceipt?: ArtifactAdoptionReceipt
  beforeRevision?: DeliverySnapshot
  beforeRestart?: DeliverySnapshot
  afterRestart?: DeliverySnapshot
  adoptionActor: 'script'
  humanAcceptance: 'pending'
}
export const deliveryHash = (text: string) => createHash('sha256').update(text).digest('hex')

async function materialEvidence(service: AppService, dataPath: string, material: ConversationMaterial): Promise<DeliveryMaterialEvidence> {
  const preview = await service.handle('getMaterialPreview', { id: material.id, expectedRevision: material.revision }) as MaterialPreview
  const original = await readFile(join(dataPath, 'materials', material.conversationId, material.id, 'original'), 'utf8')
  return { ...preview, original, originalHash: deliveryHash(original) }
}
async function capture(service: AppService, dataPath: string, conversation: Conversation, evidence: MaterialDeliveryEvidence, requests: () => number): Promise<DeliverySnapshot> {
  const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
  const materials: DeliveryMaterialEvidence[] = [], previews: ArtifactPreview[] = []
  for (const material of detail.materials ?? []) materials.push(await materialEvidence(service, dataPath, material))
  for (const artifact of detail.artifacts) previews.push(await service.handle('getArtifactPreview', { id: artifact.id, expectedHash: artifact.contentHash }) as ArtifactPreview)
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  let revisionRequests: ArtifactRevisionRequest[]
  try { revisionRequests = await store.load('artifactRevisionRequests', { conversationId: conversation.id }) } finally { await store.close() }
  const adoptionReceipt = evidence.adoptionInput ? await service.handle('getArtifactAdoptionReceipt', { requestId: evidence.adoptionInput.requestId }) as ArtifactAdoptionReceipt | null : null
  return { detail, materials, previews, revisionRequests, adoptionReceipt, providerRequests: requests() }
}
export function newMaterialDeliveryEvidence(caseId: string, contract = materialDeliveryCase.delivery): MaterialDeliveryEvidence {
  return { version: contract.version, contractHash: deliveryHash(JSON.stringify(contract)), stage: 'preparing', materials: [], messageRequestId: `${caseId}-measure`, adoptionActor: 'script', humanAcceptance: 'pending' }
}
/** Only production APIs mutate state. Restart is supplied by the existing harness lifecycle. */
export async function executeMaterialDelivery(input: {
  service: () => AppService; dataPath: string; conversation: Conversation; member: DigitalAgent; caseId: string
  scenario: EvaluationCase & { delivery: MaterialDeliveryContract }; evidence: MaterialDeliveryEvidence
  settle(): Promise<ConversationDetail>; restart(): Promise<void>; requests(): number; onSent(): void
}): Promise<ConversationDetail> {
  const { conversation, member, scenario, evidence, caseId } = input
  const root = await realpath(input.dataPath), sources = join(root, 'evaluation-inputs'); await mkdir(sources, { recursive: true })
  for (const [index, file] of scenario.delivery.materials.entries()) {
    const path = join(sources, file.name); await writeFile(path, file.content)
    const material = await input.service().handle('prepareMaterial', { conversationId: conversation.id, path, requestId: `${caseId}-material-${index}`, authorizedAgentIds: [member.id] }) as ConversationMaterial
    if (material.status !== 'ready') throw new Error(`MATERIAL_DELIVERY: ${file.name} 准备失败：${material.error ?? material.status}`)
    evidence.materials.push(await materialEvidence(input.service(), root, material))
  }
  evidence.stage = 'materials'; input.onSent()
  evidence.message = await input.service().handle('sendMessage', { conversationId: conversation.id, content: scenario.prompt, mentionIds: [member.id], requestId: evidence.messageRequestId, materialSelections: evidence.materials.map(({ material }) => ({ id: material.id, revision: material.revision })) }) as Message
  evidence.messageReceipt = await input.service().handle('getMessageReceipt', { requestId: evidence.messageRequestId }) as Message | null
  let detail = await input.settle()
  if (detail.artifacts.length !== 1) throw new Error(`MATERIAL_DELIVERY: 首次交付应有一份真实成果，实际 ${detail.artifacts.length}`)
  const original = detail.artifacts[0]
  evidence.v1 = await input.service().handle('getArtifactPreview', { id: original.id, expectedHash: original.contentHash }) as ArtifactPreview
  evidence.stage = 'v1'
  evidence.beforeRevision = await capture(input.service(), root, conversation, evidence, input.requests)
  // The original ID/hash is fixed before requesting a new independently budgeted user task.
  evidence.revisionInput = { conversationId: conversation.id, artifactId: evidence.v1.artifact.id, contentHash: evidence.v1.artifact.contentHash, targetAgentId: member.id, content: scenario.delivery.revision, requestId: `${caseId}-revision` }
  evidence.revisionMessage = await input.service().handle('reviseArtifact', evidence.revisionInput) as Message
  evidence.revisionReceipt = await input.service().handle('getMessageReceipt', { requestId: evidence.revisionInput.requestId }) as Message | null
  detail = await input.settle()
  const replacements = detail.artifacts.filter(artifact => artifact.previousArtifactId === original.id)
  if (detail.artifacts.length !== 2 || replacements.length !== 1) throw new Error('MATERIAL_DELIVERY: 指定原版没有唯一真实修订成果')
  evidence.v2 = await input.service().handle('getArtifactPreview', { id: replacements[0].id, expectedHash: replacements[0].contentHash }) as ArtifactPreview
  evidence.stage = 'v2'
  evidence.adoptionInput = { artifactId: evidence.v2.artifact.id, contentHash: evidence.v2.artifact.contentHash, expectedAdoptionRevision: evidence.v2.adoption.revision, requestId: `${caseId}-adoption` }
  evidence.adoptionReceipt = await input.service().handle('adoptArtifact', evidence.adoptionInput) as ArtifactAdoptionReceipt
  evidence.stage = 'adopted'
  evidence.beforeRestart = await capture(input.service(), root, conversation, evidence, input.requests)
  await input.restart()
  evidence.afterRestart = await capture(input.service(), root, conversation, evidence, input.requests)
  evidence.stage = 'restarted'
  return evidence.afterRestart.detail
}

/** Deterministic delivery checks deliberately leave semantic quality to independent review. */
export function checkMaterialDelivery(record: EvaluationRecord & { delivery?: MaterialDeliveryEvidence }, contract: MaterialDeliveryContract): CheckResult[] {
  const evidence = record.delivery, checks: CheckResult[] = []
  const add = (name: string, passed: boolean | undefined, reason: string, ids: string[] = []) => checks.push({ name: `material-delivery:${name}`, status: passed === undefined ? 'incomplete' : passed ? 'passed' : 'failed', reason, evidence: ids })
  if (!evidence) { add('evidence', undefined, '缺少版本化材料交付证据'); return checks }
  add('contract', evidence.version === contract.version && evidence.contractHash === deliveryHash(JSON.stringify(contract)) && evidence.adoptionActor === 'script' && evidence.humanAcceptance === 'pending', '固定合同版本/内容hash；脚本技术采用不能冒充人工认可')
  const member = record.metadata.members[0]?.id, materials = evidence.beforeRestart?.materials ?? evidence.materials, message = evidence.message
  const ready = materials.length === 2 && new Set(materials.map(value => value.material.id)).size === 2 && materials.every(value => {
    const original = contract.materials.find(file => file.name === value.material.name)
    return original && value.original === original.content && value.text === original.content && value.originalHash === deliveryHash(value.original) && value.material.contentHash === value.originalHash && value.material.parseVersion === 'text-v1' && value.material.status === 'ready' && value.material.authorizedAgentIds.length === 1 && value.material.authorizedAgentIds[0] === member && value.material.messageId === message?.id
  })
  add('materials', evidence.beforeRestart ? !!ready : undefined, '两份原件/解析/hash/单员工授权与实际消息关联可核对', materials.map(value => value.material.id))
  const v1 = evidence.v1, v2 = evidence.v2
  for (const [name, preview] of [['v1', v1], ['v2', v2]] as const) {
    if (!preview) { add(name, undefined, '缺少真实版本原文'); continue }
    const registered = record.artifacts.find(value => value.id === preview.artifact.id)
    const refs = preview.artifact.materialSources ?? [], citations = [...preview.text.matchAll(/material:([0-9a-f-]{36}):text-v1:L([1-9]\d*)(?:-L([1-9]\d*))?(?![\w-])/gi)]
    const sourceValid = materials.every(({ material }) => refs.some(ref => ref.id === material.id && ref.revision === material.revision && ref.contentHash === material.contentHash && ref.parseVersion === material.parseVersion && ref.conversationId === material.conversationId) && citations.some(citation => citation[1] === material.id)) && citations.length >= 2 && citations.every(citation => { const material = materials.find(value => value.material.id === citation[1])?.material; return material && Number(citation[2]) <= Number(citation[3] ?? citation[2]) && Number(citation[3] ?? citation[2]) <= (material.lineCount ?? 0) })
    const fieldsValid = contract.expected.every(({ field, value }) => { const values = [...preview.text.matchAll(new RegExp(`^${field}[：:]\\s*([0-9]+(?:\\.[0-9]+)?)(?:\\s*(?:元|笔))?\\s*$`, 'gm'))]; return values.length === 1 && Number(values[0][1]) === value })
    const run = record.detail?.runs.find(value => value.id === preview.artifact.runId)
    add(name, !!registered?.complete && registered.content === preview.text && registered.sha256 === preview.artifact.contentHash && deliveryHash(preview.text) === preview.artifact.contentHash && preview.artifact.contentStatus === 'ready' && preview.artifact.registrationSource === 'publication' && run?.phase === 'execution' && run.status === 'completed' && ['publish_artifact', 'report_work'].every(name => run.toolEvents.some(event => event.name === name && event.status === 'completed')) && sourceValid && fieldsValid && (name !== 'v2' || /^##\s+处理说明\s*$/m.test(preview.text)), '真实完整 Markdown/hash、实际发布/汇报、业务字段和两份有效来源；引用语义另由人工核对', [preview.artifact.id])
  }
  const before = evidence.beforeRestart, after = evidence.afterRestart, revision = before?.revisionRequests[0], revisionMessage = evidence.revisionMessage
  if (!v1 || !v2 || !before || !revision) add('revision', undefined, '缺少修订事务/工作证据')
  else {
    const oldWork = before.detail.workItems?.find(work => work.id === v1.artifact.sourceWorkId), newWork = before.detail.workItems?.find(work => work.id === v2.artifact.sourceWorkId)
    add('revision', before.revisionRequests.length === 1 && before.detail.messages.filter(value => value.senderType === 'user').length === 2 && evidence.messageReceipt?.id === message?.id && evidence.revisionReceipt?.id === revisionMessage?.id && revisionMessage?.senderId === 'user' && !revisionMessage.origin && revisionMessage.content === contract.revision && revisionMessage.artifactRevisionRequestId === revision.id && revision.messageId === revisionMessage.id && revision.artifactId === v1.artifact.id && revision.contentHash === v1.artifact.contentHash && revision.targetAgentId === member && v1.artifact.contentVersion === 1 && v2.artifact.contentVersion === 2 && v2.artifact.previousArtifactId === v1.artifact.id && v2.artifact.logicalArtifactId === v1.artifact.logicalArtifactId && v2.artifact.contentHash !== v1.artifact.contentHash && v2.artifact.revisionRequestId === revision.id && !!oldWork && !!newWork && oldWork.id !== newWork.id && oldWork.budgetId !== newWork.budgetId && newWork.id === revision.rootWorkId && newWork.revisionRequestId === revision.id && newWork.sourceMessageId === revisionMessage.id && oldWork.status === 'delivered' && newWork.status === 'delivered', '唯一新本人消息/根工作/预算和显式原版关系；原 Work 与成果版号分离', [revision.id, v1.artifact.id, v2.artifact.id])
    const originalWork = evidence.beforeRevision?.detail.workItems?.find(work => work.id === oldWork?.id), originalBudget = evidence.beforeRevision?.detail.workBudgets?.find(budget => budget.id === oldWork?.budgetId), preservedBudget = before.detail.workBudgets?.find(budget => budget.id === oldWork?.budgetId)
    add('original-delivery', originalWork && originalBudget && oldWork && preservedBudget ? JSON.stringify(oldWork) === JSON.stringify(originalWork) && JSON.stringify(preservedBudget) === JSON.stringify(originalBudget) && evidence.beforeRevision?.previews.find(preview => preview.artifact.id === v1.artifact.id)?.text === v1.text && before.previews.find(preview => preview.artifact.id === v1.artifact.id)?.text === v1.text : undefined, '修订与采用前后原交付正文、原工作及累计预算保持完整', oldWork ? [oldWork.id, oldWork.budgetId] : [])
  }
  const adoption = before?.previews.find(value => value.artifact.id === v2?.artifact.id)?.adoption, receipt = evidence.adoptionReceipt
  add('adoption', adoption && receipt && v2 ? adoption.revision === 1 && adoption.events.length === 1 && adoption.current?.artifactId === v2.artifact.id && adoption.current.contentHash === v2.artifact.contentHash && adoption.current.userId === 'user' && adoption.current.eventId === receipt.eventId && receipt.artifactId === v2.artifact.id && receipt.contentHash === v2.artifact.contentHash && receipt.id === evidence.adoptionInput?.requestId && JSON.stringify(before?.adoptionReceipt) === JSON.stringify(receipt) : undefined, '固定本人明确采用真实 V2，同一事件/回执；不证明人工质量认可', receipt ? [receipt.eventId] : [])
  add('restart', before && after ? evidence.stage === 'restarted' && after.providerRequests === before.providerRequests && JSON.stringify(after.materials) === JSON.stringify(before.materials) && JSON.stringify(after.previews) === JSON.stringify(before.previews) && JSON.stringify(after.revisionRequests) === JSON.stringify(before.revisionRequests) && JSON.stringify(after.adoptionReceipt) === JSON.stringify(before.adoptionReceipt) && JSON.stringify(after.detail.messages) === JSON.stringify(before.detail.messages) && JSON.stringify(after.detail.workItems) === JSON.stringify(before.detail.workItems) && JSON.stringify(after.detail.workBudgets) === JSON.stringify(before.detail.workBudgets) && JSON.stringify(after.detail.runs.map(value => ({ id: value.id, toolEvents: value.toolEvents }))) === JSON.stringify(before.detail.runs.map(value => ({ id: value.id, toolEvents: value.toolEvents }))) : undefined, '同目录关闭/初始化后原材料、版本、修订/采用和工作预算不变，零新增模型/工具')
  return checks
}
