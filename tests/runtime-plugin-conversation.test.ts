/*
 * [OUTPUT]: 实际原生子进程在明确业务cwd执行，不同cwd不续用旧会话。
 * [INPUT]: Production AppService, isolated Pi/ACP processes and real product tool bridge.
 * [OUTPUT]: Continuous employee chat, automatic CLI leases, files, approvals, unknown/restart and disable/stop integration.
 * [POS]: Offline native protocol tests; do not certify live provider/model quality.
 * [PROTOCOL]: Update tests/.folder.md and fixture map with changes.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtemp, realpath, copyFile, chmod, rm, readFile, cp, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../src/runtime/service'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'
import type { RuntimePluginCatalog } from '../src/shared/plugins/runtime-catalog'
import { verifyCliEnvironment, verifyWorkingDirectory } from './fixtures/cli-environment'
const cleanup: (()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function setup(provider: 'pi'|'opencode', independentModule = false) {
 const root=await realpath(await mkdtemp(join(tmpdir(),'boai-plugin-chat-'))), options={dataPath:root,engine:{run:async()=>{throw new Error('Plugins must not call Mastra')},test:async()=>''},secrets:{get:async()=>undefined,set:async()=>{},delete:async()=>{}},emit:()=>{}}
 let service=new AppService(options);cleanup.push(async()=>{await service.close();await rm(root,{recursive:true,force:true})});await service.init()
 const pluginId=independentModule?'example.runtime.pi':`boai.runtime.${provider}`
 if(independentModule){const pack=join(root,'independent-package');await cp(resolve('dist/runtime-plugin-packages/pi'),pack,{recursive:true});const manifest=JSON.parse(await readFile(join(pack,'manifest.json'),'utf8'));manifest.id=pluginId;await writeFile(join(pack,'manifest.json'),JSON.stringify(manifest));await service.installRuntimePlugin(pack,0)}
 const catalog=await service.handle('listRuntimePlugins',undefined) as RuntimePluginCatalog, item=catalog.plugins.find(item=>item.manifest.id===pluginId)!
 expect(item).toBeDefined()
 const executable=join(root,provider+'.mjs');await copyFile(resolve('tests/fixtures/plugin-native.mjs'),executable);await chmod(executable,0o700);await copyFile(resolve('tests/fixtures/native-business.mjs'),join(root,'native-business.mjs'))
 const draft={name:provider,executable,args:[],protocol:'runtime-plugin',runtimePlugin:{pluginId:item.manifest.id,providerId:provider,packageHash:item.packageHash},useExistingLogin:true,hostAccessAcknowledged:true}
 await service.handle('testLaunchProfileDraft',draft);const profile=await service.handle('saveLaunchProfile',draft) as LaunchProfile
 const agent=await service.handle('saveAgent',{name:'插件员工',role:'测试',instructions:'按消息办理',color:'#00AABB',connectionId:'',modelId:'',executionBackend:{kind:'runtime-plugin',profileId:profile.id,pluginId:item.manifest.id,providerId:provider},skillIds:[],knowledgeIds:[],allowCommands:true,active:true}) as DigitalAgent
 const chat=await service.handle('createConversation',{kind:'direct',title:'插件会话',agentIds:[agent.id]}) as Conversation
 const detail=()=>service.handle('getConversation',{id:chat.id}) as Promise<ConversationDetail>
 const send=(content:string)=>service.handle('sendMessage',{conversationId:chat.id,content,mentionIds:[],requestId:crypto.randomUUID()}) as Promise<Message>
 const wait=async(message:Message)=>{let d:ConversationDetail|undefined;await expect.poll(async()=>{d=await detail();return d.runs.some(run=>run.triggerMessageId===message.id&&['completed','failed','cancelled','interrupted'].includes(run.status))},{timeout:20000}).toBe(true);return d!}
 const work=join(root,'agents',agent.id,'workspace','sessions',chat.id,'work')
 return {root,profile,agent,chat,detail,send,wait,work,get service(){return service},restart:async()=>{await service.close();service=new AppService(options);await service.init()}}
}
test('a separately built module package with a new plugin ID can chat and publish without a core brand branch',async()=>{
 const f=await setup('pi',true),result=await f.wait(await f.send('PLUGIN_PUBLISH'))
 expect(f.profile.runtimePlugin?.pluginId).toBe('example.runtime.pi')
 expect(result.runs.at(-1)?.status,result.runs.at(-1)?.error).toBe('completed');expect(result.artifacts.some(a=>a.name==='plugin.md')).toBe(true)
},60000)
describe.each(['pi','opencode'] as const)('%s runtime plugin',provider=>{
 test('uses the explicit working directory and renews its session when it changes',async()=>{
  await verifyWorkingDirectory(await setup(provider),cleanup)
 },60000)
 test('automatically passes its run CLI lease through the plugin runner and revokes it after exit',async()=>{
  await verifyCliEnvironment(await setup(provider),cleanup)
 },60000)
 test('continuous chat shares only its own native session and restart does not replay; real product file publication works',async()=>{
  const f=await setup(provider),first=await f.wait(await f.send('第一轮'))
  expect(first.runs.at(-1)?.status,first.runs.at(-1)?.error).toBe('completed')
  expect(first.runs.at(-1)?.backend?.inputAccepted).toBe(true)
  await f.restart();const second=await f.wait(await f.send('第二轮'))
  expect(second.runs.at(-1)?.status,second.runs.at(-1)?.error).toBe('completed')
  const rows=(await readFile(join(f.work,'plugin-submissions.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
  expect(rows).toHaveLength(2);expect(rows[0].sessionId).toBe(rows[1].sessionId);expect(rows[1].input.contextMode).toBe('incremental');expect(JSON.stringify(rows[1].input.messages)).not.toContain('第一轮')
  const file=await f.wait(await f.send('PLUGIN_PUBLISH'));expect(file.runs.at(-1)?.status,file.runs.at(-1)?.error).toBe('completed');expect(file.artifacts.some(item=>item.name==='plugin.md')).toBe(true)
  expect(file.runs.every(run=>run.usage===undefined)).toBe(true)
 },60000)
 test('native permission denial is honored and does not execute the requested operation',async()=>{
  const f=await setup(provider),message=await f.send('PLUGIN_ACTION');let runId='',action:import('../src/shared/domain/execution').NativeAction|undefined
  await expect.poll(async()=>{runId=(await f.detail()).runs.at(-1)?.id??'';if(!runId)return;action=(await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as import('../src/shared/domain/execution').NativeAction[])[0];return action?.status},{timeout:20000}).toBe('pending')
  await f.service.handle('respondNativeAction',{conversationId:f.chat.id,runId,actionId:action!.id,response:{option:'no'}})
  const detail=await f.wait(message);expect(detail.runs.at(-1)?.status,detail.runs.at(-1)?.error).toBe('completed');await expect(readFile(join(f.work,'plugin-approved.txt'))).rejects.toThrow()
 },60000)
 test('product automation is persisted through the plugin tool bridge and readable after restart',async()=>{
  const f=await setup(provider),first=await f.wait(await f.send('NATIVE_AUTOMATION_SAVE'))
  expect(first.runs.at(-1)?.status,first.runs.at(-1)?.error).toBe('completed');expect(first.workItems).toHaveLength(0)
  await f.restart();const second=await f.wait(await f.send('NATIVE_AUTOMATION_LIST'));expect(second.runs.at(-1)?.status,second.runs.at(-1)?.error).toBe('completed')
 },60000)
 test('two employees delegate using independent native sessions and the original product work',async()=>{
  const f=await setup(provider),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
  const child=await f.service.handle('saveAgent',{...input,name:'插件同事'}) as DigitalAgent
  const chat=await f.service.handle('createConversation',{kind:'group',title:'插件委派',agentIds:[f.agent.id,child.id]}) as Conversation
  await f.service.handle('sendMessage',{conversationId:chat.id,content:'NATIVE_DELEGATE',mentionIds:[f.agent.id],requestId:crypto.randomUUID()})
  let detail:ConversationDetail|undefined
  await expect.poll(async()=>{detail=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return detail.workItems?.filter(work=>work.status==='delivered').length},{timeout:25000}).toBe(2)
  expect(detail!.runs.filter(run=>run.status==='failed').map(run=>run.error)).toEqual([]);expect(detail!.artifacts).toHaveLength(1)
  expect(new Set(detail!.runs.filter(run=>run.backend?.sessionId).map(run=>run.backend!.sessionId)).size).toBeGreaterThanOrEqual(2)
 },60000)
 test('unknown after a side effect is retained over restart with zero replay',async()=>{
  const f=await setup(provider),first=await f.wait(await f.send('PLUGIN_UNKNOWN'));expect(first.runs.at(-1)?.status).toBe('failed')
  await f.restart();await f.restart();expect(await readFile(join(f.work,'plugin-effects.txt'),'utf8')).toBe('once\n');expect((await f.detail()).runs).toHaveLength(1)
 },60000)
 test('disable drains the current execution; new calls are blocked and stop waits for process release',async()=>{
  const f=await setup(provider),message=await f.send('PLUGIN_WAIT')
  await expect.poll(async()=> (await f.detail()).runs.at(-1)?.backend?.inputAccepted,{timeout:20000}).toBe(true)
  const catalog=await f.service.handle('listRuntimePlugins',undefined) as RuntimePluginCatalog
  await f.service.handle('setRuntimePluginEnabled',{id:`boai.runtime.${provider}`,enabled:false,expectedRevision:catalog.revision})
  expect((await f.detail()).runs.at(-1)?.status).toBe('running')
  await f.service.handle('stopNativeExecution',{conversationId:f.chat.id,runId:(await f.detail()).runs.at(-1)!.id});await f.wait(message)
  await expect.poll(async()=> (await f.service.handle('listRuntimePlugins',undefined) as RuntimePluginCatalog).plugins.find(p=>p.manifest.id===`boai.runtime.${provider}`)?.inUse).toBe(0)
  const failed=await f.wait(await f.send('插件停用后的新消息'));expect(failed.runs.at(-1)?.status).toBe('failed');expect(failed.runs.at(-1)?.error).toContain('停用')
 },60000)
})
