<!--
[INPUT]: 当前仓库 05909997 的 shared、transport、CLI、固定主聊天规格及定向测试。
[OUTPUT]: 共享契约与终端入口质量、协议兼容问题、测试失败位置及建议验收。
[POS]: ai-docs/code-review/docs/06-contracts-cli.md。
[PROTOCOL]: 一旦本文件变化，请同步更新 Header 并检查所属目录 .folder.md。
-->

# 共享协议、RPC 与命令行

CLI 能按原 requestId 对账，命令行、桌面和运行时也共用消息游标、附件摘要、会话操作指纹和取消状态。当前最大的问题是长时只读跟踪与服务端连接寿命冲突。另有一条已经运行失败的 CLI 集成用例，需要按固定主聊天的新入口校准。

<a id="rpc-01"></a>

## RPC-01 · P2 · 正常的长时跟踪会耗尽连接的请求次数

服务端在每个 WebSocket 上永久记住已见请求 ID，累计 4,096 个后，下一条不同 ID 会直接关闭连接。CLI 的 `receipt --follow` 在无事件时每 250ms 查询执行状态，活动 run 还会读取过程窗口。事件越多，查询越频繁。对于显式使用 `--send-timeout 0` 的长时观察，服务仍可执行任务，但客户端达到次数上限会报告 unknown、退出码 4，需要用户重新跟踪。默认终端等待为五分钟，触发条件是累计请求数，无法据此给出一个统一断开时长。桌面附着也复用这套 RPC，并将断开映射为宿主退出事件。[请求 ID 上限](../../../packages/transport/src/server.ts#L83) · [跟踪循环](../../../apps/cli/src/execution.ts#L119) · [跟踪错误出口](../../../apps/cli/src/execution.ts#L139) · [等待参数](../../../apps/cli/src/index.ts#L214) · [附着端](../../../apps/electron/src/main/attached-runtime.ts#L24)

建议将连接轮换和业务请求去重分开。可让客户端在服务给出轮换信号后以原服务身份重新握手，恢复订阅，从原 requestId 与游标继续只读跟踪；保留写入结果未知时按原回执核对的行为。验收时让一次只读跟踪跨过轮换阈值，核对执行状态和输出连续、业务只提交一次。此次结论来自调用链审读，未对个人实例进行长时间轮询。

<a id="rpc-02"></a>

## RPC-02 · P3 · 普通 JSON 对象可能在往返中被替换成字节

编码器为 Uint8Array 使用带类型标记和 base64 的对象，普通对象的同名字段没有转义。解码器只核对两个字段，即使对象还有其他业务字段也会直接返回字节。员工 CLI 的工具参数允许任意结构化输入，因此一个包含同名属性的元数据对象可在到达业务校验前丢失全部其余字段。[编码](../../../packages/shared/src/cli/codec.ts#L75) · [解码](../../../packages/shared/src/cli/codec.ts#L105) · [工具调用入口](../../../packages/transport/src/channels.ts#L63)

**受控检查**。在本地 Node 直接往返调用当前 `serializeEnvelope` 和 `deserializeEnvelope`，输入含协议标记、表示单字节 A 的 base64 以及 description 字段，输出只剩 `Uint8Array([65])`。建议增加普通对象的转义形式或版本化的无歧义联合类型；仅检查键数量仍无法区分恰含两个同名键的对象。回归覆盖真实字节、保留字段对象、额外业务字段、嵌套数组，并明确旧客户端的兼容策略。

<a id="cli-01"></a>

## CLI-01 · P3 · 会话操作把能力缺失误报为提交结果未知

客户端根据握手通道表，在发送前就可能抛出 `CHANNEL_NOT_FOUND`。会话创建和删除捕获后，明确失败的分支却比较 `METHOD_NOT_FOUND`；该值没有列入共享 `ErrorCode`。连接到协议版本相同、能力集较少的服务时，命令没有发送，CLI 仍可能提示查询回执并以 unknown 退出。按 run 取消的异常分支也检查相同的错误字符串。[线上错误枚举](../../../packages/shared/src/cli/protocol.ts#L14) · [发送前检查](../../../packages/transport/src/client.ts#L83) · [会话错误分类](../../../apps/cli/src/session.ts#L29) · [取消错误分类](../../../apps/cli/src/cancel.ts#L53)

建议用共享类型声明可明确拒绝的错误集合，保留连接中断、超时和提交后无法核对的 unknown 语义。用缺少目标方法的受控握手验证用户得到“该 CLI 方法未公开”，并单独保留确实已发出但丢失回执的测试。

<a id="cli-02"></a>

## CLI-02 · P2 · bobo 首次带附件的集成用例停在旧标题断言

本轮后台 Vitest 运行中，首次带附件创建 bobo 主聊天的用例在第 857 行失败。执行发送已返回 0，且测试已查询到原消息回执和会话详情。实际标题为 `bobo`，测试期望 `首次资料.md`。第 858–867 行的附件数量、原文预览绑定、重复请求不重复上传和不重复执行等断言在这次失败后没有运行。[失败及后续断言](../../../tests/cli-service.test.ts#L848)

当前规格要求 bobo 首条普通消息创建固定主聊天，另开话题需显式选择。源码的员工发送入口明确传入 main，建房时对 main 使用员工名，独立话题才有“正文或附件名”规则。建议把主聊天断言改为当前员工名并同时校验 `employeeChat: 'main'`，保留原有附件及重复执行断言，若需要覆盖 bobo 话题的附件命名，可在支持上传描述的 startCoreConversation 路径单独验证。通用 startEmployeeTopic 入口目前只接受文本及引用。当前失败能证明测试契约过时；附件在该场景的完整结果应以修订后的原样复跑为准。[员工发送入口](../../../packages/runtime/src/service.ts#L3263) · [标题来源](../../../packages/runtime/src/service.ts#L2828) · [固定主聊天规格](../../../ai-docs/spec/29.员工核心模型与完整验收/01-核心设计.md#L65) · [主聊天与话题的现有服务测试](../../../tests/core-conversations.test.ts#L170)

## 模块覆盖与工程质量

| 模块 | 审读入口 | 判断 |
| --- | --- | --- |
| 共享领域契约 | `packages/shared/src/domain/session-operation.ts`、`material-upload.ts`、`message-queue.ts`、`run-cancellation.ts` | 回执指纹使用固定字段顺序和规范化名称，附件有分片大小和摘要，取消能区分正在停止和实际停止。较大的 domain 目录本轮按接口族抽查。 |
| IPC 和 CLI 契约 | `packages/shared/src/ipc/public-methods.ts`、`cli/protocol.ts`、`cli/codec.ts` | 新公开方法需要明确登记，协议区分业务请求与传输 ID。编码往返和错误分类见 RPC-02、CLI-01。 |
| Node 文件、插件、展现与快捷键 | `packages/shared/src/node/material-files.ts`、`plugins/runtime-catalog.ts`、`rovai/public-result.ts`、`appearance/terminal.ts`、`shortcuts.ts` | 文件系统检查位于 Node 专用路径，插件绑定核对清单身份；公开执行结果按 run 和 operation 汇聚。终端配色复用主题源，快捷键有集中 schema 与冲突校验。 |
| RPC 注册与传输 | `packages/transport/src/channels.ts`、`server.ts`、`client.ts`、`events.ts` | 区分 owner 与 run，校验入参、服务实例和待决数，断连释放等待者；正常长连接需要 RPC-01 的连续性保障。 |
| 本地发现及分页 | `packages/transport/src/discovery.ts`、`history.ts` | 本地服务记录显式关联 profile，发布使用私有临时文件后改名，游标校验 sequence 与 ID。 |
| CLI 参数、输出与观察 | `apps/cli/src/index.ts`、`execution.ts`、`output.ts`、`presentation.ts`、`cancel.ts` | 输出把临时流与已发布消息分开，取消按原 run 查询实际退出，连接轮换与错误分类有上述缺口。 |
| 员工工具、附件、来源与会话 | `apps/cli/src/employee-tools.ts`、`attachments.ts`、`sources.ts`、`session.ts` | 附件先读完并确定摘要，再以稳定身份分片上传；会话写入失败后只查询原回执，避免重复创建。见 RPC-02、CLI-01、CLI-02。 |
| 自动拉起及验证 | `apps/cli/src/server-spawner.ts`、`validation.ts` | 核对新进程的 PID、服务实例、私有发现记录，并把服务就绪与实际退出区分开。未发布安装包或验证用户机器上的安装态 CLI。 |

`tests/cli-rpc.test.ts`、`tests/product-store-readonly.test.ts` 在本轮后台运行中通过。该结果适用于所运行的原有用例；RPC-01 仍需跨连接轮换场景，RPC-02 已由独立编解码检查复现，CLI-01 尚待能力缺失的回归用例。
