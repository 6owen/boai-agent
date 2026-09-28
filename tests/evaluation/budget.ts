/*
 * [INPUT]: 实验共享账本路径、总请求上限和请求分类。
 * [OUTPUT]: 跨批次原子预留、包含失败/连接/judge 的统一计数，不自动扩大上限。
 * [POS]: tests/evaluation/budget.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
export class EvaluationBudget {
  constructor(readonly path: string, readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('实验总预算必须在1至1000之间')
  }
  async reserve(phase: string) {
    await mkdir(dirname(this.path), { recursive: true })
    let lock: Awaited<ReturnType<typeof open>> | undefined
    for (let attempt = 0; attempt < 100; attempt++) {
      try { lock = await open(`${this.path}.lock`, 'wx'); break }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 20)) }
    }
    if (!lock) throw new Error('评估预算账本忙或有中断锁；不能绕过预算，请核对原进程后处理')
    try {
      let ledger: { limit: number; used: number; phases: Record<string, number> }
      try { ledger = JSON.parse(await readFile(this.path, 'utf8')) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ledger = { limit: this.limit, used: 0, phases: {} } }
      if (ledger.limit !== this.limit || !Number.isInteger(ledger.used) || ledger.used < 0 || !ledger.phases || Object.values(ledger.phases).some(value => !Number.isInteger(value) || value < 0) || Object.values(ledger.phases).reduce((sum, value) => sum + value, 0) !== ledger.used) throw new Error('不能改变已有实验预算或使用损坏账本')
      if (ledger.used >= ledger.limit) throw new Error('EVALUATION_BUDGET: reached shared experiment ceiling')
      ledger.used++; ledger.phases[phase] = (ledger.phases[phase] ?? 0) + 1
      await writeFile(`${this.path}.tmp`, JSON.stringify(ledger, null, 2)); await rename(`${this.path}.tmp`, this.path)
      return ledger.used
    } finally { await lock.close(); await unlink(`${this.path}.lock`) }
  }
}
