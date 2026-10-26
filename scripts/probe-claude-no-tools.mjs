/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 实际本机Claude程序、当前底层适配器与隔离的本地Anthropic协议服务。
 * [OUTPUT]: 版本/hash、工具目录、续聊/隔离、用量口径和取消的独立证据；仅合成凭据，不调用真实模型。
 * [POS]: 第13组Claude能力探测，不代替员工UI、Work或供应商验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildWorkspace as build } from './workspace-packages.mjs'

if (!process.env.BOAI_CLAUDE_PROGRAM || !process.env.BOAI_CLAUDE_EVIDENCE) throw new Error('需要明确的程序路径和新证据文件')
const out = resolve(process.env.BOAI_CLAUDE_EVIDENCE)
await mkdir(dirname(out), {recursive:true})
const root = await mkdtemp(join(tmpdir(), 'boai-claude-no-tools-'))
const bundle=join(root,'adapter.cjs')
await build({stdin:{contents:"export { verifyClaudeProgram, runClaudeNoTools } from './packages/runtime/src/adapters/claude/turn'",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node22',logLevel:'silent'})
const {verifyClaudeProgram,runClaudeNoTools}=await import(pathToFileURL(bundle).href)
const sources=['packages/runtime/src/adapters/claude/turn.ts','packages/runtime/src/adapters/claude/tools.ts','packages/runtime/src/adapters/claude/policy.ts','packages/runtime/src/adapters/claude/process.ts','packages/runtime/src/modules/backends/program.ts','packages/runtime/src/adapters/mastra/host-command.ts','scripts/probe-claude-no-tools.mjs','package.json','pnpm-lock.yaml']
const evidence={kind:'actual-claude-cli-local-protocol',createdAt:new Date().toISOString(),platform:process.platform,uiVerified:false,workVerified:false,realProvider:false,
  sourceHashes:Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')]))),requests:[],steps:[]}
const token=`fixture-${randomUUID()}`, poison=`untrusted-${randomUUID()}`, fakeKey=`boai-synthetic-${randomUUID()}`
let stage='first', stallController
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  const raw=Buffer.concat(chunks).toString()
  let body={};try{body=JSON.parse(raw)}catch{}
  if(!req.url.includes('/messages') || req.url.includes('count_tokens')){res.writeHead(404);res.end('{}');return}
  const history=JSON.stringify(body.messages)
  const record={stage,model:body.model,tools:body.tools?.map(t=>t.name),stream:body.stream,containsPoison:raw.includes(poison),containsFirstToken:history.includes(token),messages:body.messages?.length}
  evidence.requests.push(record)
  if(stage==='cancel'){stallController.abort(new Error('本场明确取消'));return}
  const number=evidence.requests.length, text=stage==='first'?'收到':stage==='resume'?(history.includes(token)?token:'missing'):(history.includes(token)?'leaked':'不知道')
  res.setHeader('content-type','text/event-stream')
  for(const event of [
    {type:'message_start',message:{id:`msg_probe_${number}`,type:'message',role:'assistant',content:[],model:body.model,stop_reason:null,stop_sequence:null,usage:{input_tokens:number*10,cache_creation_input_tokens:3,cache_read_input_tokens:5,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:{type:'text_delta',text}},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:2}},
    {type:'message_stop'}
  ])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  res.end()
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const cwd=join(root,'employee-a'),configDirectory=join(root,'config-a')
const signal=AbortSignal.timeout(90_000)
async function scan(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())result.push(...await scan(path));else if(entry.isFile())result.push(path)}return result}
try {
  const program=await verifyClaudeProgram({executable:process.env.BOAI_CLAUDE_PROGRAM,cwd,configDirectory,signal})
  evidence.program=program
  await mkdir(join(cwd,'.claude','skills','fixture'),{recursive:true})
  await writeFile(join(cwd,'CLAUDE.md'),poison)
  await writeFile(join(configDirectory,'CLAUDE.md'),poison)
  await writeFile(join(cwd,'.claude','skills','fixture','SKILL.md'),`---\nname: fixture\ndescription: ${poison}\n---\n${poison}`)
  const settings={hooks:{SessionStart:[{hooks:[{type:'command',command:'touch boai-unexpected-hook'}]}]}}
  await writeFile(join(cwd,'.claude','settings.json'),JSON.stringify(settings))
  await writeFile(join(configDirectory,'settings.json'),JSON.stringify(settings))
  const common={program,cwd,configDirectory,signal,baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:fakeKey,model:'deepseek-v4-pro',instructions:'这是BoAI无工具协议验证。',timeoutMs:20_000}
  let deltas=''
  const first=await runClaudeNoTools({...common,prompt:`记住${token}`,onDelta:text=>{deltas+=text}})
  assert.equal(first.text,'收到');assert.equal(deltas,'收到');assert.deepEqual(first.usage,{inputTokens:18,outputTokens:2,totalTokens:20})
  evidence.steps.push({kind:'first',passed:true,...first})
  stage='resume'
  const resumed=await runClaudeNoTools({...common,sessionId:first.sessionId,prompt:'请回答刚才的暗号'})
  assert.equal(resumed.sessionId,first.sessionId);assert.equal(resumed.text,token)
  assert.deepEqual(resumed.usage,{inputTokens:28,outputTokens:2,totalTokens:30})
  evidence.steps.push({kind:'resume-current-turn-usage',passed:true,...resumed})
  stage='isolation'
  const other=await runClaudeNoTools({...common,cwd:join(root,'employee-b'),configDirectory:join(root,'config-b'),prompt:'另一名员工的暗号是什么？'})
  assert.notEqual(other.sessionId,first.sessionId);assert.equal(other.text,'不知道')
  evidence.steps.push({kind:'separate-session',passed:true,...other})
  assert.ok(evidence.requests.every(r=>r.tools?.length===0&&!r.containsPoison))
  assert.ok(!(await scan(root)).some(path=>path.endsWith('boai-unexpected-hook')))
  evidence.steps.push({kind:'actual-empty-tools-and-no-discovery',passed:true})
  stage='cancel';stallController=new AbortController()
  const stopped=await runClaudeNoTools({...common,signal:stallController.signal,ephemeral:true,prompt:'本场等待明确取消'}).catch(e=>e)
  assert.equal(stopped,stallController.signal.reason)
  evidence.steps.push({kind:'cancel-stalled-real-cli',passed:true})
  const diskFiles=await scan(root)
  for(const path of diskFiles)assert.ok(!(await readFile(path)).includes(Buffer.from(fakeKey)))
  evidence.steps.push({kind:'no-credential-in-private-files',passed:true,filesChecked:diskFiles.length})
  evidence.passed=true
} catch(error) {
  evidence.passed=false;evidence.error=error instanceof Error?error.message:'Unknown probe error';process.exitCode=1
} finally {
  server.closeAllConnections();await new Promise(r=>server.close(r))
  await writeFile(out,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'})
  await rm(root,{recursive:true,force:true})
  console.log(JSON.stringify({passed:evidence.passed,steps:evidence.steps.map(s=>({kind:s.kind,passed:s.passed})),error:evidence.error,evidence:out}))
}
