/*
 * [INPUT]: 有界员工查询、当前通讯录/配置时钟与受管资源记录。
 * [OUTPUT]: SQL 先过滤停用/清理/ACP/无模型员工，再限制结果与能力摘要；合格 Mastra 员工浏览器默认可用且不读取旧开关；游标绑定条件和配置代际，不返回私有规则、凭据或路径。
 * [POS]: bobo 员工发现固定 SQL，不读取聊天或记忆。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { EmployeeCandidateQuery } from '../../../shared/domain/bobo-collaboration'
export const candidateClockCollection = 'boboCandidateClock'
export const candidateClockId = 'employees'
export function advanceCandidateClock(collection: string) {
  if (!['agents', 'connections', 'resources', 'contactDeletions', 'contactList'].includes(collection)) return []
  return [{ sql: `INSERT INTO records(collection,id,value) VALUES('${candidateClockCollection}','${candidateClockId}',json_object('id','${candidateClockId}','revision',1)) ON CONFLICT(collection,id) DO UPDATE SET value=json_set(records.value,'$.revision',COALESCE(json_extract(records.value,'$.revision'),0)+1)`, args: [] }]
}
const signature = (query: EmployeeCandidateQuery) => createHash('sha256').update(JSON.stringify({ search: query.search ?? '', limit: query.limit ?? 20 })).digest('hex')
export function candidateCursor(query: EmployeeCandidateQuery, clock: number, after: string) { return Buffer.from(JSON.stringify({ version: 1, signature: signature(query), clock, after })).toString('base64url') }
export function readCandidateCursor(query: EmployeeCandidateQuery): { clock: number; after: string } | undefined {
  if (!query.cursor) return undefined
  try {
    const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString())
    if (value.version !== 1 || value.signature !== signature(query) || !Number.isSafeInteger(value.clock) || typeof value.after !== 'string' || value.after.length > 200) throw new Error()
    return value
  } catch { throw new Error('STALE_CURSOR: 员工查询条件或游标已失效，请重新查找') }
}
export function employeeCandidatesSql(query: EmployeeCandidateQuery) {
  const cursor = readCandidateCursor(query), args: (string | number)[] = [query.search ?? '', query.search ?? '', query.search ?? '', cursor?.after ?? '', (query.limit ?? 20) + 1]
  const resources = (kind: 'skill' | 'knowledge') => `COALESCE((SELECT json_group_array(json_object('id',id,'name',name)) FROM (SELECT r.id,substr(json_extract(r.value,'$.name'),1,100) AS name FROM records r WHERE r.collection='resources' AND json_extract(r.value,'$.kind')='${kind}' AND (json_extract(r.value,'$.ownerAgentId') IS NULL OR json_extract(r.value,'$.ownerAgentId')=a.id) AND r.id IN (SELECT value FROM json_each(json_extract(a.value,'$.${kind === 'skill' ? 'skillIds' : 'knowledgeIds'}'))) ORDER BY r.id LIMIT 20)),json('[]'))`
  return { sql: `WITH candidates AS (SELECT a.id, json_object('agentId',a.id,'name',substr(json_extract(a.value,'$.name'),1,100),'role',substr(json_extract(a.value,'$.role'),1,1000),'configVersion',json_extract(a.value,'$.configVersion'),'capabilities',json_object('browser',json('true'),'commands',json(CASE WHEN json_extract(a.value,'$.allowCommands')=1 THEN 'true' ELSE 'false' END),'skills',json(${resources('skill')}),'knowledge',json(${resources('knowledge')}))) AS value
    FROM records a JOIN records c ON c.collection='connections' AND c.id=json_extract(a.value,'$.connectionId')
    WHERE a.collection='agents' AND a.id<>'bobo' AND COALESCE(json_extract(a.value,'$.systemRole'),'')<>'core' AND json_extract(a.value,'$.active')=1 AND json_extract(a.value,'$.configVersion')>0 AND COALESCE(json_extract(a.value,'$.executionBackend.kind'),'mastra-model')='mastra-model'
      AND length(trim(COALESCE(NULLIF(json_extract(a.value,'$.modelId'),''),json_extract(c.value,'$.defaultModel'),'')))>0
      AND NOT EXISTS (SELECT 1 FROM records d,json_each(json_extract(d.value,'$.agentIds')) member WHERE d.collection='contactDeletions' AND member.value=a.id)
      AND (?='' OR instr(lower(json_extract(a.value,'$.name')),lower(?))>0 OR instr(lower(json_extract(a.value,'$.role')),lower(?))>0)
      AND a.id>? ORDER BY a.id LIMIT ?)
    SELECT 'metadata' AS kind,json_object('revision',COALESCE((SELECT json_extract(value,'$.revision') FROM records WHERE collection='contactList' AND id='contacts'),0),'clock',COALESCE((SELECT json_extract(value,'$.revision') FROM records WHERE collection='${candidateClockCollection}' AND id='${candidateClockId}'),0)) AS value UNION ALL SELECT 'candidate' AS kind,value FROM candidates`, args }
}
