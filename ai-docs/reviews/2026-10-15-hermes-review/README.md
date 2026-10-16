<!--
[OUTPUT]: 2026-10-16按用户要求清理未纳入Git的验收原件；历史结果保留，已删除原件的链接不再可用。
[INPUT]: 2026-10-15 Hermes 固定源码 review、BOAI 工程检查与一次真实 API 长文件修改。
[OUTPUT]: 当前通过结果、失败修正、原件/截图/退出证据与未验边界；人工审阅待定。
[POS]: 第18组本轮唯一实际验收记录。
[PROTOCOL]: 不删除旧失败；新增验证按独立日志留证并同步 .folder.md。
-->

> 清理记录（2026-10-16）：本批未提交的截图、回放、生成报告及临时文件已按用户要求删除。下文保留当时的通过、失败和未验证结论；原件路径仅作历史记录，已提交的参考源码及核对记录仍保留。

# Hermes Review 与改进验收

设计和源码对照：[第18组01](../../spec/18.Hermes能力参考/01-源码Review与实施.md)。本轮采用固定 Hermes `0f447876cab9df48b225172cf167b3254b06f1a5` 的文件读写保护策略，接入 BOAI Mastra API 员工；没有新增 Hermes 服务。

## 最终结果

| 检查 | 实际结果 | 原件 |
| --- | --- | --- |
| 最后一次完整 Vitest 默认并行 | 144 文件、2312 通过、2 跳过，65.67 秒 | [完整日志](boai-hermes-full-2.log) |
| 定向文件/SDK/Work/命令 | 5 文件、270 通过 | [日志](boai-hermes-targeted-3.log) |
| 最终类型检查 | 通过 | [日志](boai-hermes-typecheck-final.log) |
| 最终构建 | 通过；保留现有大于 500 KB chunk 提示 | [日志](boai-hermes-build-final.log) |
| BDD 生成 | 通过 | [日志](boai-hermes-bddgen.log) |
| 真实 API Electron 长文件修改 | 一场通过，30.4 秒场景时间，一条用户消息、零重试 | [日志](boai-hermes-real.log)、[Playwright](playwright-report/index.html) |
| 证据与原件复核 | 14 份证据 hash 一致；56,677 字节输入/交付，仅指定日期变化；实际退出 true | [核验 JSON](evidence-check.json) |
| Hermes 许可分发 | dist/runtime 的 MIT 许可及来源清单与源码逐字一致 | [来源清单](../../../src/runtime/modules/workspaces/hermes/source-manifest.json) |

最后的完整回归包含技能安装/预览、原生/API 与文件交付等原有测试，并非仅新用例通过。2 项跳过保持原测试配置，不算通过。

## 真实员工行为

模型：产品中明确选择的已保存 `deepseek-v4-pro` API 连接，使用隔离桌面/数据目录和原系统凭据桥。只读获取连接元信息；密钥没有进入测试日志或 Renderer。使用当前源码构建，没有生成安装包。

任务：读完 `self:/work/plan.md`，仅把末尾 `2026-11-01` 改为 `2026-11-08` 并交付。输入含 UTF-8 BOM、CRLF 和 emoji，超过 48,000 字符单页长度。

实际工具顺序：`read_file(offset=0)` → `read_file(offset=48000)` → `edit_file` → `read_file(offset=54800)` 复核尾部 → `publish_artifact` → `report_work(delivered)`。三次运行（判断/执行/后续维护）均 completed；一份实际成果，原 Work delivered。

[实际执行记录](desktop/scenarios/3e99f0d5bd48e71e63c7-8ad9f1067a23b8e6db8a-retry0-repeat0-ANrBs3/004-真实员工执行记录.json) · [原始输入](desktop/scenarios/3e99f0d5bd48e71e63c7-8ad9f1067a23b8e6db8a-retry0-repeat0-ANrBs3/002-plan.md) · [退出前原生画面](desktop/scenarios/3e99f0d5bd48e71e63c7-8ad9f1067a23b8e6db8a-retry0-repeat0-ANrBs3/008-Hermes-长文件精确修改退出前原生画面.native.png) · [场景 manifest](desktop/scenarios/3e99f0d5bd48e71e63c7-8ad9f1067a23b8e6db8a-retry0-repeat0-ANrBs3/manifest.json)。后续完成了技能二进制预览兼容修正：员工工具仍明确启用相同的 strictUtf8 路径，该修正经过最后一次完整回归；没有重复调用真实供应商。

## 失败与修正记录

- 初次定向检查 157 通过、1 失败：已有“同批写入/发布”SDK 夹具直接覆盖预置文件，违反新完整阅读合同。夹具先真实调用 read_file，再保持同批 write_file/publish_artifact 的全部原串行及 hash 断言。[初次日志](boai-hermes-targeted.log)。
- 第二次定向检查 262 通过、4 失败：同批夹具的辅助计数未同步，以及修改测试参数化时误触后续用例变量。修正夹具，未放松生产门禁和原断言。[第二次日志](boai-hermes-targeted-2.log)。
- 首次全量检查 2310 通过、2 失败、2 跳过：严格 UTF-8 被施加到共享读取函数，破坏技能二进制附件预览的原提示合同。改为仅员工文本工具显式启用严格解码，技能预览保持原识别行为；最终全量通过。[原失败](boai-hermes-full.log)。

## 边界

真实模型仅认证本场 macOS 源码构建 API 员工的长文本精确修改。没有据此宣称所有模型、Windows/Linux、正式安装包、跨进程写入竞争或完整长任务稳定性通过。文件锁是进程内串行化加 hash 乐观检查，不是对外部程序的文件系统事务锁。

Codex/Claude 自主文件工具与本机无预算合同保持；本轮没有重新认证其全部能力。人工效果审阅仍为 pending。记忆压缩、自动技能学习、Hermes cron/浏览器和通用自动重试没有迁入。

当前相关源码 hash 见 [source-hashes.json](source-hashes.json)。Playwright trace 与原测试附件保存在 test-results；Cucumber 和 Playwright 原报告单独保存。
