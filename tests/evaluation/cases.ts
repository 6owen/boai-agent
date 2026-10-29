/*
 * [INPUT]: Cumora G0/G1 真实模型语义与成本验收要求。
 * [OUTPUT]: 新增SG-v1五人组长监督正常/文件冲突开发题，原回归及留出不变。
 * [OUTPUT]: 版本化原九类回归集与独立 MD-v1 开发入口，输入和评分侧验收职责；冻结16题不变。
 * [POS]: tests/evaluation/cases.ts，基线和候选版本共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export const employees = [
  ['研究员', '核对数据、梳理事实'], ['写手', '计算已提供的数据、整理和撰写内容'], ['审核员', '检查事实、逻辑与遗漏'],
  ['设计师', '组织信息和视觉表达'], ['测试员', '核对要求和验证结果'], ['产品经理', '澄清范围和交付目标'],
  ['运营员', '整理运营资料'], ['分析师', '分析已提供的数据'], ['编辑', '核对文字表达'],
  ['客服', '整理问题和答复'], ['工程师', '解释技术实现'], ['项目助理', '整理进度和待办'],
] as const
import type { EvaluationCase, CheckSpec } from './schema'
export type { EvaluationCase } from './schema'
const legacyCases: Omit<EvaluationCase, 'matrixId' | 'split' | 'cluster' | 'category' | 'checks' | 'semantic'>[] =
[
  { id: 'introduce-6', members: 6, prompt: '请大家各用一句话介绍自己最能帮忙的事情。', criterion: '所有有效成员都有首次判断记录；回复内容对应各自身份，无强制全员回复、工具或任务。' },
  { id: 'introduce-12', members: 12, prompt: '请大家各用一句话介绍自己最能帮忙的事情。', criterion: '12 位成员均得到首次判断机会；独立参与，无身份串线、工具或任务。' },
  { id: 'old-group-greeting', members: 3, seed: '请大家各用一句话介绍自己。', prompt: '大家好，今天继续合作。', criterion: '历史自我介绍不能替代本次判断；至少一条简短回应，不重复长篇介绍、不创建任务。' },
  { id: 'explicit-mention', members: 3, mention: 1, prompt: '请用一句话说明如何把散乱笔记整理成文章。', criterion: '只有明确收件人写手公开回答，内容具体且无需工具。' },
  { id: 'natural-name', members: 3, prompt: '写手，请用一句话说明如何把散乱笔记整理成文章，其他同事暂时不用回答。', criterion: '模型自行识别自然语言点名；写手回答，其他成员沉默，不新增关键词路由。' },
  { id: 'plan-only', members: 3, mention: 0, prompt: '研究员，请给出核对这三笔销售数据的三步计划：12、18、30。只需要计划，不要计算、创建文件或执行命令。', criterion: '交付三步计划；不越界执行文件或命令，若声明交付则有实际计划证据。' },
  { id: 'delegated-result', members: 3, mention: 0, prompt: '研究员，请负责一份销售汇总报告：让写手计算三笔销售额 12、18、30 的总和，等他给出实际计算结果后，再把总和与平均数整理为最终报告。请按这个顺序协作，不要替写手抢做；其他同事无需追加。', criterion: '写手实际交付总和 60 后研究员汇总总和 60、平均 20；候选版有父子/显式依赖且无重复计算或假完成。' },
  { id: 'independent-files', members: 3, prompt: '请并行完成两个独立部分。研究员：把事实“今天有三笔销售，数值为12、18、30”写入 facts.md 并发布。写手：把提纲“背景、数据、结论”写入 outline.md 并发布。各自只负责自己的文件，无需互相等待；审核员无需参与。', criterion: '两份指定产物均真实发布，内容正确、来源归属对应员工，无覆盖或重复执行。' },
  { id: 'legal-silence', members: 3, prompt: '本条仅通知大家：材料已齐，暂时没有需要处理的任务，也不需要回复确认。', criterion: '合法沉默，不强制回复或创建工作；模型/网络失败不能被计作 pass。' },
]

const ids = ['A01', 'A02', 'A03', 'A04', 'A05', 'B01', 'B02', 'B03', 'A06']
export const regressionCases: EvaluationCase[] = legacyCases.map((scenario, index) => {
  const checks: CheckSpec[] = [{ kind: 'first-opportunity' }]
  if (!['delegated-result', 'independent-files'].includes(scenario.id)) checks.push({ kind: 'no-tools', ...(scenario.id === 'plan-only' ? { allowed: ['report_work', 'task_step'] } : {}) })
  if (!['delegated-result', 'independent-files', 'plan-only'].includes(scenario.id)) checks.push({ kind: 'no-work' })
  if (scenario.id === 'legal-silence') checks.push({ kind: 'no-replies' })
  if (['explicit-mention', 'natural-name'].includes(scenario.id)) checks.push({ kind: 'only-member', member: 1 })
  if (scenario.id === 'delegated-result') checks.push({ kind: 'delegation' }, { kind: 'text-pattern', pattern: '60' }, { kind: 'text-pattern', pattern: '20' })
  if (scenario.id === 'independent-files') checks.push({ kind: 'artifact', name: 'facts.md', member: 0, contains: ['12', '18', '30'] }, { kind: 'artifact', name: 'outline.md', member: 1, contains: ['背景', '数据', '结论'] })
  return { ...scenario, matrixId: ids[index], split: 'regression', category: ids[index][0], cluster: scenario.id, source: 'BoAI 固定合成场景；原九类保持输入不变', checks, semantic: [scenario.criterion] }
})
export { businessCases, holdoutCases } from './datasets'
import { businessCases, holdoutCases } from './datasets'
import { materialDeliveryCase } from './material-delivery'
import { groupSupervisionCases } from './group-supervision'
export const cases: EvaluationCase[] = [...regressionCases, ...businessCases, ...holdoutCases, materialDeliveryCase, ...groupSupervisionCases]
