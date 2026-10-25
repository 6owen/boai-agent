/*
 * [OUTPUT]: 执行未完成时的正文/思考增量回归，最终答复与私有协议字段保持分离。
 * [OUTPUT]: BOAI浏览器两种原生工具名均省略输入值和截图字节，保留媒体hash。
 * [INPUT]: Rovai公开工具结果/可核验文件操作语义与实际原生事件接线。
 * [OUTPUT]: 文件标题来源、失败不冒充写入、原结果无损及Codex真实diff回归。
 * [POS]: 原生协议至直接迁入呈现的合同测试，非模型质量评分。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { describe, expect, it } from 'vitest'
import { codexExecutionEvent, nativeActivity, publicNativeToolResult } from '../packages/runtime/src/adapters/native-events'
import { executionActivityTitle } from '../packages/shared/src/rovai'

describe('原生执行文件与结果呈现',()=>{
 it('shows the actual read filename and retains every original result block',()=>{
  const result=[{type:'text',text:'第一段'},{type:'image',data:'original-image'},{type:'text',text:'第二段'}]
  const event=nativeActivity('read',{type:'tool_use',name:'Read',input:{file_path:'/work/说明.md'},result},true)
  expect(executionActivityTitle(event.canonical,event.payload)).toBe('阅读 说明.md')
  expect(event.payload).toMatchObject({item:{result,output:'第一段\n第二段'},runtimeFileOperation:{operationKind:'read',path:'/work/说明.md'}})
 })
 it.each([false,true])('does not claim an unconfirmed/failed write: completed=%s',completed=>{
  const event=nativeActivity('write',{type:'tool_use',name:'Write',input:{file_path:'/work/result.md'},isError:completed},completed)
  expect(event.payload).not.toHaveProperty('runtimeFileOperation')
 })
 it('does not infer creation from the ambiguous native create result',()=>{
  const event=nativeActivity('write',{type:'tool_use',name:'Write',input:{file_path:'/work/result.md'},toolUseResult:{filePath:'/work/result.md',type:'create'}},true)
  expect(event.payload).toMatchObject({runtimeFileOperation:{operationKind:'write'}})
  expect((event.payload as any).runtimeFileOperation).not.toHaveProperty('changeKind')
  expect(executionActivityTitle(event.canonical,event.payload)).toBe('编辑 result.md')
 })
 it('only refines a write from a matching path and native update receipt',()=>{
  const base={type:'tool_use',name:'Edit',input:{file_path:'/work/result.md',old_string:'before',new_string:'after'}}
  expect(nativeActivity('edit',{...base,toolUseResult:{filePath:'/work/result.md',type:'update'}},true).payload).toMatchObject({runtimeFileOperation:{changeKind:'update'}})
  expect((nativeActivity('edit',{...base,toolUseResult:{filePath:'/other.md',type:'update'}},true).payload as any).runtimeFileOperation).not.toHaveProperty('changeKind')
 })
 it('keeps structured results without pretending they are text',()=>{
  expect(publicNativeToolResult({content:'opaque'})).toBeUndefined()
  expect(publicNativeToolResult([{type:'thinking',text:'private'},{type:'text',text:''}])).toBeUndefined()
 })
 it('uses the native Codex diff unchanged',()=>{
  const event=nativeActivity('patch',{type:'fileChange',changes:[{path:'/work/file.md',kind:{type:'update'},diff:'-before\n+after'}]},true)
  expect(event.canonical?.diffProjection?.entries?.[0]).toMatchObject({path:'/work/file.md',diff:'-before\n+after',additions:1,deletions:1})
  expect(executionActivityTitle(event.canonical,event.payload)).toBe('编辑 file.md')
 })
})

it('omits browser input from native events and stores only screenshot identity',()=>{
 const data=Buffer.from('actual screenshot').toString('base64')
 for(const name of ['browser_tool','mcp__boai__browser_tool']) {
  const event=nativeActivity('browser',{type:'tool_use',name,input:{command:'fill @e1 password-secret'},result:[{type:'image',data,mimeType:'image/png'}]},true)
  const encoded=JSON.stringify(event)
  expect(encoded).not.toContain('password-secret');expect(encoded).not.toContain(data);expect(encoded).toContain('sha256')
 }
})

it('streams Codex public reasoning summaries while excluding private reasoning frames', () => {
 expect(codexExecutionEvent('item/reasoning/summaryTextDelta', { itemId: 'r', summaryIndex: 0, delta: '先核对数据' })).toMatchObject({ id: 'reasoning:r:0', eventType: 'agent.reasoning.block', appendText: '先核对数据' })
 expect(codexExecutionEvent('item/reasoning/textDelta', { itemId: 'r', delta: 'private' })).toBeUndefined()
})
