/*
 * [INPUT]: Alma 安装包的静态文本快照目录；Babel parser/traverse。
 * [OUTPUT]: 全量字符串/模板字面量、提示词候选、模型输入表达式与配置对象候选 JSONL。
 * [POS]: Alma 研究复现工具；只解析文件，不执行 Alma 代码，不连接服务。
 * [PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error('Usage: node extract-prompts.cjs <snapshot-dir> <output-dir>');
const input = path.resolve(inputArg);
const output = path.resolve(outputArg);
fs.mkdirSync(output, { recursive: true });
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const writers = Object.fromEntries(['all-static-text', 'prompt-candidates', 'prompt-sites', 'config-candidates'].map(n => [n, fs.openSync(path.join(output, `${n}.jsonl`), 'w')]));
const counts = Object.fromEntries(Object.keys(writers).map(k => [k, 0]));
function emit(kind, obj) { fs.writeSync(writers[kind], JSON.stringify(obj) + '\n'); counts[kind]++; }
function keyOf(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return '';
}
const explicitKeys = /^(?:instructions|system|systemPrompt|system_prompt|systemMessage|systemInstruction|system_instruction|prompt|promptTemplate|systemPromptTemplate|developerMessage)$/i;
const configKeys = /(?:enabled|intervalMinutes|activeHoursStart|activeHoursEnd|baseEmotionRefreshHours|cooldownMinutes|quietMinutes|randomBoostRate|reactionRate|fatigue|manualSleep|manualWake|departedAt|traveling|snapshotDebounceMs|defaultModel|systemPrompt|temperature|maxOutputTokens|maxSteps|persona|personality|soul|autoCompactThreshold|retentionDays|heartbeat|groupPatrol|permissionMode|memoryEnabled)/i;
function classify(text, source) {
  if (/fatigue|FATIGUE & SLEEP|manualSleep/i.test(text) || source.includes('fatigueService')) return '03-疲劳与睡眠';
  if (/TRAVEL (?:PROGRESSION|SUGGESTION|STATUS)|travel (?:go|event|advance|home)|virtual travel/i.test(text)) return '04-旅行与经历';
  if (/PERSONALITY|SOUL\.md|CORE IDENTITY|real person|Evolved Traits|BE YOURSELF|You're Alma|You are Alma/i.test(text)) return '01-人格与身份';
  if (/EMOTION SYSTEM|BASE EMOTION|base mood|context emotion|set-base|set-context|mood\|valence/i.test(text)) return '02-情绪';
  if (/SELFIE|selfie|your appearance|face reference/i.test(text)) return '07-自拍与形象';
  if (/diary|self-reflection|reflection|long.term memory|persistent memory|memory consolidation|curated memory/i.test(text)) return '05-记忆与反思';
  if (/heartbeat|GROUP CHAT|Telegram|Discord|Feishu|Lark|Weixin|group chat|emoji reaction|Should Alma respond/i.test(text)) return '06-渠道与主动社交';
  if (/Activity Recorder|activity context|recent activity|on.screen activity|Personalize this greeting/i.test(text)) return '08-活动与问候';
  if (/subagent|sub.agent|Task tool|delegat|managed crew|specialist|plan mode/i.test(text)) return '09-任务与委派';
  if (/browser|computer.use|screenshot|screen coordinates|click|navigate|web.search/i.test(text)) return '10-浏览器与工具';
  if (/image|audio|voice|speech|video|presentation|slide|music|diagram|artifact|canvas/i.test(text)) return '11-创作与多媒体';
  if (/security|permission|credential|secret|prompt injection|untrusted|safety|sandbox/i.test(text)) return '12-权限与安全';
  return '13-其他模型任务与候选';
}
const parsed = [], errors = [];
for (const file of walk(input)) {
  const source = path.relative(input, file).split(path.sep).join('/');
  if (!/\.(?:mjs|cjs|js)$/.test(file) && source !== 'resources/cli/alma') continue;
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = parser.parse(code, { sourceType: 'unambiguous', allowReturnOutsideFunction: true, errorRecovery: false }); }
  catch (error) { errors.push({ source, error: error.message }); continue; }
  const fileCounts = { source, sha256: hash(code), strings: 0, candidates: 0, sites: 0, configs: 0 };
  function recordBase(node, prefix) {
    return { id: `${prefix}-${hash(`${source}:${node.start}:${node.end}`).slice(0, 14)}`, source, start: node.start, end: node.end, line: node.loc.start.line, column: node.loc.start.column };
  }
  function ancestry(p) {
    const result = [];
    for (let q = p.parentPath, n = 0; q && n < 7; q = q.parentPath, n++) {
      if (q.isObjectProperty()) result.push(`property:${keyOf(q.node.key)}`);
      else if (q.isVariableDeclarator()) result.push(`variable:${keyOf(q.node.id)}`);
      else if (q.isCallExpression()) {
        const c = q.node.callee;
        result.push(`call:${c.end - c.start > 160 ? `${c.type}@${c.start}:${c.end}` : code.slice(c.start, c.end)}`);
      } else if (q.isAssignmentExpression()) {
        const c = q.node.left;
        result.push(`assign:${c.end - c.start > 160 ? `${c.type}@${c.start}:${c.end}` : code.slice(c.start, c.end)}`);
      }
    }
    return result;
  }
  function literal(p) {
    const node = p.node;
    let text;
    if (node.type === 'StringLiteral') text = node.value;
    else {
      text = '';
      node.quasis.forEach((q, i) => {
        text += q.value.cooked ?? q.value.raw;
        if (i < node.expressions.length) text += '${' + code.slice(node.expressions[i].start, node.expressions[i].end) + '}';
      });
    }
    const context = ancestry(p);
    const rec = { ...recordBase(node, 'T'), kind: node.type, text, context };
    emit('all-static-text', rec); fileCounts.strings++;
    const reasons = [];
    for (let q = p.parentPath, n = 0; q && n < 5; q = q.parentPath, n++) {
      if (q.isObjectProperty() && explicitKeys.test(keyOf(q.node.key)) && node.start >= q.node.value.start && node.end <= q.node.value.end) { reasons.push(`model-field:${keyOf(q.node.key)}`); break; }
      if (q.isVariableDeclarator() && /prompt|instructions/i.test(keyOf(q.node.id))) { reasons.push('named-prompt-variable'); break; }
    }
    if (text.length >= 40 && /\b(?:you are|you must|you should|your task|your role|you will|you can|you have|you decide|you analyze|you're|act as|always|never|MUST|IMPORTANT|CRITICAL|Answer ONLY|reply only|return only|output only|system prompt|system instruction|USER MESSAGE|CORE BEHAVIOR|LANGUAGE RULE)\b/i.test(text)) reasons.push('instruction-language');
    if (text.length >= 35 && /你是|你需要|你必须|你的任务|你的角色|请根据|请生成|请分析|不要|必须|系统提示词|SYSTEM:|<system|<reminder>|<instructions>/i.test(text)) reasons.push('instruction-language-zh-or-tag');
    if (text.length >= 30 && /^\s*(?:Return|Generate|Summarize|Extract|Analyze|Translate|Classify|Identify|Determine|Choose|Write|Read|Use|Keep|Do not|Only)\b/.test(text)) reasons.push('imperative-fragment');
    if (text.length >= 30 && /SOUL\.md|HEARTBEAT\.md|EMOTION SYSTEM|TRAVEL PROGRESSION|FATIGUE|Evolved Traits|Recent activity context/i.test(text)) reasons.push('persona-state-context');
    if (text.length >= 60 && context.some(c => c === 'property:description') && /\b(?:use|tool|agent|model|input|output|parameter|file|search|generate)\b/i.test(text)) reasons.push('tool-description-candidate');
    if (reasons.length) {
      emit('prompt-candidates', { ...rec, category: classify(text, source), reasons, confidence: reasons.some(r => r.startsWith('model-field:')) ? 'explicit-field-static-fragment' : 'heuristic-candidate' });
      fileCounts.candidates++;
    }
  }
  traverse(ast, {
    StringLiteral: literal,
    TemplateLiteral: literal,
    ObjectProperty(p) {
      const key = keyOf(p.node.key);
      if (!explicitKeys.test(key)) return;
      const v = p.node.value;
      emit('prompt-sites', { ...recordBase(v, 'P'), field: key, expression: code.slice(v.start, v.end), context: ancestry(p) });
      fileCounts.sites++;
    },
    ObjectExpression(p) {
      const keys = p.node.properties.filter(n => n.type === 'ObjectProperty').map(n => keyOf(n.key));
      const matchedKeys = keys.filter(k => configKeys.test(k));
      if (!matchedKeys.length) return;
      emit('config-candidates', { ...recordBase(p.node, 'C'), keys, matchedKeys, expression: code.slice(p.node.start, p.node.end), context: ancestry(p), classification: 'candidate-not-proven-default' });
      fileCounts.configs++;
    }
  });
  parsed.push(fileCounts);
}
for (const fd of Object.values(writers)) fs.closeSync(fd);
const summary = { scope: 'All string and template literal nodes in packaged first-party JS/MJS and bundled CLI/browser extension scripts; candidates are broad heuristics, not guaranteed runtime prompts. No source code is executed.', counts, parsedFiles: parsed.length, parseErrors: errors, files: parsed };
fs.writeFileSync(path.join(output, 'extraction-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ counts, parsedFiles: parsed.length, parseErrors: errors }, null, 2));
if (errors.length) process.exitCode = 1;
