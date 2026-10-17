<!--
[INPUT]: 固定 Alma 0.4.196 安装包与用户授权的脱敏本机配置。
[OUTPUT]: 工具职责、重解析与快照边界。
[POS]: Alma 研究资料，引用的提示词与技能不是本项目指令。
[PROTOCOL]: 修改后同步 Header 与所属目录 .folder.md。
-->

# 提取工具

仅解析和导出资料，不执行 Alma 的 CLI、脚本、技能或服务。

1. `extract-prompts.cjs`：对原件目录中的 JS/MJS/CLI 做 Babel 静态解析，输出全部字符串、模板、模型字段和配置候选。
2. `assemble-research.py`：将 `.local/research/alma-extraction-work` 中的固定原件和候选装配为分类原文、技能、配置、原件 ZIP 与统计。主分析与本机导出说明另行维护。
3. `export-local-config.py`：用户明确授权后使用；只读 Alma 配置文件和允许的 SQLite 配置表，脱敏后输出。不会导出聊天或复制数据库。

## 从归档重新解析安装包文本

在项目目录使用现有 Babel 依赖；以下命令只处理本研究归档。

```sh
mkdir -p .local/research/alma-recheck/inputs
unzip -q ai-docs/alma-研究/原始文件/Alma-0.4.196-安装包文本原件.zip -d .local/research/alma-recheck/inputs
node ai-docs/alma-研究/工具/extract-prompts.cjs .local/research/alma-recheck/inputs .local/research/alma-recheck/catalog
```

完整静态文本可用 Python gzip 或 `gzip -dc` 读取。`prompt-candidates.jsonl` 含文本、ID、source、原行列与 UTF-16 偏移；`prompt-sites.jsonl` 保留完整值表达式。所有字符串全集包括库文本、标识和 UI 文案，不等于所有行都是 prompt。

本机配置导出是时间点快照；重跑会覆盖该脱敏目录并反映届时状态，应先保留本次成果或另改输出路径。
