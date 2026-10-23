/*
 * [INPUT]: 独立人工标签和辅助评审对同一完整样本的结论。
 * [OUTPUT]: 至少20个不同正负样本、同版judge、90%一致率、零关键漏判的校准门禁。
 * [POS]: tests/evaluation/calibration.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export interface CalibrationPair { sampleHash: string; humanReviewer: string; modelReviewer: string; human: 'passed' | 'failed'; model: 'passed' | 'failed'; critical: boolean; evidence: string[] }
export function calibrate(pairs: CalibrationPair[]) {
  const valid = pairs.filter(pair => /^[a-f0-9]{64}$/.test(pair.sampleHash) && pair.humanReviewer?.trim() && pair.modelReviewer?.trim() && pair.humanReviewer !== pair.modelReviewer && ['passed','failed'].includes(pair.human) && ['passed','failed'].includes(pair.model) && typeof pair.critical === 'boolean' && pair.evidence?.length)
  const unique = new Set(valid.map(pair => pair.sampleHash)).size === pairs.length
  const agreement = valid.length ? valid.filter(pair => pair.human === pair.model).length / valid.length : null
  const criticalMisses = valid.filter(pair => pair.critical && pair.human === 'failed' && pair.model === 'passed').length
  const representative = new Set(valid.map(pair => pair.modelReviewer)).size === 1 && valid.some(pair => pair.human === 'passed') && valid.some(pair => pair.human === 'failed' && pair.critical)
  return { status: !unique || valid.length < 20 || !representative ? 'incomplete' : agreement! >= 0.9 && criticalMisses === 0 ? 'passed' : 'failed', count: valid.length, agreement, criticalMisses, minimum: 20, requiredAgreement: 0.9, reason: '必须由人工独立标注，包含正例与关键失败负例并固定judge版本；本函数校验提交标签，不生成或证明标签来源。' }
}
