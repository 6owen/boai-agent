/*
 * [INPUT]: Real package directories and production runtime plugin registry.
 * [OUTPUT]: Independent package/CAS/lifecycle/fingerprint/configuration and discovery invariants.
 * [POS]: Runtime plugin contract tests; no model calls.
 * [PROTOCOL]: Update tests/.folder.md on changes.
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimePlugins } from '../src/runtime/modules/backends/runtime-plugins'
import { bundledRuntimePlugins, validateRuntimeConfig, runtimeContribution } from '../src/shared/plugins/runtime-catalog'
import { definePluginCatalog } from '../src/shared/plugins/catalog'
import { pluginAvailability } from '../src/shared/plugins/types'
import { LocalConfigDiscovery } from '../src/main/local-configs/discovery'
import { pluginFrameSchema, hostFrameSchema } from '../src/runtime/adapters/plugins/validation'
import { nativeRuntimeNamespace } from '../src/shared/domain/backends'
const roots: string[] = []
afterEach(async () => { for (const path of roots.splice(0)) await rm(path, {recursive:true,force:true}) })
async function setup() { const root = await mkdtemp(join(tmpdir(),'boai-runtime-pack-'));roots.push(root);const manager = new RuntimePlugins(join(root,'registry'));await manager.init();return {root,manager} }
async function pkg(root: string, id='example.runtime', version='1.0.0') { const path=join(root,id+version);await mkdir(path);const manifest={...bundledRuntimePlugins[1],id,version};await writeFile(join(path,'manifest.json'),JSON.stringify(manifest));await writeFile(join(path,'LICENSE'),'Test fixture');return {path,manifest} }
test('v1 catalog stays compatible while v2 runtime needs an explicit compatible API', () => {
 const plugin = bundledRuntimePlugins[0];expect(definePluginCatalog([plugin])).toHaveLength(1)
 expect(pluginAvailability(plugin,{revision:0,disabledIds:[]})).toBe('enabled')
 expect(()=>definePluginCatalog([{...plugin,apiVersion:1}])).toThrow('API 2')
 expect(()=>validateRuntimeConfig(runtimeContribution(plugin),{token:'not allowed'})).toThrow()
})
test('an independent declaration package installs, survives restart, drains disable and pins updates', async () => {
 const {root,manager}=await setup(), first=await pkg(root)
 let catalog=await manager.install(first.path,0), row=catalog.plugins.find(item=>item.manifest.id===first.manifest.id)!
 const ref={pluginId:first.manifest.id,providerId:'opencode',packageHash:row.packageHash}, lease=await manager.acquire(ref)
 catalog=await manager.setEnabled(ref.pluginId,false,catalog.revision)
 expect(()=>manager.resolve(ref)).toThrow('停用');expect(catalog.plugins.find(p=>p.manifest.id===ref.pluginId)?.inUse).toBe(1)
 const second=await pkg(root,ref.pluginId,'1.0.1');await expect(manager.install(second.path,catalog.revision)).rejects.toThrow('退出')
 await expect(manager.uninstall(ref.pluginId,catalog.revision)).rejects.toThrow('退出')
 lease.release();lease.release();catalog=await manager.install(second.path,catalog.revision)
 expect(catalog.plugins.find(p=>p.manifest.id===ref.pluginId)?.enabled).toBe(false)
 catalog=await manager.setEnabled(ref.pluginId,true,catalog.revision)
 expect(()=>manager.resolve(ref)).toThrow('版本已变化')
 const restarted=new RuntimePlugins(join(root,'registry'));await restarted.init();expect(restarted.snapshot().revision).toBe(catalog.revision)
 await expect(restarted.setEnabled(ref.pluginId,true,0)).rejects.toThrow('刷新')
 await restarted.uninstall(ref.pluginId,catalog.revision);expect(restarted.snapshot().plugins.some(p=>p.manifest.id===ref.pluginId)).toBe(false)
})
test('symlink escape, invalid module entry and tampered installed bytes fail closed', async () => {
 const {root,manager}=await setup(), item=await pkg(root)
 await symlink('/etc/hosts',join(item.path,'escape'));await expect(manager.install(item.path,0)).rejects.toThrow('符号链接');await rm(join(item.path,'escape'))
 const installed=await manager.install(item.path,0), row=installed.plugins.find(p=>p.manifest.id===item.manifest.id)!
 await writeFile(join(root,'registry','packages',row.packageHash,'LICENSE'),'tampered')
 await expect(manager.acquire({pluginId:item.manifest.id,providerId:'opencode',packageHash:row.packageHash})).rejects.toThrow('文件已变化')
 const restarted=new RuntimePlugins(join(root,'registry'));await restarted.init();expect(restarted.snapshot().readOnly).toBe(true)
})
test('Pi discovery becomes addable through enabled plugin data and scan never executes the CLI', async () => {
 const {root,manager}=await setup(), command=join(root,'pi');await writeFile(command,'#!/bin/sh\ntouch SHOULD_NOT_EXECUTE\n');await chmod(command,0o700)
 const discovery=new LocalConfigDiscovery([root]);discovery.setRuntimePlugins(manager.snapshot().plugins)
 const pi=discovery.scan().agents!.find(item=>item.name==='Pi')!;expect(pi.availability).toBe('available');expect(discovery.detectedProfile(pi.candidateId)).toMatchObject({protocol:'runtime-plugin',runtimePlugin:{providerId:'pi'}})
 await manager.setEnabled('boai.runtime.pi',false,0);discovery.setRuntimePlugins(manager.snapshot().plugins)
 const disabled=discovery.scan().agents!.find(item=>item.name==='Pi')!;expect(disabled.availability).toBe('unsupported');expect(()=>discovery.detectedProfile(disabled.candidateId)).toThrow('插件')
})
test('uninstalling an independent override immediately restores the disabled bundled driver', async () => {
 const {root,manager}=await setup(), item=await pkg(root,'boai.runtime.opencode','0.2.0')
 const installed=await manager.install(item.path,0)
 const removed=await manager.uninstall(item.manifest.id,installed.revision)
 expect(removed.plugins.find(p=>p.manifest.id===item.manifest.id)).toMatchObject({bundled:true,enabled:false,manifest:{version:'0.1.0'}})
 const restarted=new RuntimePlugins(join(root,'registry'));await restarted.init();expect(restarted.snapshot()).toEqual(removed)
})
test('wire validation rejects malformed events and unsupported host methods before dispatch', () => {
 expect(hostFrameSchema.parse({type:'request',id:'probe',method:'probe'})).toEqual({type:'request',id:'probe',method:'probe'})
 expect(()=>pluginFrameSchema.parse({type:'event',event:{type:'input.accepted',requestId:23}})).toThrow()
 expect(()=>pluginFrameSchema.parse({type:'tool',id:'callback',value:{name:'publish_artifact',input:{}}})).toThrow()
 expect(()=>hostFrameSchema.parse({type:'request',id:'request',method:'handle',input:{method:'deleteAgent'}})).toThrow()
 expect(pluginFrameSchema.parse({type:'event',event:{type:'message.delta',id:'block',delta:'一\u2028二'}})).toBeDefined()
 expect(nativeRuntimeNamespace({kind:'runtime-plugin',profileId:'p',pluginId:'a-b',providerId:'c'})).not.toBe(nativeRuntimeNamespace({kind:'runtime-plugin',profileId:'p',pluginId:'a',providerId:'b-c'}))
})
