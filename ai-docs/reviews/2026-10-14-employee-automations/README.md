<!--
[INPUT]: 本轮实际批次、原件清单与唯一进度文档。
[OUTPUT]: 可离线查看的审阅入口；原失败和缺证保持。
[POS]: 当前目录证据索引，不代替验收账本。
[PROTOCOL]: 变化同步Header及所属.folder.md。
-->

员工/群自动化的实际状态和剩余范围见[第5组11 §10.1](../../spec/5.Mastra能力扩展/11-员工与群聊自动化设计与实施计划.md)。

- [最终桌面与混合群审阅](../2026-10-14-employee-browser/reports/final-desktop/index.html)
- [全部模型批次与失败报告](../2026-10-14-employee-browser/reports/index.html)
- `desktop/`：先前员工/群表单、右侧、dashboard及资源原件。
- `real-first/`：准备失败原件；其中一个原manifest为零字节，未修造。
- `real-prepared/`：原API/Claude工具目录失败与Codex通过。
- `real-mixed/`：产品已交付、旧快照断言失败，重启未到达。
- `technical/`：全量/定向日志、一次libSQL测试worker崩溃及后续默认并行结果。

最终和后期真实批次Playwright回放有独立副本；早期desktop共19条trace引用没有找到原hash副本，截图/数据保留，详见technical/final-artifact-audit.json。派生报告输入仅把trace位置指向原hash相同的归档，保留原manifest路径与hash；不修改原批次状态。历史schedule截图原件保持，新图单独放在`schedule-snapshots/`。
