<!--
[INPUT]: 旧诊断分支与测试清理前的 workflow 文件。
[OUTPUT]: 保留诊断步骤原文供手动参考，不被 GitHub Actions 发现或运行。
[POS]: scripts/diagnostics/README.md。
[PROTOCOL]: 成员变化同步目录地图。
-->
# 诊断工作流档案

这些 YAML 来自已整合的历史分支，保留原始诊断命令、场景与配置供本地排查参考；它们不在 `.github/workflows/`，GitHub Actions 不会执行。不要直接照抄旧 checkout/上传/基线写入步骤到当前 CI。

当前 CI 唯一自动流程是 `.github/workflows/tests.yml` 的 UI regression 与 Required checks；UI 基线候选保持单独手动入口。本地 Vitest、完整 BDD、T1/T3 和评估 runner 均已恢复。

## 本次整合来源

| 分支 | 原 head | 合并处理 |
| --- | --- | --- |
| `dev/keyboard-shortcuts-v3` | `cfc019d7` | 历史合入；保留 main 的 v5 与可编辑快捷键，不回退旧静态列表 |
| `infra/bdd-ci-probe` | `ebc3b2a4` | 保留当前字体字段/菜单步骤，旧 workflow 原文归档 |
| `infra/ci-failure-diagnostic-20261021` | `bbba0941` | 合入审批指针/按键留证；保留当前键盘审批及原断言 |
| `infra/ui-display-diagnostic-20261021` | `88b3299b` | 显示器诊断 workflow 归档，不加入 Actions |
| `infra/ui-font-probe` | `b7dc8f4a` | 字体诊断 workflow 归档，不覆盖当前 UI 门禁 |
| `infra/daily-source-identity` | `99ee633f` | 已有修复保持；冲突保留 main 的停止图标、聊天和预览生命周期，诊断 workflow 归档 |

上述分支 head 均已成为整合分支祖先。检查时所有既有 worktree 均无未提交或未跟踪文件；产品源文件与整合前 main 相同。源码历史被保留，旧试验实现不会覆盖后续正式功能。
