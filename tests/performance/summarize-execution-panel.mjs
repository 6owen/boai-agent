/*
 * [INPUT]: Paired isolated panel measurement batches, including the retained failed dev attempt.
 * [OUTPUT]: Frozen sample vectors, measured summary and explicit acceptance boundaries.
 * [POS]: Opt-in execution panel evidence exporter; never updates UI baselines.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { buildInputHash } from '../../scripts/build-identity.mjs'

const root = resolve(process.argv[2] ?? '.local/frontend-performance')
const target = resolve('ai-docs/spec/17.桌面后台运行')
const median = values => { const s = [...values].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const round = value => Math.round(value * 10) / 10
const stats = values => ({ n: values.length, median: round(median(values)), min: round(Math.min(...values)), max: round(Math.max(...values)), samples: values })
function sample(row) {
  const start = row.transitions.find(event => event.target === 'panel-resize t-resize' && event.property === 'width')?.at
  if (start === undefined) throw new Error('Panel width transition missing')
  let at = 0
  const frames = []
  for (const duration of row.frames) {
    if (at >= start && at + duration <= start + 300) frames.push(duration)
    at += duration
  }
  if (!frames.length) throw new Error('Missing frames within the panel transition')
  return { batch: row.batch, sample: row.sample, cold: row.cold, elapsed: row.elapsed, maxFrame: Math.max(...row.frames), animationMaxFrame: Math.max(...frames), slowFrames: row.frames.filter(ms => ms > 25).length, script: row.metrics.ScriptDuration, layout: row.metrics.LayoutDuration, mainWidthChanges: row.widths.filter(value => value.target === 'main').length }
}
async function load(name, expected) {
  const files = (await readdir(join(root, name))).filter(name => /^batch-\d+\.json$/.test(name)).sort()
  if (files.length !== expected) throw new Error(`${name}: expected ${expected} complete batches, found ${files.length}`)
  const batches = await Promise.all(files.map(file => readFile(join(root, name, file), 'utf8').then(JSON.parse)))
  if (batches.some(batch => batch.fixture.modelCalls !== 0)) throw new Error('Unexpected model calls')
  const samples = batches.flatMap(batch => batch.rows.map(sample))
  const summarize = cold => Object.fromEntries(['elapsed', 'maxFrame', 'animationMaxFrame', 'slowFrames', 'script', 'layout', 'mainWidthChanges'].map(key => [key, stats(samples.filter(row => row.cold === cold).map(row => row[key]))]))
  return { name, environment: batches[0].environment, fixture: batches[0].fixture, builds: batches.map(batch => batch.built), samples, warm: summarize(false), cold: summarize(true) }
}
const result = { version: 1, baselineCommit: '77d7d653f1609f0caa531ee23967a8ff07707081', production: { before: await load('panel-baseline-full', 3), after: await load('panel-candidate-full', 3) }, development: { before: await load('panel-dev-baseline-final', 2), after: await load('panel-dev-candidate-full', 2) }, failedAttempt: { dataset: 'panel-dev-candidate', batch: 1, stage: 'prepareGroupChat initial conversation selection, before measurements', error: 'Playwright waited for initial navigation although the application and group were displayed.', handling: 'Retained failure and trace. Performance fixture now selects only after its required explicit width-preference reload; default BDD selection and assertions remain unchanged. Paired dev measurements were collected with this corrected setup.' }, definitions: { maxFrame: 'Maximum click-to-settled requestAnimationFrame callback interval, including initial click work.', animationMaxFrame: 'Maximum complete rAF interval wholly inside the original 300ms panel width transition; excludes initial click work, which maxFrame still reports.', elapsed: 'Click through completed finite animations and content readiness; includes test orchestration.', warm: 'Subsequent reopens of the already mounted execution tab.', cold: 'First opening of the execution tab in each fresh application batch.' }, limits: ['Isolated long group chat fixture, no personal data or remote model calls.', 'Production: 3 cold and 27 warm observations per side; development: 2 cold and 10 warm observations per side.', 'Small samples: medians and ranges only, no P95 or FPS certification.', 'rAF callback intervals are not a physical display/GPU presentation measurement.', 'Live streaming, arbitrary huge personal histories, other platforms and long-run memory are not qualified.'] }
if (result.production.after.builds.some(build => build.inputHash !== result.production.after.builds[0].inputHash) || result.production.after.builds[0].inputHash !== await buildInputHash(process.cwd())) throw new Error('Candidate build does not match current source')
result.sourceFingerprints = Object.fromEntries(await Promise.all(['apps/electron/src/renderer/components/common/markdown.tsx', 'apps/electron/src/renderer/components/common/panel-resize.css', 'apps/electron/src/renderer/pages/conversations/-components/material-citations.tsx'].map(async path => [path, { before: createHash('sha256').update(execFileSync('git', ['show', `${result.baselineCommit}:${path}`])).digest('hex'), after: createHash('sha256').update(await readFile(path)).digest('hex') }])))
await writeFile(join(target, '06-执行面板展开性能实测.json'), JSON.stringify(result, null, 2) + '\n')
let md = `<!--\n[INPUT]: Paired isolated long-chat/execution panel measurements.\n[OUTPUT]: Frozen panel performance evidence; spec17/04 owns current progress.\n[POS]: No personal-data, release or full-UI qualification.\n[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md；通过tests/performance/summarize-execution-panel.mjs生成。\n-->\n# 执行面板展开掉帧实测（2026-10-28）\n\n- 基线：77d7d653（含已提交的骨架注释）；候选：perf/execution-panel-animation独立worktree。\n- 修复三处：相同正文/参数复用MarkdownContent；主聊天按最终宽度只排版一次，收起结束再扩展；聊天MaterialMarkdown按消息与来源复用子树，引用动作读取最新已提交回调，正文/授权变化仍更新。右侧原300ms宽度过渡及内部淡入/位移保持。\n- 原右侧详情内容已为固定宽度；实测逐帧变窄的是左侧主内容。CPU诊断中未变化的Markdown解析占据显著时间。\n- 相同1487×1058视口、600px详情宽度，36段长聊天与8块执行正文；模型调用0，个人数据和现有dev进程未改。\n- 耗时/帧间隔单位为ms，其他项目另标次数；明确区分点击全程最长帧间隔和动画期间帧间隔；小样本不声称精确P95或固定FPS。\n`
for (const [mode, data] of Object.entries({ production: result.production, development: result.development })) {
  const a = data.before.warm, b = data.after.warm
  md += `\n## ${mode === 'production' ? '构建版' : '开发模式'}\n\n- 重复展开每侧${a.maxFrame.n}次；首次展开每侧${data.before.cold.maxFrame.n}次。\n`
  for (const [key, label] of [['animationMaxFrame', '动画阶段最长帧间隔'], ['maxFrame', '点击全程最长帧间隔'], ['script', '脚本执行'], ['layout', '布局执行'], ['mainWidthChanges', '左侧主内容宽度变化次数'], ['slowFrames', '全程大于25ms的rAF间隔数'], ['elapsed', '完整稳定耗时']]) md += `- ${label}中位数：${a[key].median} → ${b[key].median}。\n`
  md += `- 首次展开全程最长帧间隔：优化前${data.before.cold.maxFrame.samples.map(round).join('/')}；优化后${data.after.cold.maxFrame.samples.map(round).join('/')}。样本很少，仅列原值，不能当作每次启动保证。\n`
}
md += `\n## 验证与限制\n\n- 42项相关组件/执行披露/虚拟列表/预览安全及引用回调/焦点/权限回归、类型检查、定向ESLint和完整Electron构建通过。\n- 测量外验证宽度键盘调整、收起立即inert、减少动态效果、展开/收起最终宽度；最终分栏宽度经核对，动画时主聊天文字改为一次排版。\n- 原dev候选第二批在测量前的初始导航等待超时，失败和trace保留于.local/frontend-performance/panel-dev-candidate。性能夹具去掉显式reload前的重复选择后，重新取得同条件开发模式对照；普通BDD默认与原断言不变。\n- 仍有初始点击/首次正文挂载成本；本轮没有承诺完全零掉帧，也未验证用户这条真实会话、持续流式压力或长时资源。\n- 原始批次、CPU profile和失败trace为本地诊断产物；同目录JSON保存全部汇总样本和构建身份。云端视觉候选/基准与实际合并尚未执行。\n- 显式复测：BOAI_PERF_OUTPUT=<新目录> pnpm exec playwright test --config tests/performance/execution-panel.config.ts；BOAI_TEST_DEV_SERVER=1为开发模式。性能测试不加入日常CI。\n`
await writeFile(join(target, '06-执行面板展开性能实测.md'), md)
console.log(JSON.stringify(Object.fromEntries(Object.entries({ production: result.production, development: result.development }).map(([mode, data]) => [mode, { n: data.before.warm.maxFrame.n, animationMaxFrame: [data.before.warm.animationMaxFrame.median, data.after.warm.animationMaxFrame.median], script: [data.before.warm.script.median, data.after.warm.script.median] }]))))
