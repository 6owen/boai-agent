<!--
[INPUT]: 本轮实际批次、原件清单与唯一进度文档。
[OUTPUT]: 可离线查看的审阅入口；原失败和缺证保持。
[POS]: 当前目录证据索引，不代替验收账本。
[PROTOCOL]: 变化同步Header及所属.folder.md。
-->

浏览器的实际状态、原失败及未认证范围见[第11组05](../../spec/11.浏览器能力迁移/05-实施步骤与验收清单.md)。

- [全部可视审阅报告](./reports/index.html)
- [最终桌面、短期资源及混合群](./reports/final-desktop/index.html)
- [本机Codex/Claude网页与Claude自动化](./reports/native-browser-and-claude/index.html)
- [API网页刷新指引复验](./reports/api-browser-refreshed/index.html)

`real-native*`保留原模型批次；`real-api*`保留API失败及修复；`desktop*`保留独立桌面与原失败；`technical/`保留工程日志。`report-inputs/`是带来源hash的只读派生输入，`reports/`为原生成器输出。当前真实网页图像有媒体hash、网站实际POST和主窗口原图，未归档传入模型的完整PNG；主窗口图不等于网页全程录像。人工效果仍待用户审阅。
