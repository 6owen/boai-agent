/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 公开回复精确关联；仅当前来源本次请求完成交付才自动切版，执行中/失败/多产物与历史请求保持阅读。
 * [INPUT]: 文件修改持久请求、宿主回执和并发工作结果。
 * [OUTPUT]: 未知不重放、来源白名单/身份校验、只关联真实请求的文件回复与交付。
 * [POS]: 文件侧边编辑合同单元回归。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { describe, expect, it } from 'vitest'
import type { ConversationDetail, Message } from '../packages/shared/src/domain'
import { completedFileEditArtifact, fileEditKey, fileEditReceiptMatches, fileEditResults, materialEditInput, restoreFileEdits, type FileEditRequest } from '../apps/electron/src/renderer/components/detail-panel/file-edit-state'

const source: FileEditRequest['source'] = { kind: 'material', id: 'material-a', conversationId: 'room-a', name: '计划.md', contentHash: 'a'.repeat(64), revision: 2, parseVersion: 'text-v1' }
const request: FileEditRequest = { id: 'request-a', source, agentId: 'employee-a', content: '修改第二段', createdAt: '2026-10-15T00:00:00.000Z', status: 'pending' }
const receipt: Message = { id: 'message-a', conversationId: 'room-a', senderType: 'user', senderId: 'user', senderName: '本人', content: request.content, status: 'completed', sequence: 1, mentionIds: ['employee-a'], createdAt: request.createdAt, materialReference: { id: source.id, conversationId: source.conversationId, contentHash: source.contentHash, revision: source.revision, parseVersion: source.parseVersion } }
describe('file editor request identity', () => {
  it.each(['pending', 'unknown', 'not_accepted'] as const)('restores %s only as an unknown request', status => {
    const restored = restoreFileEdits({ version: 1, requests: [{ ...request, status }] }, fileEditKey(source))
    expect(restored).toEqual([{ ...request, status: 'unknown' }])
  })
  it('retains the original file identity while matching only the independent execution receipt', () => {
    const internal = { ...request, executionConversationId: 'internal-room' }
    expect(materialEditInput(internal)).toMatchObject({ conversationId: 'internal-room', materialReference: { conversationId: source.conversationId, contentHash: source.contentHash } })
    expect(fileEditReceiptMatches(internal, receipt)).toBe(false)
    expect(fileEditReceiptMatches(internal, { ...receipt, conversationId: 'internal-room' })).toBe(true)
    expect(restoreFileEdits({ version: 1, requests: [internal] }, fileEditKey(source))[0]).toMatchObject({ executionConversationId: 'internal-room', status: 'unknown' })
  })
  it('retains accepted identity but refuses corrupt or foreign records', () => {
    const accepted = { ...request, status: 'accepted', messageId: receipt.id }
    expect(restoreFileEdits({ version: 1, requests: [accepted] }, fileEditKey(source))).toEqual([accepted])
    for (const requests of [[{ ...request, status: 'accepted' }], [request, request], [{ ...request, source: { ...source, path: '/private/original' } }], [{ ...request, source: { ...source, contentHash: 'bad' } }]]) expect(() => restoreFileEdits({ version: 1, requests }, fileEditKey(source))).toThrow()
    expect(() => restoreFileEdits({ version: 1, requests: [request] }, 'another-file')).toThrow()
  })
  it('requires material receipt to match file revision, hash, employee and exact instruction', () => {
    expect(fileEditReceiptMatches(request, receipt)).toBe(true)
    for (const patch of [{ conversationId: 'other-room' }, { senderId: 'other-user' }, { content: '另一修改' }, { mentionIds: ['employee-b'] }, { mentionIds: ['employee-a', 'employee-b'] }, { artifactRevisionRequestId: 'unrelated' }, { materialReference: { ...receipt.materialReference!, revision: 3 } }, { materialReference: { ...receipt.materialReference!, contentHash: 'b'.repeat(64) } }]) expect(fileEditReceiptMatches(request, { ...receipt, ...patch })).toBe(false)
  })
  it('requires the exact artifact revision request receipt', () => {
    const artifact: FileEditRequest = { ...request, source: { kind: 'artifact', id: 'version-a', logicalArtifactId: 'family-a', conversationId: 'room-a', contentHash: source.contentHash, contentVersion: 1, name: source.name } }
    expect(fileEditReceiptMatches(artifact, { ...receipt, materialReference: undefined, artifactRevisionRequestId: artifact.id })).toBe(true)
    expect(fileEditReceiptMatches(artifact, { ...receipt, artifactRevisionRequestId: 'another-request' })).toBe(false)
  })
  it('does not mix the same employee or filename from other requests into results', () => {
    const detail = { conversation: { id: 'room-a' }, workItems: [{ id: 'work-a', sourceMessageId: receipt.id, resultMessageIds: ['reply-a'] }, { id: 'unrelated', sourceMessageId: 'other-message', resultMessageIds: ['other-reply'] }], runs: [{ id: 'run-a', triggerMessageId: receipt.id, messageId: 'reply-a' }, { id: 'other-run', triggerMessageId: 'other-message', messageId: 'other-reply' }], artifacts: [{ id: 'artifact-a', name: '计划.md', sourceWorkId: 'work-a' }, { id: 'unrelated-file', name: '计划.md', runId: 'other-run' }] } as ConversationDetail
    const results = fileEditResults(detail, [{ ...request, status: 'accepted', messageId: receipt.id }])
    expect(results[0].messageIds).toEqual(['reply-a'])
    expect(results[0].artifacts.map(artifact => artifact.id)).toEqual(['artifact-a'])
    expect(fileEditResults({ ...detail, conversation: { ...detail.conversation, id: 'room-b' } }, [{ ...request, messageId: receipt.id }])).toEqual([])
  })
  it('reads only public replies, excluding private phases and unpublished task drafts', () => {
    const detail = { conversation: { id: 'room-a' }, workItems: [], artifacts: [], runs: [
      { id: 'decision', phase: 'decision', status: 'completed', messageId: 'private-decision' },
      { id: 'memory', phase: 'memory', status: 'completed', messageId: 'private-memory' },
      { id: 'task', phase: 'execution', status: 'running', responseKind: 'task', messageId: 'unpublished' },
      { id: 'reply', phase: 'execution', status: 'completed', messageId: 'public-reply' },
    ].map(run => ({ ...run, triggerMessageId: receipt.id })) } as unknown as ConversationDetail
    expect(fileEditResults(detail, [{ ...request, status: 'accepted', messageId: receipt.id }])[0].messageIds).toEqual(['public-reply'])
  })
})

describe('file preview delivery transition', () => {
  const completed = () => [{ request: { ...request, status: 'accepted', messageId: receipt.id }, works: [{ id: 'work-a', status: 'delivered' }], runs: [{ id: 'run-a', phase: 'execution', status: 'completed' }], messageIds: [], artifacts: [{ id: 'new-artifact', logicalArtifactId: 'new-family', contentVersion: 1, contentHash: 'b'.repeat(64), contentStatus: 'ready' }] }] as unknown as ReturnType<typeof fileEditResults>
  it('follows only this explicit request and exact file revision after delivery', () => {
    const results = completed()
    expect(completedFileEditArtifact(results, source, request.id)?.id).toBe('new-artifact')
    expect(completedFileEditArtifact(results, source, undefined)).toBeUndefined()
    expect(completedFileEditArtifact(results, source, 'another-request')).toBeUndefined()
    for (const patch of [{ revision: 3 }, { conversationId: 'another-room' }, { contentHash: 'c'.repeat(64) }, { parseVersion: 'binary-v1' as const }]) expect(completedFileEditArtifact(results, { ...source, ...patch }, request.id)).toBeUndefined()
  })
  it.each(['queued', 'running', 'waiting_approval', 'failed', 'cancelled', 'interrupted'] as const)('does not replace the document during %s execution even if a file was published', status => {
    const results = completed(); results[0].runs[0].status = status
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
  })
  it('requires actual completed execution and delivery, but does not wait for private memory maintenance', () => {
    const results = completed()
    results[0].runs.push({ ...results[0].runs[0], id: 'memory', phase: 'memory', status: 'running' })
    expect(completedFileEditArtifact(results, source, request.id)).toBeDefined()
    results[0].works[0].status = 'running'
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
    results[0].works = []; results[0].runs = []
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
  })
  it('leaves analysis without files, unknown receipts, unavailable files and multiple outputs for explicit review', () => {
    const results = completed(), original = results[0].artifacts[0]
    results[0].artifacts = []
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
    results[0].artifacts = [original, { ...original, id: 'another-output' }]
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
    results[0].artifacts = [{ ...original, contentStatus: 'unavailable' }]
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
    results[0].artifacts = [original]; results[0].request.status = 'unknown'
    expect(completedFileEditArtifact(results, source, request.id)).toBeUndefined()
  })
  it('chooses the newest version of the requested family, not an unrelated later output', () => {
    const results = completed(), artifactSource: FileEditRequest['source'] = { kind: 'artifact', id: 'old-artifact', conversationId: source.conversationId, contentHash: source.contentHash, logicalArtifactId: 'family-a', contentVersion: 1, name: source.name }
    results[0].request.source = artifactSource
    results[0].artifacts.push(...[2, 3].map(contentVersion => ({ ...results[0].artifacts[0], id: `version-${contentVersion}`, logicalArtifactId: 'family-a', contentVersion })))
    expect(completedFileEditArtifact(results, artifactSource, request.id)?.id).toBe('version-3')
    expect(completedFileEditArtifact(results, { ...artifactSource, contentVersion: 2 }, request.id)).toBeUndefined()
  })
})
