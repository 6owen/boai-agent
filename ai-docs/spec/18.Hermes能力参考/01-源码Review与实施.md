<!--
[INPUT]: 用户明确要求参考 Hermes、review 当前 BOAI 并修改；固定上游代码和本地实现。
[OUTPUT]: 文件安全编辑能力增量、UTF-8 修复、采用/保留/候选清单与真实验收边界。
[POS]: 第18组源码 review 和本轮实施事实；原始日志及实际成绩归关联 review。
[PROTOCOL]: 修改后同步 Header 和本目录 .folder.md；不覆盖历史失败或其他专题的实际成绩。
-->
# Hermes 源码 Review 与实施

## 1. 结论与来源

本轮采用 Hermes 的文件工具策略，补上 BOAI API 员工修改长文件的缺口。BOAI 已具备员工身份、来源权限、Work、自动化 occurrence 和成果版本链；这些领域逻辑继续使用现有实现。

上游：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)，固定提交 [`0f447876cab9df48b225172cf167b3254b06f1a5`](https://github.com/NousResearch/hermes-agent/tree/0f447876cab9df48b225172cf167b3254b06f1a5)，提交时间 2026-10-14 17:39:45 UTC。许可 MIT，Copyright (c) 2025 Nous Research。

Hermes 使用 Python；本轮按其行为转写到现有 TypeScript 工具，不引入第二套 Agent 服务。来源清单及逐文件 SHA-256 位于 `src/runtime/modules/workspaces/hermes/source-manifest.json`，许可和清单由 `scripts/build.mjs` 随 runtime 分发。命令流解码是本轮检查发现的 BOAI 自身修复，不标为上游原码搬运。

## 2. 差距与采用清单

| 范围 | Hermes 参考 | BOAI 检查结果 | 本轮处理 |
| --- | --- | --- | --- |
| 长文件阅读 | `tools/file_operations.py` 分页；`file_tools_read_tracking.py` 跟踪阅读 | 原 read_file 只返回前 48,000 个字符，缺少继续阅读入口 | 已增加 offset/limit、nextOffset、总字符数和内容 hash |
| 局部修改 | `tools/fuzzy_match.py` 精确非重叠匹配与补丁流程 | 原 API 员工主要依赖整份 write_file，改一行也需重写全文 | 已增加 edit_file；多处匹配必须显式 replaceAll |
| 读后再写 | `file_tools_write_guards.py` 完整阅读及过期保护 | 部分读取后整份覆盖可能丢失尾部；未核验读取后外部修改 | 已增加当前执行的阅读基线、完整页覆盖和写前 hash 检查 |
| 并发写入 | `tools/file_state.py` 路径锁/状态 | 同进程不同任务竞争同一路径缺少统一保护 | 已增加按实际父路径的写入串行化和新文件 O_EXCL |
| 文本完整性 | `file_operations.py` UTF-8/二进制处理 | Buffer.toString 会把无效字节替换后继续交给文本编辑 | 已严格解码，保留 BOM/CRLF；二进制和无效 UTF-8 拒绝进入文本工具 |
| 命令结果 | 检查工具输出和存储策略时发现本地问题 | stdout/stderr 每个 Buffer 单独解码会破坏跨块中文和 emoji | 已分别使用 StringDecoder，命令审批、上限和实际退出保持 |
| 自动化 | `cron/jobs.py` | BOAI 已有 Mastra 时钟、员工/群归属、occurrence、明确回执和未知不重放 | 保留现有实现，不并列引入 Hermes cron |
| 记忆 | `agent/memory_manager.py`、`tools/memory_tool_store.py` | BOAI 需保持员工独立、会话/事项范围及原材料撤权；单用户文件记忆不直接兼容 | 保留现有来源边界 |
| 工具历史压缩 | `agent/micro_compaction.py`、`tools/tool_output_truncate.py`、`tool_result_storage.py` | 可改善 API 员工长工具结果；迁入需补结果存储权限/清理/恢复，避免隐藏有效证据 | 后续候选，不恢复本机 token/时长限制 |
| 重试/重复检测 | `agent/repetition_guard.py`、`retry_utils.py`、`error_classifier.py` | BOAI 已有业务回执、未知不重放；通用重试不能代替业务幂等 | 本轮不迁入通用自动重试和重复惩罚 |
| 浏览器 | 用户明确沿 Craft 复用 | 现有 Craft/CDP 和全局登录资料是当前合同 | 继续沿 Craft，不新增浏览器实现 |

不是对 Hermes 全仓库的完整安全审计；以上结论基于列出的源码及其对应 BOAI 入口。后续可单独研究“员工从成功任务生成技能草稿”，但本轮没有自动学习、写回绑定 Skill 或跨员工共享记忆的改动。

## 3. 实际行为

### 3.1 分页和完整阅读

`read_file({path, offset?, limit?})` 的 offset 为从 0 开始的 Unicode 码点位置，默认/最大一页 48,000 字符。回执包括 `offset`、`nextOffset`、`totalCharacters`、`contentHash` 和 `truncated`。`nextOffset=null` 代表该页到达末尾；`truncated` 表示本次回执不是全文（尾页 offset>0 时仍为 true）。

API 员工的阅读基线仅属于当前执行，只有同一 hash 的连续页面覆盖整个文件，才允许整份覆盖。版本变化后页面不能拼成完整阅读。当前执行自己完整写出的文件也可继续修改；只读局部后使用 edit_file，不会取得整份覆盖资格。

### 3.2 精确修改和写前检查

`edit_file({path, oldText, newText, replaceAll?})` 仅提供给 Mastra API 任务员工。先读过当前版本，再精确替换。oldText 必须非空、不同于 newText；无匹配或多个匹配均明确报错，多个匹配只有显式 replaceAll 才执行。保留未修改字节与换行，不采用模糊/空白归一化猜测。

现有文件写入检查阅读 hash，副作用门禁后在同路径写入队列内再次核对真实文件，过期拒绝。预期不存在的目标使用 O_EXCL，不能覆盖期间他人创建的文件。继续拒绝 symlink、hardlink 和越界路径。

这属于进程内串行化加写前乐观检查，不是对其他外部进程的文件系统事务锁；进程外程序仍可能在最后检查后写入。没有增加故障回滚承诺。

原权限、私有逻辑路径、材料来源、宿主 beforeEffect/afterEffect、显式成果发布继续适用。edit_file 的成功回执纳入同一 Work 已完成操作列表，续接时提示不要重放。编辑成功不等于交付；仍需 publish_artifact 并登记实际成果。

### 3.3 文本与原生边界

1 MiB 文本上限保留；UTF-8 BOM、CRLF 和 emoji 均保持。PDF/Office/其他二进制文件不能交给这些文本读写工具，要沿实际格式处理路径。

新增 edit_file 和完整阅读/版本门禁只包围 API 员工的 BOAI 文件工具，不替换 Codex/Claude 自带编辑工具、不增加本机用量预算。共享宿主文本 read_file 能返回分页元信息；原生 CLI 的自主文件处理和权限协议保持。

## 4. 代码与验收

生产修改：`workspaces/file-editing.ts`、`file-access.ts`、`mastra/task-runtime.ts`、`mastra/host-command.ts`、`runtime/service.ts` 和构建许可复制。

单元/合同覆盖：分页缺口与混合版本、Unicode/BOM/CRLF、二进制拒绝、精确匹配歧义、旧版本拒绝、竞争创建/写入、来源撤权与副作用期间变更、同批写入/发布串行、实际 Mastra SDK 工具接线、Work 接续不重放、真实子进程逐字节输出。SDK 本地协议测试不冒充真实模型能力。

真实桌面：`hermes-file-tools-real.feature`，隔离桌面和数据目录，实际已保存 API 连接，一条新用户请求、零自动重试。测试只种入超过单页的 BOM/CRLF 文件；员工必须自行分页读取、edit_file、publish_artifact；最终逐字核对交付和未修改内容，并留存工具记录、原件、截图和退出核对。实际成绩、失败及未验范围以 [review](../../reviews/2026-10-15-hermes-review/README.md) 为准。

2026-10-15最终：144测试文件/2312通过、2跳过，类型/构建通过；一场真实API长文件编辑通过。旧失败、技能预览兼容修正、原件和未验范围完整保存在关联review。
