<!--
[INPUT]: 渠道镜像与独立内部讨论的源码、隔离模块测试、真实pnpm dev Electron官方结果及原生截图。
[OUTPUT]: 实现与定向技术验证收口；原失败/修复及真实平台、模型、发行包、长期资源未认证范围分别保留。
[POS]: 2026-10-15渠道镜像审阅入口；现行16组03 §14，实际进度唯一归02 §7.21。
[PROTOCOL]: 变化同步Header和所属.folder.md；机器原件保持原字节。
-->
# 渠道镜像、内部讨论与明确外发

渠道展示获准接收的外部消息、对应员工回答和最终文件。主聊天与内部讨论不自动外发；内部讨论复用同一员工，保存独立Conversation、原生session与会话记忆。引用原消息时固定内容身份，文件修订固定原件/版本；只有用户明确“发送到渠道”才沿所选原消息的绑定、收件人和回复链投递。工作完成、文件生成与平台送达分别显示。

侧边界面继续复用系统级单容器：标题按钮打开渠道列表Popover，私聊/群聊沿label折叠；渠道、内部讨论、执行详情、文件和发送表单在容器内切换，宽度与主聊天草稿保持。渠道移除常驻聊天/任务/文件三组Tab，过程以摘要和执行入口呈现；全局空态、标题渐隐、ScrollArea保持。

## 实际检查

| 批次 | 实际结果 |
| --- | --- |
| [最终模块](checks/modules-complete.txt) | 14文件309项通过。覆盖内部上下文/native session/记忆范围、旧本地记录的镜像分页/检索/未读/列表摘要隔离、原线程外发/并发去重/未知重启不重放、原件hash/版本/权限/父渠道代际、内部材料和文件投影。 |
| [类型](checks/typecheck-complete.txt)、[renderer ESLint](checks/renderer-eslint.txt)、[构建](checks/build-complete.txt)、[定向diff](checks/diff-check.txt) | 均通过。构建保留大chunk提示。全工作树含其他修改，定向diff不替它们认证。 |
| [桌面首批](desktop-initial/index.html) | 4场3通过1失败；镜像场景的模型夹具按整条消息精确匹配，追加固定引用后未命中。修正为识别用户指令首行，不改生产问答行为。 |
| [桌面完整批](desktop-final/index.html) | 8场通过；绑定/本人历史/主聊天隔离与重启、外部群单员工、未读/定位、同一容器宽度和窄窗、详情与文件返回、空态/渐隐/ScrollArea、镜像与独立文件修改入口。 |
| [补测首批](additional-initial/index.html) | 2场失败。资源场景完成43次详情切换和5次内部处理后，在空闲等待期间窗口提前关闭；当时退出码与signal均为null，根因未确定，trace收尾也失败。另一个场景的定位器同时命中容器和表单，严格模式断言失败；实际失效绑定已被拒绝。 |
| [补测复验](additional-final/index.html) | 同两场通过；13次采样覆盖43次切换、5次处理和两分钟空闲。显式发送受理失败后，只核对原request，不自动再次发送；原渠道消息数不变。 |
| [最后桌面复验](final-recheck/index.html) | 完成Work修订来源修复后的镜像/内部讨论/明确发送/文件修改入口1场通过。 |

原生Codex与Claude的新增完整链路分别通过：渠道文件原版 → 独立内部session的新版 → 用户明确发送所选新版；只有最后一步新增渠道投递。原文件归属与固定版本保持，新版保存于内部会话。本项使用实际stdio/MCP进程和受管文件副作用的协议夹具，不是实际供应商模型。桌面文件修改场景证明请求受理及容器/草稿/来源保持；实际生成新版由上述原生集成测试覆盖，不把桌面截图中的“本次处理已结束”解释成文件已生成。

## 原失败与修复

- [模块首批](checks/modules-initial.txt)：旧“本地直接写渠道”断言与现行合同冲突，另有拒绝文案不一致；更新合同断言，保留已有多员工历史及材料读取的具体拒绝语义。
- [旧读取夹具](checks/legacy-fixture-failure.txt)：合成run缺toolEvents，补齐完整run后[复验通过](checks/legacy-fixture-recheck.txt)。原数据仍保留，镜像仅过滤读取投影。
- [关闭时序](checks/modules-teardown-failure.txt)：243项断言通过但有1个未处理的fixture退出错误；释放模拟执行后等待真实终态再关库，最终批无未处理异常。
- [原生首批](checks/native-initial.txt)及[引用修正后失败](checks/native-fixed-reference-failure.txt)：旧夹具从当前会话deliveredFiles取修订源，改为宿主固定引用后，暴露Work认领仍拒绝父渠道原件的实际遗漏。[诊断](checks/native-work-scope-diagnostic.txt)保留具体失败；修复Work认领/续行和材料来源校验后，[两种原生完整链路通过](checks/native-work-scope-recheck.txt)，并纳入309项最终批。
- [类型检查首轮](checks/typecheck-fixture-failure.txt)：新增材料夹具的parseVersion被推断为string；固定字面量类型后通过。

短期资源复验中，最终相对基线renderer heap增加约3.78MiB、main heap增加约0.05MiB，窗口/worker身份和宿主监听器保持，DOM节点/监听器未增长；按原16MiB heap、64MiB各业务进程常驻增长及空闲CPU中位数5%的门槛通过。一次复验不能解释首批窗口提前关闭，也不代表长期无泄漏。

各桌面报告保留其官方JSON、原生整幅PNG元数据、trace与资源hash。已查看内部讨论、发送表单、失效绑定与文件修改画面，未代替用户人工视觉认可。每批均缺运行前完整源码/build摘要，按缺口记录；`final-source-hashes.json`仅是收尾源码记录，不能补作运行前证据。本轮未连接真实渠道/外部模型，未验证新发行包、全仓库用例或长期常驻，也不借此前现场收发成绩认证这些新行为。
