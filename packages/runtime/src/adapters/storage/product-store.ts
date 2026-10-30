/*
 * [OUTPUT]: 员工任务与定时计划在SQL分页前分流，员工历史包括其定时执行。
 * [OUTPUT]: 任务执行历史按原计划参与员工在SQL分页前筛选。
 * [OUTPUT]: 单次定时详情读取本次所有阶段；普通历史保留失败/中断的判断与协调，避免有原Run却显示空过程。
 * [OUTPUT]: 主聊天执行历史按已发布原消息关联定时私有Run，合并后统一分页；清理/撤权来源不再可见。
 * [OUTPUT]: 任务结果Run在原事务内固定Work/会话/员工、有界SELECT并只投影公开状态与计数。
 * [OUTPUT]: Explicit task pages filter current source/viewer rights before SQL LIMIT; project bounded notes/steps without loading all task records.
 * [OUTPUT]: 事务list支持固定status过滤，调用者决定恢复语义；无需读取已终态观察记录。
 * [OUTPUT]: 定时执行历史与计划最近结果在分页/统计前排除已删除墓碑。
 * [OUTPUT]: 公开消息write/transaction共用提交钩子，记录首次插入与更新；业务可见性在原事务提交前完成，内存/通知仅在成功提交后更新。
 * [OUTPUT]: 执行历史按occurrence持久runIds和会话身份先过滤后分页，旧共用会话的其他运行不混入。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 员工/群归属计划在SQL分页前筛选，固定更新时间/ID游标，不读取其他owner计划正文。
 * [OUTPUT]: 2026-10-14 事务内精确选择房间引用记录，供显式空闲历史归一，普通消息查询门槛保持。
 * [OUTPUT]: 父工作计数的文本亲和索引匹配关联SQL，避免每个列表项扫描全会话历史。
 * [OUTPUT]: 2026-10-11 持久执行证据、内容按需读取及Rovai执行窗口/变化游标，完整数据与UI缓存窗口分开。
 * [OUTPUT]: 执行历史/事件固定SQL分页，完整原文分段读取，列表不加载大正文；不丢弃持久原生结果。
 * [OUTPUT]: 2026-10-10 员工执行SQL在LIMIT前核当前成员/原来源/清理及可见范围，稳定分页只投影冻结配置；固定Trace按run/员工/会话有界读取，零业务写入。
 * [OUTPUT]: 工作/文件有界页与五组同条件计数同次SQL，变更代际同事务推进；范围变动使旧游标失效。
 * [INPUT]: 本地 SQLite 连接、当前聊天成员/附件接收范围与产品记录。
 * [OUTPUT]: 成员增删及材料deliveryScope变更同事务提升检索代际，旧员工筛选游标不能混入新接收范围。
 * [OUTPUT]: bobo 员工发现与组织回执 SQL 有界投影、同事务配置时钟；浏览器成果来源按 runId 在 SQL 限制20项，仅投影来源字段；R1 固定相关性/多词 SQL、正文有界队列与覆盖统计、原来源变更/撤权/清理同事务撤销正文，重启/恢复先清除未核验摘录；D6 历史/完成身份、inbox/自动化固定查询；原子读检查写与有界写锁等待、不重试已开始事务，备份和空间回收。
 * [POS]: 产品持久化边界；事务回调不得再调用外层存储方法；只读取证连接不执行迁移、索引失效或建表写入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createClient, type Client } from '@libsql/client'
import { taskPageSql, type TaskPageSqlQuery } from './task-page-sql'
import type { TrackedTaskListItem } from '@boai/shared/domain/tracked-tasks'
import { executionWindowPage } from '../../modules/conversations/execution-window'
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { advanceCandidateClock, candidateCursor, employeeCandidatesSql, readCandidateCursor } from '../../modules/bobo-collaboration/candidate-sql'
import type { BoboCollaborationReceipt, EmployeeCandidate, EmployeeCandidatePage, EmployeeCandidateQuery } from '@boai/shared/domain/bobo-collaboration'
import type { BrowserArtifactSource } from '@boai/shared/domain/artifacts'
import type { AutomationDefinition, AutomationHistoryPage, AutomationHistoryQuery, AutomationListQuery, AutomationListPage } from '@boai/shared/domain/automations'
import { AUTOMATION_ATTENTION_STATUSES, AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import { inboxSql, type InboxSqlRow } from '../../modules/inbox/inbox-sql'
import type { InboxQuery } from '@boai/shared/domain/inbox'
import type { ConversationCompletion, ConversationMessagePageQuery, ConversationSearchCoverage, ConversationSearchQuery } from '@boai/shared/domain/reading'
import { conversationMessagesSql, conversationSearchSql, conversationSearchTargetSql, firstUnreadCompletionSql, unreadCompletionCountSql, type ConversationMessageSqlRow, type ConversationSearchSqlRow, type ConversationSearchSqlTarget, type FirstUnreadCompletionSqlQuery } from '../../modules/conversations/reading-sql'
import { SEARCH_INDEX_CLOCK_COLLECTION, SEARCH_INDEX_CLOCK_ID, SEARCH_INDEX_COLLECTION, searchBodyCandidatesSql, searchBodyCoverageSql, searchBodyFailuresSql, type SearchBodyCandidate } from '../../modules/conversations/search-index-sql'
import { advanceWorkViewClock, conversationFilesSql, conversationFileQuerySchema, readWorkViewCursor, workViewQuerySchema, workViewsSql, workViewCursor, workViewTargetSql } from '../../modules/collaboration/work-view-sql'
import { WORK_VIEW_LIMITS, type WorkViewQuery, type WorkViewPage, type WorkViewItem, type ConversationFileQuery, type ConversationFilePage, type ConversationFileItem } from '@boai/shared/domain/work-views'
import type { WorkItem } from '@boai/shared/domain/work'
import type { EmployeeExecutionQuery, EmployeeExecutionSummary, ExecutionConfiguration } from '@boai/shared/domain/employee-executions'
import { EMPLOYEE_EXECUTION_LIMITS } from '@boai/shared/domain/employee-executions'
import type { AgentRun } from '@boai/shared/domain'
import type { StoredTraceSpan } from '@boai/shared/domain/traces'

const transactionAdmissionDelays = [10, 20, 40, 80, 160, 320]
const advanceSearchClockSql = `INSERT INTO records(collection,id,value) SELECT '${SEARCH_INDEX_CLOCK_COLLECTION}','${SEARCH_INDEX_CLOCK_ID}',json_object('id','${SEARCH_INDEX_CLOCK_ID}','revision',1) WHERE changes()>0 ON CONFLICT(collection,id) DO UPDATE SET value=json_set(records.value,'$.revision',COALESCE(json_extract(records.value,'$.revision'),0)+1)`
const rankingFields: Record<string, string[]> = {
  conversations: ['title', 'lastMessageAt', 'createdAt', 'agentIds'],
  messages: ['content', 'status', 'senderType', 'senderId', 'createdAt', 'conversationId'],
  materials: ['name', 'messageId', 'conversationId', 'createdAt', 'revision', 'contentHash', 'deliveryScope', 'authorizedAgentIds', 'status'],
  artifacts: ['name', 'conversationId', 'publishedAt', 'registrationSource', 'contentHash', 'contentVersion', 'logicalArtifactId', 'ownerAgentId', 'contentStatus', 'materialSources'],
}
function advanceRankingClock(collection: string, id: string, value?: string) {
  const fields = rankingFields[collection]
  if (!fields) return []
  const same = fields.map(field => `json_extract(previous.value,'$.${field}') IS json_extract(incoming.value,'$.${field}')`).join(' AND ')
  const eligible = collection === 'messages' ? "json_extract(VALUE,'$.status')='completed'" : collection === 'materials' ? "COALESCE(json_extract(VALUE,'$.messageId'),'')<>''" : collection === 'artifacts' ? "COALESCE(json_extract(VALUE,'$.registrationSource'),'')<>''" : undefined
  const oldEligible = eligible ? `EXISTS(SELECT 1 FROM records previous WHERE previous.collection=? AND previous.id=? AND ${eligible.replaceAll('VALUE', 'previous.value')})` : '1'
  const newEligible = eligible && value !== undefined ? `(SELECT ${eligible.replaceAll('VALUE', 'incoming.value')} FROM incoming)` : '0'
  const predicate = value === undefined ? 'EXISTS(SELECT 1 FROM records previous WHERE previous.collection=? AND previous.id=?)' : `NOT EXISTS(SELECT 1 FROM records previous CROSS JOIN incoming WHERE previous.collection=? AND previous.id=? AND ${same})`
  return [{ sql: `${value === undefined ? '' : 'WITH incoming(value) AS (SELECT ?) '}INSERT INTO records(collection,id,value) SELECT '${SEARCH_INDEX_CLOCK_COLLECTION}','${SEARCH_INDEX_CLOCK_ID}',json_object('id','${SEARCH_INDEX_CLOCK_ID}','revision',1) WHERE (${newEligible} OR ${oldEligible}) AND ${predicate} ON CONFLICT(collection,id) DO UPDATE SET value=json_set(records.value,'$.revision',COALESCE(json_extract(records.value,'$.revision'),0)+1)`, args: [...(value === undefined ? [] : [value]), ...(eligible ? [collection, id] : []), collection, id] }]
}

/** Derived bodies lose eligibility in the same source mutation, including material-derived artifacts. */
function invalidateSearchBodies(collection: string, id: string, value?: string) {
  if (collection !== 'materials' && collection !== 'artifacts' && collection !== 'conversationCleanup' && !(collection === 'conversations' && value === undefined)) return []
  const isFile = collection === 'materials' || collection === 'artifacts', args: (string | number)[] = []
  let predicate: string
  if (isFile) {
    predicate = 'id=?'; args.push(`${collection === 'materials' ? 'material' : 'artifact'}:${id}`)
    if (value !== undefined) { predicate += " AND json_extract(value,'$.sourceValue')<>?"; args.push(value) }
    if (collection === 'materials') { predicate = `(${predicate}) OR (json_extract(records.value,'$.kind')='artifact' AND EXISTS(SELECT 1 FROM json_each(json_extract(json_extract(records.value,'$.sourceValue'),'$.materialSources')) source WHERE json_extract(source.value,'$.id')=?))`; args.push(id) }
  } else { predicate = "json_extract(value,'$.conversationId')=?"; args.push(id) }
  return [{ sql: `DELETE FROM records WHERE collection='${SEARCH_INDEX_COLLECTION}' AND (${predicate})`, args }, { sql: advanceSearchClockSql, args: [] }]
}

export interface StoredRecord { collection: string; id: string; value: unknown }
export interface MessageCommit { message: import('@boai/shared/domain').Message; inserted: boolean }
export interface RecordTransaction {
  taskResultRuns(work: Pick<WorkItem, 'id' | 'conversationId' | 'ownerAgentId'>, limit: number): Promise<{ items: import('@boai/shared/domain/task-results').TaskResultRun[]; total: number }>
  conversationRecords(ids: string[]): Promise<StoredRecord[]>
  get<T>(collection: string, id: string): Promise<T | undefined>
  list<T>(collection: string, filter?: { status: string }): Promise<T[]>
  unreadCompletionCount(query: FirstUnreadCompletionSqlQuery): Promise<number>
  firstUnreadCompletion(query: FirstUnreadCompletionSqlQuery): Promise<ConversationCompletion | undefined>
  put(record: StoredRecord): Promise<void>
  remove(collection: string, id: string): Promise<void>
}

/** One local SQLite writer; every mutation is committed before it is acknowledged. */
export class ProductStore {
  private client!: Client
  private tail: Promise<unknown> = Promise.resolve()
  private messageCommit?: (tx: RecordTransaction, messages: MessageCommit[]) => Promise<() => void>
  /** Product reception is part of the original write transaction, before acknowledgement. */
  onMessageCommit(handler: (tx: RecordTransaction, messages: MessageCommit[]) => Promise<() => void>) { this.messageCommit = handler }
  constructor(readonly filename: string) {}
  /** Inspect an existing database without changing startup/index state or acquiring a writer. */
  static async openReadOnly(filename: string): Promise<Pick<ProductStore, 'load' | 'close'>> {
    if (!(await stat(filename)).isFile()) throw new Error('只读取证要求已有数据库文件')
    const store = new ProductStore(filename)
    // One connection keeps SQLite's connection-local query_only guard on every operation.
    store.client = createClient({ url: pathToFileURL(filename).href, concurrency: 1 })
    try {
      await store.client.execute('PRAGMA query_only=ON')
      await store.client.execute('SELECT 1 FROM records LIMIT 1')
      return store
    } catch (error) { store.client.close(); throw error }
  }
  async init() {
    await mkdir(dirname(this.filename), { recursive: true })
    this.client = createClient({ url: pathToFileURL(this.filename).href })
    await this.client.execute('PRAGMA journal_mode=WAL')
    await this.client.execute('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (collection, id))')
    const viewEpoch = randomUUID()
    await this.client.execute({ sql: "INSERT INTO records(collection,id,value) VALUES('workViewClock','current',json_object('id','current','revision',1,'epoch',?)) ON CONFLICT(collection,id) DO UPDATE SET value=json_set(records.value,'$.revision',COALESCE(json_extract(records.value,'$.revision'),0)+1,'$.epoch',?)", args: [viewEpoch, viewEpoch] })
    // Read projections use the existing records; these indexes add no second task authority.
    await this.client.batch([
      { sql: "CREATE INDEX IF NOT EXISTS work_view_scope ON records(json_extract(value,'$.conversationId'),json_extract(value,'$.createdAt') DESC,id DESC) WHERE collection='workItems'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS work_view_owner ON records(json_extract(value,'$.ownerAgentId'),json_extract(value,'$.status'),json_extract(value,'$.createdAt') DESC,id DESC) WHERE collection='workItems'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS work_view_parent ON records(json_extract(value,'$.parentWorkId'),json_extract(value,'$.conversationId')) WHERE collection='workItems'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS work_view_parent_text ON records(CAST(json_extract(value,'$.parentWorkId') AS TEXT),json_extract(value,'$.conversationId')) WHERE collection='workItems'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS conversation_file_scope ON records(collection,json_extract(value,'$.conversationId'),json_extract(value,'$.logicalArtifactId')) WHERE collection IN ('materials','artifacts')", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS agent_task_page ON records(json_extract(value,'$.updatedAt') DESC,id DESC) WHERE collection='agentTasks'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS agent_task_owner_page ON records(json_extract(value,'$.agentId'),json_extract(value,'$.updatedAt') DESC,id DESC) WHERE collection='agentTasks'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS employee_execution_scope ON records(json_extract(value,'$.agentId'),json_extract(value,'$.createdAt') DESC,id DESC) WHERE collection='runs'", args: [] },
      { sql: "CREATE INDEX IF NOT EXISTS execution_publication_source ON records(json_extract(value,'$.automationPublication.sourceConversationId'),json_extract(value,'$.automationPublication.sourceMessageId'),json_extract(value,'$.conversationId')) WHERE collection='messages'", args: [] },
    ], 'write')
    // A reopened or restored database never trusts old bytes before bounded source verification.
    await this.client.batch([{ sql: `UPDATE records SET value=json_remove(json_set(value,'$.status','pending'),'$.text') WHERE collection='${SEARCH_INDEX_COLLECTION}' AND json_extract(value,'$.status')='indexed'`, args: [] }, { sql: advanceSearchClockSql, args: [] }], 'write')
  }
  async load<T>(collection: string, scope?: { conversationId: string }): Promise<T[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute({ sql: `SELECT value FROM records WHERE collection = ?${scope ? " AND json_extract(value, '$.conversationId') = ?" : ''} ORDER BY rowid`, args: scope ? [collection, scope.conversationId] : [collection] })
      return result.rows.map(row => JSON.parse(String(row.value)) as T)
    })
  }
  get<T>(collection: string, id: string): Promise<T | undefined> {
    return this.enqueue(async () => {
      const result = await this.client.execute({ sql: 'SELECT value FROM records WHERE collection=? AND id=?', args: [collection, id] })
      return result.rows[0] ? JSON.parse(String(result.rows[0].value)) as T : undefined
    })
  }
  queryTrackedTaskPage(query: TaskPageSqlQuery): Promise<TrackedTaskListItem[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(taskPageSql(query))
      return result.rows.map(row => ({
        id: String(row.id), agentId: String(row.agentId), ...(row.conversationId == null ? {} : { conversationId: String(row.conversationId) }),
        title: String(row.title), status: String(row.status) as TrackedTaskListItem['status'], revision: Number(row.revision),
        createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), stepCount: Number(row.stepCount), completedStepCount: Number(row.completedStepCount),
        ...(row.nextStepTitle == null ? {} : { nextStepTitle: String(row.nextStepTitle) }), noteExcerpt: String(row.noteExcerpt), noteTruncated: Boolean(row.noteTruncated),
      }))
    })
  }
  queryAutomationDefinitions(query: AutomationListQuery) {
    return this.enqueue(async () => {
      const args: (string | number)[] = [], filters = ["d.collection='automations'", "json_extract(d.value,'$.deletedAt') IS NULL"]
      filters.push(query.purpose === 'employee-task' ? "json_extract(d.value,'$.purpose')='employee-task'" : "COALESCE(json_extract(d.value,'$.purpose'),'')!='employee-task'")
      if (query.owner) {
        filters.push("json_extract(d.value,'$.owner.kind')=?"); args.push(query.owner.kind)
        filters.push(`json_extract(d.value,'$.owner.${query.owner.kind === 'employee' ? 'employeeId' : 'conversationId'}')=?`)
        args.push(query.owner.kind === 'employee' ? query.owner.employeeId : query.owner.conversationId)
      }
      if (query.before) { filters.push("(json_extract(d.value,'$.updatedAt')<? OR (json_extract(d.value,'$.updatedAt')=? AND d.id<?))"); args.push(query.before.updatedAt, query.before.updatedAt, query.before.id) }
      const limit = Math.max(1, Math.min(query.limit ?? 30, 100))
      const result = await this.client.execute({ sql: `SELECT d.value,(SELECT json_object('id',o.id,'status',json_extract(o.value,'$.status'),'deliveryStatus',json_extract(o.value,'$.deliveryStatus'),'startedAt',json_extract(o.value,'$.startedAt'),'finishedAt',json_extract(o.value,'$.finishedAt')) FROM records o WHERE o.collection='automationOccurrences' AND json_extract(o.value,'$.deletedAt') IS NULL AND json_extract(o.value,'$.automationId')=d.id ORDER BY COALESCE(json_extract(o.value,'$.finishedAt'),json_extract(o.value,'$.startedAt')) DESC,o.id DESC LIMIT 1) AS latest FROM records d WHERE ${filters.join(' AND ')} ORDER BY json_extract(d.value,'$.updatedAt') DESC,d.id DESC LIMIT ?`, args: [...args, limit + 1] })
      const definitions = result.rows.slice(0, limit).map(row => ({ ...JSON.parse(String(row.value)) as AutomationDefinition, ...(row.latest ? { latestOccurrence: JSON.parse(String(row.latest)) as AutomationListPage['definitions'][number]['latestOccurrence'] } : {}) }))
      const last = definitions.at(-1)
      return { definitions, ...(result.rows.length > limit && last ? { nextCursor: { updatedAt: last.updatedAt, id: last.id } } : {}) }
    })
  }
  queryExecutionHistory(query: import('@boai/shared/domain/execution').ExecutionHistoryQuery) {
    return this.enqueue(async () => {
      const args: (string | number)[] = [query.conversationId, query.conversationId]
      // Publications are anchors, not copied runs. Resolve them before LIMIT so ordinary
      // and scheduled executions share one stable cursor and the same original evidence.
      const visibleConversation = `(json_extract(r.value,'$.conversationId')=? OR EXISTS (
        SELECT 1 FROM records source JOIN records published ON published.collection='messages'
        JOIN records target ON target.collection='conversations' AND target.id=json_extract(published.value,'$.conversationId')
        WHERE source.collection='conversations' AND source.id=json_extract(r.value,'$.conversationId')
          AND json_extract(source.value,'$.purpose')='automation'
          AND json_extract(published.value,'$.automationPublication.sourceConversationId')=source.id
          AND json_extract(published.value,'$.automationPublication.sourceMessageId')=m.id
          AND json_extract(published.value,'$.automationPublication.automationId')=json_extract(source.value,'$.automationId')
          AND json_extract(published.value,'$.automationPublication.occurrenceId')=json_extract(source.value,'$.occurrenceId')
          AND json_extract(m.value,'$.automationPublication') IS NULL
          AND target.id=? AND json_extract(target.value,'$.channel') IS NULL
          AND json_extract(target.value,'$.mergedInto') IS NULL AND COALESCE(json_extract(target.value,'$.purpose'),'personal')='personal'
          AND COALESCE(json_extract(target.value,'$.list.hidden'),0)=0
          AND NOT EXISTS (SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=target.id)
          AND NOT EXISTS (SELECT 1 FROM json_each(source.value,'$.agentIds') member WHERE member.value NOT IN (SELECT value FROM json_each(target.value,'$.agentIds')))
      ))`
      const phases = query.occurrenceId ? "1=1" : "(COALESCE(json_extract(r.value,'$.phase'),'execution')='execution' OR (json_extract(r.value,'$.phase') IN ('decision','coordination') AND json_extract(r.value,'$.status') IN ('failed','interrupted','cancelled')))"
      const filters = ["r.collection='runs'", visibleConversation, phases, "EXISTS (SELECT 1 FROM records c,json_each(json_extract(c.value,'$.agentIds')) member WHERE c.collection='conversations' AND c.id=json_extract(r.value,'$.conversationId') AND member.value=json_extract(r.value,'$.agentId') AND COALESCE(json_extract(c.value,'$.list.hidden'),0)=0)", "NOT EXISTS (SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=json_extract(r.value,'$.conversationId'))"]
      if (query.occurrenceId) { filters.push("EXISTS (SELECT 1 FROM records o,json_each(json_extract(o.value,'$.runIds')) run WHERE o.collection='automationOccurrences' AND o.id=? AND json_extract(o.value,'$.conversationId')=json_extract(r.value,'$.conversationId') AND run.value=r.id)"); args.push(query.occurrenceId) }
      if (query.agentId) { filters.push("json_extract(r.value,'$.agentId')=?"); args.push(query.agentId) }
      if (query.before) { filters.push("(json_extract(r.value,'$.createdAt')<? OR (json_extract(r.value,'$.createdAt')=? AND r.id<?))"); args.push(query.before.createdAt, query.before.createdAt, query.before.id) }
      const result = await this.client.execute({ sql: `SELECT json_remove(r.value,'$.toolEvents','$.draft','$.progress') AS value, substr(json_extract(m.value,'$.content'),1,1000) AS trigger FROM records r JOIN records m ON m.collection='messages' AND m.id=json_extract(r.value,'$.triggerMessageId') AND json_extract(m.value,'$.conversationId')=json_extract(r.value,'$.conversationId') WHERE ${filters.join(' AND ')} ORDER BY json_extract(r.value,'$.createdAt') DESC,r.id DESC LIMIT 21`, args })
      return result.rows.map(row => ({ run: JSON.parse(String(row.value)) as AgentRun, trigger: String(row.trigger ?? '') }))
    })
  }
  queryExecutionEvidence(runId: string, after = 0) {
    return this.enqueue(async () => {
      const result = await this.client.execute({ sql: `SELECT CASE WHEN length(value)>24000 THEN json_set(json_remove(value,'$.canonical.diffProjection'),'$.payload',json_object('deferred',json('true')),'$.deferred',json('true')) ELSE value END AS value FROM records WHERE collection='executionEvidence' AND json_extract(value,'$.runId')=? AND json_extract(value,'$.sequence')>? ORDER BY json_extract(value,'$.sequence') LIMIT 101`, args: [runId, after] })
      return result.rows.map(row => JSON.parse(String(row.value)) as import('@boai/shared/domain/execution').ExecutionEvidence)
    })
  }
  queryExecutionWindow(query: import('@boai/shared/domain/execution').ExecutionWindowQuery) {
    return this.enqueue(async () => {
      const projection = "CASE WHEN length(value)>24000 THEN json_set(json_remove(value,'$.canonical.diffProjection'),'$.payload',json_object('deferred',json('true')),'$.deferred',json('true')) ELSE value END AS value"
      const field = query.afterChangeSequence !== undefined ? 'revision' : 'sequence'
      const forward = query.afterChangeSequence !== undefined || query.afterSequence !== undefined
      const cursor = query.afterChangeSequence ?? query.afterSequence ?? query.beforeSequence
      const sql = `SELECT ${projection} FROM records WHERE collection='executionEvidence' AND json_extract(value,'$.runId')=?${cursor == null ? '' : ` AND json_extract(value,'$.${field}')${forward ? '>' : '<'}?`} ORDER BY json_extract(value,'$.${field}') ${forward ? 'ASC' : 'DESC'} LIMIT ?`
      const result = await this.client.execute({ sql, args: [query.runId, ...(cursor == null ? [] : [cursor]), query.limit + 1] })
      const counter = await this.client.execute({ sql: "SELECT value FROM records WHERE collection='executionClocks' AND id=?", args: [query.runId] })
      const active = query.afterChangeSequence !== undefined ? [] : (await this.client.execute({ sql: `SELECT ${projection} FROM records WHERE collection='executionEvidence' AND json_extract(value,'$.runId')=? AND json_extract(value,'$.canonical.phase')='started' ORDER BY json_extract(value,'$.sequence')`, args: [query.runId] })).rows
      const parse = (rows: typeof result.rows) => rows.map(row => JSON.parse(String(row.value)) as import('@boai/shared/domain/execution').ExecutionEvidence)
      return executionWindowPage(query, parse(result.rows), counter.rows[0] ? JSON.parse(String(counter.rows[0].value)) : { sequence: 0, revision: 0 }, parse(active))
    })
  }
  queryExecutionContent(runId: string, evidenceId: string, offset: number) {
    return this.enqueue(async () => {
      const result = await this.client.execute({ sql: "SELECT substr(value,?,24000) AS content,length(value) AS contentLength,json_extract(value,'$.revision') AS revision FROM records WHERE collection='executionEvidence' AND id=? AND json_extract(value,'$.runId')=?", args: [offset + 1, evidenceId, runId] })
      const row = result.rows[0]
      if (!row) throw new Error('执行内容已清理')
      return { content: String(row.content), length: Number(row.contentLength), revision: Number(row.revision), next: offset + 24000 < Number(row.contentLength) ? offset + 24000 : undefined }
    })
  }
  queryEmployeeExecutions(query: EmployeeExecutionQuery): Promise<EmployeeExecutionSummary[]>
  queryEmployeeExecutions(query: EmployeeExecutionQuery, runId: string): Promise<(EmployeeExecutionSummary & { run: AgentRun })[]>
  queryEmployeeExecutions(query: EmployeeExecutionQuery, runId?: string): Promise<(EmployeeExecutionSummary & { run: AgentRun })[]> {
    return this.enqueue(async () => {
      const clauses = ["r.collection='runs'", "json_extract(r.value,'$.agentId')=?", "COALESCE(json_extract(c.value,'$.list.hidden'),0)=0",
        "EXISTS(SELECT 1 FROM json_each(c.value,'$.agentIds') member WHERE member.value=?)",
        "NOT EXISTS(SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=c.id)"]
      const args: (string | number)[] = [query.agentId, query.agentId]
      if (query.conversationId) { clauses.push('c.id=?'); args.push(query.conversationId) }
      if (runId) { clauses.push('r.id=?'); args.push(runId) }
      if (query.cursor && !runId) {
        clauses.push("(json_extract(r.value,'$.createdAt')<? OR (json_extract(r.value,'$.createdAt')=? AND r.id<?))")
        args.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.id)
      }
      args.push(runId ? 1 : EMPLOYEE_EXECUTION_LIMITS.pageSize + 1)
      const result = await this.client.execute({ sql: `SELECT ${runId ? 'r.value' : "json_remove(r.value,'$.toolEvents','$.draft','$.error')"} AS run,
        json_extract(c.value,'$.title') AS title,
        COALESCE(json_extract(s.value,'$.agent.executionBackend.kind'),json_extract(r.value,'$.backend.kind'),CASE WHEN s.id IS NOT NULL THEN 'mastra-model' ELSE 'unknown' END) AS kind,
        json_extract(s.value,'$.runtimeProfile.name') AS profileName,
        json_extract(s.value,'$.connection.name') AS connectionName,
        COALESCE(NULLIF(json_extract(r.value,'$.backend.modelId'),''),json_extract(s.value,'$.agent.modelId')) AS modelId,
        json_extract(s.value,'$.connection.defaultModel') AS defaultModel,
        json_extract(s.value,'$.agent.configVersion') AS configVersion,
        COALESCE(json_extract(s.value,'$.runtimeProfile.id'),json_extract(r.value,'$.backend.profileId')) AS profileId,
        COALESCE(json_extract(s.value,'$.runtimeProfile.revision'),json_extract(r.value,'$.backend.profileRevision')) AS profileRevision,
        COALESCE(json_extract(s.value,'$.runtimeProfile.verified.version'),json_extract(r.value,'$.backend.program.version')) AS programVersion
        FROM records r JOIN records c ON c.collection='conversations' AND c.id=json_extract(r.value,'$.conversationId')
        JOIN records employee ON employee.collection='agents' AND employee.id=json_extract(r.value,'$.agentId')
        JOIN records source ON source.collection='messages' AND source.id=json_extract(r.value,'$.triggerMessageId') AND json_extract(source.value,'$.conversationId')=c.id
        LEFT JOIN records s ON s.collection='snapshots' AND s.id=r.id
        WHERE ${clauses.join(' AND ')} ORDER BY json_extract(r.value,'$.createdAt') DESC,r.id DESC LIMIT ?`, args })
      return result.rows.map(row => {
        const run = JSON.parse(String(row.run)) as AgentRun
        const kind = String(row.kind) as ExecutionConfiguration['kind']
        const label = String(row.profileName ?? row.connectionName ?? (kind === 'unknown' ? '执行配置尚未记录' : kind === 'mastra-model' ? '模型 API（历史配置未记录）' : kind === 'codex-local' ? 'Codex' : kind === 'claude-local' ? 'Claude' : 'ACP'))
        return { run, conversationTitle: String(row.title), configuration: { kind, label, modelId: String(row.modelId || row.defaultModel || ''),
          ...(row.configVersion != null ? { configVersion: Number(row.configVersion) } : {}),
          ...(row.profileId != null ? { profileId: String(row.profileId) } : {}),
          ...(row.profileRevision != null ? { profileRevision: Number(row.profileRevision) } : {}),
          ...(row.programVersion != null ? { programVersion: String(row.programVersion) } : {}) } }
      })
    })
  }
  queryExecutionTrace(runId: string, agentId: string, conversationId: string): Promise<{ spans: StoredTraceSpan[]; truncated: boolean }> {
    return this.enqueue(async () => {
      const result = await this.client.execute({ sql: "SELECT value FROM records WHERE collection='traceSpans' AND json_extract(value,'$.runId')=? AND json_extract(value,'$.agentId')=? AND json_extract(value,'$.conversationId')=? ORDER BY rowid LIMIT ?", args: [runId, agentId, conversationId, EMPLOYEE_EXECUTION_LIMITS.traceSpans + 1] })
      return { spans: result.rows.slice(0, EMPLOYEE_EXECUTION_LIMITS.traceSpans).map(row => JSON.parse(String(row.value)) as StoredTraceSpan), truncated: result.rows.length > EMPLOYEE_EXECUTION_LIMITS.traceSpans }
    })
  }
  queryWorkViews(query: WorkViewQuery): Promise<WorkViewPage> {
    query = workViewQuerySchema.parse(query)
    return this.enqueue(async () => {
      const result = await this.client.execute(workViewsSql(query))
      const metadata = JSON.parse(String(result.rows[0].value)) as Omit<WorkViewPage, 'items'>
      const previous = readWorkViewCursor(query)
      if (previous && (previous.revision !== metadata.revision || previous.scopeEpoch !== metadata.scopeEpoch)) throw new Error('STALE_CURSOR: 工作或可见范围已变化，请刷新')
      const rows = result.rows.slice(1).map(row => JSON.parse(String(row.value)) as WorkViewItem), limit = query.limit ?? WORK_VIEW_LIMITS.defaultPage
      const items = rows.slice(0, limit), last = items.at(-1)
      return { ...metadata, items, ...(rows.length > limit && last ? { nextCursor: workViewCursor(query, metadata.revision, metadata.scopeEpoch!, last.work.createdAt, last.work.id) } : {}) }
    })
  }
  queryConversationFiles(query: ConversationFileQuery): Promise<ConversationFilePage> {
    query = conversationFileQuerySchema.parse(query)
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationFilesSql(query))
      const metadata = JSON.parse(String(result.rows[0].value)) as Omit<ConversationFilePage, 'items'>
      const previous = readWorkViewCursor(query)
      if (previous && (previous.revision !== metadata.revision || previous.scopeEpoch !== metadata.scopeEpoch)) throw new Error('STALE_CURSOR: 文件或可见范围已变化，请刷新')
      const rows = result.rows.slice(1).map(row => JSON.parse(String(row.value)) as ConversationFileItem), limit = query.limit ?? WORK_VIEW_LIMITS.defaultPage
      const items = rows.slice(0, limit), last = items.at(-1)
      return { ...metadata, items, ...(rows.length > limit && last ? { nextCursor: workViewCursor(query, metadata.revision, metadata.scopeEpoch!, last.createdAt, last.id, last.kind) } : {}) }
    })
  }
  workViewTarget(workId: string): Promise<WorkItem | undefined> {
    return this.enqueue(async () => {
      const result = await this.client.execute(workViewTargetSql(workId))
      return result.rows.length ? JSON.parse(String(result.rows[0].work)) as WorkItem : undefined
    })
  }
  findBoboEmployeeCandidates(query: EmployeeCandidateQuery): Promise<EmployeeCandidatePage> {
    return this.enqueue(async () => {
      const result = await this.client.execute(employeeCandidatesSql(query))
      const metadata = JSON.parse(String(result.rows[0].value)) as {revision:number;clock:number}
      const previous = readCandidateCursor(query)
      if (previous && previous.clock !== metadata.clock) throw new Error('STALE_CURSOR: 员工配置已变化，请重新查找')
      const all = result.rows.slice(1).map(row => JSON.parse(String(row.value)) as EmployeeCandidate), limit = query.limit ?? 20
      const employees = all.slice(0, limit)
      return { employees, revision: metadata.revision, ...(all.length > limit ? { cursor: candidateCursor(query, metadata.clock, employees.at(-1)!.agentId) } : {}) }
    })
  }
  /** No private employee instructions or workspace paths are parsed for the core result list. */
  listBoboOperations(conversationId:string):Promise<BoboCollaborationReceipt[]> {
    return this.enqueue(async () => {
      const result=await this.client.execute({sql:`SELECT json_object('id',o.id,'requestId',json_extract(o.value,'$.requestId'),'version',json_extract(o.value,'$.version'),'sourceConversationId',json_extract(o.value,'$.sourceConversationId'),'mode',json_extract(o.value,'$.mode'),'goal',json_extract(o.value,'$.goal'),'status',json_extract(o.value,'$.status'),'createdAt',json_extract(o.value,'$.createdAt'),'committedAt',json_extract(o.value,'$.committedAt'),'error',json_extract(o.value,'$.error'),'existingMembers',json(COALESCE(json_extract(o.value,'$.existingMembers'),'[]')),'agents',json(COALESCE((SELECT json_group_array(json_object('id',json_extract(member.value,'$.id'),'name',json_extract(member.value,'$.name'),'role',json_extract(member.value,'$.role'),'color',json_extract(member.value,'$.color'),'configVersion',json_extract(member.value,'$.configVersion'))) FROM json_each(json_extract(o.value,'$.agents')) member),'[]')),'groupConversationId',json_extract(o.value,'$.groupConversationId'),'groupTitle',json_extract(o.value,'$.conversation.title'),'announcementMessageId',json_extract(o.value,'$.announcement.id'),'groupRootWorkId',json_extract(o.value,'$.groupRootWorkId'),'startIntentId',json_extract(o.value,'$.startIntentId'),'startStatus',(SELECT json_extract(value,'$.status') FROM records WHERE collection='collaborationStarts' AND id=json_extract(o.value,'$.startIntentId')),'sourceCleared',json_extract(o.value,'$.sourceCleared'),'groupCleared',json_extract(o.value,'$.groupCleared')) AS value FROM records o WHERE o.collection='boboCollaborations' AND json_extract(o.value,'$.sourceConversationId')=? AND COALESCE(json_extract(o.value,'$.sourceCleared'),0)<>1 ORDER BY o.rowid DESC LIMIT 30`,args:[conversationId]})
      return result.rows.map(row=>JSON.parse(String(row.value)) as BoboCollaborationReceipt)
    })
  }
  /** Source projection is bounded in SQLite before parsing any private historical rows. */
  browserSourcesForRun(runId:string):Promise<BrowserArtifactSource[]> {
    return this.enqueue(async()=>{
      const result=await this.client.execute({sql:"SELECT json_object('url',json_extract(value,'$.url'),'title',json_extract(value,'$.title'),'obtainedAt',json_extract(value,'$.obtainedAt'),'pageVersion',json_extract(value,'$.pageVersion')) AS value FROM records WHERE collection='browserEvidence' AND json_extract(value,'$.runId')=? ORDER BY rowid DESC LIMIT 20",args:[runId]})
      return result.rows.map(row=>JSON.parse(String(row.value)) as BrowserArtifactSource).reverse()
    })
  }
  /** Stable keyset pagination: new inserts and removals cannot shift an older page's boundary. */
  automationHistory(query: AutomationHistoryQuery & { limit: number; id?: string }): Promise<AutomationHistoryPage> {
    return this.enqueue(async () => {
      const where = ["collection = 'automationOccurrences'", "json_extract(value, '$.deletedAt') IS NULL"], args: (string | number)[] = []
      if (query.id) { where.push('id = ?'); args.push(query.id) }
      if (query.automationId) { where.push("json_extract(value, '$.automationId') = ?"); args.push(query.automationId) }
      if (!query.employeeId && !query.id && !query.automationId) where.push("COALESCE(json_extract(o.value,'$.purpose'),'')!='employee-task'")
      if (query.employeeId) { where.push("EXISTS (SELECT 1 FROM json_each(json_extract(o.value, '$.plan.employeeIds')) member WHERE member.value = ?)"); args.push(query.employeeId) }
      if (query.search?.trim()) { where.push("instr(lower(json_extract(value, '$.name')), lower(?)) > 0"); args.push(query.search.trim()) }
      if (query.status === 'active') { where.push(`json_extract(value, '$.status') IN (${AUTOMATION_ONGOING_STATUSES.map(() => '?').join(',')})`); args.push(...AUTOMATION_ONGOING_STATUSES) }
      if (query.status === 'completed') where.push("json_extract(value, '$.status') = 'completed'")
      if (query.attentionOnly || query.status === 'attention') {
        // Mirror automationNeedsAttention before LIMIT, so old unresolved records cannot disappear behind recent successes.
        where.push(`(json_extract(value, '$.status') IN (${AUTOMATION_ATTENTION_STATUSES.map(() => '?').join(',')}) OR json_extract(value, '$.attentionReason') = 'authorization' OR (json_extract(value, '$.status') = 'cancelled' AND json_extract(value, '$.cancellationCause') = 'budget') OR (json_extract(value, '$.status') = 'completed' AND json_extract(value, '$.deliveryStatus') IN ('blocked', 'partial')))`)
        args.push(...AUTOMATION_ATTENTION_STATUSES)
      }
      if (query.before) {
        where.push("(json_extract(value, '$.startedAt'), id) < (?, ?)")
        args.push(query.before.startedAt, query.before.id)
      }
      args.push(query.limit + 1)
      const result = await this.client.execute({ sql: `SELECT value, (SELECT json_group_array(json(n.value)) FROM records n WHERE n.collection = 'automationNotices' AND json_extract(n.value, '$.occurrenceId') = o.id) AS notices FROM records o WHERE ${where.join(' AND ')} ORDER BY json_extract(value, '$.startedAt') DESC, id DESC LIMIT ?`, args })
      const rows = result.rows.map(row => ({ ...JSON.parse(String(row.value)), notices: JSON.parse(String(row.notices)) })) as AutomationHistoryPage['occurrences']
      const occurrences = rows.slice(0, query.limit), last = occurrences.at(-1)
      return { occurrences, ...(rows.length > query.limit && last ? { nextCursor: { startedAt: last.startedAt, id: last.id } } : {}) }
    })
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.catch(() => undefined)
    return next
  }
  /** Fixed host-owned inbox SELECT; renderer only supplies typed filters and a bounded cursor. */
  inboxRows(query: InboxQuery & { limit: number; id?: string }): Promise<InboxSqlRow[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(inboxSql(query))
      return result.rows.map(row => ({ id: String(row.id), kind: String(row.kind), sourceCollection: String(row.sourceCollection), sourceId: String(row.sourceId), time: String(row.time), conversation: String(row.conversation), agent: row.agent == null ? null : String(row.agent), message: row.message == null ? null : String(row.message), artifact: row.artifact == null ? null : String(row.artifact), source: String(row.source) }))
    })
  }
  /** Fixed full-history queries filter before LIMIT and never infer another object's identity. */
  conversationSearchRows(query: ConversationSearchQuery & { limit: number }): Promise<ConversationSearchSqlRow[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationSearchSql(query))
      return result.rows.map(row => ({ id: String(row.id), kind: String(row.kind), time: String(row.time), conversation: String(row.conversation), source: String(row.source), body: row.body == null ? null : String(row.body), score: Number(row.score), completion: row.completion == null ? null : String(row.completion) }))
    })
  }
  conversationSearchTarget(target: ConversationSearchSqlTarget): Promise<ConversationSearchSqlRow | null> {
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationSearchTargetSql(target)), row = result.rows[0]
      return row ? { id: String(row.id), kind: String(row.kind), time: String(row.time), conversation: String(row.conversation), source: String(row.source), body: row.body == null ? null : String(row.body), score: Number(row.score), completion: row.completion == null ? null : String(row.completion) } : null
    })
  }
  searchBodyCandidates(query: ConversationSearchQuery, limit: number): Promise<SearchBodyCandidate[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(searchBodyCandidatesSql(query, limit))
      return result.rows.map(row => ({ id: String(row.id), kind: String(row.kind) as SearchBodyCandidate['kind'], conversationId: String(row.conversationId), source: String(row.source), conversation: String(row.conversation) }))
    })
  }
  searchBodyCoverage(query: ConversationSearchQuery): Promise<ConversationSearchCoverage> {
    return this.enqueue(async () => {
      const result = await this.client.execute(searchBodyCoverageSql(query)), row = result.rows[0]
      const failures = await this.client.execute(searchBodyFailuresSql(query))
      const pending = Number(row.pending)
      return { total: Number(row.total), indexed: Number(row.indexed), pending, failed: Number(row.failed), skipped: Number(row.skipped), indexRevision: Number(row.revision ?? 0), batchProcessed: 0, hasMore: pending > 0, ...(failures.rows.length ? { failures: failures.rows.map(failure => ({ kind: String(failure.kind) as 'material' | 'artifact', id: String(failure.id), name: String(failure.name), reason: String(failure.reason ?? '正文无法核读') })) } : {}) }
    })
  }
  conversationMessageRows(query: Pick<ConversationMessagePageQuery, 'conversationId' | 'before' | 'after'> & { limit: number }): Promise<ConversationMessageSqlRow[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationMessagesSql(query))
      return result.rows.map(row => ({ source: String(row.source), completion: row.completion == null ? null : String(row.completion) }))
    })
  }
  write(records: StoredRecord[], removals: { collection: string; id: string }[] = []): Promise<void> {
    if (this.messageCommit && records.some(record => record.collection === 'messages')) {
      const snapshot = structuredClone(records), removed = structuredClone(removals)
      return this.transaction(async tx => {
        for (const record of snapshot) await tx.put(record)
        for (const record of removed) await tx.remove(record.collection, record.id)
      })
    }
    // Serialize now so a later in-memory change cannot alter this transaction.
    const statements = records.flatMap(record => { const value = JSON.stringify(record.value); return [...advanceWorkViewClock(record.collection), ...advanceCandidateClock(record.collection), ...advanceRankingClock(record.collection, record.id, value), ...invalidateSearchBodies(record.collection, record.id, value), { sql: 'INSERT INTO records(collection,id,value) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value', args: [record.collection, record.id, value] }] })
    statements.push(...removals.flatMap(record => [...advanceWorkViewClock(record.collection), ...advanceCandidateClock(record.collection), ...advanceRankingClock(record.collection, record.id), ...invalidateSearchBodies(record.collection, record.id), { sql: 'DELETE FROM records WHERE collection=? AND id=?', args: [record.collection, record.id] }]))
    return this.enqueue(async () => { if (statements.length) await this.client.batch(statements, 'write') })
  }
  /** BEGIN IMMEDIATE protects the read/check/write sequence, including other writers. */
  transaction<T>(operation: (records: RecordTransaction) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const transaction = await this.beginWriteTransaction()
      try {
        const messages = new Map<string, MessageCommit>()
        const records: RecordTransaction = {
          taskResultRuns: async (work, limit) => {
            const args = [work.id, work.conversationId, work.ownerAgentId]
            const scope = "collection='runs' AND json_extract(value,'$.workId')=? AND json_extract(value,'$.conversationId')=? AND json_extract(value,'$.agentId')=?"
            const count = await transaction.execute({ sql: `SELECT count(*) AS total FROM records WHERE ${scope}`, args })
            const result = await transaction.execute({ sql: `SELECT json_object('id',id,'conversationId',json_extract(value,'$.conversationId'),'agentId',json_extract(value,'$.agentId'),'status',json_extract(value,'$.status'),'phase',json_extract(value,'$.phase'),'createdAt',json_extract(value,'$.createdAt'),'finishedAt',json_extract(value,'$.finishedAt'),'messageId',json_extract(value,'$.messageId'),'triggerMessageId',json_extract(value,'$.triggerMessageId'),'error',substr(json_extract(value,'$.error'),1,2000),'errorTruncated',CASE WHEN length(json_extract(value,'$.error'))>2000 THEN json('true') ELSE json('false') END,'toolCounts',json_object('completed',(SELECT count(*) FROM json_each(records.value,'$.toolEvents') tool WHERE json_extract(tool.value,'$.status')='completed'),'failed',(SELECT count(*) FROM json_each(records.value,'$.toolEvents') tool WHERE json_extract(tool.value,'$.status')='failed'),'running',(SELECT count(*) FROM json_each(records.value,'$.toolEvents') tool WHERE json_extract(tool.value,'$.status')='running'))) AS summary FROM records WHERE ${scope} ORDER BY json_extract(value,'$.createdAt') DESC,id DESC LIMIT ?`, args: [...args, limit] })
            return { items: result.rows.map(row => { const summary = JSON.parse(String(row.summary)); for (const key of Object.keys(summary)) if (summary[key] === null) delete summary[key]; return summary }), total: Number(count.rows[0].total) }
          },
          conversationRecords: async ids => {
            if (!ids.length) return []
            const placeholders = ids.map(() => '?').join(',')
            const result = await transaction.execute({ sql: `SELECT collection,id,value FROM records WHERE collection<>'conversations' AND EXISTS(SELECT 1 FROM json_tree(records.value) ref WHERE ref.type='text' AND ref.value IN (${placeholders}) AND (ref.key IN ('conversationId','sourceConversationId','groupConversationId','coreConversationId') OR ref.fullkey LIKE '%.conversation.id' OR ref.fullkey LIKE '$.conversationIds[%]'))`, args: ids })
            return result.rows.map(row => ({ collection: String(row.collection), id: String(row.id), value: JSON.parse(String(row.value)) }))
          },
          get: async <R>(collection: string, id: string) => {
            const result = await transaction.execute({ sql: 'SELECT value FROM records WHERE collection=? AND id=?', args: [collection, id] })
            return result.rows.length ? JSON.parse(String(result.rows[0].value)) as R : undefined
          },
          list: async <R>(collection: string, filter?: { status: string }) => {
            const result = await transaction.execute({ sql: `SELECT value FROM records WHERE collection=?${filter ? " AND json_extract(value,'$.status')=?" : ''} ORDER BY rowid`, args: filter ? [collection, filter.status] : [collection] })
            return result.rows.map(row => JSON.parse(String(row.value)) as R)
          },
          unreadCompletionCount: async query => Number((await transaction.execute(unreadCompletionCountSql(query))).rows[0].count),
          firstUnreadCompletion: async query => {
            const result = await transaction.execute(firstUnreadCompletionSql(query))
            return result.rows.length ? JSON.parse(String(result.rows[0].completion)) as ConversationCompletion : undefined
          },
          put: async record => {
            const value = JSON.stringify(record.value)
            if (this.messageCommit && record.collection === 'messages') {
              const inserted = messages.get(record.id)?.inserted ?? !(await records.get('messages', record.id))
              messages.set(record.id, { message: JSON.parse(value), inserted })
            }
            for (const statement of advanceWorkViewClock(record.collection)) await transaction.execute(statement)
            for (const statement of advanceCandidateClock(record.collection)) await transaction.execute(statement)
            for (const statement of advanceRankingClock(record.collection, record.id, value)) await transaction.execute(statement)
            for (const statement of invalidateSearchBodies(record.collection, record.id, value)) await transaction.execute(statement)
            await transaction.execute({ sql: 'INSERT INTO records(collection,id,value) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value', args: [record.collection, record.id, value] })
          },
          remove: async (collection, id) => {
            if (collection === 'messages') messages.delete(id)
            for (const statement of advanceWorkViewClock(collection)) await transaction.execute(statement)
            for (const statement of advanceCandidateClock(collection)) await transaction.execute(statement)
            for (const statement of advanceRankingClock(collection, id)) await transaction.execute(statement)
            for (const statement of invalidateSearchBodies(collection, id)) await transaction.execute(statement)
            await transaction.execute({ sql: 'DELETE FROM records WHERE collection=? AND id=?', args: [collection, id] })
          },
        }
        const result = await operation(records)
        const committed = messages.size && this.messageCommit ? await this.messageCommit(records, [...messages.values()]) : undefined
        await transaction.commit()
        committed?.()
        return result
      } catch (error) {
        if (!transaction.closed) await transaction.rollback()
        throw error
      } finally { transaction.close() }
    })
  }
  private async beginWriteTransaction() {
    for (let attempt = 0; ; attempt++) {
      try { return await this.client.transaction('write') }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_BUSY')) throw error
        // libsql 0.5.29 can retain the failed BEGIN statement in its connection pool.
        // No transaction began and this store's reads/writes are queued, so discard that idle pool.
        this.client.close()
        this.client = createClient({ url: pathToFileURL(this.filename).href })
        if (attempt >= transactionAdmissionDelays.length) throw error
        // Only retry acquiring BEGIN. The callback and commit are never replayed, even on SQLITE_BUSY.
        await new Promise(resolve => setTimeout(resolve, transactionAdmissionDelays[attempt]))
      }
    }
  }
  backup(destination: string): Promise<void> {
    return this.enqueue(async () => {
      await this.client.execute({ sql: 'VACUUM INTO ?', args: [destination] })
    })
  }
  compact(): Promise<void> {
    return this.enqueue(async () => {
      await this.client.execute('VACUUM')
      await this.client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    })
  }
  async close() { await this.tail; this.client.close() }
}
