/*
 * [INPUT]: 32项方案要求、实际模块/桌面测试及版本化真实模型场景。
 * [OUTPUT]: 原32项覆盖与冻结留出hash，另列可选独立MD-v1开发合同；入口不代表运行/人工通过。
 * [POS]: tests/evaluation/matrix.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { cases, holdoutCases } from './cases'
import { DATASET_VERSION, SCORER_VERSION } from './schema'
const protocol: Record<string, string[]> = {
  A01: ['service.test.ts'], A02: ['service.test.ts', 'model-capacity.test.ts'], A04: ['service.test.ts'], A06: ['service.test.ts'],
  B01: ['mastra-engine.test.ts'], B02: ['service.test.ts', 'work-dependencies.test.ts'], B03: ['service.test.ts'], B05: ['work-dependencies.test.ts'],
  C01: ['service.test.ts'], C02: ['service.test.ts', 'work-dependencies.test.ts'], C03: ['service.test.ts'], C04: ['work-repository.test.ts', 'work-dependencies.test.ts'],
  D01: ['evaluation.test.ts'], D04: ['mastra-engine.test.ts'], E01: ['work-repository.test.ts'], E02: ['work-repository.test.ts'], E03: ['work-dependencies.test.ts'], E04: ['task-admission.test.ts', 'service.test.ts'],
  F01: ['mastra-engine.test.ts', 'model-capacity.test.ts'], F02: ['work-repository.test.ts'], F03: ['work-repository.test.ts', 'work-dependencies.test.ts'], F04: ['work-dependencies.test.ts'],
}
const desktop: Record<string, string[]> = { A03: ['collaboration.feature'], A04: ['desktop.feature'], B02: ['collaboration.feature'], C02: ['collaboration.feature'], C04: ['desktop.feature', 'upgrade.feature'] }
export function datasetManifest() {
  const matrix = ['A','B','C','D','E','F','G'].flatMap(category => Array.from({ length: ['A','B'].includes(category) ? 6 : 4 }, (_, index) => {
    const id = `${category}${String(index + 1).padStart(2, '0')}`
    return { id, protocol: (protocol[id] ?? []).map(file => `tests/${file}`), desktop: (desktop[id] ?? []).map(file => `tests/e2e/features/${file}`), realCases: cases.filter(item => item.matrixId === id).map(item => item.id), ...(['B04','C01','C03'].includes(id) ? { remaining: '服务/评估入口已覆盖；专门桌面交互场景待补充' } : {}) }
  }))
  return { datasetVersion: DATASET_VERSION, scorerVersion: SCORER_VERSION, matrix, developmentContracts: cases.filter(item => item.delivery).map(item => ({ id: item.id, version: item.delivery!.version, protocol: ['tests/evaluation-delivery.test.ts'], desktop: ['tests/e2e/features/materials.feature', 'tests/e2e/features/artifacts.feature'], firstPilot: { samples: 1, members: 1, connections: 1, maxRequests: item.delivery!.requestLimit }, note: '脚本采用仅技术证据；真实模型与人工质量待实际报告' })), cases: cases.map(({ id, split, cluster, category, matrixId, comparableSingle, delivery }) => ({ id, split, cluster, category, matrixId, comparableSingle: !!comparableSingle, ...(delivery ? { contractVersion: delivery.version } : {}) })), frozenHoldout: frozenHoldout(), note: '此清单仅证明实现入口；执行结果以逐样本报告/测试运行结果为准。人工校准前不将辅助评审计为通过。' }
}
export function frozenHoldout() {
  return { datasetVersion: DATASET_VERSION, cases: holdoutCases.map(scenario => ({ id: scenario.id, cluster: scenario.cluster, sha256: createHash('sha256').update(JSON.stringify(scenario)).digest('hex') })) }
}
export async function validateFrozenHoldout() {
  const saved = JSON.parse(await readFile('tests/evaluation/holdout-manifest.json', 'utf8'))
  if (JSON.stringify(saved) !== JSON.stringify(frozenHoldout())) throw new Error('留出集合同已变化；不得沿用旧版本报告，请显式建立新版本与冻结记录')
}
