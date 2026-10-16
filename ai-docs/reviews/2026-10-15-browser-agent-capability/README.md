<!--
[OUTPUT]: 2026-10-16按用户要求清理未纳入Git的验收原件；历史结果保留，已删除原件的链接不再可用。
[INPUT]: 真实员工网页操作独立批次与原失败。
[OUTPUT]: 原件、回放、固定源码与可视报告索引；实际状态唯一归第11组05。
[POS]: 本次浏览器操作验收证据目录。
[PROTOCOL]: 目录变化同步本说明和上级.folder.md；生成的原件不补写Header。
-->

> 清理记录（2026-10-16）：本批未提交的截图、回放、生成报告及临时文件已按用户要求删除。下文保留当时的通过、失败和未验证结论；原件路径仅作历史记录，已提交的参考源码及核对记录仍保留。


[打开可视验收报告](reports/index.html) · [唯一实际结果](../../spec/11.浏览器能力迁移/05-实施步骤与验收清单.md)

本轮让真实BOAI员工在tldraw和Excalidraw绘制中文流程、连接并移动原图形。测试只准备空白网页、批准原任务及只读检查，不代替员工操作，不保存或导出画布文件。浏览器驱动继续复用固定Craft源码；BOAI适配及hash见source-manifest。

- 本机四个组合的成功原图：`candidate1`、`candidate2`、`candidate3`。这是分批构建上的结果。
- API tldraw两轮成功：`candidate4-api`；原单条复杂任务和Excalidraw未通过，不被覆盖。
- 原失败与准备问题：`baseline`及每一候选，含原API额度终止。
- `candidate3`框架记API tldraw interrupted，但实际产品已budget_exhausted；同批API Excalidraw未运行，具体见05。
- `preflight`、`preflight2`只有准备，零员工消息。
- `*-playwright`是在下一批开始前保存的原trace与附件；`report-inputs`只按同hash重定位trace，原manifest保持。
- `technical`保留红绿/全量/类型/构建日志、源码与图片核对。`final-artifact-audit.json`是候选3冻结核对，最新核对见[completion-artifact-audit.json](technical/completion-artifact-audit.json)。

未认证范围：每次实际传入模型的完整图片字节、新安装包、长期泄漏和全网站兼容性。原PNG、动作和媒体hash不能替代缺少的原件；Codex查看原图不等于用户人工认可。报告中的独立后台eval记录与本次真实Electron员工测试分开，不相互替代。

当前工程限制：最后候选的浏览器10场回归通过；默认并行全量连续两次worker SIGSEGV，两个文件定向通过不能替代全量。原系统异常摘要和检查日志已保留，根因未确认。
