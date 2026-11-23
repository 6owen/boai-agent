<!--
[INPUT]: 当前仓库 05909997 的运行时宿主、调度器、适配器以及同版本的调用者与定向检查。
[OUTPUT]: 运行时模块的质量判断、故障条件、修复建议和验收办法。
[POS]: ai-docs/code-review/docs/05-engine.md。
[PROTOCOL]: 一旦本文件变化，请同步更新 Header 并检查所属目录 .folder.md。
-->

# 运行时宿主、调度与适配器

运行时最值得保留的是可核验的执行身份。产品存储串行化写入，原生适配器核对会话与轮次，宿主等待底层程序退出后释放所有权。当前需要优先处理两类故障边界：一处配置要提交到两个独立存储，渠道已经确认收件时产品库还没有可恢复的输入。群聊调度也存在随历史增长而放大的读取开销。

<a id="eng-01"></a>

## ENG-01 · P1 · 保存模型连接失败后，旧配置可能已经使用新凭据

编辑现有连接并更换凭据时，服务先写入 SecretStore，再提交 SQLite 中的连接配置及版本。若密钥写入成功，后面的数据库提交失败，新凭据已生效，数据库和进程中的连接仍使用旧配置与旧版本。对同时改端点或账号的用户，这会让一个报错的保存操作改变后续模型请求所使用的身份。删除连接也先删除凭据，再变更数据库。独立服务的环境绑定还要在连接保存后另写一次环境变量引用；如果第二步失败，本次配置可能在当前会话可用，重启后失去绑定。源码可确认上述写入顺序，未对真实钥匙串或个人连接注入故障。[保存入口](../../../packages/runtime/src/service.ts#L2467) · [写凭据和提交配置](../../../packages/runtime/src/service.ts#L2483) · [删除入口](../../../packages/runtime/src/service.ts#L2504) · [独立服务绑定](../../../packages/runtime/src/headless.ts#L100) · [引用文件提交](../../../packages/runtime/src/environment-secrets.ts#L50)

建议以不可变的凭据版本作为连接记录的引用。先准备新版本，再原子切换数据库中的连接及引用，提交后回收旧版本。需要兼容旧密钥格式时可用可恢复的变更记录实现同一语义，记录中只保留引用。验收时使用临时 SecretStore，在准备、SQLite 提交和引用持久化各阶段分别注入失败，重开服务后核对配置版本、凭据来源和实际读出的测试身份。

<a id="eng-02"></a>

## ENG-02 · P2 · 恢复和读取群聊时，逐轮扫描全库事件、投递、判断

每次启动都会遍历已完成、待用户、失败的历史轮次。每轮单独创建全库投递、事件、判断的数组，再过滤相同 turnId。打开会话详情也会为该会话的每一轮重复这三次扫描，其他会话的历史同样计入每次扫描。设当前需处理 T 轮，全库三类记录合计 N 条，仅分组就要 O(T × N) 次访问。消息列表的分页无法消除这条开销，因为读取会话元数据也调用相同详情函数。[启动恢复](../../../packages/runtime/src/group-scheduler.ts#L99) · [群聊详情](../../../packages/runtime/src/group-scheduler.ts#L206) · [三次全表扫描](../../../packages/runtime/src/group-scheduler.ts#L215) · [会话元数据入口](../../../packages/runtime/src/service.ts#L1941)

**受控检查**。使用当前源码的 `GroupScheduler.detail()`，一个群每轮各一条已完成投递、事件、判断，用计数 Map 统计三类集合的 values() 实际访问。40 轮访问 4,920 条，80 轮访问 19,440 条，两次未解决失败数均为零。此检查度量访问量；真实用户启动耗时尚未测量。

建议先在一次恢复或详情请求内按 turnId 分组，再沿用原比较顺序判断后继是否覆盖旧失败。验收应覆盖同序号事件、旧失败阶段推断、同员工后来成功和跨会话历史，并为输入规模成倍增加的场景记录访问量。

<a id="eng-03"></a>

## ENG-03 · P2 · 钉钉 Stream 已回 SUCCESS 的入站消息缺少本地恢复点

Robot 回调先回复平台成功，再在微任务里检查当前绑定、解析并提交消息。业务层随后才用 eventId 查回执、准备附件、接受消息。如果在 ACK 与持久受理之间退出，或者本地接收失败，平台已经收到成功响应，此入口没有已落盘的消息可在启动后恢复。现有测试明确固定 ACK 先于 handler；仅把顺序调整成等待员工全部处理完，会改变回调时限。此处确认的是本地恢复缺口，未测量线上丢信率或平台重投策略。[ACK 与延迟处理](../../../packages/runtime/src/adapters/channels/rovai/dingtalk-stream-registry.ts#L68) · [成功响应内容](../../../packages/runtime/src/adapters/channels/rovai/dingtalk-stream-registry.ts#L132) · [业务层受理](../../../packages/runtime/src/modules/channels/channel-service.ts#L254) · [现有顺序测试](../../../tests/channels-dingtalk-source.test.ts#L33)

建议在回调时限内按绑定和平台事件 ID 持久登记最小入站记录，然后 ACK，由后台继续按当前授权校验和原 requestId 受理。增加“已 ACK、尚未创建消息时退出”的重启用例，验证生成一条会话消息；同时保留重复回调和撤销授权的覆盖。

## 模块覆盖与工程质量

下表列出实际审读的实现及边界，路径以 `packages/runtime/src/` 为根。每项覆盖该模块的主要调用链或高风险分支。

| 模块 | 审读入口 | 判断 |
| --- | --- | --- |
| 生命周期、profile 独占及升级快照 | `bootstrap.ts`、`owner.ts`、`profile-access.ts`、`profile-snapshot.ts` | 独占服务先检查配置版本，快照有独立清单及验证，初始化失败也尝试排空服务。恢复路径区分维护权和运行权。 |
| Headless、桌面附着和退出 | `serve.ts`、`headless.ts`、`desktop-host.ts`、`desktop-process.ts` | 附着队列、宿主身份检查、丢失连接及进程退出确认有独立状态。凭据引用的跨存储一致性见 ENG-01。 |
| 服务编排、调度和业务入口 | `service.ts`、`contracts.ts`、`dispatch.ts`、`group-scheduler.ts` | 6,468 行的 AppService 同时装配依赖、维护历史投影、处理请求和取消。可先以“连接配置与凭据提交”作为拆分边界，对应实际故障。启动会装载消息、运行和快照等九个集合，容量评估还应检查真实历史规模。见 ENG-01、ENG-02。 |
| 模型覆盖、运行级 CLI 身份 | `request-model.ts`、`run-cli-access.ts`、`environment-secrets.ts` | 请求身份、临时模型凭据和运行级授权有独立表示。按原 run 做工具选择和回调核验，这条边界值得保留。 |
| SQLite 产品存储及索引 | `adapters/storage/product-store.ts`、`raw-history-index.ts`、`task-page-sql.ts` | 读写有顺序，消息受理钩子在同一事务生成投影，SQLITE_BUSY 只重试开启事务。聊天详情的主要扫描开销发生在调用侧。 |
| Mastra 模型、记忆、工具和流 | `adapters/mastra/engine.ts`、`stream-completion.ts`、`gateway-catalog-store.ts` | API 记忆有员工所有者和关闭入口。流结束原因受校验，模型目录以连接来源和序号拒绝迟到响应。未调用真实模型验证召回效果。 |
| 共用原生会话、产物和进程监督 | `adapters/native-sessions.ts`、`native-process-supervisor.ts`、`native-tool-result.ts` | 运行会话与宿主工具按原请求接续，进程监督协议分开处理真正退出、输入失败与停止请求。 |
| Codex | `adapters/codex/conversation.ts`、`client.ts` | 本轮、子线程和工具回调各有身份核验，相同 callId 会校验输入签名。真实 App Server 多轮及版本漂移需要另外验收。 |
| Claude | `adapters/claude/conversation.ts`、`process.ts` | 启动前检查可执行文件身份，子进程用串行行处理和 UTF-8 解码，回执记录停止位置。 |
| ACP 外部任务 | `adapters/acp/client.ts`、`service.ts` 的 executeExternal | 有输出上限、显式审批和退出清理。宿主和适配器各自设定 15 分钟任务期限，后续修改这项产品行为必须同时核对两处。此处是既有外部任务专用路径。 |
| 运行时插件宿主 | `adapters/plugins/host.ts`、`runner.ts`、`validation.ts` | 已核验程序才可启动，probe、openSession 和 submit 的确认分开，调用签名和来源指纹贯穿会话。真实第三方程序兼容性未实测。 |
| 渠道适配器 | `adapters/channels/mastra-channels.ts`、`channels/rovai/dingtalk-stream-registry.ts` | 启停、连接身份和 SDK 生命周期集中管理。钉钉入站有 ENG-03；出站多项发送的外部回执也要与产品状态分别核对。 |
| Skill 下载、来源和仓库格式 | `adapters/skills/download.ts`、`library-repository.ts` | 下载限制总字节、时间和重定向数，每跳重验目标并绑定解析结果；仓库的可移植表示独立于传输。此处仅静态核对。 |
| Rust 进程守护及 PTY 分发 | `adapters/process-guard/main.rs`、`managed_process.rs`、`linux.rs`、`macos.rs` | 监督和 PTY 入口分开，Linux 信号目标使用 pidfd，macOS 有资源台账。未在 Linux 或已安装的 macOS 应用中验证进程树回收。 |
