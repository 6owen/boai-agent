/*
 * [INPUT]: 隔离数据目录与父进程指定的真实文件/提交断点。
 * [OUTPUT]: 在生产 AppService 断点驻留，由测试父进程 SIGKILL；不模拟重启状态。
 * [POS]: T1.3 子进程故障支撑，非生产 UI 或环境开关。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { AppService } from '../../src/runtime/service'
import { writingPlan } from './team-planner'
import type { TeamDraft, TeamDraftView } from '../../src/shared/domain/team-creation'

const [dataPath, stopAt] = process.argv.slice(2)
const service = new AppService({ dataPath, teamPlanner: async () => writingPlan, engine: { run: async () => {}, test: async () => '' }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {},
  teamFileCheckpoint: async (phase, operation, path) => {
    if (phase !== stopAt || phase === 'before-write' && !path?.endsWith('AGENTS.md')) return
    if (phase === 'before-write') await writeFile(path!, operation.agents[0].instructions.slice(0, 3))
    process.send?.({ operationId: operation.id, draftId: operation.draftId, memberIds: operation.memberIds, conversationId: operation.conversationId, phase })
    await new Promise<void>(() => {})
  },
})
await service.init()
await writeFile(join(dataPath, 'data-version.json'), JSON.stringify({ schemaVersion: 2 }))
const connection = await service.handle('saveConnection', { name: 'child fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' }) as { id: string }
let draft = await service.handle('openTeamDraft', undefined) as TeamDraft
draft = await service.handle('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '创建四人写作团队', selectedConnectionId: connection.id, selectedModelId: '', createGroup: true, groupTitle: '重启验证' } }) as TeamDraft
await service.handle('generateTeamPlan', { draftId: draft.id, expectedVersion: draft.version, requestId: 'child-generation' })
for (;;) {
  draft = (await service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView).draft
  if (draft.generationStatus === 'succeeded') break
  await new Promise(resolve => setTimeout(resolve, 10))
}
await service.handle('acceptTeamCreation', { draftId: draft.id, expectedVersion: draft.version, planHash: draft.planHash!, requestId: 'child-creation' })
