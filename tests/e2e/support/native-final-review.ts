/*
 * [INPUT]: 本场Desktop、只读SQLite状态及明确已登记成果；POSIX PID/父PID/进程组/启动时间。
 * [OUTPUT]: 退出前状态/原生画面、正常关闭后的实际进程退出核对及最终状态/固定hash原件；失败逐项留证，不重启或重放业务。
 * [POS]: Claude普通群与核心场景的结束留证；测试关闭引起的取消与原场景结果分开，不证明未观察到的历史孤儿进程。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header，并上浮检查所属目录.folder.md。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import type { Desktop } from './desktop'

type ProcessIdentity = { pid: number; parent: number; group: number; started: string }
type PublishedFile = { id: string; name: string; path: string; contentHash: string }
async function processes(): Promise<ProcessIdentity[]> {
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,ppid=,pgid=,lstart='])
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!match) throw new Error('无法核对本场实际进程身份')
    return { pid: Number(match[1]), parent: Number(match[2]), group: Number(match[3]), started: match[4] }
  })
}

export async function archiveNativeFinalReview(runtime: Desktop, input: {
  label: string; records(): Promise<{ artifacts: PublishedFile[]; [key: string]: unknown }>
}) {
  const failures: unknown[] = []
  const recordFailure = async (label: string, error: unknown) => {
    failures.push(error)
    await runtime.reviewData(label, { failure: error instanceof Error ? error.message : '本场结束留证失败' })
  }
  try { await runtime.reviewData(input.label + '退出前实际状态', await input.records()) }
  catch (error) { await recordFailure(input.label + '退出前状态读取失败', error) }
  try { await runtime.reviewNativeCheckpoint(input.label + '退出前原生画面') }
  catch (error) { await runtime.reviewData(input.label + '退出前画面受限', { failure: error instanceof Error ? error.message : '无法读取原生画面' }) }
  let owned: ProcessIdentity[] = [], groups: number[] = [], observed = false, exitVerified = false
  try {
    const owner = await runtime.app.evaluate(({ app }) => {
      const worker = app.getAppMetrics().find(value => value.name === 'BoAI Agent Runtime' && value.type === 'Utility')
      if (!worker) throw new Error('本场运行服务缺失，不能宣称退出已核对')
      return worker.pid
    })
    const rows = await processes(), descendants = new Set([owner])
    let changed = true
    while (changed) {
      changed = false
      for (const row of rows) if (descendants.has(row.parent) && !descendants.has(row.pid)) { descendants.add(row.pid); changed = true }
    }
    owned = rows.filter(row => descendants.has(row.pid))
    if (!owned.some(row => row.pid === owner)) throw new Error('本场运行服务缺少可信进程身份')
    // Only groups whose leader belongs to this scenario; never wait on the test runner's inherited group.
    groups = [...new Set(owned.filter(row => descendants.has(row.group)).map(row => row.group))]
    observed = true
    await runtime.reviewData(input.label + '退出前进程身份', { owned, groups })
  } catch (error) { await recordFailure(input.label + '进程身份核对失败', error) }
  try { await runtime.close() } catch (error) { await recordFailure(input.label + '桌面关闭失败', error) }
  if (observed) try {
    await expect.poll(async () => {
      const rows = await processes()
      return rows.filter(row => owned.some(before => before.pid === row.pid && before.started === row.started) || groups.includes(row.group)).map(row => row.pid)
    }, { timeout: 15000, intervals: [50, 100, 250] }).toEqual([])
    exitVerified = true
  } catch (error) { await recordFailure(input.label + '实际进程仍未退出', error) }
  await runtime.reviewData(input.label + '实际退出核对', { observed, exitVerified, checkedAt: new Date().toISOString(), owned, groups, reason: '本场结束正常关闭；不重启、不续行、不重放；不修改原场景通过或失败' })
  try {
    const records = await input.records()
    await runtime.reviewData(input.label + '退出后实际状态', { exitVerified, records })
    for (const file of records.artifacts) try {
      if (createHash('sha256').update(await readFile(file.path)).digest('hex') !== file.contentHash) throw new Error('退出后原件hash与登记不一致')
      await runtime.reviewFile(input.label + '退出后已发布原件-' + file.name, file.path, { required: true, expectedSha256: file.contentHash })
    } catch (error) { await recordFailure(input.label + '退出后原件留证失败-' + file.id, error) }
  } catch (error) { await recordFailure(input.label + '退出后状态读取失败', error) }
  if (failures.length) throw new AggregateError(failures, input.label + '结束留证不完整')
}
