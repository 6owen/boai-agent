/*
 * [INPUT]: 独立批次目录的逐场景留证清单、最终 Playwright JSON、构建摘要和明确真实模型评估记录。
 * [OUTPUT]: 不覆盖旧批次的全离线 F01–F11 审阅页、逐字节核验资源与检查清单；技术/人工/证据状态分开，保留失败和重试。
 * [POS]: 既有 Electron/评估结果的只读报告入口；不启动测试、不读取配置密钥/数据库、不执行 HTML/SVG 成果。
 * [PROTOCOL]: 修改时同步 Header，并检查所属 .folder.md。
 */
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const FEATURES = [
  ['F01', '员工与 IM 沟通', ['creation','contacts','conversation-list','group-chat','composer','collaboration','employee-tabs','avatars','group-settings','ui'], '独立员工的署名、消息顺序与日常交流。', ['员工身份是否清楚','群内交流是否容易跟随','发送与附件操作是否顺手']],
  ['F02', '材料输入与文件预览', ['materials','artifacts','detail-panel','detail-tabs'], '从聊天文件直接阅读 Markdown、代码和附件。', ['文件是否好读','排版与源码切换是否清楚','读文件时能否继续交流']],
  ['F03', '员工交付、修改与采用', ['artifacts','inbox'], '在员工交付消息内处理成果，并在同一输入框要求修改。', ['交付是否清楚','修改是否符合聊天习惯','不同版本和采用结果是否易懂']],
  ['F04', '审批、补充与失败处理', ['inbox','group-chat','history','team-creation','browser-migration'], '在原聊天处理审批、补充问题和失败后的核对。', ['审批对象是否明确','补充问题是否容易操作','失败和未知结果是否解释清楚']],
  ['F05', 'bobo 创建团队与组织协作', ['team-creation','bobo-collaboration','collaboration'], '保留原讨论，组织独立员工在群中分工交付。', ['讨论与新群关系是否清楚','员工分工是否可理解','最终交付是否满足目标']],
  ['F06', 'Skills 与可用能力', ['local-skills','native-skills','skill-binding','skill-marketplace','skill-updates','skills','environment'], '发现、安装、绑定和使用实际技能。', ['查找技能是否方便','绑定结果是否明确','更新或失败提示是否清楚']],
  ['F07', '员工记忆与纠正', ['unified-memory','team-creation'], '查看记忆管理、来源、纠正和忘记的实际结果。', ['来源是否能看懂','纠正是否易操作','是否回应了真实记忆需求']],
  ['F08', '定时任务与监控', ['schedule-simplification','extensions','automation-monitor','automation-recovery'], '创建任务、查看触发聊天、变化监控与历史结果。', ['创建过程是否清楚','提醒是否有用','失败与历史是否容易找到']],
  ['F09', '内置浏览器', ['browser-migration'], '应用内置浏览器的导航、窗口、下载和网页操作。', ['浏览操作是否自然','窗口导航是否清楚','下载和错误反馈是否明确']],
  ['F10', '搜索、历史与阅读位置', ['reading','search-upgrade','history'], '从关键词回到确切消息和文件版本。', ['结果是否容易理解','定位的上下文是否足够','返回与阅读位置是否自然']],
  ['F11', '设置、数据恢复与外部任务', ['upgrade','skills','extensions','automation-recovery','desktop','local-connections','profile','appearance','pages','detail-panel','detail-tabs'], '查看设置、主题、恢复和外部任务的实际边界。', ['设置是否容易理解','恢复结果是否清楚','中断和未知状态是否易处理']],
].map(([id,title,files,goal,focus]) => ({id,title,files:files.map(name=>`${name}.feature`),goal,focus}))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const within = (root,path) => { const value=relative(root,path); return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value) }
const featureName = path => basename(path || '').replace(/\.feature(?:\.spec\.[cm]?[jt]s)?$/, '.feature')
const args = process.argv.slice(2)
const option = name => args[args.indexOf(name)+1]
if (!args.includes('--input') || !args.includes('--output') || !option('--input') || !option('--output')) throw new Error('用法：node scripts/generate-feature-review.mjs --input DIR --output NEW_DIR')
const input = await realpath(resolve(option('--input'))), output = resolve(option('--output'))
if (input === output || within(output,input)) throw new Error('输出目录必须是新的独立目录，不能覆盖输入或其父目录')
const readJSON = async path => JSON.parse(await readFile(path,'utf8'))
const optionalJSON = async path => { try {return await readJSON(path)} catch(error) {if(error.code==='ENOENT')return undefined;throw error} }
const report = await readJSON(join(input,'playwright-results.json'))
if (!Array.isArray(report.suites) || !report.stats?.startTime) throw new Error('缺少完整 Playwright JSON 报告身份')
const build = await optionalJSON(join(input,'build-manifest.json'))
const registration = await optionalJSON(join(input,'registration.json'))
const budget = await optionalJSON(join(input,'real-budget.json'))
const findings = (await optionalJSON(join(input,'findings.json')) || []).map(item=>({id:item.id,title:item.title,status:item.status,observed:item.observed,analysis:item.analysis,next:item.next,actionThisRun:item.actionThisRun}))
await mkdir(output, {recursive:false})
await mkdir(join(output,'resources'))
const globalGaps = []
let resourceCount = 0

async function checkedRead(path, root=input, max=20*1024*1024) {
  const absolute=resolve(path), canonicalRoot=await realpath(root)
  if(!within(canonicalRoot,absolute))throw new Error('资源路径不在本次明确输入目录内')
  let component=canonicalRoot
  for(const part of relative(canonicalRoot,absolute).split(sep)) {component=join(component,part);if((await lstat(component)).isSymbolicLink())throw new Error('拒绝符号链接资源')}
  const stats=await lstat(absolute)
  if(!stats.isFile()||stats.size>max)throw new Error('资源不是普通文件或超过留证大小上限')
  if(!within(canonicalRoot,await realpath(absolute)))throw new Error('资源真实路径超出范围')
  return readFile(absolute)
}
async function copyEvidence(item, root, source) {
  const bytes=await checkedRead(source,root)
  if(!/^[a-f0-9]{64}$/.test(item.sha256 || '') || sha(bytes)!==item.sha256)throw new Error('原始字节 SHA-256 不符或缺失')
  if(item.bytes!==undefined && bytes.length!==item.bytes)throw new Error('原始文件长度与清单不符')
  const labelName=String(item.label||'').split(' · ').find(part=>/\.[a-z0-9]{1,8}$/i.test(part))
  const name=basename(item.name || labelName || item.source || item.path || 'original')
  const extension=extname(name).toLowerCase()
  const screenshot=item.kind==='screenshot'
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255
  if(screenshot&&!png&&!jpeg)throw new Error('截图不是原始 PNG/JPEG 栅格图')
  const suffix=screenshot?(png?'.png':'.jpeg'):/^[.](txt|md|ts|tsx|js|jsx|json|py|css|csv|yaml|yml|sql|sh|go|rs|java|c|cpp|h)$/i.test(extension)?extension:'.download'
  const path=`resources/${String(++resourceCount).padStart(4,'0')}-${item.sha256.slice(0,16)}${suffix}`
  await writeFile(join(output,path),bytes,{flag:'wx'})
  if(sha(await readFile(join(output,path)))!==item.sha256)throw new Error('导出后资源 hash 核对失败')
  const textual=!screenshot&&(item.kind==='data'||/\.(txt|md|ts|tsx|js|jsx|json|py|css|csv|yaml|yml|sql|sh|go|rs|java|c|cpp|h|html?|svg|xml)$/i.test(name))
  return {kind:item.kind,label:item.label,name,path,sha256:item.sha256,bytes:bytes.length,launch:item.launch,capturedAt:item.capturedAt,source:item.source,...(textual&&bytes.length<=256*1024?{text:bytes.toString('utf8')}:{}),...(textual&&bytes.length>256*1024?{previewGap:'原件已归档；大于 256 KiB，仅提供下载'}:{})}
}
const cases=new Map()
function visit(suite) {
  for(const spec of suite.specs || []) for(const test of spec.tests || []) {
    const id=test.testId || test.id || spec.id
    if(!id) {globalGaps.push(`测试缺少唯一身份：${spec.title}`);continue}
    const results=test.results || [], last=results.at(-1)
    const status=test.status==='flaky'?'flaky':test.status==='skipped'||last?.status==='skipped'?'skipped':test.status==='expected' && last?.status===test.expectedStatus?'passed':last?'failed':'not-run'
    cases.set(id,{id,title:spec.title,feature:featureName(spec.file||suite.file),status,expectedStatus:test.expectedStatus,project:test.projectName,attempts:[],results:results.map(result=>({retry:result.retry,status:result.status,duration:result.duration,startTime:result.startTime,errors:(result.errors || (result.error?[result.error]:[])).map(error=>error.message||error.value||'未知错误')}))})
  }
  for(const child of suite.suites || [])visit(child)
}
for(const suite of report.suites)visit(suite)
let directories=[]
try{directories=await readdir(join(input,'scenarios'),{withFileTypes:true})}catch(error){if(error.code!=='ENOENT')throw error;globalGaps.push('本批没有逐场景留证目录')}
for(const dir of directories.filter(dir=>dir.isDirectory())) {
  const root=join(input,'scenarios',dir.name)
  let manifest
  try{manifest=await readJSON(join(root,'manifest.json'))}catch(error){globalGaps.push(`${dir.name}：清单不可读，${error.message}`);continue}
  let item=cases.get(manifest.testId)
  if(!item){item={id:manifest.testId,title:manifest.title,feature:featureName(manifest.location?.file),status:'unverified',attempts:[],results:[]};cases.set(item.id,item);globalGaps.push(`${manifest.title}：最终 Playwright 报告中未找到相同 testId`)}
  const result=item.results.find(result=>result.retry===manifest.retry)
  const attempt={retry:manifest.retry,repeatEachIndex:manifest.repeatEachIndex,startedAt:manifest.startedAt,completedAt:manifest.completedAt,status:result?.status||'unverified',evidence:[],gaps:(manifest.gaps||[]).map(gap=>`${gap.label}：${gap.reason}`),traces:[],errors:result?.errors||[],launchCount:manifest.launchCount}
  if(!manifest.completedAt)attempt.gaps.push('留证清单未完成，不能推定该尝试证据完整')
  if(manifest.cleanupErrors?.length)attempt.gaps.push(...manifest.cleanupErrors.map(error=>`清理失败：${error}`))
  for(const evidence of manifest.evidence || [])try{attempt.evidence.push(await copyEvidence(evidence,root,resolve(root,evidence.path)))}catch(error){attempt.gaps.push(`${evidence.label}：${error.message}`)}
  for(const trace of manifest.traces || []) {
    try{const file=await lstat(trace.path);if(!file.isFile()||file.size!==trace.bytes)throw new Error('trace 缺失或文件长度变化');attempt.traces.push({launch:trace.launch,path:trace.path,href:pathToFileURL(trace.path).href,sha256:trace.sha256,bytes:trace.bytes})}
    catch(error){attempt.gaps.push(`运行回放：${error.message}`)}
  }
  attempt.keyFrames=attempt.evidence.filter(evidence=>evidence.kind==='screenshot'&&!/^第 \d+ 次启动结束画面$/.test(evidence.label)).length
  if(!attempt.evidence.some(evidence=>evidence.kind==='screenshot'))attempt.gaps.push('本场景没有可查看的原始截图')
  item.attempts.push(attempt)
}
for(const item of cases.values()) {
  item.attempts.sort((a,b)=>a.retry-b.retry || String(a.startedAt).localeCompare(String(b.startedAt)))
  item.groups=FEATURES.filter(feature=>feature.files.includes(item.feature)).map(feature=>feature.id)
  if(!item.groups.length)globalGaps.push(`尚未映射的 feature：${item.feature} / ${item.title}`)
  if(!item.attempts.length&&item.status!=='skipped'&&item.status!=='not-run')globalGaps.push(`${item.title}：没有逐场景留证清单`)
}
const real=[]
for(const dir of (await readdir(input,{withFileTypes:true})).filter(dir=>dir.isDirectory()&&/^real-model(?:-retry.*)?$/.test(dir.name)).sort((a,b)=>a.name.localeCompare(b.name))) {
  const root=join(input,dir.name), sample=await optionalJSON(join(root,'material-delivery-v1-1.json')), scores=await optionalJSON(join(root,'report','scores.json'))
  const record={id:dir.name,title:dir.name==='real-model'?'首次真实模型尝试':`后续尝试 · ${dir.name}`,status:scores?.scores?.[0]?.verdict||'unverified',gaps:[],inputs:[],files:[],messages:[],checks:scores?.scores?.[0]?.hardChecks||[]}
  if(!sample){record.gaps.push('本次尝试缺少已保存样本，无法推断交付结果');real.push(record);continue}
  record.prompt=sample.prompt;record.criterion=sample.criterion;record.elapsedMs=sample.elapsedMs;record.stage=sample.delivery?.stage
  record.caseId=sample.caseId;record.sampleHash=scores?.scores?.[0]?.sampleHash;record.contractVersion=sample.delivery?.version
  record.providerRequests=scores?.providerRequests ?? sample.metrics?.providerRequestsAfterInput
  record.totalTokens=scores?.totalTokens ?? sample.metrics?.usage?.reported?.totalTokens
  record.usageCoverage=scores?.scores?.[0]?.usageCoverage
  record.errors=[sample.error,...(scores?.scores?.[0]?.runtimeErrors||[]),...(sample.detail?.runs||[]).filter(run=>run.error).map(run=>`${run.agentName||run.agentId}：${run.error}`)].filter(Boolean)
  record.messages=(sample.detail?.messages||[]).map(message=>({id:message.id,sender:message.senderName||message.senderId,content:message.content,sequence:message.sequence,createdAt:message.createdAt,status:message.status})).sort((a,b)=>a.sequence-b.sequence)
  for(const material of sample.delivery?.materials||[]) {
    const identity=material.material
    try{record.inputs.push(await copyEvidence({kind:'file',label:identity.name,name:identity.name,sha256:material.originalHash||identity.contentHash,bytes:identity.size},root,join(root,'data',sample.caseId,'materials',identity.conversationId,identity.id,'original')))}
    catch(error){record.gaps.push(`输入 ${identity.name}：${error.message}`)}
  }
  for(const artifact of sample.artifacts||[]) {
    try{record.files.push(await copyEvidence({kind:'file',label:artifact.name||basename(artifact.path),name:artifact.name||basename(artifact.path),sha256:artifact.sha256||artifact.contentHash,bytes:artifact.bytes},root,artifact.path))}
    catch(error){record.gaps.push(`成果 ${artifact.name||artifact.id}：${error.message}`)}
  }
  record.artifactCount=(sample.artifacts||[]).length
  record.sourceDigest=sample.metadata?.sourceHashes?sha(JSON.stringify(sample.metadata.sourceHashes)):undefined
  if(!scores)record.gaps.push('缺少原评分文件，不将运行状态当作技术通过')
  if(!record.files.length)record.gaps.push(record.artifactCount?'成果登记存在，但实际原件未能归档':'没有实际成果原件，未完成 V1 交付')
  record.gaps.push('这是独立 AppService 后台执行；没有同一次真实模型执行的产品窗口截图')
  real.push(record)
}
const count=items=>({total:items.length,passed:items.filter(item=>item.status==='passed').length,failed:items.filter(item=>item.status==='failed').length,flaky:items.filter(item=>item.status==='flaky').length,notRun:items.filter(item=>['skipped','not-run','unverified'].includes(item.status)).length})
const all=[...cases.values()]
const result={schemaVersion:1,runId:registration?.runId||basename(input),generatedAt:new Date().toISOString(),input,desktopMode:'真实 Electron · 离线协议/合成场景',humanReview:'pending',summary:count(all),playwrightStats:report.stats,globalErrors:(report.errors||[]).map(error=>error.message||error.value),globalGaps,features:FEATURES.map(feature=>({...feature,counts:count(all.filter(item=>item.groups.includes(feature.id)))})),cases:all,real,budget:budget?{used:budget.used,limit:budget.limit,phases:budget.phases}:undefined,build:build?{recordedAt:build.recordedAt,commit:build.commit,dirty:build.dirty,sourceAndBuildDigest:build.sourceAndBuildDigest,lockHash:build.files?.['pnpm-lock.yaml'],sourceCount:Object.keys(build.files||{}).length,desktopMode:build.desktopMode}:undefined,playwrightReport:{path:join(input,'playwright-report','index.html'),href:pathToFileURL(join(input,'playwright-report','index.html')).href},limitations:['本次展示当前已有场景，不代表十一项规格的所有条款均已覆盖。','只有自动结束截图的场景不具备完整关键过程证据；截图不证明所有动态交互。','trace 是事件回放，不是标准连续录屏；完整大文件保留在本批原目录。','离线模型协议验证产品接线与边界；真实供应商结果在独立区域展示。','本批是当前 macOS 开发构建；未验证其他平台和发行安装包。','所有人工效果评价均为待审阅；测试通过或脚本采用不代表用户认可。']}
if(!build)result.globalGaps.push('缺少运行前源码/构建摘要')
result.findings=findings
await writeFile(join(output,'checks.json'),JSON.stringify(result,null,2),{flag:'wx'})
await writeFile(join(output,'manifest.json'),JSON.stringify({schemaVersion:1,runId:result.runId,generatedAt:result.generatedAt,input,build:result.build,humanReview:'pending',copiedResources:resourceCount,checksSha256:sha(await readFile(join(output,'checks.json'))),notes:result.limitations},null,2),{flag:'wx'})

const payload=JSON.stringify(result).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoAI · 本次功能效果审阅</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#24373d;background:#f3f5f4;line-height:1.6;font-size:14px}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1500px;margin:auto;padding:25px 32px}header{padding-bottom:18px}button,select{font:inherit}button{cursor:pointer}a{color:#246f72}h1{font-size:31px;line-height:1.3;letter-spacing:-.04em;margin:12px 0}h2{font-size:22px;margin:0 0 7px}h3{font-size:16px;margin:0 0 8px}p{margin:8px 0}.small{font-size:12px;color:#708188}.brand{font-size:11px;font-weight:700;letter-spacing:.16em;color:#72857f}.hero{display:flex;align-items:center;justify-content:space-between;gap:20px}.badges{display:flex;gap:10px;flex-shrink:0}.badge{border:1px solid #dce4e1;border-radius:13px;background:#fff;padding:12px 17px}.badge strong{display:block;font-size:22px}.pass{color:#2a765d}.fail{color:#ad443f}.warn{color:#996b22}.notice{border:1px solid #e1dcca;background:#f8f3e7;color:#796432;border-radius:10px;padding:12px 15px;font-size:13px}.layout{display:grid;grid-template-columns:245px minmax(0,1fr);gap:24px;padding-top:10px}.nav{position:sticky;top:15px;align-self:start;display:grid;gap:6px}.nav button{border:1px solid transparent;text-align:left;border-radius:10px;background:transparent;padding:10px 12px;color:#526a70}.nav button[aria-current=true]{border-color:#c4dcd5;background:#e2eeea;color:#27574e}.nav strong{font-size:13px;display:block}.nav small{font-size:11px;display:block;margin-top:3px}.panel{min-width:0}.section{border:1px solid #dce4e0;background:#fff;border-radius:15px;padding:21px;margin-bottom:18px}.headrow{display:flex;justify-content:space-between;align-items:flex-start;gap:15px}.status{white-space:nowrap;border-radius:20px;background:#f2f5f3;padding:4px 10px;font-size:12px}.selector{width:100%;padding:11px 12px;border:1px solid #d5e0dc;border-radius:9px;background:#fff;color:#29434a;min-width:0;margin:13px 0}.tabs{display:flex;overflow:auto;gap:6px;padding:10px 0}.tabs button{flex-shrink:0;font-size:12px;border:1px solid #e1e7e3;border-radius:7px;background:#fff;padding:6px 10px}.tabs button[aria-selected=true]{background:#e0eee8;border-color:#a9cec0;color:#275746}.stage{background:#edf1ef;border-radius:11px;overflow:hidden;position:relative}.stage button{border:0;background:transparent;padding:0;width:100%;display:block;cursor:zoom-in}.stage img{display:block;width:100%;height:auto}.caption{padding-top:11px;color:#51686d;font-size:13px}.empty{padding:35px;text-align:center;color:#7a8987;border:1px dashed #cbd7d1;border-radius:10px}.row{display:flex;gap:12px;flex-wrap:wrap}.pill{font-size:12px;border-radius:8px;background:#f2f5f3;padding:6px 10px}details{border-top:1px solid #e4eae6;padding-top:11px;margin-top:12px}summary{cursor:pointer;color:#526b71;font-size:13px;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-height:440px;overflow:auto;background:#f4f6f5;border:1px solid #e0e7e2;padding:14px;border-radius:9px;font-size:12px;line-height:1.75}ul{padding-left:20px}.issues{background:#fff7ef;color:#825032;border:1px solid #efdfcb;border-radius:9px;padding:10px 14px;font-size:13px}.focus{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:15px}.focus span{font-size:12px;color:#647674;padding:10px;border-radius:9px;background:#f4f6f4}.files{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.file{border:1px solid #e2e8e3;border-radius:10px;padding:13px;min-width:0}.file strong{display:block;overflow-wrap:anywhere}.file a{font-size:12px}.transcript{border-left:3px solid #d9e7df;padding-left:14px;margin-top:15px}.transcript p{white-space:pre-wrap;overflow-wrap:anywhere}.identity{overflow-wrap:anywhere}.modal{border:0;border-radius:13px;padding:0;width:min(1500px,96vw);max-width:96vw;background:#f7faf8;max-height:96vh}.modal::backdrop{background:#122126dc;backdrop-filter:blur(6px)}.modalbar{display:flex;justify-content:space-between;gap:10px;padding:12px 16px;position:sticky;top:0;background:white;z-index:1}.modalbar button{border:1px solid #d7e0db;border-radius:6px;padding:4px 11px;background:#fff}.modal img{width:100%;height:auto;display:block}.gapcount{font-size:12px;color:#8d663b}.real{margin-top:24px}.muted{color:#6e807f}.path{font-size:11px;overflow-wrap:anywhere}footer{font-size:11px;color:#84928d}button:focus-visible,a:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #469180;outline-offset:3px}@media(max-width:950px){.hero{align-items:flex-start;flex-direction:column}.layout{grid-template-columns:205px minmax(0,1fr)}.focus{grid-template-columns:1fr}.section{padding:16px}}@media(max-width:680px){header,main,footer{padding-left:16px;padding-right:16px}.layout{grid-template-columns:1fr}.nav{position:static;display:flex;overflow:auto}.nav button{flex:0 0 185px}.badges{width:100%;flex-wrap:wrap}.badge{flex:1;padding:10px 12px}.badge strong{font-size:20px}h1{font-size:27px}.headrow{flex-direction:column}.section{padding:15px}.files{grid-template-columns:1fr}}
</style></head><body><header><div class="brand">BOAI / 本次功能效果审阅 · ${escape(result.runId)}</div><div class="hero"><div><h1>把实际做成的样子，放在这里看。</h1><p class="muted">本次新运行的真实 Electron 界面与实际文件。按功能审阅，失败和缺口一起保留。</p></div><div class="badges"><div class="badge"><span class="small">离线场景技术结果</span><strong id="overall"></strong></div><div class="badge"><span class="small">人工效果结论</span><strong class="warn">待你审阅</strong></div></div></div><p class="notice" id="notice"></p></header><main><div class="layout"><nav class="nav" id="features" aria-label="按功能审阅"></nav><div class="panel"><section class="section" id="feature"></section><section class="section" id="scenario"></section><section class="section" id="technical"></section></div></div><section class="section real" id="real"></section><section class="section"><h2>本批证据与未验证范围</h2><div id="limits"></div><details><summary>源码、构建与批次身份</summary><pre id="build"></pre><p><a href="manifest.json" download>下载报告清单</a> · <a href="checks.json" download>下载检查与证据索引</a></p></details></section></main><footer>本地离线报告 · 实际资源已逐字节核对 · 查看不代表认可，所有人工结论仍待审阅。</footer><dialog class="modal" id="zoom" aria-labelledby="zoom-title"><div class="modalbar"><strong id="zoom-title"></strong><div><button id="prev" aria-label="上一张截图">←</button> <button id="next" aria-label="下一张截图">→</button> <button id="close">关闭 / Esc</button></div></div><img id="zoom-image" alt="实际原始截图"></dialog><script type="application/json" id="report-data">${payload}</script><script>
const R=JSON.parse(document.getElementById('report-data').textContent);const $=id=>document.getElementById(id);const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const label=s=>({passed:'技术通过',failed:'技术失败',flaky:'重试后通过',skipped:'已跳过','not-run':'未执行',unverified:'未核对',incomplete:'不完整',pending:'待审阅'}[s]||s);let featureId='F02',caseId,frames=[],frameIndex=0;
$('overall').textContent=R.summary.passed+' / '+R.summary.total+' 通过';$('overall').className=R.summary.failed?'fail':'pass';$('notice').textContent='本次新运行 · '+R.desktopMode+'。'+R.summary.failed+' 场失败，'+R.summary.flaky+' 场重试，'+R.summary.notRun+' 场未执行或未核对。真实供应商模型为下方独立后台尝试，不与离线截图拼接。';
function fileCard(file){return '<div class="file"><strong>'+E(file.label||file.name)+'</strong><span class="small">'+E(file.bytes)+' 字节 · 原始文件</span><p><a href="'+E(file.path)+'" download="'+E(file.name)+'">下载原件</a></p>'+(file.text!==undefined?'<details><summary>'+(file.kind==='data'?'查看明确记录的 JSON':'安全源码预览')+'</summary><pre>'+E(file.text)+'</pre></details>':'<p class="small">'+E(file.previewGap||'此格式只提供原件下载，不执行文件内容。')+'</p>')+'<details><summary>文件身份</summary><p class="path">SHA-256 '+E(file.sha256)+'</p></details></div>'}
function gaps(values){return values.length?'<div class="issues"><strong>需要保留的问题 / 证据缺口</strong><ul>'+values.map(value=>'<li>'+E(value)+'</li>').join('')+'</ul></div>':''}
function drawNav(){const order=['F02','F03','F04','F01','F05','F06','F07','F08','F09','F10','F11'];$('features').innerHTML=order.map(id=>{const f=R.features.find(x=>x.id===id);return '<button data-feature="'+id+'" aria-current="'+(id===featureId)+'"><strong>'+E(id+' '+f.title)+'</strong><small>'+f.counts.passed+' / '+f.counts.total+' 通过'+(f.counts.failed?' · '+f.counts.failed+' 失败':'')+' · 效果待审阅</small></button>'}).join('');$('features').querySelectorAll('button').forEach(button=>button.onclick=()=>{featureId=button.dataset.feature;caseId=undefined;render()})}
function render(){drawNav();const f=R.features.find(x=>x.id===featureId),items=R.cases.filter(x=>x.groups.includes(featureId));const preferred={F02:'聊天文件直接打开安全的文档与代码预览',F03:'新版发布保留当前审阅版本和真实材料依据',F04:'群聊审批保留实际命令与单次授权边界'};items.sort((a,b)=>Number(b.title===preferred[featureId])-Number(a.title===preferred[featureId])||Math.max(0,...b.attempts.map(x=>x.keyFrames))-Math.max(0,...a.attempts.map(x=>x.keyFrames)));if(!items.some(x=>x.id===caseId))caseId=items[0]?.id;const c=items.find(x=>x.id===caseId);$('feature').innerHTML='<div class="headrow"><div><p class="brand">'+E(f.id)+'</p><h2>'+E(f.title)+'</h2><p class="muted">'+E(f.goal)+'</p></div><span class="status warn">效果待审阅</span></div><div class="row"><span class="pill">已关联 '+items.length+' 个实际场景</span><span class="pill">技术通过 '+f.counts.passed+'</span><span class="pill fail">失败 '+f.counts.failed+'</span></div><div class="focus">'+f.focus.map(x=>'<span>□ '+E(x)+'</span>').join('')+'</div><details><summary>这项关联哪些既有场景</summary><p class="small">按以下精确 feature 文件关联；同一场景可出现在多个功能中，全局按 testId 去重。这不是全部规格条款的覆盖证明。</p><p class="small">'+f.files.map(E).join(' · ')+'</p></details>';
if(!c){$('scenario').innerHTML='<div class="empty">本次没有运行此功能的对应场景。</div>';$('technical').innerHTML='';return}
const attempts=c.attempts;frames=attempts.flatMap((a,i)=>a.evidence.filter(x=>x.kind==='screenshot').map(x=>({...x,attempt:i,retry:a.retry})));frameIndex=0;const files=attempts.flatMap(a=>a.evidence.filter(x=>x.kind==='file')),data=attempts.flatMap(a=>a.evidence.filter(x=>x.kind==='data'));const issue=attempts.flatMap(a=>a.gaps.map(x=>'尝试 '+(a.retry+1)+'：'+x));if(!attempts.length)issue.push('没有该场景的留证清单');const errors=c.results.flatMap(x=>x.errors||[]);$('scenario').innerHTML='<div class="headrow"><h3>实际场景</h3><span class="status '+(c.status==='passed'?'pass':'fail')+'">'+E(label(c.status))+'</span></div><select class="selector" id="case-choice" aria-label="选择实际场景">'+items.map(x=>'<option value="'+E(x.id)+'" '+(x.id===caseId?'selected':'')+'>'+E(x.title)+' · '+E(label(x.status))+'</option>').join('')+'</select><p class="small">'+E(c.feature)+' · '+attempts.length+' 份尝试记录 · '+frames.length+' 张原始截图</p>'+(frames.length?'<div class="tabs" id="frame-tabs" role="tablist" aria-label="选择关键画面"></div><div class="stage"><button id="enlarge" aria-label="放大当前真实截图"><img id="frame-image" alt="当前场景的实际原始截图"></button></div><p class="caption" id="caption"></p>':'<div class="empty">没有可用截图；不能凭测试结果还原界面。</div>')+'<p class="small">'+(attempts.some(x=>x.keyFrames)?'包含明确操作检查点；所有图片保留实际字节，点击可放大。':'当前仅有结束画面或没有画面；缺少完整关键操作过程，不能据此评价全过程。')+'</p>'+gaps(issue)+(files.length?'<h3 style="margin-top:22px">实际文件</h3><div class="files">'+files.map(fileCard).join('')+'</div>':'<p class="small">此场景没有显式归档原件；这不等于它无需原件证据。</p>')+(data.length?'<details><summary>消息、版本与回执等明确数据 · '+data.length+' 份</summary><div class="files">'+data.map(fileCard).join('')+'</div></details>':'');$('case-choice').onchange=event=>{caseId=event.target.value;render()};if(frames.length){drawFrames();$('enlarge').onclick=()=>{$('zoom').showModal()}};
$('technical').innerHTML='<h3>自动检查与运行记录</h3><p class="small">以下按最终 Playwright 报告确认；不把 fixture 清单的暂存状态当成最终通过。场景标题描述原脚本检查目标，详细步骤保留在原报告与 trace 中。</p>'+gaps(errors)+'<div class="row">'+c.results.map(r=>'<span class="pill">尝试 '+(r.retry+1)+' · '+E(label(r.status))+' · '+(r.duration/1000).toFixed(1)+' 秒</span>').join('')+'</div><details><summary>回放位置与准确身份</summary><p class="path">testId：'+E(c.id)+'</p><p class="small">trace 为 Playwright 事件回放，不是标准录屏；大 ZIP 未复制到本审阅页。若本地链接不可打开，使用下面原路径。</p>'+attempts.flatMap(a=>a.traces).map(t=>'<p><a href="'+E(t.href)+'" download>下载第 '+t.launch+' 次启动 trace</a></p><p class="path">'+E(t.path)+'</p>').join('')+'<p><a href="'+E(R.playwrightReport.href)+'">打开本批 Playwright 报告</a></p><p class="path">'+E(R.playwrightReport.path)+'</p></details>'}
function drawFrames(){const f=frames[frameIndex];$('frame-tabs').innerHTML=frames.map((x,i)=>'<button role="tab" aria-selected="'+(i===frameIndex)+'" data-index="'+i+'">'+E(x.label)+'</button>').join('');$('frame-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{frameIndex=Number(b.dataset.index);drawFrames()});$('frame-image').src=f.path;$('frame-image').alt=f.label;$('caption').textContent=(frameIndex+1)+' / '+frames.length+' · '+f.label+' · 尝试 '+(f.retry+1)+' · 点击放大原图';$('zoom-image').src=f.path;$('zoom-image').alt=f.label;$('zoom-title').textContent=f.label+' · '+(frameIndex+1)+' / '+frames.length}
$('close').onclick=()=>$('zoom').close();$('prev').onclick=()=>{frameIndex=(frameIndex+frames.length-1)%frames.length;drawFrames()};$('next').onclick=()=>{frameIndex=(frameIndex+1)%frames.length;drawFrames()};$('zoom').addEventListener('keydown',event=>{if(event.key==='ArrowLeft')$('prev').click();if(event.key==='ArrowRight')$('next').click()});$('zoom').addEventListener('click',event=>{if(event.target===$('zoom')){const b=$('zoom').getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)$('zoom').close()}});
$('real').innerHTML='<p class="brand">独立的真实供应商模型尝试 · 后台执行</p><h2>真实材料交付，实际结果是什么</h2><p class="muted">这部分来自本次真实 AppService 运行，没有配用离线窗口截图。</p>'+(R.budget?'<p class="pill">本批累计供应商请求：'+R.budget.used+' / '+R.budget.limit+'（含连接检查；每次样本用量见下方）</p>':'')+(R.real.length?R.real.map(r=>'<article style="margin-top:20px"><div class="headrow"><h3>'+E(r.title)+'</h3><span class="status '+(r.status==='passed'?'pass':'fail')+'">'+E(label(r.status))+' · 效果待审阅</span></div><div class="row"><span class="pill">样本请求 '+E(r.providerRequests??'未知')+'</span><span class="pill">总 token '+E(r.totalTokens??'未知')+'</span><span class="pill">实际成果 '+E(r.artifactCount??0)+' 份</span><span class="pill">'+E(r.elapsedMs===undefined?'耗时未知':(r.elapsedMs/1000).toFixed(1)+' 秒')+'</span></div>'+gaps(r.errors||[])+'<details open><summary>原任务与验收要求</summary><pre>'+E(r.prompt)+'</pre><p class="small">'+E(r.criterion)+'</p></details><h3 style="margin-top:16px">实际输入原件</h3><div class="files">'+r.inputs.map(fileCard).join('')+'</div>'+(r.files.length?'<h3 style="margin-top:16px">实际交付原件</h3><div class="files">'+r.files.map(fileCard).join('')+'</div>':'<p class="issues">没有可查看的实际交付原件。不能把模型运行或已发送输入算作完成交付。</p>')+'<details><summary>本次实际消息 · '+r.messages.length+' 条</summary>'+r.messages.map(m=>'<div class="transcript"><strong>'+E(m.sender)+'</strong><span class="small"> · '+E(m.createdAt)+'</span><p>'+E(m.content)+'</p></div>').join('')+'</details><details><summary>原检查结论与证据缺口</summary>'+gaps(r.gaps)+'<pre>'+E(JSON.stringify({caseId:r.caseId,sampleHash:r.sampleHash,contractVersion:r.contractVersion,stage:r.stage,usageCoverage:r.usageCoverage,checks:r.checks},null,2))+'</pre></details></article>').join(''):'<p class="issues">本批没有可核对的真实模型评估记录。</p>');
if(R.findings?.length)$('real').insertAdjacentHTML('beforeend','<details><summary>本次实际问题、分析与后续处理</summary>'+R.findings.map(f=>'<h3 style="margin-top:16px">'+E(f.title)+'</h3><p>'+E(f.observed)+'</p><p>'+E(f.analysis)+'</p><p class="small">'+E(f.actionThisRun)+'</p><p class="small">后续：'+E(f.next)+'</p>').join('')+'</details>');
$('limits').innerHTML='<ul>'+R.limitations.map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>'+gaps([...R.globalGaps,...R.globalErrors]);$('build').textContent=JSON.stringify({runId:R.runId,generatedAt:R.generatedAt,build:R.build,globalCounts:R.summary,stats:R.playwrightStats},null,2);render();
</script></body></html>`
await writeFile(join(output,'index.html'),html,{flag:'wx'})
console.log(JSON.stringify({output,scenarios:all.length,resources:resourceCount,summary:result.summary,globalGaps:globalGaps.length,realAttempts:real.length}))
