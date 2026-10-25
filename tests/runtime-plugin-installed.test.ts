/*
 * [INPUT]: Explicit opt-in to the installed Pi CLI; isolated BOAI product directory.
 * [OUTPUT]: Native handshake or a bounded real-provider three-message integration record.
 * [POS]: Manual runtime integration, excluded from normal offline CI.
 * [PROTOCOL]: Record actual external runs in 19/06; never retry unknown business input.
 */
import { expect, test } from 'vitest'
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../packages/runtime/src/service'
import type { LaunchProfile, Conversation, DigitalAgent, ConversationDetail, Message } from '../packages/shared/src/domain'
import type { RuntimePluginCatalog } from '../packages/shared/src/plugins/runtime-catalog'
const mode = process.env.BOAI_TEST_INSTALLED_PI
const evidenceRoot = process.env.BOAI_PLUGIN_EVIDENCE_DIR
test.skipIf(!mode)('installed Pi handshake and explicitly opted-in live messages', async () => {
 const root=await realpath(await mkdtemp(join(tmpdir(),'boai-installed-pi-'))), evidence: Record<string,unknown>={mode, startedAt:new Date().toISOString()}
 const service = new AppService({dataPath:root,engine:{run:async()=>{throw Error('API parent must not run')},test:async()=>''},secrets:{get:async()=>undefined,set:async()=>{},delete:async()=>{}},emit:()=>{}})
 try {
  await service.init();const catalog=await service.handle('listRuntimePlugins',undefined) as RuntimePluginCatalog, plugin=catalog.plugins.find(p=>p.manifest.id==='boai.runtime.pi')!
  const draft={name:'Installed Pi verification',executable:'pi',args:[],protocol:'runtime-plugin',runtimePlugin:{pluginId:plugin.manifest.id,providerId:'pi',packageHash:plugin.packageHash},useExistingLogin:true,hostAccessAcknowledged:true}
  const verified = await service.handle('testLaunchProfileDraft',draft);evidence.verified=verified;expect(verified).toMatchObject({name:'Pi',protocolVersion:1})
  if(mode!=='live')return
  const profile=await service.handle('saveLaunchProfile',draft) as LaunchProfile
  const agent=await service.handle('saveAgent',{name:'Pi验证员工',role:'测试',instructions:'完成用户指定的简短检查。',color:'#00AABB',connectionId:'',modelId:'',executionBackend:{kind:'runtime-plugin',profileId:profile.id,pluginId:plugin.manifest.id,providerId:'pi'},skillIds:[],knowledgeIds:[],allowCommands:false,active:true}) as DigitalAgent
  const chat=await service.handle('createConversation',{kind:'direct',title:'Pi独立验证',agentIds:[agent.id]}) as Conversation
  const rows:unknown[]=[];evidence.runs=rows
  for(const content of ['记住本次测试词“青杉”。只回复“已记住青杉”，不调用工具。','上一条指定的测试词是什么？只回复这个词，不调用工具。','在当前工作目录创建 pi-plugin-check.txt，内容为“青杉插件验证”。使用 publish_artifact 作为真实附件交付。最后只回复“已交付”。']){
   const message=await service.handle('sendMessage',{conversationId:chat.id,content,mentionIds:[],requestId:crypto.randomUUID()}) as Message
   let detail:ConversationDetail|undefined
   await expect.poll(async()=>{detail=await service.handle('getConversation',{id:chat.id}) as ConversationDetail;return detail.runs.some(run=>run.triggerMessageId===message.id&&['completed','failed','cancelled','interrupted'].includes(run.status))},{timeout:150000}).toBe(true)
   rows.push({input:content,detail});expect(detail!.runs.at(-1)?.status,detail!.runs.at(-1)?.error).toBe('completed')
  }
  const final=await service.handle('getConversation',{id:chat.id}) as ConversationDetail
  expect(final.artifacts.some(artifact=>artifact.name==='pi-plugin-check.txt')).toBe(true)
 }catch(error){evidence.error=String(error);throw error}finally{
  await service.close();evidence.finishedAt=new Date().toISOString()
  if(evidenceRoot){await mkdir(evidenceRoot,{recursive:true});await writeFile(join(evidenceRoot,`${mode}-${Date.now()}.json`),JSON.stringify(evidence,null,2))}
  if(process.env.BOAI_KEEP_PLUGIN_TEST==='1') await writeFile('/tmp/boai-plugin-last-test-root',root); else await rm(root,{recursive:true,force:true})
 }
},480000)
