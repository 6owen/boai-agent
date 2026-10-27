/*
 * [OUTPUT]: 普通比较报告标明分片范围并重算合同，最终完整资格仍归Required checks。
 * [OUTPUT]: 从原Playwright结果附带准备/交互/截图/其余fixture耗时，缺失或异常不补零，不参与合并资格判定。
 * [OUTPUT]: Playwright旧图按附件name及同提交固定基线/hash读取，其他图片不放宽本批路径范围。
 * [INPUT]: 原UI Playwright报告、执行摘要或独立候选，以及本批原始PNG。
 * [OUTPUT]: 轻量旧/新/diff审阅附件与Actions摘要；区分视觉差异和执行失败，不授合并或基线接受资格。
 * [POS]: UI结果的只读展示；复用原桌面报告解析，不运行产品或模型。
 * [PROTOCOL]: 修改同步Header、scripts/.folder.md和第22组06。
 */
import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { desktopReportRows } from './desktop-plan.mjs'
import { assertUiShard } from './ui-shards.mjs'
import { CI_PROFILE, LOCAL_PROFILE, uiProfile } from './ui-profiles.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const clean = value => String(value ?? '').replace(/\u001b\[[0-9;]*m/g, '')
const message = error => clean(error?.message ?? error?.value ?? error)
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const labels = { passed: '比较通过', changed: '视觉差异，待审阅', failed: '执行失败或材料不完整', 'needs-review': '待审阅，仍阻止合并' }
const caseLabel = (report, item) => report.candidate && item.status === 'passed' ? '采集通过，仍需审阅' : labels[item.status]
const within = (parent, child) => { const path = relative(parent, child); return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path) }

function resultTiming(result) {
  const steps = result?.steps
  if (result?.retry !== 0 || !Number.isFinite(result.duration) || result.duration < 0 || !Array.isArray(steps) || steps.length !== 4 || steps.some(step => !step || typeof step.title !== 'string' || !Number.isFinite(step.duration) || step.duration < 0)) return null
  if (steps[0].title !== '假如UI回归已准备隔离的固定历史和资源' || !steps[1].title.startsWith('当用户打开UI基准场景 ') || steps[2].title !== '那么当前场景的真实交互和布局满足原约定' || steps[3].title !== '并且当前场景与已接受的UI截图一致') return null
  const other = result.duration - steps.reduce((total, step) => total + step.duration, 0)
  if (other < 0) return null
  return { total: result.duration, prepare: steps[0].duration, interaction: steps[1].duration + steps[2].duration, screenshot: steps[3].duration, other }
}

function timingSummary(report) {
  if (!report.cases.length || report.cases.some(item => !item.timing)) return '原报告缺少完整阶段计时，未汇总耗时。'
  const totals = Object.fromEntries(['total', 'prepare', 'interaction', 'screenshot', 'other'].map(key => [key, (report.cases.reduce((sum, item) => sum + item.timing[key], 0) / 1000).toFixed(1)]))
  return `场景耗时合计 ${totals.total} 秒：准备 ${totals.prepare} 秒，交互/布局 ${totals.interaction} 秒，截图比较 ${totals.screenshot} 秒，其他（含收尾）${totals.other} 秒。不含安装、构建和排队。`
}

export function classifyUiResults(report, ids) {
  const rows = desktopReportRows(report)
  const issues = (report.errors ?? []).map(message)
  if (!Array.isArray(report.errors)) issues.push('原报告缺少全局错误字段')
  if (rows.length !== ids.length) issues.push(`登记${ids.length}场，原报告${rows.length}场`)
  const cases = ids.map(id => {
    const found = rows.filter(row => row.file === 'ui-regression.feature' && row.titles.at(-1) === `已登记界面 ${id} 保持行为布局和视觉基线`)
    const test = found[0]?.tests?.[0], result = test?.results?.[0]
    const errors = (result?.errors ?? []).map(message)
    if (result?.error && !errors.includes(message(result.error))) errors.push(message(result.error))
    const item = { id, status: 'failed', errors, images: {}, attachments: result?.attachments ?? [], timing: found.length === 1 && test?.results?.length === 1 ? resultTiming(result) : null }
    if (found.length !== 1 || found[0].tests?.length !== 1 || test.expectedStatus !== 'passed' || test.results?.length !== 1 || result.retry !== 0 || !Number.isFinite(result.duration) || !Array.isArray(result.errors)) {
      item.errors.push('缺失、重复、预期失败、跳过或重试结果不能作为正常一次执行')
    } else if (test.status === 'expected' && result.status === 'passed' && errors.length === 0) {
      item.status = 'passed'
    } else if (test.status === 'unexpected' && result.status === 'failed' && errors.length && errors.every(error => error.includes('.toHaveScreenshot(') && /\d+ pixels \(ratio/.test(error) && error.includes(`Snapshot: ${id}.png`))) {
      item.status = 'changed'
    } else if (!errors.length) item.errors.push(`原始结果：${test.status}/${result.status}`)
    return item
  })
  return { cases, issues }
}

async function checkedPng(input, path) {
  const absolute = resolve(input, path)
  if (!within(input, absolute)) throw new Error('图片路径不在本批目录内')
  let component = input
  for (const part of relative(input, absolute).split(sep)) {
    component = join(component, part)
    if ((await lstat(component)).isSymbolicLink()) throw new Error('图片路径含符号链接')
  }
  const metadata = await lstat(absolute)
  if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024 || !within(await realpath(input), await realpath(absolute))) throw new Error('图片不是本批普通文件或超过20MiB')
  const bytes = await readFile(absolute)
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('图片不是PNG')
  return bytes
}

async function checkedExpectedPng(summary, id, path) {
  if (![CI_PROFILE, LOCAL_PROFILE].includes(summary?.profile)) throw new Error('旧图缺少登记的基线档案')
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== summary.source?.commit) throw new Error('旧图所在checkout与本批源码提交不一致')
  const profile = uiProfile(root, summary.profile, {})
  if (resolve(path) !== join(profile.directory, `${id}.png`)) throw new Error('旧图路径不是本场景已登记基线')
  const bytes = await checkedPng(root, path)
  const manifest = JSON.parse(await readFile(join(profile.directory, 'manifest.json'), 'utf8'))
  if (manifest.profile !== profile.id || manifest.cases?.[id]?.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('旧图与登记基线hash不一致')
  return bytes
}

export async function generateUiReview(inputPath, outputPath, ids, candidateMode = false) {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !/^[a-z0-9-]+$/.test(id))) throw new Error('非法或空场景合同')
  const input = resolve(inputPath), output = resolve(outputPath)
  if (input === output || within(input, output) || within(output, input)) throw new Error('审阅输出必须是新的独立目录')
  const issues = []
  const read = async path => {
    try { return JSON.parse(await readFile(join(input, path), 'utf8')) }
    catch (error) { issues.push(`${path}: ${error.code === 'ENOENT' ? '未生成' : message(error)}`); return null }
  }
  const summary = await read(candidateMode ? 'candidate.json' : 'summary.json')
  let shard
  if (summary?.shard) {
    try {
      if (candidateMode) throw new Error('候选不允许分片')
      shard = assertUiShard(ids, summary.shard)
      ids = shard.cases
    } catch (error) { issues.push(message(error)) }
  }
  const execution = await read(candidateMode ? 'capture/summary.json' : 'compare/summary.json')
  const raw = await read(candidateMode ? 'capture/playwright.json' : 'compare/playwright.json')
  let classified
  try { classified = classifyUiResults(raw, ids) }
  catch (error) { classified = { issues: [message(error)], cases: ids.map(id => ({ id, status: 'failed', errors: ['没有有效场景报告'], images: {}, attachments: [] })) } }
  issues.push(...classified.issues)
  if (!/^[a-f0-9]{40}$/.test(summary?.source?.commit ?? '') || summary.source.dirty !== false) issues.push('本批源码身份缺失或工作树不干净')
  const exit = execution?.exit
  if (!exit || exit.signal !== null || ![0, 1].includes(exit.code)) issues.push('测试进程退出异常或缺少退出记录')
  const expectedErrors = new Set(classified.cases.filter(item => item.status === 'changed').map(item => `${item.id}: 未完整通过（unexpected）`))
  expectedErrors.add('测试进程退出：{"code":1,"signal":null}')
  for (const record of [candidateMode ? null : summary, execution]) {
    if (!record) continue
    if (!Array.isArray(record.errors)) issues.push('执行摘要缺少错误字段')
    else issues.push(...record.errors.filter(error => !expectedErrors.has(error)).map(message))
  }
  if (candidateMode && execution?.status !== 'passed') issues.push('候选行为/布局采集没有完整通过')
  if (!candidateMode && !['passed', 'failed'].includes(summary?.status)) issues.push('只读比较没有有效终态')
  const differences = candidateMode ? await read('review/differences.json') : null
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output, { recursive: false })
  for (const item of classified.cases) {
    const paths = {}, hashes = {}
    if (candidateMode && item.status === 'passed') {
      const difference = differences?.cases?.[item.id]
      if (!difference) { item.status = 'failed'; item.errors.push('缺少候选差异记录') }
      else {
        if (difference.oldSha256 === null || difference.changedPixels > 0) item.status = 'changed'
        else if (difference.changedPixels !== 0) { item.status = 'failed'; item.errors.push('候选像素差异记录无效') }
        paths.actual = `review/${item.id}-new.png`
        Object.assign(hashes, { actual: difference.newSha256, expected: difference.oldSha256, diff: difference.diffSha256 })
        if (difference.oldSha256 !== null) { paths.expected = `review/${item.id}-old.png`; paths.diff = `review/${item.id}-diff.png` }
      }
    } else if (!candidateMode && item.status === 'changed') {
      for (const kind of ['expected', 'actual', 'diff']) {
        const matches = item.attachments.filter(attachment => attachment.contentType === 'image/png' && (attachment.name === `${item.id}-${kind}.png` || basename(attachment.path ?? '') === `${item.id}-${kind}.png`))
        if (matches.length !== 1) { item.status = 'failed'; item.errors.push(`缺少唯一${kind}原图`) }
        else paths[kind] = matches[0].path
      }
    }
    for (const [kind, path] of Object.entries(paths)) {
      try {
        const absolute = isAbsolute(path) ? path : resolve(input, candidateMode ? '' : 'compare', path)
        const bytes = !candidateMode && kind === 'expected' && !within(input, absolute)
          ? await checkedExpectedPng(summary, item.id, absolute)
          : await checkedPng(input, absolute)
        const digest = createHash('sha256').update(bytes).digest('hex')
        if (candidateMode && (digest !== hashes[kind] || kind === 'actual' && digest !== summary.cases?.[item.id]?.sha256)) throw new Error('图片与候选登记hash不一致')
        const file = `${item.id}-${kind}.png`
        await writeFile(join(output, file), bytes, { flag: 'wx' })
        item.images[kind] = { file, sha256: digest }
      } catch (error) { item.status = 'failed'; item.errors.push(`${kind}: ${message(error)}`) }
    }
    delete item.attachments
  }
  const counts = Object.fromEntries(['passed', 'changed', 'failed'].map(status => [status, classified.cases.filter(item => item.status === status).length]))
  if (!counts.changed && !counts.failed && (execution?.status !== 'passed' || exit?.code !== 0 || !candidateMode && summary?.status !== 'passed')) issues.push('场景与执行汇总不一致')
  const result = { version: 1, ...(shard ? { shard } : {}), candidate: candidateMode, source: summary?.source ?? null, status: issues.length || counts.failed ? 'failed' : candidateMode || counts.changed ? 'needs-review' : 'passed', counts, issues: [...new Set(issues)], cases: classified.cases }
  await writeFile(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(output, 'index.html'), renderUiReview(result), { flag: 'wx' })
  return result
}

const shardLabel = report => report.shard ? `分片 ${report.shard.index}/${report.shard.total}，本片 ${report.cases.length} 项；完整资格由 Required checks 汇总。` : ''

export function reviewMarkdown(report, artifactUrl) {
  const link = /^https:\/\/github\.com\/6owen\/boai-agent\/actions\/runs\/\d+\/artifacts\/\d+$/.test(artifactUrl ?? '') ? `[下载轻量审阅附件](${artifactUrl})；解压后打开 index.html。` : '下载本次运行的 ui-review 附件，解压后打开 index.html。'
  const sha = /^[a-f0-9]{40}$/.test(report.source?.commit ?? '') ? report.source.commit : '未登记有效提交'
  return `### UI${report.candidate ? '候选' : '比较'}：${labels[report.status]}\n\n源码：\`${sha}\`\n\n${link}\n\n${shardLabel(report)}\n\n${timingSummary(report)}\n\n| 场景 | 结果 |\n| --- | --- |\n${report.cases.map(item => `| ${item.id} | ${caseLabel(report, item)} |`).join('\n')}\n\n${report.issues.map(issue => `- ${escape(issue).replace(/\r?\n/g, ' ')}`).join('\n')}\n\n本报告仅整理原始结果。视觉差异须核对需求后通过独立候选流程接受，不能自动视为预期改版；行为/布局或材料失败须先修复。报告生成成功不代表 Required checks 通过。完整日志和回放见原附件。\n`
}

export function renderUiReview(report) {
  const figures = item => Object.entries(item.images).map(([kind, image]) => `<figure><figcaption>${{ expected: '旧基线', actual: '当前画面', diff: '差异' }[kind]}</figcaption><a href="${escape(image.file)}"><img src="${escape(image.file)}" alt="${escape(item.id)} ${kind}"></a></figure>`).join('')
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BOAI UI审阅</title><style>body{font:15px/1.6 system-ui,sans-serif;margin:32px;color:#202124;background:#fff}main{max-width:1500px;margin:auto}section{border-top:1px solid #ddd;padding:16px 0}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}figure{margin:0}img{width:100%;border:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}small{color:#555}</style><main><h1>UI${report.candidate ? '候选' : '比较'}：${labels[report.status]}</h1><p>源码：${escape(report.source?.commit ?? '未登记')}</p><p>${report.counts.passed}项${report.candidate ? '采集通过且无像素变化' : '通过'}，${report.counts.changed}项变化待审阅，${report.counts.failed}项失败。</p><p>${escape(shardLabel(report))}</p><p>${escape(timingSummary(report))}</p><p>请核对需求范围、布局、文字及明暗模式。差异不等于预期改版；本页不批准基线或合并，最终资格仍由 Required checks 核验。</p>${report.issues.length ? `<pre>${escape(report.issues.join('\n'))}</pre>` : ''}${[...report.cases].sort((a, b) => Number(a.status === 'passed') - Number(b.status === 'passed')).map(item => `<section><h2>${escape(item.id)} · ${caseLabel(report, item)}</h2><div class="images">${figures(item)}</div>${item.errors.length ? `<details><summary>原始错误与材料问题</summary><pre>${escape(item.errors.join('\n\n'))}</pre></details>` : ''}</section>`).join('')}<small>仅包含本批登记场景。未覆盖的页面/状态与主观设计质量需另行审阅；完整原件和trace在原CI附件中。</small></main></html>`
}

async function main() {
  const [command, input, output] = process.argv.slice(2)
  if (command === 'summary' && input && process.env.GITHUB_STEP_SUMMARY) {
    const report = JSON.parse(await readFile(join(input, 'report.json'), 'utf8'))
    await appendFile(process.env.GITHUB_STEP_SUMMARY, reviewMarkdown(report, process.env.UI_REVIEW_ARTIFACT_URL))
  } else if (['report', 'candidate'].includes(command) && input && output) {
    const contract = JSON.parse(await readFile(join(root, 'tests/e2e/baselines/contract.json'), 'utf8'))
    const result = await generateUiReview(input, output, contract.cases.map(item => item.id), command === 'candidate')
    console.log(`UI审阅报告：${labels[result.status]}；${output}/index.html（不改变测试终态）`)
  } else throw new Error('用法：ui-review-report.mjs report|candidate INPUT NEW_OUTPUT | summary REPORT_DIR')
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
