/*
 * [INPUT]: 显式Claude/API来源及隔离的内存工作夹具。
 * [OUTPUT]: 共用隔离内存工作夹具；原工具模式经生产write/read核读私有文件，不建立产品Work或发布成果。
 * [POS]: Claude真实供应商底层探测的工具阶段，不进入产品构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ToolEvent } from '../../packages/shared/src/domain'
import type { EngineContext } from '../../packages/runtime/src/contracts'
import { createNativeTask } from '../../packages/runtime/src/adapters/native-task'
import { runClaudePhase, type ClaudePhaseInput } from '../../packages/runtime/src/adapters/claude/turn'

export async function claudeProbeContext(root: string, signal: AbortSignal) {
  const session=join(root,'employee-host','sessions','conversation'),runId='probe-run',now=new Date().toISOString()
  const events:ToolEvent[]=[],effects:string[]=[]
  const context:EngineContext={
    agent:{id:'probe-employee',name:'工具验证员工',role:'私有文件核对',instructions:'仅处理本场明确文件。',color:'#00AABB',connectionId:'',modelId:'',skillIds:[],knowledgeIds:[],allowCommands:false,active:true,configVersion:1},
    apiKey:'',conversation:{id:'conversation',kind:'direct',title:'底层工具验证',agentIds:['probe-employee'],mode:'mention',workspacePath:join(root,'shared'),sharedKnowledgeIds:[],createdAt:now,updatedAt:now},
    messages:[],resources:[],runId,signal,responseKind:'task',
    // Explicit in-memory module fixture. This is not a product-admitted Work or
    // evidence of SQLite publication, budgeting, employee routing or UI approval.
    work:{schemaVersion:2,id:'probe-work',conversationId:'conversation',sourceMessageId:'probe-message',key:'probe',scope:'private-file',deliverable:'私有原件读写',ownerAgentId:'probe-employee',activeRunId:runId,version:1,status:'running',budgetId:'probe-budget',rootWorkId:'probe-work',dependsOnWorkIds:[],requiredResults:[],observedResults:[],waitRevision:0,resultMessageIds:[],artifactIds:[],resultVersion:0,requiresReview:false,createdAt:now,updatedAt:now},
    workspace:{root:session,workPath:join(session,'work'),runPath:join(session,'runs',runId),sharedPath:join(root,'shared')},
    onDelta:async()=>{},onTool:async event=>{events.push(event)},
    beforeEffect:async()=>{effects.push('before')},afterEffect:async()=>{effects.push('after')},
    approveCommand:async()=>{throw new Error('本场不允许命令审批')},onArtifact:async()=>{throw new Error('本场不发布成果')},
  }
  for(const path of [context.workspace!.workPath,context.workspace!.runPath,context.workspace!.sharedPath])await mkdir(path,{recursive:true})
  return { context, events, effects, session, runId }
}

export async function probeClaudeHostTools(common: Omit<ClaudePhaseInput, 'prompt' | 'instructions'>, root: string, output: string) {
  const { context, events, effects, session, runId } = await claudeProbeContext(root, common.signal)
  const token=`工具回执-${randomUUID()}`,logical=`self:/runs/${runId}/proof.txt`
  const task=await createNativeTask(context,'Claude')
  try {
    const result=await runClaudePhase({...common,cwd:session,configDirectory:join(root,'config-tools'),ephemeral:true,
      instructions:task.instructions+'\n本场只验证私有文件的写入与读取，不发布成果，不执行命令。',
      prompt:`请调用write_file把以下文本原样写入${logical}：${token}。然后调用read_file读取同一个文件，只按实际读取结果回答。不要发布，不要执行命令，不要重复写入。`,
      tools:task.tools.filter(tool=>['write_file','read_file'].includes(tool.name)),onStop:task.stop,
    })
    const bytes=await readFile(join(context.workspace!.runPath,'proof.txt'))
    assert.equal(bytes.toString(),token);assert.ok(result.text.includes(token))
    assert.deepEqual(events.filter(event=>event.status==='completed').map(event=>event.name),['write_file','read_file'])
    assert.equal(new Set(events.map(event=>event.id)).size,2);assert.deepEqual(effects,['before','after'])
    await writeFile(join(dirname(output),'proof.txt'),bytes,{flag:'wx'})
    return {kind:'production-host-file-tools',...result,toolEvents:events,effects,proof:{file:'proof.txt',hash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},productWorkPersisted:false,artifactPublished:false}
  } finally {task.stop();await task.dispose()}
}
