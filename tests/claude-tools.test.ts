/*
 * [OUTPUT]: 实际MCP客户端收到原生image部件及同tool-use回执，图片不退化为JSON文本。
 * [OUTPUT]: 只读计数/固定状态区分公告、接收、执行、回执及退出未知；重复请求不重放、失败/取消后仍可核对且无私有载荷。
 * [INPUT]: 真实MCP客户端/回环连接、明确工具调用身份与取消屏障。
 * [OUTPUT]: 工具来源/参数/重复回执、连接断开不重放、拒绝越权和关闭等待实际工具；非真实模型或员工UI。
 * [POS]: Claude宿主工具桥模块验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { NativeTool } from '../src/runtime/adapters/native-task'
import { createClaudeToolBridge } from '../src/runtime/adapters/claude/tools'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const operation of cleanup.splice(0).reverse()) await operation() })
async function setup(execute: (args: unknown, id: string) => Promise<unknown> = async (args, id) => ({ args, id }), toModelContent?: NativeTool['toModelContent']) {
  const root = await mkdtemp(join(tmpdir(), 'boai-claude-mcp-test-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const controller = new AbortController(), failures: Error[] = []
  const bridge = await createClaudeToolBridge({configDirectory:root,signal:controller.signal,
    tools:[{name:'echo',description:'Return the received payload',inputSchema:{type:'object',properties:{text:{type:'string'}}},execute,toModelContent}],
    onFailure: error => {failures.push(error);controller.abort(error)}})
  let closed = false
  const close = async () => { if (closed) return; closed=true; controller.abort(new Error('测试明确退出')); await bridge.close() }
  cleanup.push(close)
  const configuration = JSON.parse(await readFile(bridge.configPath,'utf8')).mcpServers.boai
  const client = new Client({name:'BoAI protocol test',version:'1'})
  const transport = new StreamableHTTPClientTransport(new URL(configuration.url),{requestInit:{headers:configuration.headers}})
  await client.connect(transport)
  cleanup.push(()=>client.close())
  const call=(id:string,args:Record<string,unknown>={text:'value'})=>client.callTool({name:'echo',arguments:args,_meta:{'claudecode/toolUseId':id}})
  return {root,bridge,controller,failures,configuration,client,transport,call,close}
}

it('does not execute until the native announcement matches, and reuses the same receipt for a retransmitted tool-use id',async()=>{
  const calls:{args:unknown;id:string}[]=[]
  const fixture=await setup(async(args,id)=>{calls.push({args,id});return {receipt:'one'}})
  const pending=fixture.call('tool_a')
  await new Promise(resolve=>setTimeout(resolve,30));expect(calls).toEqual([])
  expect(fixture.bridge.callState('tool_a')).toBe('received')
  expect(fixture.bridge.diagnostic()).toMatchObject({announcedCalls:0,receivedCalls:1,executionStarts:0})
  fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'value'})
  expect(await pending).toMatchObject({content:[{type:'text',text:'{"receipt":"one"}'}]})
  expect(await fixture.call('tool_a')).toMatchObject({content:[{text:'{"receipt":"one"}'}]})
  expect(calls).toEqual([{args:{text:'value'},id:'tool_a'}]);fixture.bridge.assertComplete()
  expect((await stat(fixture.bridge.configPath)).mode & 0o777).toBe(0o600)
  await fixture.close();await expect(stat(fixture.bridge.configPath)).rejects.toMatchObject({code:'ENOENT'})
})

it.each(['arguments','name','identity'] as const)('rejects changed or missing %s before another side effect',async mode=>{
  let calls=0
  const fixture=await setup(async()=>{calls++;return {done:true}})
  fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'value'})
  await fixture.call('tool_a')
  const result=await fixture.client.callTool({name:mode==='name'?'unlisted':'echo',arguments:{text:mode==='arguments'?'changed':'value'},_meta:mode==='identity'?{}:{'claudecode/toolUseId':'tool_a'}})
  expect(result.isError).toBe(true);expect(calls).toBe(1);expect(fixture.failures).toHaveLength(1)
  expect(fixture.bridge.diagnostic()).toMatchObject({announcedCalls:1,receivedCalls:1,executionStarts:1,completionConfirmations:1,failedRequests:1})
})

it('does not promote a native progress or tool-result event to a host completion receipt',async()=>{
  const fixture=await setup()
  expect(()=>fixture.bridge.assertResult('unannounced')).toThrow('宿主完成回执')
  fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'value'})
  expect(()=>fixture.bridge.assertResult('tool_a')).toThrow('宿主完成回执')
  expect(()=>fixture.bridge.assertComplete()).toThrow('未确认')
  expect(()=>fixture.bridge.announce('native','Bash',{})).toThrow('未授权')
  expect(()=>fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'changed'})).toThrow('发生变化')
})

it('observes announcement, receipt and actual execution separately without exposing identity or replaying an effect',async()=>{
  let count=0,release!:()=>void
  const barrier=new Promise<void>(done=>{release=done})
  const fixture=await setup(async()=>{count++;await barrier;return {privateResult:'tool-result-secret'}})
  fixture.bridge.announce('private-tool-id','mcp__boai__echo',{text:'tool-input-secret'})
  expect(fixture.bridge.callState('private-tool-id')).toBe('announced')
  expect(fixture.bridge.callState('absent')).toBe('unknown')
  expect(fixture.bridge.diagnostic()).toEqual({announcedCalls:1,receivedCalls:0,executionStarts:0,executionReturns:0,executionExits:0,completionConfirmations:0,responsePreparations:0,failedRequests:0})
  const pending=fixture.call('private-tool-id',{text:'tool-input-secret'})
  try {
    await expect.poll(()=>fixture.bridge.callState('private-tool-id')).toBe('executing')
    expect(fixture.bridge.diagnostic()).toMatchObject({receivedCalls:1,executionStarts:1,executionExits:0,completionConfirmations:0})
  } finally {release();await pending}
  expect(fixture.bridge.callState('private-tool-id')).toBe('confirmed')
  expect(fixture.bridge.diagnostic()).toEqual({announcedCalls:1,receivedCalls:1,executionStarts:1,executionReturns:1,executionExits:1,completionConfirmations:1,responsePreparations:1,failedRequests:0})
  await fixture.call('private-tool-id',{text:'tool-input-secret'})
  expect(count).toBe(1);expect(fixture.bridge.diagnostic().executionStarts).toBe(1)
  expect(JSON.stringify(fixture.bridge.diagnostic())).not.toMatch(/private-tool-id|tool-input-secret|tool-result-secret|echo/)
})

it('rejects browser origins and incorrect credentials without cancelling the legitimate phase',async()=>{
  const fixture=await setup()
  for(const headers of [{Authorization:'wrong'}, {...fixture.configuration.headers,Origin:'https://untrusted.example'}]){
    expect((await fetch(fixture.configuration.url,{method:'POST',headers,body:'{}'})).status).toBe(403)
  }
  expect(fixture.failures).toEqual([])
  expect((await fixture.client.listTools()).tools.map(t=>t.name)).toEqual(['echo'])
})

it('keeps the original pending effect after HTTP disconnect and returns it once on retry with the same identity',async()=>{
  let started=false, count=0, release!:()=>void
  const barrier=new Promise<void>(done=>{release=done})
  const fixture=await setup(async()=>{count++;started=true;await barrier;return {receipt:'original'}})
  fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'value'})
  const abort=new AbortController()
  const disconnected=fetch(fixture.configuration.url,{method:'POST',signal:abort.signal,headers:{...fixture.configuration.headers,'Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Session-Id':fixture.transport.sessionId!, 'MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:'lost-response',method:'tools/call',params:{name:'echo',arguments:{text:'value'},_meta:{'claudecode/toolUseId':'tool_a'}}})}).catch(e=>e)
  try {
    await expect.poll(()=>started).toBe(true);abort.abort();await disconnected
    const replay=fixture.call('tool_a');release()
    expect(await replay).toMatchObject({content:[{text:'{"receipt":"original"}'}]})
    expect(count).toBe(1);expect(fixture.failures).toEqual([])
  } finally {release()}
})

it('holds close until an already executing host tool actually exits, preserving cancellation',async()=>{
  let started=false, ended=false, release!:()=>void
  const barrier=new Promise<void>(done=>{release=done})
  const fixture=await setup(async()=>{started=true;await barrier;ended=true;return {done:true}})
  fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'value'})
  const call=fixture.call('tool_a').catch(e=>e)
  await expect.poll(()=>started).toBe(true)
  // The real phase waits for the CLI to exit before closing its bridge. A lost
  // HTTP response alone does not terminate an MCP client's pending request.
  await fixture.client.close();await call
  let closed=false
  const closing=fixture.close().then(()=>{closed=true})
  try {
    await new Promise(resolve=>setTimeout(resolve,30))
    expect(closed).toBe(false);expect(ended).toBe(false)
  } finally {release();await closing}
  expect(closed).toBe(true);expect(ended).toBe(true)
  expect(fixture.bridge.callState('tool_a')).toBe('exited_unconfirmed')
  expect(fixture.bridge.diagnostic()).toMatchObject({executionStarts:1,executionReturns:1,executionExits:1,completionConfirmations:0,responsePreparations:0,failedRequests:1})
})

it('keeps a thrown host effect unconfirmed after actual exit without retaining the private failure',async()=>{
  const fixture=await setup(async()=>{throw new Error('host-effect-secret')})
  fixture.bridge.announce('tool_a','mcp__boai__echo',{text:'value'})
  expect(await fixture.call('tool_a')).toMatchObject({isError:true})
  expect(fixture.bridge.callState('tool_a')).toBe('exited_unconfirmed')
  expect(fixture.bridge.diagnostic()).toEqual({announcedCalls:1,receivedCalls:1,executionStarts:1,executionReturns:0,executionExits:1,completionConfirmations:0,responsePreparations:0,failedRequests:1})
  expect(JSON.stringify(fixture.bridge.diagnostic())).not.toContain('host-effect-secret')
})

it('keeps externally changed temporary configuration instead of deleting unknown bytes',async()=>{
  const fixture=await setup()
  await writeFile(fixture.bridge.configPath,'externally changed')
  await expect(fixture.close()).rejects.toThrow('外改')
  expect(await readFile(fixture.bridge.configPath,'utf8')).toBe('externally changed')
})

it('returns actual MCP image content and reuses the original media result on retransmission', async () => {
 const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
 let calls=0
 const fixture=await setup(async()=>{calls++;return {image:data}},result=>[{type:'text',text:'实际截图'},{type:'image',mimeType:'image/png',data:(result as {image:string}).image}])
 fixture.bridge.announce('tool_image','mcp__boai__echo',{text:'value'})
 const first=await fixture.call('tool_image')
 expect(first).toMatchObject({content:[{type:'text',text:'实际截图'},{type:'image',mimeType:'image/png',data}]})
 expect(await fixture.call('tool_image')).toEqual(first)
 expect(calls).toBe(1);fixture.bridge.assertComplete()
})
