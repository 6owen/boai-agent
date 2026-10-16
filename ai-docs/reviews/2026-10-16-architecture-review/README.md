<!--
[INPUT]: 2026-10-16用户授权检查当前代码架构并修复；HEAD 2bfeb61e及399f86ca...2bfeb61e近期变更。
[OUTPUT]: 两轴复核与五处已修问题；技术检查按本批记录，旧批次和其他会话文档清理不合并。
[POS]: 当前架构review报告；原始工程日志和独立桌面证据保存在/tmp。
[PROTOCOL]: 修改同步Header和本目录.folder.md，上浮检查reviews索引。
-->
# 2026-10-16 架构复核与修复

复核当前源码，近期渠道续聊、文件预览和内置插件变更作为重点上下文（`git diff 399f86ca...2bfeb61e`）。按code-review skill分别检查Standards和Spec；结合根AGENTS、局部目录合同、第8组14、第13组11和第19组03/04。本轮修改属于用户已授权的bug修复，没有新增外部插件系统或改写Agent运行架构。

现有主进程配置/业务核验、shared纯合同、renderer插件装配与独立视图的分层可以继续使用。已确认问题集中在局部状态恢复、能力判断和异步错误回传。运行时仍负责员工身份、文件来源/hash和业务回执；插件仍只取得已核源的只读内容。本轮没有发现需要推翻这层职责分工的证据。

## Standards：宿主与查看器边界

| 优先级 | 已确认问题与复现条件 | 修复位置与行为 |
| --- | --- | --- |
| P2 | PDF/Office/图片自行捕获加载失败并显示本地提示；React ErrorBoundary无法观察这些异步失败，插件管理的实际故障状态漏报。违反第19组03 G3/G4的实际故障观测要求。 | `common/file-preview/plugin-view.tsx`与`plugins/types.ts`增加稳定的可选`onPreviewError()`；实际图片/PDF/Office适配器转发，统一只记录`viewer-failed`。原提示保持，不保存正文/路径/异常原文。 |
| P2 | 图片组件复用同一img节点切换URL，旧加载的error事件可能进入新URL回调，使当前图片错误回退。 | `common/file-preview/image-preview.tsx`按URL固定节点并核对当前ref；空来源、卸载、旧图事件不记故障。 |

异步失败回报不等于插件代码损坏：无效原件、解析器或worker加载失败都可能导致本次预览失败。主动取消、隐藏/卸载、旧来源迟到、文件超限或不支持格式不记插件故障。回调身份稳定，后台事件不会因此重启查看器。内部可选参数不构成对外SDK或安全沙箱。

## Spec：文件修改与现行交互

| 优先级 | 已确认问题与合同 | 修复位置与行为 |
| --- | --- | --- |
| P2 | 关闭浮层再选文会清空requestId，使已受理的解释/分析回复无法重看；与第8组14的重新选择正文恢复本次结果不符。 | `detail-panel/file-edit-session.tsx`恢复当前精确来源最近受理结果；与`file-edit-state.ts`共用身份比较。新选文仍是独立要求，旧运行不锁定新草稿；跨文件/hash/材料代际不串回复。 |
| P2 | `artifactRevisionTarget`只识别本机Codex，纯本机Claude落入API资格判断而不可选；与第13组11无需另配API Key的本机合同不符。 | `detail-panel/artifact-state.ts`共用`isNativeBackend`，支持本机Claude；显式Claude API来源复用`claudeProvider`校验，缺失profile/失效凭据/旧ACP及不兼容绑定仍拒绝。真正受理继续由宿主核验。 |
| P3 | 附件来源折叠区仍展示“解析版本”和“材料版本”，遗漏用户明确删除文件版本展示的要求。 | `conversations/-components/material-preview.tsx`移除两个字段，标题收敛为“材料来源”；保留内部来源/hash核验。既有材料BDD同步核验两字段消失。 |

未恢复文件版本管理、header“让员工修改”按钮或底部会话；选区仍使用原Selection Actions，同排员工Select。当前修改交付后自动预览、分析时稳定阅读、未知请求只核对的原合同保持。

## 维护性观察（判断项，不作为已确认bug）

`AppService`与`app-shell`仍承担较多业务编排，属于潜在Divergent Change风险；现有模块调用与来源校验没有因本次review发现必须立即拆分的错误。后续应在具体业务改动时按受理、发布等职责提取模块，避免为了减少行数新增万能插件接口。本轮不因体积进行大规模重构。

渠道发布/续聊的串行受理、精确触发来源、幂等回执与未知不重放已做定向源码复核；没有因此新增渠道运行时代码。不能据此宣称全部渠道平台或完整架构无bug。

## 验证

修复前全仓基线148文件、2374项通过、2项跳过；这不证明缺少覆盖的上述问题不存在。修复后本批结果：

| 检查 | 本次实际结果 |
| --- | --- |
| 全仓Vitest | 150文件、2391项通过、2项跳过，150.23秒；新增17项回归 |
| 工程检查 | TypeScript、全量renderer ESLint、源码构建、BDD生成及diff空白检查通过；已有超过500KB的chunk构建提示仍在 |
| Electron | 14/14通过，0重试，约1.9分钟；预览插件启停、长文稳定阅读、选区/附件修改与失联重启、同名材料、四类二进制正常/损坏原件 |
| 来源/证据核对 | 开跑前1144份源码/构建文件hash结束时未变；14份场景清单、120份原始资源逐字节核验，21张原生PNG尺寸匹配，零记录缺口/清理错误 |
| 画面查看 | 已直接查看横向全部动作、同排员工Select、DOCX损坏原件局部回退的整窗原图；没有版本标题或底部会话 |

Standards共2处已修（最高P2），Spec共3处已修（最高P2）。全量测试和14场桌面均为本次源码构建的新批次，不引用旧成绩替代。

- 先运行回归得到选区结果2项失败、Claude资格2项失败、DOCX异步故障记录1项失败，再修复至定向测试通过。
- 新增`tests/file-edit-session.test.ts`和`tests/file-preview-plugin-errors.test.ts`，分别使用生产会话状态和实际查看器异步路径；取消/换源测试只替换worker传输，未替换查看器为伪造失败插件。PDF的jsdom分支验证失败回报接线，实际格式展示另由Electron覆盖。
- 新增测试不调用真实供应商；桌面使用独立数据目录和离线协议夹具，不改变用户真实员工或插件配置。

本轮原始日志为`/tmp/boai-architecture-review-*.log`；红绿定向日志分别为`/tmp/boai-file-edit-*.log`与`/tmp/boai-plugin-async-*.log`。Electron原始证据为`/tmp/boai-architecture-review-desktop`，Playwright报告为`/tmp/boai-architecture-review-playwright`。这些是本机临时证据，不承诺跨设备或清理后长期可用。仓库只保留本轻量结论，避免复制截图/trace。

工作开始前已有的历史review清理文档修改保持原样；没有提交或推送本次代码。未运行新安装包、Windows/Linux、真实模型/渠道平台或长期资源认证；人工视觉评价与技术通过分开。
