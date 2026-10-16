<!--
[OUTPUT]: 2026-10-16按用户要求清理未纳入Git的验收原件；历史结果保留，已删除原件的链接不再可用。
[INPUT]: 用户对渠道发送页面的可用性反馈、03 §15、实际源码及pnpm dev隔离桌面证据。
[OUTPUT]: 发送改为明确收件人/引用的完整编辑区；技术检查通过，原首次类型失败与未认证范围保持。
[POS]: 第16组渠道发送体验审阅；唯一进度02 §7.22。
[PROTOCOL]: 变化更新Header与所属.folder.md，机器原件保持原字节。
-->

> 清理记录（2026-10-16）：本批未提交的截图、回放、生成报告及临时文件已按用户要求删除。下文保留当时的通过、失败和未验证结论；原件路径仅作历史记录，已提交的参考源码及核对记录仍保留。

# 发送到渠道的编辑体验

页面明确显示收件渠道和使用的员工机器人，原消息采用紧凑引用；正文获得主要编辑空间，发送操作固定在编辑区底部。已有引用的内部答复和渠道消息直接带入原目标，只有缺少来源或用户选择更换时才打开消息搜索Popover。弹层按内容高度收缩，超出时使用ScrollArea，显示发送者、时间和摘要；分页耗尽后移除“载入更早消息”。

渠道底部保留内部讨论，明确发送归具体消息或文件。内部答复按钮直接写明“发送到「渠道名称」”。不同消息/文件使用各自持久草稿，返回恢复所改正文；文件说明可选。旧未决发送先冻结核对，不被新草稿覆盖；发送过程中同步防重复点击，未知状态不自动重发。Enter换行，Ctrl/Cmd+Enter明确发送，输入法合成期间不触发发送。原平台线程、权限、文件hash及送达语义未更改。

| 检查 | 实际结果 |
| --- | --- |
| [模块](checks/modules.txt) | 3文件73项通过，覆盖原渠道合同与发送/详情状态。 |
| [类型](checks/typecheck-final.txt)、[renderer ESLint](checks/renderer-eslint.txt)、[源码构建](checks/build.txt)、[BDD生成](checks/bddgen.txt)、[定向diff](checks/diff-check.txt) | 通过；构建保留原大chunk提示。 |
| [首批桌面](desktop-initial/index.html) | 实际pnpm dev Electron两场通过：共用容器/宽窄尺寸/返回，镜像→内部答复→明确发送→文件修改。包含明确引用、搜索与键盘选择、恢复草稿、Enter换行/Cmd+Enter提交、360px长文本及固定发送栏、失效绑定拒绝后只核对原请求。 |
| [弹层与文件补查](desktop-final/index.html) | 单场通过；搜索弹层按内容收缩，新增文件草稿不混入文字草稿、空说明可发送文件。 |
| [最终画面复验](desktop-capture/index.html) | 同一场通过；等待弹层实际关闭后再截文件编辑画面，避免把退场动画当稳定截图。不是第三个独立场景。 |

已查看最终原生完整截图：编辑区、搜索选择、360px长文本、失效绑定反馈和文件草稿。每批保留官方Playwright JSON、trace、原生PNG/尺寸与hash、运行前源码清单；最后一批1031项输入在结束时逐项hash一致。真实Electron与平台/模型联调分开：本次为隔离数据和本地协议夹具，没有向真实飞书或Telegram发消息，也没有真实外部模型、发行包或长期资源验收。技术通过不代表用户视觉认可。

首次[类型检查](checks/typecheck-initial.txt)暴露共享图标导出名及Base UI焦点属性不匹配，已分别改为现有ChevronDownIcon与finalFocus后通过。shadcn CLI读取registry时连接关闭，随后直接查阅官方[Input Group](https://ui.shadcn.com/docs/components/base/input-group)、[Popover](https://ui.shadcn.com/docs/components/base/popover)、[Command](https://ui.shadcn.com/docs/components/base/command)文档和本地组件，未新增依赖或重装组件。首次生成报告因父目录未创建而退出，创建本次审阅根目录后成功；原场景与结果未覆盖。
