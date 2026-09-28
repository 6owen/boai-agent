/*
 * [INPUT]: 已聚合的整个协作样本评分，不是单个员工的回复。
 * [OUTPUT]: 无额外模型调用的 Mastra createScorer 适配；未完成/待评审不能得到通过分。
 * [POS]: tests/evaluation/scorers.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createScorer } from '@mastra/core/evals'
import type { EvaluationScore } from './schema'
export const teamScorer = createScorer({ id: 'boai-team-goal-v1', description: 'Entire team goal, evidence and hard constraints; pending is not passed.' })
  .generateScore(({ run }) => (run.output as EvaluationScore).verdict === 'passed' ? 1 : 0)
  .generateReason(({ run }) => { const score = run.output as EvaluationScore; return JSON.stringify({ verdict: score.verdict, goal: score.goalVerdict, judge: score.judgeStatus, checks: score.hardChecks, runtimeErrors: score.runtimeErrors }) })
