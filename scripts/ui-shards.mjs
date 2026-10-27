/*
 * [INPUT]: 完整版本化UI场景合同与固定两片编号。
 * [OUTPUT]: 确定性交错分片及合同hash；拒绝任意选场景、旧合同和伪造片号。
 * [POS]: UI执行、轻量报告和Required checks共用的纯分片协议。
 * [PROTOCOL]: 修改同步Header和scripts/.folder.md。
 */
import { createHash } from 'node:crypto'

export const UI_SHARD_COUNT = 2
export function uiShardPlan(ids, index) {
  if (!Array.isArray(ids) || ids.length < UI_SHARD_COUNT || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id))) throw new Error('分片必须使用完整有效UI合同')
  if (!Number.isInteger(index) || index < 1 || index > UI_SHARD_COUNT) throw new Error('非法UI分片编号')
  const identity = { version: 1, total: UI_SHARD_COUNT, cases: ids }
  return { version: 1, index, total: UI_SHARD_COUNT, planHash: createHash('sha256').update(JSON.stringify(identity)).digest('hex'), cases: ids.filter((_, offset) => offset % UI_SHARD_COUNT === index - 1) }
}
export function assertUiShard(ids, actual) {
  const expected = uiShardPlan(ids, actual?.index)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('UI分片合同、编号或场景不匹配')
  return expected
}
export function selectUiShard(ids, value, command, profile, cases) {
  if (value === undefined) return undefined
  if (!/^[12]\/2$/.test(value) || command !== 'check' || profile !== 'github-macos15-arm64' || cases !== undefined) throw new Error('仅官方只读比较允许固定 --shard 1/2 或 2/2，不能混用 --cases')
  return uiShardPlan(ids, Number(value[0]))
}
