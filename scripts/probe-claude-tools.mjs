/*
 * [INPUT]: 实际Claude程序、生产MCP桥与本地Anthropic协议服务；仅合成凭据。
 * [OUTPUT]: 实际CLI宿主工具阶段明确低强度/取消默认、工具目录、文件回执、多步用量及取消等待；不证明员工UI或Work发布。
 * [POS]: 第13组Claude宿主工具桥的独立协议验收入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

if (!process.env.BOAI_CLAUDE_PROGRAM || !process.env.BOAI_CLAUDE_EVIDENCE) throw new Error('需要明确的程序路径和新证据文件')
const out=resolve(process.env.BOAI_CLAUDE_EVIDENCE)
await mkdir(dirname(out),{recursive:true})
const root=await mkdtemp(join(tmpdir(),'boai-claude-tools-')),bundle=join(root,'adapter.cjs')
await build({stdin:{contents:"export { verifyClaudeProgram, runClaudePhase } from './src/runtime/adapters/claude/turn'",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node22',logLevel:'silent'})
const {verifyClaudeProgram,runClaudePhase}=await import(pathToFileURL(bundle).href)
const sources=['src/runtime/adapters/claude/turn.ts','src/runtime/adapters/claude/tools.ts','src/runtime/adapters/claude/policy.ts','src/runtime/adapters/claude/process.ts','src/runtime/modules/backends/program.ts','src/runtime/adapters/mastra/host-command.ts','scripts/probe-claude-tools.mjs','package.json','pnpm-lock.yaml']
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(path))])))
const evidence={kind:'actual-claude-cli-production-mcp-local-protocol',createdAt:new Date().toISOString(),platform:process.platform,realProvider:false,uiVerified:false,workVerified:false,sourceHashes,requests:[],hostCalls:[],steps:[]}
const token=`fixture-${randomUUID()}`,fakeKey=`boai-synthetic-${randomUUID()}`
let stage='success',number=0,fixtureError
const server=createServer(async(req,res)=>{
  try {
    const chunks=[];for await(const chunk of req)chunks.push(chunk)
    if(!req.url.includes('/messages') || req.url.includes('count_tokens')){res.writeHead(404).end('{}');return}
    const body=JSON.parse(Buffer.concat(chunks).toString()),current=++number
    const records=body.messages.flatMap(message=>Array.isArray(message.content)?message.content:[])
    const result=records.find(block=>block.type==='tool_result')
    const first=!result
    evidence.requests.push({stage,model:body.model,tools:body.tools?.map(tool=>tool.name),hasHostReceipt:Boolean(result),number:current,thinking:body.thinking,outputConfig:body.output_config})
    assert.deepEqual(body.output_config,{effort:stage==='success'?'low':'high'})
    assert.ok(current<=3,'Unexpected model request')
    assert.deepEqual(body.tools.map(tool=>tool.name),['mcp__boai__write_proof'])
    if(result){assert.ok(JSON.stringify(result).includes(hash(Buffer.from(token))));assert.equal(result.tool_use_id,'toolu_success')}
    res.setHeader('content-type','text/event-stream')
    for(const event of [
      {type:'message_start',message:{id:`msg_${current}`,type:'message',role:'assistant',content:[],model:body.model,stop_reason:null,stop_sequence:null,usage:{input_tokens:10,cache_creation_input_tokens:3,cache_read_input_tokens:5,output_tokens:0}}},
      {type:'content_block_start',index:0,content_block:first?{type:'tool_use',id:`toolu_${stage}`,name:'mcp__boai__write_proof',input:{}}:{type:'text',text:''}},
      {type:'content_block_delta',index:0,delta:first?{type:'input_json_delta',partial_json:JSON.stringify({text:token})}:{type:'text_delta',text:'宿主已确认'}},
      {type:'content_block_stop',index:0},
      {type:'message_delta',delta:{stop_reason:first?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:2}},
      {type:'message_stop'}
    ])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    res.end()
  }catch(error){fixtureError=error;res.writeHead(500).end('{}')}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const cwd=join(root,'employee'),configDirectory=join(root,'config'),signal=AbortSignal.timeout(90_000)
async function scan(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())result.push(...await scan(path));else if(entry.isFile())result.push(path)}return result}
try {
  const program=await verifyClaudeProgram({executable:process.env.BOAI_CLAUDE_PROGRAM,cwd,configDirectory,signal})
  evidence.program=program
  const tool={name:'write_proof',description:'Write the exact supplied text to the host-managed probe file and return its hash.',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}
  const common={program,cwd,configDirectory,signal,baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:fakeKey,model:'deepseek-v4-pro',instructions:'Use only the explicitly provided host tool.',prompt:`Write ${token} using the host tool.`,timeoutMs:30_000}
  let text=''
  const result=await runClaudePhase({...common,ephemeral:true,effort:'low',onDelta:delta=>{text+=delta},tools:[{...tool,execute:async(args,id)=>{
    assert.deepEqual(args,{text:token});assert.equal(id,'toolu_success')
    await writeFile(join(cwd,'proof.txt'),args.text,{flag:'wx'})
    const receipt={id,hash:hash(await readFile(join(cwd,'proof.txt')))}
    evidence.hostCalls.push(receipt);return receipt
  }}]})
  assert.equal(fixtureError,undefined);assert.equal(result.text,'宿主已确认');assert.equal(text,result.text)
  assert.equal(evidence.hostCalls.length,1);assert.equal(number,2)
  assert.deepEqual(result.usage,{inputTokens:36,outputTokens:4,totalTokens:40})
  evidence.steps.push({kind:'native-tool-loop-and-current-phase-usage',passed:true,...result})
  evidence.proof={text:await readFile(join(cwd,'proof.txt'),'utf8'),hash:hash(await readFile(join(cwd,'proof.txt')))}
  stage='cancel'
  const controller=new AbortController()
  let release,ended=false,stopSeen=false
  const barrier=new Promise(done=>{release=done})
  const stopped=await runClaudePhase({...common,signal:controller.signal,ephemeral:true,onStop:()=>{stopSeen=true;release()},tools:[{...tool,execute:async(args,id)=>{
    evidence.hostCalls.push({id,cancelled:true});controller.abort(new Error('本场明确取消'))
    await barrier;ended=true;return {done:true}
  }}]}).catch(error=>error)
  assert.equal(stopped,controller.signal.reason);assert.equal(ended,true);assert.equal(stopSeen,true);assert.equal(number,3)
  evidence.steps.push({kind:'cancel-waits-for-cli-and-host-tool-exit',passed:true})
  const files=await scan(root)
  assert.ok(!files.some(path=>path.endsWith('connection.json')))
  for(const path of files)assert.ok(!(await readFile(path)).includes(Buffer.from(fakeKey)))
  evidence.steps.push({kind:'private-mcp-config-removed-and-no-provider-credential-on-disk',passed:true})
  for(const [path,expected] of Object.entries(sourceHashes))assert.equal(hash(await readFile(path)),expected)
  evidence.passed=true
}catch(error){evidence.passed=false;evidence.error=error instanceof Error?error.message:'Unknown protocol failure';process.exitCode=1}
finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  await writeFile(out,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'})
  await rm(root,{recursive:true,force:true})
  console.log(JSON.stringify({passed:evidence.passed,steps:evidence.steps,error:evidence.error,evidence:out}))
}
