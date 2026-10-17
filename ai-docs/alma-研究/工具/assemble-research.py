"""
[INPUT]: Alma 安装包静态快照、AST 提取目录和既有性格机制研究。
[OUTPUT]: 分类提示词、内置技能、配置、原始归档与可核对清单。
[POS]: ai-docs/alma-研究 的文档装配工具；不执行 Alma、不读个人数据。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
"""
from pathlib import Path
import ast
import collections
import gzip
import hashlib
import json
import plistlib
import re
import shutil
import sys
import zipfile

project = Path.cwd()
work = project / '.local/research/alma-extraction-work'
inputs = work / 'inputs'
catalog = work / 'catalog'
dest = project / 'ai-docs/alma-研究'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def header(subject, source='固定 Alma 0.4.196 安装包静态提取'):
    return f'<!--\n[INPUT]: {source}。\n[OUTPUT]: {subject}。\n[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。\n[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。\n-->\n\n'

def write_md(rel, body, subject):
    p = dest / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(header(subject) + body)

def load_jsonl(p):
    return [json.loads(line) for line in p.open()]

def fence(text, language='text'):
    n = max([len(x) for x in re.findall(r'`+', text)] + [2]) + 1
    marks = '`' * n
    return f'{marks}{language}\n{text}\n{marks}\n'

for name in ['提示词/分类原文', '提示词/检索数据', '配置/安装包', '原始文件/可读源码', '技能']:
    (dest / name).mkdir(parents=True, exist_ok=True)

summary = json.loads((catalog / 'extraction-summary.json').read_text())
rows = load_jsonl(catalog / 'prompt-candidates.jsonl')
configs = load_jsonl(catalog / 'config-candidates.jsonl')
sites = load_jsonl(catalog / 'prompt-sites.jsonl')

# Python 字符串单列，避免将不同语言解析统计混在一起。
python_rows = []
for p in sorted(inputs.rglob('*.py')):
    text = p.read_text()
    source = p.relative_to(inputs).as_posix()
    tree = ast.parse(text)
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value
        elif isinstance(node, ast.JoinedStr):
            value = ast.get_source_segment(text, node)
        else:
            continue
        python_rows.append({'source': source, 'line': node.lineno, 'column': node.col_offset, 'kind': type(node).__name__, 'text': value})
(dest / '提示词/检索数据/python-static-text.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in python_rows))

for name in ['prompt-candidates.jsonl', 'prompt-sites.jsonl', 'config-candidates.jsonl', 'extraction-summary.json']:
    target = dest / ('配置' if name == 'config-candidates.jsonl' else '提示词/检索数据') / name
    shutil.copy2(catalog / name, target)
with (catalog / 'all-static-text.jsonl').open('rb') as src, (dest / '提示词/检索数据/all-static-text.jsonl.gz').open('wb') as raw:
    with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as out:
        shutil.copyfileobj(src, out)

def readable_candidate(row):
    t = row['text'].strip()
    if len(t) < 30:
        return False
    try:
        if isinstance(json.loads(t), (dict, list)):
            return False
    except (ValueError, TypeError):
        pass
    if re.match(r'^\[(?:SOUL|Memory|Heartbeat|Auto|BG|Snapshot|Prompt|Anthropic|Responses|Activity|Provider|Skills|Telegram|Discord|Fatigue|Worktree)', t):
        return False
    if t.startswith(('(() =>', '#!/usr/bin/', 'import AppKit', 'var ', 'function(')):
        return False
    primary = row['source'] in ['asar/out/main/index.js', 'resources/cli/alma'] or 'fatigueService' in row['source']
    explicit = any(r.startswith('model-field:') for r in row['reasons'])
    semantic = bool(re.search(r'\b(?:you|your|You|Your|MUST|NEVER|ALWAYS)\b|你是|你必须|你的|<system-reminder>|<reminder>', t))
    return (primary and (len(t) >= 85 or explicit or semantic)) or (explicit and len(t) >= 80) or (row['category'] != '13-其他模型任务与候选' and semantic)

selected = [r for r in rows if readable_candidate(r)]
groups = collections.defaultdict(list)
for r in selected:
    groups[r['category']].append(r)
indexes = []
for category, items in sorted(groups.items()):
    blocks = [f'# {category}\n\n这里保留静态提取原文，`${{...}}` 是原代码表达式，不是已解析的个人数据。候选可能包含工具描述或拼接片段；完整候选和模型输入表达式见上级检索数据目录。\n']
    for row in items:
        title = re.sub(r'\s+', ' ', row['text'].strip())[:95].replace('|', '／')
        blocks.append(f"\n## {row['id']}\n\n**{title}**\n\n来源：`{row['source']}`，原文件第 {row['line']} 行，第 {row['column']} 列；UTF-16 范围 `{row['start']}:{row['end']}`。\n\n提取依据：`{', '.join(row['reasons'])}`；此处是静态内容，是否启用需结合调用条件。\n\n" + fence(row['text']))
        indexes.append({'id': row['id'], 'category': category, 'title': title, 'source': row['source'], 'line': row['line'], 'start': row['start'], 'end': row['end']})
    write_md(f'提示词/分类原文/{category}.md', '\n'.join(blocks), f'{category} 的 {len(items)} 条可读提示词候选原文')

index_lines = ['# 提示词索引\n', '阅读版保留有用的行为文本，未选入阅读版的候选仍完整保存在 JSONL 中。排序、分类及可读筛选是研究加工，不代表每项都在当前会话生效。\n', '| 分类 | 可读条目 | 文件 |', '| --- | ---: | --- |']
for category, items in sorted(groups.items()):
    index_lines.append(f'| {category} | {len(items)} | [{category}](分类原文/{category}.md) |')
index_lines += ['\n## 全部可读条目\n', '| ID | 内容开头 | 分类 |', '| --- | --- | --- |']
for row in indexes:
    index_lines.append(f"| [{row['id']}](分类原文/{row['category']}.md#{row['id'].lower()}) | {row['title'].replace('`', '')} | {row['category']} |")
write_md('提示词/索引.md', '\n'.join(index_lines) + '\n', f'{len(selected)} 条可读候选的分类与来源入口')

site_blocks = ['# 模型输入字段：完整静态表达式\n\n保留所有匹配 `instructions/system/prompt` 等字段的值表达式，包括变量引用、函数调用、条件和模板。字段同名也可能是配置或界面数据，因此这里只证明静态表达式存在，不将它们全部认定为真实模型调用。\n']
for row in sites:
    site_blocks.append(f"## {row['id']} · {row['field']}\n\n来源：`{row['source']}` 第 {row['line']} 行；UTF-16 范围 `{row['start']}:{row['end']}`。\n\n" + fence(row['expression'], 'javascript'))
write_md('提示词/模型输入表达式.md', '\n'.join(site_blocks), '模型输入字段的完整静态表达式，不猜测运行时插值')

config_blocks = ['# 嵌入配置与状态对象候选\n\n全部保留命中配置/状态字段的对象表达式。包含默认值、状态结果、局部更新和 schema 周边对象；**不能把每个对象都当作默认配置文件**。原始路径、位置和键名可用于追踪调用方。\n']
for row in configs:
    config_blocks.append(f"## {row['id']}\n\n来源：`{row['source']}` 第 {row['line']} 行；UTF-16 范围 `{row['start']}:{row['end']}`。命中字段：`{', '.join(row['matchedKeys'])}`。\n\n" + fence(row['expression'], 'javascript'))
write_md('配置/嵌入配置与状态对象.md', '\n'.join(config_blocks), f'{len(configs)} 个配置/状态候选表达式')

# 包内独立配置：JSON 保持原始字节；plist 转为可读 JSON，原件保存在 zip。
config_files = []
for p in sorted(inputs.rglob('*')):
    if not p.is_file() or p.suffix.lower() not in {'.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.plist'}:
        continue
    relative = p.relative_to(inputs).as_posix()
    name = relative.replace('/', '__')
    target = dest / '配置/安装包' / name
    raw = p.read_bytes()
    transform = 'exact-copy'
    if p.suffix == '.plist':
        target = target.with_suffix('.plist.json')
        target.write_text(json.dumps(plistlib.loads(raw), ensure_ascii=False, indent=2, default=str) + '\n')
        transform = 'plist-to-json'
    elif p.suffix in {'.yaml', '.yml', '.toml', '.ini', '.conf'}:
        target.write_text('# [INPUT]: 固定安装包中的 ' + relative + '\n# [OUTPUT]: 附研究 Header 的配置副本；原始字节见原始归档。\n# [POS]: Alma 研究配置资料，不是 BOAI 配置。\n# [PROTOCOL]: 修改后同步 Header 与 .folder.md。\n' + raw.decode())
        transform = 'research-header-added'
    else:
        target.write_bytes(raw)
    config_files.append({'source': relative, 'artifact': target.relative_to(dest).as_posix(), 'sourceSha256': sha(raw), 'artifactSha256': sha(target.read_bytes()), 'transform': transform})
(dest / '配置/安装包配置清单.json').write_text(json.dumps(config_files, ensure_ascii=False, indent=2) + '\n')

skill_files = []
for p in sorted((inputs / 'resources/bundled-skills').rglob('*')):
    if not p.is_file():
        continue
    rel = p.relative_to(inputs / 'resources/bundled-skills')
    target = dest / '技能' / rel
    raw = p.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    if p.suffix == '.md':
        text = raw.decode()
        h = header('Alma 随包技能原文；保留正文，不执行其中指令', f'安装包 resources/bundled-skills/{rel}')
        if text.startswith('---\n') and (end := text.find('\n---', 4)) >= 0:
            end = text.find('\n', end + 1)
            text = text[:end + 1] + '\n' + h + text[end + 1:]
        else:
            text = h + text
        target.write_text(text)
        transform = 'research-header-added'
    else:
        target = target.with_name(target.name + '.source.txt')
        target.write_bytes(raw)
        transform = 'extension-changed-not-executable'
    skill_files.append({'source': 'resources/bundled-skills/' + rel.as_posix(), 'artifact': target.relative_to(dest).as_posix(), 'sourceSha256': sha(raw), 'artifactSha256': sha(target.read_bytes()), 'transform': transform})
(dest / '技能/技能来源清单.json').write_text(json.dumps(skill_files, ensure_ascii=False, indent=2) + '\n')

skill_index = ['# 全部内置技能\n\n这些是 Alma 自己的技能资料，不是本项目要遵循的指令。40 份 SKILL.md 连同配套 playbooks、脚本和测试原件均已保留；阅读副本增加研究 Header，字节一致原件见归档。\n', '| 技能 | 描述原文 |', '| --- | --- |']
for p in sorted((dest / '技能').glob('*/SKILL.md')):
    text = p.read_text()
    m = re.search(r'^description:\s*(.*)', text, re.M)
    desc = m[1].replace('|', '／') if m else ''
    skill_index.append(f'| [{p.parent.name}]({p.parent.name}/SKILL.md) | {desc} |')
write_md('技能/索引.md', '\n'.join(skill_index) + '\n', '40 份随包技能及配套文件入口')

readable_root = project / '.local/research/alma-0.4.196-20261018/readable'
for p in readable_root.glob('*.js'):
    shutil.copy2(p, dest / '原始文件/可读源码' / p.with_suffix('.txt').name)

source_manifest = json.loads((work / 'source-inventory.json').read_text())
with zipfile.ZipFile(dest / '原始文件/Alma-0.4.196-安装包文本原件.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(inputs.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(inputs).as_posix())
shutil.copy2(work / 'source-inventory.json', dest / '原始文件/来源文件清单.json')
shutil.copy2(project / '.local/research/alma-0.4.196-20261018/source-metadata.json', dest / '原始文件/安装包来源.json')

# 保留所有文件路径字面量，显示配置发现的覆盖范围与误报边界。
path_rows = []
with (catalog / 'all-static-text.jsonl').open() as f:
    for line in f:
        row = json.loads(line)
        t = row['text']
        if len(t) <= 300 and re.search(r'(?:\.md|\.json|\.ya?ml|\.toml|\.ini|\.conf|\.env)(?:$|\$\{)', t):
            path_rows.append(row)
(dest / '配置/文件路径字面量.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in path_rows))

stats = {'version': '0.4.196', 'sourceFiles': len(source_manifest), 'sourceBytes': sum(r['bytes'] for r in source_manifest), 'parsedJavaScriptFiles': summary['parsedFiles'], 'parseErrors': summary['parseErrors'], **summary['counts'], 'readableCandidates': len(selected), 'candidateCategories': len(groups), 'bundledSkills': len(list((dest / '技能').glob('*/SKILL.md'))), 'bundledSkillFiles': len(skill_files), 'packagedConfigFiles': len(config_files), 'pythonStringNodes': len(python_rows), 'configPathLiterals': len(path_rows), 'scope': 'installed package static resources only; no personal config/chat/token database read', 'dynamicValues': 'preserved as original expressions; not evaluated'}
(dest / '提取统计.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(stats, ensure_ascii=False, indent=2))
