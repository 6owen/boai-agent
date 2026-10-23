/*
 * [INPUT]: 实际回环请求、合成上游和原关闭/取消信号。
 * [OUTPUT]: 唯一私有格式器按每次累计历史选择未完成/匹配失败的调用，合法成功后保留原选择；错序/重复/未知/未确认拒绝且上游零请求，原来源/响应/鉴权/实际退出保持，无供应商或UI结论。
 * [POS]: Claude思考参数提供方桥模块回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { afterEach,expect,it } from 'vitest'
import { createServer,request,type IncomingMessage,type ServerResponse } from 'node:http'
import { createClaudeThinkingBridge } from '../src/runtime/adapters/claude/thinking-bridge'

const cleanups:(()=>Promise<unknown>)[]=[]
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
async function endpoint(handler:(req:IncomingMessage,res:ServerResponse)=>void){
 const server=createServer(handler);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done))
 cleanups.push(async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))})
 return `http://127.0.0.1:${(server.address()as any).port}`
}
const payload={model:'deepseek-v4-pro',messages:[{role:'user',content:'原消息/文件 hash 不变'}],system:'Original private instructions',tools:[{name:'StructuredOutput',input_schema:{type:'object'}}],thinking:{type:'adaptive'},output_config:{effort:'low'},stream:true}
async function bridge(baseUrl:string){
 const errors:Error[]=[],controller=new AbortController()
 const value=await createClaudeThinkingBridge({baseUrl,apiKey:'synthetic-original-key',model:payload.model,signal:controller.signal,onFailure:error=>errors.push(error)})
 cleanups.push(value.close);return {...value,errors,controller}
}
const send=(b:{baseUrl:string;apiKey:string},body:unknown=payload,extra:Record<string,string>={})=>fetch(b.baseUrl+'/v1/messages?beta=true',{method:'POST',headers:{'content-type':'application/json','x-api-key':b.apiKey,...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(2000)})
const use=(id:string)=>({role:'assistant',content:[{type:'tool_use',id,name:'StructuredOutput',input:{action:'discard'}}]})
const receipt=(id:string,extra:Record<string,unknown>={})=>({role:'user',content:[{type:'tool_result',tool_use_id:id,content:'Private formatter receipt',...extra}]})
async function recordingEndpoint(){
 const requests:Record<string,unknown>[]=[]
 const baseUrl=await endpoint((req,res)=>{void(async()=>{
  const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk))
  requests.push(JSON.parse(Buffer.concat(parts).toString()));res.writeHead(200,{'content-type':'application/json'}).end('{"source":"original response"}')
 })()})
 return {baseUrl,requests}
}

it('preserves sources and formatter and streams original bytes while selecting only the unfinished private formatter',async()=>{
 let actual:any,key:unknown,path:unknown,cookie:unknown
 const bytes='event: content_block_delta\ndata: {"text":"原结果"}\n\n'
 const upstream=await endpoint((req,res)=>{void(async()=>{
  const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk));actual=JSON.parse(Buffer.concat(parts).toString());key=req.headers['x-api-key'];path=req.url;cookie=req.headers.cookie
  res.writeHead(200,{'content-type':'text/event-stream','set-cookie':'should-not-cross'});res.write(bytes.slice(0,17));res.end(bytes.slice(17))
 })()})
 const b=await bridge(upstream+'/anthropic'),response=await send(b,payload,{cookie:'untrusted-cookie'})
 expect(await response.text()).toBe(bytes);expect(response.headers.get('set-cookie')).toBeNull()
 expect(actual).toEqual({...payload,thinking:{type:'disabled'},output_config:undefined,tool_choice:{type:'tool',name:'StructuredOutput'}})
 expect(path).toBe('/anthropic/v1/messages?beta=true');expect(key).toBe('synthetic-original-key');expect(b.apiKey).not.toBe(key);expect(cookie).toBeUndefined();expect(b.errors).toEqual([])
})

it('private formatter bridge: selects the only unfinished formatter without replacing its schema, instructions or original choice in the caller',async()=>{
 const upstream=await recordingEndpoint(),b=await bridge(upstream.baseUrl)
 const body={...payload,tool_choice:{type:'auto'},output_config:{effort:'low',format:{type:'json_schema',schema:{type:'object'}}}}
 const original=JSON.stringify(body),response=await send(b,body)
 expect(response.status).toBe(200);expect(await response.text()).toBe('{"source":"original response"}')
 expect(upstream.requests).toEqual([{...body,thinking:{type:'disabled'},output_config:{format:body.output_config.format},tool_choice:{type:'tool',name:'StructuredOutput'}}])
 expect(JSON.stringify(body)).toBe(original);expect(b.errors).toEqual([])
})

it('private formatter bridge: a matching rejected receipt keeps only this private formatter selected',async()=>{
 const upstream=await recordingEndpoint(),b=await bridge(upstream.baseUrl)
 const body={...payload,tool_choice:{type:'auto'},messages:[...payload.messages,use('rejected-1'),receipt('rejected-1',{is_error:true})]}
 const response=await send(b,body);expect(response.status).toBe(200);await response.text()
 expect(upstream.requests).toEqual([{...body,thinking:{type:'disabled'},output_config:undefined,tool_choice:{type:'tool',name:'StructuredOutput'}}]);expect(b.errors).toEqual([])
})

it.each(['false','omitted'] as const)('private formatter bridge: a matching successful receipt with is_error %s preserves the original auto choice',async variant=>{
 const upstream=await recordingEndpoint(),b=await bridge(upstream.baseUrl)
 const body={...payload,tool_choice:{type:'auto'},messages:[...payload.messages,use('completed-1'),receipt('completed-1',variant==='false'?{is_error:false}:{})]}
 const response=await send(b,body);expect(response.status).toBe(200);await response.text()
 expect(upstream.requests).toEqual([{...body,thinking:{type:'disabled'},output_config:undefined}]);expect(b.errors).toEqual([])
})

it.each(['missing','empty'] as const)('private formatter bridge: %s tools preserve the original choice without inventing a formatter',async variant=>{
 const upstream=await recordingEndpoint(),b=await bridge(upstream.baseUrl)
 const {tools:_,...withoutTools}=payload
 const body={...withoutTools,...(variant==='empty'?{tools:[]}:{}),tool_choice:{type:'auto'}}
 const response=await send(b,body);expect(response.status).toBe(200);await response.text()
 expect(upstream.requests).toEqual([{...body,thinking:{type:'disabled'},output_config:undefined}]);expect(b.errors).toEqual([])
})

it('private formatter bridge: rescans each request and its cumulative rejected history without caching completion across requests',async()=>{
 const upstream=await recordingEndpoint(),b=await bridge(upstream.baseUrl)
 const first=[use('rejected-1'),receipt('rejected-1',{is_error:true})]
 const second=[...first,use('rejected-2'),receipt('rejected-2',{is_error:true})]
 const histories=[[],first,second,[...second,use('completed-3'),receipt('completed-3',{is_error:false})],second]
 for(const history of histories){
  const response=await send(b,{...payload,messages:[...payload.messages,...history],tool_choice:{type:'auto'}})
  expect(response.status).toBe(200);await response.text()
 }
 expect(upstream.requests).toEqual(histories.map((history,index)=>({...payload,messages:[...payload.messages,...history],thinking:{type:'disabled'},output_config:undefined,tool_choice:index===3?{type:'auto'}:{type:'tool',name:'StructuredOutput'}})))
 expect(b.errors).toEqual([])
})

it.each(['receipt-before-use','reused-id','unknown-receipt-id','empty-use-id','empty-receipt-id','parallel-uses','pending-use','duplicate-receipt','use-after-success','wrong-use-role','wrong-receipt-role','is-error-string','is-error-null','is-error-number','duplicate-descriptor','missing-schema','array-schema'] as const)('private formatter bridge: rejects %s without making an upstream request or treating it as completion',async variant=>{
 const upstream=await recordingEndpoint(),b=await bridge(upstream.baseUrl)
 let messages:unknown[]=[...payload.messages,use('formatter-1'),receipt('formatter-1')],tools:unknown=payload.tools
 if(variant==='receipt-before-use')messages=[receipt('formatter-1'),use('formatter-1')]
 if(variant==='reused-id')messages=[use('formatter-1'),receipt('formatter-1',{is_error:true}),use('formatter-1'),receipt('formatter-1')]
 if(variant==='unknown-receipt-id')messages=[use('formatter-1'),receipt('foreign-id')]
 if(variant==='empty-use-id')messages=[use(''),receipt('')]
 if(variant==='empty-receipt-id')messages=[use('formatter-1'),receipt('')]
 if(variant==='parallel-uses')messages=[{role:'assistant',content:[...use('formatter-1').content,...use('formatter-2').content]},receipt('formatter-1'),receipt('formatter-2')]
 if(variant==='pending-use')messages=[use('formatter-1')]
 if(variant==='duplicate-receipt')messages=[use('formatter-1'),receipt('formatter-1'),receipt('formatter-1')]
 if(variant==='use-after-success')messages=[use('formatter-1'),receipt('formatter-1'),use('formatter-2'),receipt('formatter-2')]
 if(variant==='wrong-use-role')messages=[{...use('formatter-1'),role:'user'},receipt('formatter-1')]
 if(variant==='wrong-receipt-role')messages=[use('formatter-1'),{...receipt('formatter-1'),role:'assistant'}]
 if(variant==='is-error-string')messages=[use('formatter-1'),receipt('formatter-1',{is_error:'false'})]
 if(variant==='is-error-null')messages=[use('formatter-1'),receipt('formatter-1',{is_error:null})]
 if(variant==='is-error-number')messages=[use('formatter-1'),receipt('formatter-1',{is_error:0})]
 if(variant==='duplicate-descriptor')tools=[...payload.tools,...payload.tools]
 if(variant==='missing-schema')tools=[{name:'StructuredOutput'}]
 if(variant==='array-schema')tools=[{name:'StructuredOutput',input_schema:[]}]
 const response=await send(b,{...payload,messages,tools,tool_choice:{type:'auto'}})
 expect(response.status).toBe(502);expect(await response.text()).not.toMatch(/Private formatter receipt|formatter-1|foreign-id|synthetic-original-key/)
 expect(upstream.requests).toEqual([]);expect(b.errors).toHaveLength(1);expect(b.errors[0].message).not.toMatch(/formatter-1|foreign-id|synthetic|original/)
})

it('does not forward unapproved authority, browser origin, credentials or preflight routes',async()=>{
 let count=0;const b=await bridge(await endpoint((_req,res)=>{count++;res.end()}))
 const rejected:Record<string,string>[]=[{'x-api-key':'wrong'},{origin:'https://untrusted.invalid'}]
 for(const headers of rejected){const r=await send(b,payload,headers);expect(r.status).toBe(403);await r.json()}
 // Fetch normalizes Host; exercise the real wire authority with Node HTTP.
 const hostStatus=await new Promise<number|undefined>((done,reject)=>{
  const outgoing=request(b.baseUrl+'/v1/messages',{method:'POST',headers:{host:'untrusted.invalid','x-api-key':b.apiKey}},incoming=>{incoming.resume();incoming.once('end',()=>done(incoming.statusCode))})
  outgoing.once('error',reject);outgoing.end(JSON.stringify(payload))
 })
 expect(hostStatus).toBe(403)
 const r=await fetch(b.baseUrl+'/v1/models',{headers:{'x-api-key':b.apiKey}});expect(r.status).toBe(404);expect(await r.json()).toMatchObject({type:'error'})
 expect(count).toBe(0);expect(b.errors).toEqual([])
})

it.each(['other-model','business-tool','malformed-body'] as const)('rejects %s without contacting the provider or exposing source credentials',async variant=>{
 let count=0;const b=await bridge(await endpoint((_req,res)=>{count++;res.end()}))
 const value=variant==='other-model'?{...payload,model:'other'}:variant==='business-tool'?{...payload,tools:[{name:'Bash'}]}:['invalid']
 const response=await send(b,value);expect(response.status).toBe(502);await response.text()
 expect(count).toBe(0);expect(b.errors).toHaveLength(1);expect(b.errors[0].message).not.toMatch(/synthetic|original|Bash/)
})

it('closing a still-streaming request waits for the actual upstream connection to exit',async()=>{
 let ended=false
 const b=await bridge(await endpoint((req,res)=>{req.socket.once('close',()=>{ended=true});res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: pending\n\n')}))
 const response=await send(b)
 await b.close();await expect.poll(()=>ended,{timeout:2000}).toBe(true)
 await response.text().catch(()=>undefined)
 expect(b.controller.signal.aborted).toBe(false);expect(b.errors).toEqual([])
 await expect(send(b)).rejects.toThrow()
})

it.each([429,307])('returns upstream %s without adding retries or following redirects',async status=>{
 let count=0
 const b=await bridge(await endpoint((_req,res)=>{count++;res.writeHead(status,{'content-type':'application/json',location:'https://other.invalid','retry-after':'0'});res.end('{"source":"original response"}')}))
 const response=await send(b);expect(response.status).toBe(status);expect(await response.text()).toBe('{"source":"original response"}');expect(count).toBe(1);expect(b.errors).toEqual([])
})
