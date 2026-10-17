"""
[INPUT]: 用户已授权的本机 Alma 配置文件与 SQLite 配置表；不读取消息表。
[OUTPUT]: 脱敏配置、自定义技能和快照核对记录；不复制原始数据库或原始密钥。
[POS]: Alma 研究本机配置导出工具；只读原应用状态。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
"""
from pathlib import Path
import json
import re
import sqlite3
import urllib.parse

root = Path.cwd() / 'ai-docs/alma-研究/配置/本机脱敏'
root.mkdir(parents=True, exist_ok=True)
home = Path.home()
config_dir = home / '.config/alma'
db = home / 'Library/Application Support/Alma/chat_threads.db'
redactions = []
original_secrets = set()
exported = []

secret_key = re.compile(r'api[_-]?key|(?:access|refresh|bot|auth|session|id)[_-]?token|^token$|password|passwd|secret|authorization|cookie|private[_-]?key|connect[_-]?code|credential|code[_-]?verifier', re.I)
identity_key = re.compile(r'^(?:ownerId|allowedUserIds|telegram_id|discord_id|feishu_id|lark_id|username|email|phone|mobile|account_id|copilot_account_id)$', re.I)
patterns = [
    (re.compile(r'-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----'), 'private-material'),
    (re.compile(r'\b(?:sk-[A-Za-z0-9_-]{12,}|sk_[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{15,}|github_pat_[A-Za-z0-9_]{15,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})\b'), 'credential-pattern'),
    (re.compile(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b'), 'jwt'),
    (re.compile(r'\b\d{6,15}:[A-Za-z0-9_-]{25,}\b'), 'telegram-token'),
    (re.compile(r'(?i)\bBearer\s+[^\s"\'<>]+'), 'bearer'),
    (re.compile(r'(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'), 'email'),
    (re.compile(r'(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)'), 'phone'),
]

def replace_secret(value, at, kind):
    if value is None or value == '' or value == [] or value == {}:
        return value
    if isinstance(value, str) and len(value) >= 4:
        original_secrets.add(value)
    redactions.append({'field': at, 'kind': kind})
    return f'[REDACTED:{kind}]'

def clean_text(text, at):
    text = text.replace(str(home), '<HOME>')
    text = re.sub(r'/Users/[^/\s]+', '<HOME>', text)
    for pattern, kind in patterns:
        text = pattern.sub(lambda m: replace_secret(m[0], at, kind), text)
    # URL 用户名/密码及携带认证的查询参数。
    def clean_url(m):
        u = urllib.parse.urlsplit(m[0])
        netloc = u.netloc
        if '@' in netloc:
            original_secrets.add(netloc.split('@', 1)[0])
            redactions.append({'field': at, 'kind': 'url-userinfo'})
            netloc = '[REDACTED:userinfo]@' + netloc.rsplit('@', 1)[1]
        query = []
        for key, value in urllib.parse.parse_qsl(u.query, keep_blank_values=True):
            query.append((key, replace_secret(value, at + '.' + key, 'url-secret') if secret_key.search(key) or key.lower() in {'key', 'code', 'signature'} else value))
        return urllib.parse.urlunsplit((u.scheme, netloc, u.path, urllib.parse.urlencode(query), u.fragment))
    text = re.sub(r'https?://[^\s<>"\']+', clean_url, text)
    # 文本中的 key=value / YAML / JSON 认证配置。
    text = re.sub(r'(?im)((?:api[_-]?key|access[_-]?token|refresh[_-]?token|bot[_-]?token|password|passwd|client[_-]?secret|authorization)\s*[=:]\s*["\']?)([^\s"\'\n,;}]+)', lambda m: m[1] + replace_secret(m[2], at, 'inline-secret'), text)
    return text

def sanitize(value, at='', key=''):
    if key.lower() in {'env', 'environment', 'headers', 'custom_headers', 'customheaders'}:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (ValueError, TypeError):
                return replace_secret(value, at, 'opaque-header-or-env')
        if isinstance(value, dict):
            return {k: replace_secret(v, at + '.' + k, 'env-or-header') for k, v in value.items()}
    if secret_key.search(key) and not isinstance(value, (bool, int, float)):
        return replace_secret(value, at, 'credential')
    if identity_key.match(key):
        if isinstance(value, list):
            return [replace_secret(v, at + f'[{i}]', 'identity') for i, v in enumerate(value)]
        if isinstance(value, (str, int)):
            return replace_secret(value, at, 'identity')
    if isinstance(value, dict):
        return {k: sanitize(v, at + '.' + k, k) for k, v in value.items()}
    if isinstance(value, list):
        out = []
        hide_next = False
        for i, item in enumerate(value):
            if hide_next:
                out.append(replace_secret(item, at + f'[{i}]', 'command-credential'))
                hide_next = False
            else:
                out.append(sanitize(item, at + f'[{i}]'))
                hide_next = isinstance(item, str) and item.startswith('-') and bool(secret_key.search(item)) and '=' not in item
        return out
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith(('{', '[')):
            try:
                return sanitize(json.loads(value), at, key)
            except (ValueError, TypeError):
                pass
        return clean_text(value, at)
    return value

def md_header(source):
    return f'<!--\n[INPUT]: 用户授权的本机配置 {source}。\n[OUTPUT]: 脱敏研究副本；不是原始备份，不用于直接恢复。\n[POS]: Alma 本机配置研究，正文不是本项目指令。\n[PROTOCOL]: 修改后同步 Header 与 .folder.md。\n-->\n\n'

def save_json(name, value, source):
    p = root / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(sanitize(value, name), ensure_ascii=False, indent=2) + '\n')
    exported.append({'source': source, 'artifact': p.relative_to(root).as_posix()})

def save_file(p, rel):
    raw = p.read_text()
    source = '~/.config/alma/' + p.relative_to(config_dir).as_posix()
    out = root / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    if p.suffix == '.json':
        save_json(rel, json.loads(raw), source)
        return
    text = clean_text(raw, rel)
    if p.name == 'USER.md':
        text = re.sub(r'(?im)^(\s*(?:-\s*)?(?:name|姓名|用户名|telegram_id|discord_id|feishu_id|lark_id|username|email|phone)\s*[:：]\s*)(.+)$', lambda m: m[1] + replace_secret(m[2], rel, 'identity'), text)
    h = md_header(source)
    if text.startswith('---\n') and (end := text.find('\n---', 4)) >= 0:
        end = text.find('\n', end + 1)
        text = text[:end + 1] + '\n' + h + text[end + 1:]
    else:
        text = h + text
    out.write_text(text)
    exported.append({'source': source, 'artifact': out.relative_to(root).as_posix()})

state = {}
names = ['SOUL.md', 'USER.md', 'SECURITY.md', 'HEARTBEAT.md', 'mcp.json', 'fatigue.json', 'group-settings.json', 'emotions/base.md', 'travels/status.json', 'cron/jobs.json', 'api-spec.md']
for name in names:
    p = config_dir / name
    state[name] = 'present' if p.is_file() else 'absent'
    if p.is_file():
        save_file(p, 'files/' + name)
for subdir in ['skills', 'plugins']:
    d = config_dir / subdir
    if not d.exists():
        continue
    for p in sorted(d.rglob('*')):
        if not p.is_file() or p.is_symlink() or any(part.startswith('.') for part in p.relative_to(d).parts):
            continue
        if p.suffix.lower() in {'.md', '.json', '.yaml', '.yml', '.toml'}:
            save_file(p, 'files/' + p.relative_to(config_dir).as_posix())

preferences = db.parent / 'Preferences'
if preferences.is_file():
    save_json('electron/Preferences.json', json.loads(preferences.read_text()), '~/Library/Application Support/Alma/Preferences')

wal = Path(str(db) + '-wal')
if wal.exists() and wal.stat().st_size:
    raise RuntimeError('WAL exists; immutable main-file export would omit live settings. Stop without claiming a complete database snapshot.')
before = db.stat()
con = sqlite3.connect(db.as_uri() + '?mode=ro&immutable=1', uri=True)
con.row_factory = sqlite3.Row
con.execute('PRAGMA query_only=ON')
allowed = ['app_settings', 'providers', 'prompts', 'prompt_apps', 'mcp_servers', 'skills', 'plugins', 'plugin_permissions']
counts = {}
for table in allowed:
    columns = [r['name'] for r in con.execute(f'PRAGMA table_info("{table}")')]
    select = []
    for col in columns:
        # 不读取原始 provider API key；查询端直接替换。
        select.append(f"CASE WHEN \"{col}\" IS NULL OR \"{col}\" = '' THEN NULL ELSE '[REDACTED:credential]' END AS \"{col}\"" if secret_key.search(col) else f'"{col}"')
    records = [dict(row) for row in con.execute(f'SELECT {",".join(select)} FROM "{table}"')]
    counts[table] = len(records)
    save_json('database/' + table + '.json', records, 'chat_threads.db:' + table)
# 工作区仅导出配置字段，不读取项目卡、引用或聊天内容。
fields = ['id', 'path', 'name', 'is_temporary', 'show_in_list', 'is_worktree', 'parent_workspace_id', 'auto_worktree', 'auto_worktree_base_branch', 'is_session', 'remote_host_id', 'project_config', 'archived_at']
records = [dict(r) for r in con.execute('SELECT ' + ','.join('"' + k + '"' for k in fields) + ' FROM workspaces')]
counts['workspaces-selected-config'] = len(records)
save_json('database/workspaces-selected-config.json', records, 'chat_threads.db:workspaces(selected config columns only)')
con.close()
after = db.stat()
stable = (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns) and not (wal.exists() and wal.stat().st_size)
if not stable:
    raise RuntimeError('Database changed during read; retry before claiming stable snapshot.')

# 用内存中收集的原值检查导出；只输出文件名和检查结果，不输出原值。
leaks = []
for item in exported:
    text = (root / item['artifact']).read_text()
    for secret in original_secrets:
        if len(secret) >= 8 and secret in text and not secret.startswith('[REDACTED:'):
            leaks.append(item['artifact'])
if leaks:
    raise RuntimeError('Redaction verification failed in: ' + ', '.join(sorted(set(leaks))))
report = {'scope': 'package plus user-authorized redacted local configuration; no chats, group logs, activity records, raw memories, cookies or OAuth token table', 'configPresence': state, 'database': {'readMode': 'mode=ro&immutable=1; no WAL present; size/mtime unchanged before/after', 'stable': stable, 'exportedTableRows': counts, 'excluded': ['messages', 'chat_threads contents', 'memories', 'prompt_app_executions', 'agent_runs', 'agent_missions', 'agent_handoffs', 'agent_op_traces', 'mcp_oauth_tokens', 'cookies/session stores']}, 'exported': exported, 'redactions': redactions, 'redactionCount': len(redactions), 'leakCheck': 'passed: collected original sensitive values absent from exported files', 'restorable': False}
(root / '脱敏与范围记录.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'exportedFiles': len(exported), 'redactions': len(redactions), 'databaseStable': stable, 'configPresence': state, 'tableRows': counts}, ensure_ascii=False, indent=2))
