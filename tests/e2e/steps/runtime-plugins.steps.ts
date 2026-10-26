/*
 * [INPUT]: Real Electron, isolated native fixtures and independent local plugin packages.
 * [OUTPUT]: User-facing scan/test/save, chat/artifact, CAS install/disable/restart/uninstall evidence.
 * [POS]: Runtime plugin desktop BDD; no real provider calls.
 * [PROTOCOL]: Update steps/.folder.md and feature review ledger on changes.
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { copyFile, chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import type { Conversation, DigitalAgent } from '../../../packages/shared/src/domain'
import { bundledRuntimePlugins } from '../../../packages/shared/src/plugins/runtime-catalog'
import { test } from '../support/test'
import type { Desktop } from '../support/desktop'
const { Given, When, Then } = createBdd(test)
async function settings(runtime: Desktop, name: string) {
 await runtime.page.getByRole('button',{name:'我的菜单',exact:true}).click();await runtime.page.getByRole('menuitem',{name:'设置',exact:true}).click();await runtime.page.getByRole('button',{name,exact:true}).click()
}
Given('插件桌面中已安装隔离的Pi程序',async({runtime})=>{
 const bin=join(runtime.root,'bin');await mkdir(bin)
 await copyFile(resolve('tests/fixtures/plugin-native.mjs'),join(bin,'pi'));await chmod(join(bin,'pi'),0o700);await copyFile(resolve('tests/fixtures/native-business.mjs'),join(bin,'native-business.mjs'))
 const old=process.env.PATH;process.env.PATH=bin+delimiter+old;runtime.defer(()=>{process.env.PATH=old;return Promise.resolve()})
 await runtime.start();await settings(runtime,'模型连接')
 await expect(runtime.page.getByRole('button',{name:'扫描本机 Agent',exact:true})).toBeVisible()
})
When('用户扫描并测试保存Pi连接',async({runtime})=>{
 const page=runtime.page;await page.getByRole('button',{name:'扫描本机 Agent',exact:true}).click()
 await page.getByRole('button',{name:'Pi 配置',exact:true}).click()
 await page.getByRole('button',{name:'测试',exact:true}).click();await expect(page.getByText('测试成功 · Pi 0.85.1',{exact:true})).toBeVisible()
 await runtime.reviewNativeCheckpoint('Pi插件连接测试成功')
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect.poll(async()=> (await page.evaluate(()=>window.boai.request('listLaunchProfiles',undefined))).filter(p=>p.runtimePlugin?.providerId==='pi').length).toBe(1)
})
Then('插件员工可连续聊天交付文件且重启不重放',async({runtime})=>{
 test.setTimeout(120000)
 const value=await runtime.page.evaluate(async()=>{
  const profile=(await window.boai.request('listLaunchProfiles',undefined)).find(p=>p.runtimePlugin?.providerId==='pi')!
  const agent=await window.boai.request('saveAgent',{name:'Pi插件员工',role:'交付',instructions:'按消息完成任务',color:'#00AABB',connectionId:'',modelId:'',executionBackend:{kind:'runtime-plugin',profileId:profile.id,pluginId:profile.runtimePlugin!.pluginId,providerId:'pi'},skillIds:[],knowledgeIds:[],allowCommands:true,active:true})
  const chat=await window.boai.request('createConversation',{kind:'direct',title:'Pi插件桌面',agentIds:[agent.id]});return {agent,chat}
 }) as {agent:DigitalAgent;chat:Conversation}
 const open=async()=>{await runtime.page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('button',{name:'会话',exact:true}).click();await runtime.page.getByRole('navigation',{name:'会话列表',exact:true}).getByRole('button',{name:value.chat.title,exact:true}).click()}
 await open();let count=0
 await expect(runtime.page.getByRole('button',{name:'权限批准',exact:true})).toContainText('原生配置')
 for(const content of ['第一轮','第二轮','PLUGIN_PUBLISH']){
  await runtime.page.getByRole('textbox',{name:'消息内容',exact:true}).fill(content);await runtime.page.getByRole('button',{name:'发送消息',exact:true}).click();count++
  await expect.poll(async()=>{const detail=await runtime.page.evaluate(id=>window.boai.request('getConversation',{id}),value.chat.id);return detail.runs.length===count&&detail.runs.every(run=>run.status==='completed')}).toBe(true)
 }
 const before=await runtime.page.evaluate(id=>window.boai.request('getConversation',{id}),value.chat.id)
 expect(before.artifacts.some(a=>a.name==='plugin.md')).toBe(true);await runtime.reviewData('Pi插件三轮协议事实',before);await runtime.reviewNativeCheckpoint('Pi插件聊天与真实文件交付')
 await runtime.restart();await open()
 const after=await runtime.page.evaluate(id=>window.boai.request('getConversation',{id}),value.chat.id)
 expect(after.runs.map(r=>r.id)).toEqual(before.runs.map(r=>r.id));expect(after.artifacts.map(a=>a.id)).toEqual(before.artifacts.map(a=>a.id));await runtime.reviewNativeCheckpoint('重启后插件会话与附件保留')
})
Given('插件桌面有待安装的独立ACP声明包',async({runtime})=>{
 const path=join(runtime.root,'declaration-package');await mkdir(path)
 await writeFile(join(path,'manifest.json'),JSON.stringify({...bundledRuntimePlugins[1],id:'example.runtime.acp',name:'独立ACP包'}));await writeFile(join(path,'LICENSE.txt'),'Offline fixture package')
 await runtime.start();await settings(runtime,'插件')
 await runtime.app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]})},path)
})
When('用户安装并停用该运行时插件',async({runtime})=>{
 await runtime.page.getByRole('button',{name:'安装或更新插件',exact:true}).click()
 const control=runtime.page.locator('[data-application-plugin="example.runtime.acp"]').getByRole('switch');await expect(control).toBeChecked();await control.click();await expect(control).not.toBeChecked();await expect(control).toBeEnabled()
 await control.evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))})
 await runtime.reviewNativeCheckpoint('独立ACP声明包安装并停用')
})
Then('重启后停用保持且卸载保留其他插件',async({runtime})=>{
 await runtime.restart();await settings(runtime,'插件')
 const row=runtime.page.locator('[data-application-plugin="example.runtime.acp"]');await expect(row.getByRole('switch')).not.toBeChecked();await row.getByRole('button',{name:'卸载',exact:true}).click();await expect(row).toHaveCount(0)
 await expect(runtime.page.locator('[data-application-plugin]')).toHaveCount(8);await runtime.reviewNativeCheckpoint('独立包卸载后原插件保持')
})
