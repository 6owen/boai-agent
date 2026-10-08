/*
 * [INPUT]: 显式选定的BoAI已保存DeepSeek连接、隔离目录和本机Claude程序。
 * [OUTPUT]: 在独立Electron中只读解密API凭据并调用真实Claude CLI；无工具、文件工具或员工引擎模式，密钥不出内存和子进程环境。
 * [POS]: Claude运行时真实供应商探测，不进入产品构建或员工UI。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CredentialVault } from '../../src/main/vault'
import type { Connection } from '../../src/shared/domain'
import { ProductStore } from '../../src/runtime/adapters/storage/product-store'
import { verifyClaudeProgram, runClaudeNoTools } from '../../src/runtime/adapters/claude/turn'
import { probeClaudeHostTools } from './claude-real-tools'
import { probeClaudeEmployee } from './claude-real-employee'

const [root, source, connectionId, executable, output, mode] = process.argv.slice(2)
app.setName('BoAI Agent'); app.setPath('userData', join(root, 'electron'))
void (async () => {
  await app.whenReady(); app.dock?.hide()
  const evidence: { passed: boolean; kind: string; uiVerified: false; workVerified: false; steps: unknown[]; provider?: unknown; program?: unknown; error?: string } =
    { passed: false, kind: 'actual-claude-cli-deepseek-model', uiVerified: false, workVerified: false, steps: [] }
  try {
    const store=await ProductStore.openReadOnly(join(source,'boai.sqlite'))
    let connection:Connection|undefined
    try {connection=(await store.load<Connection>('connections')).find(item=>item.id===connectionId)} finally {await store.close()}
    if(!connection?.hasApiKey || !connection.defaultModel || new URL(connection.baseUrl).origin!=='https://api.deepseek.com') throw new Error('所选连接不是本场明确的DeepSeek来源')
    const key=await new CredentialVault(join(source,'credentials.enc.json')).get(connectionId)
    if(!key)throw new Error('所选连接没有凭据')
    const cwd=join(root,'employee-a'),configDirectory=join(root,'config-a'),signal=AbortSignal.timeout(150_000)
    const program=await verifyClaudeProgram({executable,cwd,configDirectory,signal})
    evidence.program=program;evidence.provider={connectionId,provider:connection.provider,model:connection.defaultModel,baseUrl:'https://api.deepseek.com/anthropic',credentialSource:'existing-BoAI-vault-read-only'}
    const common={program,cwd,configDirectory,signal,baseUrl:'https://api.deepseek.com/anthropic',apiKey:key,model:connection.defaultModel,
      instructions:'你是BoAI的独立验收员工。仅根据当前会话回答用户。本阶段无工具，不执行工作。回答简短。',timeoutMs:60_000}
    if(mode==='employee') {
      evidence.kind='actual-claude-cli-deepseek-employee-engine'
      await probeClaudeEmployee(common,connection,root,output,evidence.steps)
    } else if(mode==='tools') {
      evidence.kind='actual-claude-cli-deepseek-host-tools'
      evidence.steps.push(await probeClaudeHostTools(common,root,output))
    } else {
    const token=`青竹-${randomUUID().slice(0,8)}`
    const first=await runClaudeNoTools({...common,prompt:`本次验收暗号是${token}。记住它，只回答“收到”。`})
    evidence.steps.push({kind:'first',...first});assert.ok(first.text.includes('收到'))
    const second=await runClaudeNoTools({...common,sessionId:first.sessionId,prompt:'上一条消息的暗号是什么？只回答暗号。'})
    evidence.steps.push({kind:'resume',...second});assert.equal(second.sessionId,first.sessionId);assert.ok(second.text.includes(token))
    const separate=await runClaudeNoTools({...common,cwd:join(root,'employee-b'),configDirectory:join(root,'config-b'),prompt:'另一名员工刚收到的验收暗号是什么？没有上下文只回答“不知道”，不要猜测。'})
    evidence.steps.push({kind:'separate-session',...separate});assert.notEqual(separate.sessionId,first.sessionId);assert.ok(separate.text.includes('不知道'));assert.ok(!separate.text.includes(token))
    }
    evidence.passed=true
  } catch {
    // Provider errors can echo credentials. Keep raw exception payloads out of files and logs.
    evidence.error='真实Claude/DeepSeek阶段未完成；已保存的步骤仅证明各自范围。'
  }
  await writeFile(output,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'})
  app.exit(evidence.passed?0:1)
})().catch(()=>{process.stderr.write('真实运行探测未能保存完整回执。\n');app.exit(1)})
