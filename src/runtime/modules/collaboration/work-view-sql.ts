/*
 * [INPUT]: records中的当前可见会话、Work、已发材料/已发布成果；规范化筛选和版本游标。
 * [OUTPUT]: SQL分页前授权/范围/AND筛选、五组计数、根子展开同口径原消息来源及当前审批原卡身份；不读取聊天正文。
 * [POS]: 工作视图固定SELECT与游标合同；不接受外部SQL、不改变执行事实。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { WORK_VIEW_GROUPS, WORK_VIEW_LIMITS, type WorkViewQuery, type ConversationFileQuery } from '../../../shared/domain/work-views'

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/)
const timestamp = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString())
const page = { limit: z.number().int().min(1).max(WORK_VIEW_LIMITS.maxPage).optional(), cursor: z.string().max(3000).optional() }
const range = { from: timestamp.optional(), to: timestamp.optional() }
const keyword = z.string().trim().max(WORK_VIEW_LIMITS.searchCharacters).transform(value => [...new Set(value.toLocaleLowerCase().split(/\s+/).filter(Boolean))].sort().join(' ') || undefined).optional()
export const workViewQuerySchema = z.object({ conversationId: identifier.optional(), ownerAgentId: identifier.optional(), parentWorkId: identifier.optional(), search: keyword, states: z.array(z.enum(['ready', 'running', 'waiting', 'blocked', 'delivered', 'failed', 'cancelled', 'interrupted'])).max(8).transform(value => [...new Set(value)].sort()).optional(), group: z.enum(WORK_VIEW_GROUPS).optional(), source: z.enum(['ordinary', 'automation', 'unknown']).optional(), ...range, ...page }).strict().refine(value => !value.from || !value.to || value.from <= value.to, '开始时间不得晚于结束时间')
export const conversationFileQuerySchema = z.object({ conversationId: identifier, name: keyword, kind: z.enum(['material', 'artifact']).optional(), actorId: identifier.optional(), fileType: z.string().trim().max(30).transform(value => value.replace(/^\./, '').toLowerCase()).optional(), logicalArtifactId: identifier.optional(), ...range, ...page }).strict().refine(value => !value.from || !value.to || value.from <= value.to, '开始时间不得晚于结束时间')
export const workViewTargetSchema = z.object({ workId: identifier, kind: z.enum(['source', 'result', 'question', 'approval']), messageId: identifier.optional(), artifactId: identifier.optional(), contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), approvalId: identifier.optional(), runId: identifier.optional() }).strict().refine(value => value.kind === 'approval' ? !!value.approvalId && !value.artifactId && !value.contentHash : !value.approvalId && !value.runId, '审批必须固定原审批身份，不能改绑其他目标')
export const conversationFileTargetSchema = z.object({ conversationId: identifier, kind: z.enum(['material', 'artifact']), id: identifier, contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), revision: z.number().int().positive().optional() }).strict()

export const WORK_VIEW_CLOCK = 'workViewClock'
export function advanceWorkViewClock(collection: string) {
  if (!['workItems', 'conversations', 'conversationCleanup', 'messages', 'snapshots', 'runs', 'approvals', 'materials', 'artifacts', 'agents', 'artifactAdoptionCurrent', 'automationDefinitions', 'automationOccurrences'].includes(collection)) return []
  return [{ sql: `INSERT INTO records(collection,id,value) VALUES('${WORK_VIEW_CLOCK}','current',json_object('id','current','revision',1)) ON CONFLICT(collection,id) DO UPDATE SET value=json_set(records.value,'$.revision',COALESCE(json_extract(records.value,'$.revision'),0)+1)`, args: [] }]
}
interface Cursor { version: 1; fingerprint: string; revision: number; scopeEpoch: string; time: string; id: string; kind?: string }
const fingerprint = (query: WorkViewQuery | ConversationFileQuery) => {
  const { cursor: _cursor, ...conditions } = query
  return createHash('sha256').update(JSON.stringify(conditions)).digest('hex')
}
export function readWorkViewCursor(query: WorkViewQuery | ConversationFileQuery): Cursor | undefined {
  if (!query.cursor) return
  try {
    const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()) as Cursor
    if (cursor.version !== 1 || cursor.fingerprint !== fingerprint(query) || !Number.isSafeInteger(cursor.revision) || cursor.revision < 0 || typeof cursor.scopeEpoch !== 'string' || typeof cursor.time !== 'string' || typeof cursor.id !== 'string') throw new Error()
    return cursor
  } catch { throw new Error('STALE_CURSOR: 查询条件或分页身份已变化，请刷新') }
}
export function workViewCursor(query: WorkViewQuery | ConversationFileQuery, revision: number, scopeEpoch: string, time: string, id: string, kind?: string) {
  return Buffer.from(JSON.stringify({ version: 1, fingerprint: fingerprint(query), revision, scopeEpoch, time, id, ...(kind ? { kind } : {}) })).toString('base64url')
}
const field = (expression: string, path: string) => `json_extract(${expression},'$.${path}')`
export const visibleWorkConversationSql = "COALESCE(json_extract(c.value,'$.list.hidden'),0)=0 AND NOT EXISTS(SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=c.id)"
/** A recorded material grant/version revocation makes derived objects ineligible before LIMIT. */
function validRefs(expression: string, refs = field(expression, 'materialSources')) {
  return `NOT EXISTS(SELECT 1 FROM json_each(COALESCE(${refs},'[]')) ref WHERE NOT EXISTS(SELECT 1 FROM records material WHERE material.collection='materials' AND material.id=${field('ref.value', 'id')} AND ${field('material.value', 'conversationId')}=${field(expression, 'conversationId')} AND ${field('ref.value', 'conversationId')}=${field(expression, 'conversationId')} AND ${field('material.value', 'status')}='ready' AND COALESCE(${field('material.value', 'messageId')},'')<>'' AND ${field('ref.value', 'revision')} BETWEEN COALESCE(${field('material.value', 'readableRevisionFrom')},${field('material.value', 'revision')}) AND ${field('material.value', 'revision')} AND ${field('material.value', 'contentHash')}=${field('ref.value', 'contentHash')} AND ${field('material.value', 'parseVersion')}=${field('ref.value', 'parseVersion')}))`
}
function validMessageSources(expression: string, messageId: string) {
  const refs = `COALESCE(${field(expression, 'materialSources')},(SELECT json_extract(snapshot.value,'$.materialRefs') FROM records snapshot WHERE snapshot.collection='snapshots' AND snapshot.id=${field(expression, 'runId')}),'[]')`
  return `${validRefs(expression, refs)} AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(${field(expression, 'materialIds')},'[]')) sent WHERE NOT EXISTS(SELECT 1 FROM records original WHERE original.collection='materials' AND original.id=sent.value AND ${field('original.value', 'conversationId')}=${field(expression, 'conversationId')} AND ${field('original.value', 'messageId')}=${messageId} AND ${field('original.value', 'status')}='ready' AND ${field('original.value', 'contentHash')} IS NOT NULL))`
}
/** Parent lookup and child counts must apply the same legacy original-message grants as their pages. */
function validWorkSources(expression: string) {
  return `${validRefs(expression)} AND NOT EXISTS(SELECT 1 FROM records original WHERE original.collection='messages' AND original.id=${field(expression, 'sourceMessageId')} AND ${field('original.value', 'conversationId')}=${field(expression, 'conversationId')} AND NOT (${validMessageSources('original.value', 'original.id')}))`
}
const workSource = `CASE WHEN ${field('w.value', 'origin.kind')}='automation' THEN 'automation' WHEN ${field('w.value', 'origin')} IS NULL AND m.id IS NOT NULL AND ${field('m.value', 'origin')} IS NULL THEN 'ordinary' ELSE 'unknown' END`
const workGroup = `CASE ${field('w.value', 'status')} WHEN 'ready' THEN 'ready' WHEN 'running' THEN 'running' WHEN 'waiting' THEN 'waiting' WHEN 'blocked' THEN 'waiting' WHEN 'delivered' THEN 'delivered' ELSE 'ended' END`
function workBase(query: WorkViewQuery, id?: string) {
  const args: (string | number)[] = [], predicates = ["w.collection='workItems'", visibleWorkConversationSql, validRefs('w.value'), `(m.id IS NULL OR (${validMessageSources('m.value', 'm.id')}))`]
  if (id) { predicates.push('w.id=?'); args.push(id) }
  if (query.conversationId) { predicates.push('c.id=?'); args.push(query.conversationId) }
  if (query.ownerAgentId) { predicates.push(`${field('w.value', 'ownerAgentId')}=?`); args.push(query.ownerAgentId) }
  if (query.parentWorkId) { predicates.push(`${field('w.value', 'parentWorkId')}=? AND EXISTS(SELECT 1 FROM records parent WHERE parent.collection='workItems' AND parent.id=? AND ${field('parent.value', 'conversationId')}=c.id AND ${validWorkSources('parent.value')})`); args.push(query.parentWorkId, query.parentWorkId) }
  for (const term of query.search?.split(/\s+/).filter(Boolean) ?? []) { predicates.push(`instr(lower(COALESCE(${field('w.value', 'deliverable')},'')||' '||COALESCE(${field('w.value', 'scope')},'')),?)>0`); args.push(term) }
  if (query.states) { predicates.push(query.states.length ? `${field('w.value', 'status')} IN (${query.states.map(() => '?').join(',')})` : '0'); args.push(...query.states) }
  if (query.source) { predicates.push(`(${workSource})=?`); args.push(query.source) }
  if (query.from) { predicates.push(`${field('w.value', 'createdAt')}>=?`); args.push(query.from) }
  if (query.to) { predicates.push(`${field('w.value', 'createdAt')}<=?`); args.push(query.to) }
  const root = `COALESCE(${field('w.value', 'parentWorkId')},'')=''`
  return { args, root, sql: `SELECT w.id,w.value AS work,${field('c.value', 'title')} AS conversationTitle,${field('a.value', 'name')} AS ownerName,COALESCE(${field('w.value', 'createdAt')},'') AS time,${workSource} AS source,${workGroup} AS stateGroup,(${root}) AS isRoot,(m.id IS NOT NULL AND ${field('m.value', 'status')}='completed') AS sourceAvailable FROM records w JOIN records c ON c.collection='conversations' AND c.id=${field('w.value', 'conversationId')} LEFT JOIN records a ON a.collection='agents' AND a.id=${field('w.value', 'ownerAgentId')} LEFT JOIN records m ON m.collection='messages' AND m.id=${field('w.value', 'sourceMessageId')} AND ${field('m.value', 'conversationId')}=c.id WHERE ${predicates.join(' AND ')}` }
}
/** The pending card has a fixed approval/run identity even before its private reply is published. */
function approvalTargets(work: string) {
  const messageMatches = `am.id IS NOT NULL AND ${field('am.value', 'conversationId')}=${field(work, 'conversationId')} AND ${field('am.value', 'runId')}=ar.id AND ${field('am.value', 'senderType')}='agent' AND ${field('am.value', 'senderId')}=${field('ar.value', 'agentId')} AND ${field('am.value', 'status')} IN ('streaming','completed') AND ${validMessageSources('am.value', 'am.id')}`
  return `(SELECT json_group_array(json(target)) FROM (SELECT json_patch('{}',json_object('approvalId',ap.id,'runId',ar.id,'kind',CASE WHEN ${field('ap.value', 'kind')} IN ('command','browser') THEN ${field('ap.value', 'kind')} ELSE NULL END,'messageId',CASE WHEN ${messageMatches} THEN am.id ELSE NULL END)) AS target FROM records ar JOIN records ap ON ap.collection='approvals' AND ${field('ap.value', 'runId')}=ar.id AND ${field('ap.value', 'conversationId')}=${field(work, 'conversationId')} LEFT JOIN records am ON am.collection='messages' AND am.id=${field('ar.value', 'messageId')} WHERE ar.collection='runs' AND ar.id=${field(work, 'activeRunId')} AND ${field(work, 'status')} IN ('running','waiting') AND ${field('ar.value', 'conversationId')}=${field(work, 'conversationId')} AND ${field('ar.value', 'workId')}=${field(work, 'id')} AND ${field('ar.value', 'agentId')}=${field(work, 'ownerAgentId')} AND ${field('ar.value', 'status')}='waiting_approval' ORDER BY ap.id))`
}
export function workViewsSql(query: WorkViewQuery) {
  const base = workBase(query), args = [...base.args], selected = query.ownerAgentId || query.parentWorkId ? '1' : 'isRoot=1', group = query.group ? 'stateGroup=?' : '1'
  if (query.group) args.push(query.group)
  const before = readWorkViewCursor(query), pageWhere = ['isSelected=1', 'groupMatches=1']
  if (before) { pageWhere.push('(time,id)<(?,?)'); args.push(before.time, before.id) }
  args.push((query.limit ?? WORK_VIEW_LIMITS.defaultPage) + 1)
  const sum = (predicate: string) => `COALESCE(SUM(CASE WHEN ${predicate} THEN 1 ELSE 0 END),0)`
  const statistics = [
    `${sum('isSelected=1 AND groupMatches=1')} AS total`,
    `${sum('isRoot=1 AND groupMatches=1')} AS rootTotal`,
    `${sum('isRoot=0 AND groupMatches=1')} AS childTotal`,
    ...WORK_VIEW_GROUPS.map(key => `${sum(`isSelected=1 AND stateGroup='${key}'`)} AS ${key}Count`),
  ].join(',')
  const counts = WORK_VIEW_GROUPS.map(key => `'${key}',${key}Count`).join(',')
  // All counters share one filtered scan; a page never substitutes its length for the scope's total.
  return { sql: `WITH base AS (${base.sql}), eligible AS (SELECT *,(${selected}) AS isSelected,(${group}) AS groupMatches FROM base), statistics AS (SELECT ${statistics} FROM eligible), page AS (SELECT * FROM eligible WHERE ${pageWhere.join(' AND ')} ORDER BY time DESC,id DESC LIMIT ?) SELECT 0 AS ordinal,'' AS sortTime,'' AS sortId,'' AS sortKind,json_object('scopeEpoch',(SELECT json_extract(value,'$.epoch') FROM records WHERE collection='${WORK_VIEW_CLOCK}' AND id='current'),'revision',COALESCE((SELECT json_extract(value,'$.revision') FROM records WHERE collection='${WORK_VIEW_CLOCK}' AND id='current'),0),'total',total,'rootTotal',rootTotal,'childTotal',childTotal,'counts',json_object(${counts})) AS value FROM statistics UNION ALL SELECT 1,time,id,'',json_object('work',json(work),'conversationTitle',conversationTitle,'ownerName',ownerName,'source',source,'sourceAvailable',json(CASE WHEN sourceAvailable THEN 'true' ELSE 'false' END),'childCount',(SELECT COUNT(*) FROM records child WHERE child.collection='workItems' AND ${field('child.value', 'parentWorkId')}=page.id AND ${field('child.value', 'conversationId')}=${field('page.work', 'conversationId')} AND ${validWorkSources('child.value')}),'resultMessageIds',json(COALESCE(json_extract(work,'$.resultMessageIds'),'[]')),'approvalTargets',json(${approvalTargets('page.work')})) FROM page ORDER BY ordinal,sortTime DESC,sortId DESC,sortKind DESC`, args }
}
export function workViewTargetSql(workId: string) {
  const base = workBase({}, workId)
  return { sql: `WITH base AS (${base.sql}) SELECT work FROM base LIMIT 1`, args: base.args }
}

const fileBranch = (collection: 'materials' | 'artifacts', kind: string) => {
  const material = collection === 'materials', messageId = material ? field('f.value', 'messageId') : field('f.value', 'sourceMessageId')
  return `SELECT f.id,'${kind}' AS kind,${field('f.value', 'conversationId')} AS conversationId,f.value AS original,${field('f.value', 'name')} AS name,COALESCE(${field('f.value', material ? 'createdAt' : 'publishedAt')},'') AS time,${material ? field('m.value', 'senderId') : field('f.value', 'ownerAgentId')} AS actorId,${messageId} AS messageId,${material ? 'NULL' : field('f.value', 'logicalArtifactId')} AS logicalArtifactId,${material ? '0' : `COALESCE(${field('f.value', 'contentVersion')},0)`} AS contentVersion FROM records f LEFT JOIN records m ON m.collection='messages' AND m.id=${messageId} AND ${field('m.value', 'conversationId')}=${field('f.value', 'conversationId')} WHERE f.collection='${collection}' AND ${field('f.value', 'conversationId')}=? AND ${material ? `${messageId} IS NOT NULL AND m.id IS NOT NULL` : `${field('f.value', 'registrationSource')} IN ('publication','legacy_verified') AND ${field('f.value', 'logicalArtifactId')} IS NOT NULL AND ${validRefs('f.value')}`}`
}
export function conversationFilesSql(query: ConversationFileQuery) {
  const args: (string | number)[] = [query.conversationId, query.conversationId, query.conversationId], predicates = ['i.conversationId=?', visibleWorkConversationSql]
  if (query.kind) { predicates.push('i.kind=?'); args.push(query.kind) }
  if (query.actorId) { predicates.push('i.actorId=?'); args.push(query.actorId) }
  if (query.logicalArtifactId) { predicates.push("i.kind='artifact' AND i.logicalArtifactId=?"); args.push(query.logicalArtifactId) }
  else predicates.push("(i.kind='material' OR NOT EXISTS(SELECT 1 FROM records newer WHERE newer.collection='artifacts' AND json_extract(newer.value,'$.registrationSource') IN ('publication','legacy_verified') AND json_extract(newer.value,'$.conversationId')=i.conversationId AND json_extract(newer.value,'$.logicalArtifactId')=i.logicalArtifactId AND (COALESCE(json_extract(newer.value,'$.contentVersion'),0),COALESCE(json_extract(newer.value,'$.publishedAt'),''),newer.id)>(i.contentVersion,i.time,i.id)))")
  for (const term of query.name?.split(/\s+/).filter(Boolean) ?? []) { predicates.push('instr(lower(i.name),?)>0'); args.push(term) }
  if (query.from) { predicates.push('i.time>=?'); args.push(query.from) }
  if (query.to) { predicates.push('i.time<=?'); args.push(query.to) }
  if (query.fileType) { predicates.push('i.fileType=?'); args.push(query.fileType) }
  const before = readWorkViewCursor(query), pagePredicates = ['1']
  if (before) { pagePredicates.push('(time,id,kind)<(?,?,?)'); args.push(before.time, before.id, before.kind ?? '') }
  args.push((query.limit ?? WORK_VIEW_LIMITS.defaultPage) + 1)
  // An extension is data, never a path; the recursive CTE peels the last dot deterministically.
  return { sql: `WITH RECURSIVE originals AS (${fileBranch('materials', 'material')} UNION ALL ${fileBranch('artifacts', 'artifact')}), suffix(id,kind,rest) AS (SELECT id,kind,name FROM originals UNION ALL SELECT id,kind,substr(rest,instr(rest,'.')+1) FROM suffix WHERE instr(rest,'.')>0), typed AS (SELECT original.*,COALESCE((SELECT lower(rest) FROM suffix WHERE suffix.id=original.id AND suffix.kind=original.kind AND instr(rest,'.')=0 AND rest<>original.name LIMIT 1),CASE json_extract(original.original,'$.format') WHEN 'image' THEN 'image' WHEN 'txt' THEN 'text' WHEN 'markdown' THEN 'text' ELSE 'binary' END) AS fileType FROM originals original), base AS (SELECT i.*,json_extract(a.value,'$.name') AS actorName FROM typed i JOIN records c ON c.collection='conversations' AND c.id=i.conversationId LEFT JOIN records a ON a.collection='agents' AND a.id=i.actorId WHERE ${predicates.join(' AND ')}), page AS (SELECT * FROM base WHERE ${pagePredicates.join(' AND ')} ORDER BY time DESC,id DESC,kind DESC LIMIT ?) SELECT 0 AS ordinal,'' AS sortTime,'' AS sortId,'' AS sortKind,json_object('scopeEpoch',(SELECT json_extract(value,'$.epoch') FROM records WHERE collection='${WORK_VIEW_CLOCK}' AND id='current'),'revision',COALESCE((SELECT json_extract(value,'$.revision') FROM records WHERE collection='${WORK_VIEW_CLOCK}' AND id='current'),0),'total',(SELECT COUNT(*) FROM base)) AS value UNION ALL SELECT 1,time,id,kind,json_object('id',id,'conversationId',conversationId,'kind',kind,'name',name,'size',json_extract(original,'$.size'),'fileType',fileType,'actorId',actorId,'actorName',CASE WHEN actorId='user' THEN '我' ELSE actorName END,'createdAt',time,'sourceMessageId',messageId,'contentHash',json_extract(original,'$.contentHash'),'revision',json_extract(original,'$.revision'),'logicalArtifactId',logicalArtifactId,'contentVersion',CASE WHEN kind='artifact' THEN contentVersion ELSE NULL END,'versionCount',CASE WHEN kind='artifact' THEN (SELECT COUNT(*) FROM originals versions WHERE versions.kind='artifact' AND versions.conversationId=page.conversationId AND versions.logicalArtifactId=page.logicalArtifactId) ELSE NULL END,'adopted',json((SELECT json_object('artifactId',json_extract(adopt.value,'$.artifactId'),'contentVersion',json_extract(adopt.value,'$.contentVersion'),'contentHash',json_extract(adopt.value,'$.contentHash')) FROM records adopt WHERE adopt.collection='artifactAdoptionCurrent' AND adopt.id=page.logicalArtifactId AND json_extract(adopt.value,'$.conversationId')=page.conversationId)),'status',COALESCE(json_extract(original,'$.status'),json_extract(original,'$.contentStatus'),'unavailable'),'error',COALESCE(json_extract(original,'$.error'),json_extract(original,'$.contentError'))) FROM page ORDER BY ordinal,sortTime DESC,sortId DESC,sortKind DESC`, args }
}
