/*
 * [OUTPUT]: 可选相对业务文件与命令目录申请，核对实际cwd、组合批准和原CLI工具位置一致。
 * [INPUT]: Built CLI path and original Mastra-compatible controlled HTTP protocol.
 * [OUTPUT]: Actual execute_command calls original scoped CLI file tools and reports the same run, without token disclosure.
 * [POS]: Shared standalone/desktop protocol fixture, not a real provider quality test.
 * [PROTOCOL]: 变化同步Header与tests/fixtures/.folder.md。
 */
import { teamEndpoint, sendTeamOutput } from './team-planner'
import type { DirectoryGrant } from '../../src/shared/domain/directory-access'

export async function cliCommandEndpoint(executable: string, businessFile = false, directories?: DirectoryGrant[]) {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const program = `const{execFile}=require('node:child_process');const{promisify}=require('node:util');(async()=>{const call=async(c,input)=>JSON.parse((await promisify(execFile)(process.execPath,[${JSON.stringify(executable)},'invoke',c,...(input===undefined?[]:[JSON.stringify(input)]),'--json'])).stdout);let denied;try{await call('employees')}catch(e){denied=JSON.parse(e.stderr).code}const context=await call('employee:context');const path=${businessFile ? JSON.stringify('cli-nested.txt') : "'self:/runs/'+context.runId+'/cli-nested.txt'"};const write={tool:'write_file',input:{path,content:'CLI_NESTED_FILE'},callId:'nested-file-write'};const first=await call('employee:invoke',write),second=await call('employee:invoke',write),read=await call('employee:invoke',{tool:'read_file',input:{path},callId:'nested-file-read'});process.stdout.write(JSON.stringify({cwd:process.cwd(),context,denied,run:process.env.BOAI_CLI_EMPLOYEE_RUN,hasToken:!!process.env.BOAI_SERVER_TOKEN,hostSecret:!!process.env.BOAI_SECRET_FIXTURE,nested:{same:JSON.stringify(first)===JSON.stringify(second),content:read.content}}))})().catch(()=>process.exit(7))`
  const commandText = `${quote(process.execPath)} -e ${quote(program)}`
  let commandReceipt: { stdout: string; exitCode: number } | undefined
  const endpoint = await teamEndpoint((body, response, index) => {
    const messages = body.messages as { role: string; content: string; tool_calls?: { function: { name: string } }[] }[]
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    if (system.includes('Private participation decision')) { sendTeamOutput(response, { action: 'reply', responseKind: 'task', work: { key: 'automatic-cli-command', scope: '核对原命令CLI身份', deliverable: '命令身份回执' } }); return }
    if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
    if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { sendTeamOutput(response, { action: 'publish', text: '命令身份已核对' }); return }
    const called = messages.flatMap(message => message.tool_calls ?? []).map(tool => tool.function.name)
    const receipt = messages.find(message => message.role === 'tool')
    if (receipt) commandReceipt = JSON.parse(receipt.content)
    if (!called.includes('report_work')) {
    const name = called.includes('execute_command') ? 'report_work' : 'execute_command'
    const args = name === 'execute_command' ? { command: commandText, ...(directories ? { directories } : {}) } : { disposition: 'delivered', summary: '命令身份已核对', evidence: [{ kind: 'answer', reference: '命令身份已核对' }] }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const [delta, finish_reason] of [[{ role: 'assistant' }, null], [{ tool_calls: [{ index: 0, id: `cli-command-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, null], [{}, 'tool_calls']] as const) response.write(`data: ${JSON.stringify({ id: `cli-command-${index}`, object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    response.end('data: [DONE]\n\n'); return
    }
    sendTeamOutput(response, '命令身份已核对')
  })
  return { ...endpoint, get commandReceipt() { return commandReceipt } }
}
