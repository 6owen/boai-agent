<!--
[INPUT]: 05909997 的运行时业务入口、Electron 浏览器宿主、SQLite 实现和现有测试；合成个人活动聚合计时。
[OUTPUT]: 六个跨业务边界的问题及修复验收条件。
[POS]: 运行时业务模块审查的发现明细。
[PROTOCOL]: 本文件变化时同步更新 Header，并检查所属目录 .folder.md。
-->

# 运行时业务路径的问题与验收条件

审查基线为 `05909997`。RT-01 至 RT-05 来自源码调用链分析；RT-06 另有纯函数合成计时。源码行号对应此版本。以下验收条件供后续修复时使用。

<a id="rt-01"></a>

## RT-01 · P1 · 一名员工的清理失败可阻止整个运行时启动

删除员工的事务先删除员工、写入 `contactDeletions`。之后，`finish` 清理画板和工作区。画板发现外部修改而返回 `preserved`，或文件系统持续拒绝清理时，`finish` 把账本标为失败，再抛出。下一次启动，`recover` 按条等待 `finish`，第一条失败就退出。上层 `AppService.init` 直接等待恢复，启动器收到异常后关闭服务。原员工已从库中删除，其他健康员工也无法经该运行时开始工作。[员工清理](../../../packages/runtime/src/modules/employees/contact-deletion.ts#L146) · [画板保留回执](../../../packages/runtime/src/modules/canvas/service.ts#L145) · [启动恢复](../../../packages/runtime/src/service.ts#L1073) · [启动器](../../../packages/runtime/src/bootstrap.ts#L30)

**建议与验收。** 保留无法证明归属的文件和失败账本，将该员工的未完成清理隔离，继续处理其余条目并允许无关业务启动。保留对数据库本身无法使用等全局故障的启动阻断。现有用例覆盖第二次清理成功。补一条持续失败记录、一条可恢复记录，核对健康员工可使用、失败记录可见、外部文件保留、第二条正常收尾。[现有恢复测试](../../../tests/contact-deletion.test.ts#L114)

<a id="rt-02"></a>

## RT-02 · P2 · 进度删除操作会删除尚未执行的人工委派

创建看板任务会持久化 `kind: 'assignment'`，首次执行前没有 `latestOccurrenceId`。公开的应用操作 `tasks.delete` 描述为删除进度，但读到任务并比对版本后，只检查有没有 `latestOccurrenceId`，然后直接删除 `agentTasks` 记录。本人入口可以读取这类任务，所以同一操作也能让刚刚创建的人工委派从看板消失。专门的员工任务删除入口还会写删除记录并清理交接关联；进度删除没有调用这套逻辑。[任务创建与专用删除](../../../packages/runtime/src/modules/automations/employee-task-service.ts#L196) · [进度删除](../../../packages/runtime/src/modules/application/task-operations.ts#L85) · [应用操作入口](../../../packages/runtime/src/service.ts#L1224)

**建议与验收。** 进度删除分支明确拒绝人工委派，并按现有兼容规则识别旧数据的任务类型。保留个人确认删除看板任务的正式入口。验证未执行的新式和旧式委派均不能由进度接口移除；普通进度的原有删除行为仍通过。[现有进度测试](../../../tests/task-pages.test.ts#L85)

<a id="rt-03"></a>

## RT-03 · P2 · 删除员工之后，原机器人的绑定无法释放

正常删除员工时，`detachEmployees` 将机器人绑定写成停用并断开传输，随后删除员工记录。绑定仍在 SQLite 和内存中，重启后也会重新加载。新员工绑定同一平台和 App ID 时，唯一性检查会命中这条旧绑定；想走显式解绑，又需要通过旧员工的存在性检查。这使正常删除员工之后的机器人交接失效，旧凭据引用也继续留存。[删除入口](../../../packages/runtime/src/service.ts#L2572) · [停用绑定](../../../packages/runtime/src/modules/channels/channel-service.ts#L350) · [唯一性检查](../../../packages/runtime/src/modules/channels/channel-service.ts#L134) · [显式解绑](../../../packages/runtime/src/modules/channels/channel-service.ts#L157)

**建议与验收。** 员工删除正式提交时，登记解绑及本地凭据清理；为已经失去员工的旧绑定提供可恢复的清理路径。历史聊天和发送回执可继续保存原绑定身份。用隔离账号夹具验证删除员工后另一个员工能够绑定同一机器人，重启后结果一致且原机器人不会自动连接。

<a id="rt-04"></a>

## RT-04 · P2 · 浏览器首次获取租约与停止交错时可能占住共享浏览器

首次调用的 `ensure` 先检查 `disposed`，随后等待异步 `validate`，返回后才设置 `acquiring`。如果停止发生在等待期间，`drain` 会看到获取尚未登记、租约尚未取得，跳到等待在途调用。验证返回后，原调用仍登记租约并向 Main 发起获取，后面的停止检查即使拦住命令，已运行的 `drain` 也不会再次释放刚取得的租约。Main 会拒绝与活动租约不同的下一项任务。调用方的验证确有异步材料和记忆核对，停止路径也实际使用这套 `drain`。[获取](../../../packages/runtime/src/modules/browser/session.ts#L40) · [停止](../../../packages/runtime/src/modules/browser/session.ts#L191) · [实际验证回调](../../../packages/runtime/src/service.ts#L5305) · [共享浏览器独占检查](../../../apps/electron/src/main/browser/browser-service.ts#L294)

**建议与验收。** 将首次验证到取得租约的过程登记为完整的在途操作；停止后拒绝后续获取，已越过获取边界时等待实际回收。可以在假宿主中控制异步验证和停止的先后，检查结束时无活动租约，随后第二个会话能正常使用浏览器。这里的判断来自代码时序，未操作真实浏览器。

<a id="rt-05"></a>

## RT-05 · P2 · 清理桌面活动中断后，当次重试可能遗留截图

`clear` 在事务里删除采样及其关联记录，以内存数组保存待移除的截图 ID，提交后逐个删除文件。一旦某个文件删除失败，列表随后丢失；用户排除临时故障再提交同范围清理，数据库已经没有可供选择的采样，新请求可能返回成功，但上次未删的 JPEG 仍在磁盘上。保留期限清理也使用同样的提交顺序。服务启动时确会按数据库的存量截图核对并移除孤儿文件，因此可恢复时间取决于下一次成功的核对。[主动清理](../../../packages/runtime/src/modules/desktop-activity/activity-service.ts#L359) · [过期清理](../../../packages/runtime/src/modules/desktop-activity/activity-service.ts#L193) · [启动期核对](../../../packages/runtime/src/modules/desktop-activity/activity-service.ts#L74) · [孤儿文件处理](../../../packages/runtime/src/modules/desktop-activity/activity-storage.ts#L40)

**建议与验收。** 在删除采样的事务中登记受管截图 ID，文件移除成功后逐项销账；重复请求和启动恢复都可继续该账本。验收时让一份隔离样本在文件移除阶段遇到一次 I/O 失败，随后在同一进程重试，核对数据库和实际文件，保留所选日期以外的截图。

<a id="rt-06"></a>

## RT-06 · P2 · 打开个人活动页时，统计运算会占住数据库写队列

个人设置和分享页会请求 `getProfileActivity`。仓储用 `ProductStore.transaction` 完整读取八个集合，其中包括消息正文和资源，再在同一回调内聚合与计算整个证据对象的哈希。事务经队列串行执行并持有 SQLite 写事务。聚合为每条本人消息或模型调用新建日期格式化器，对每个根任务又重新扫描工作、运行和区间。即使只请求一天，历史总量也决定这次后台工作的成本。在它结束前，进入同一存储队列的后续读写需要等待。[个人设置入口](../../../apps/electron/src/renderer/pages/settings/profile.tsx#L36) · [仓储](../../../packages/runtime/src/modules/profile/profile-repository.ts#L78) · [写事务](../../../packages/runtime/src/adapters/storage/product-store.ts#L469) · [日期与区间聚合](../../../packages/runtime/src/modules/profile/profile-activity.ts#L22) · [证据摘要](../../../packages/runtime/src/modules/profile/profile-activity.ts#L96)

**合成验证。** Node 22.23.4，esbuild 在内存中加载当前源码的 `aggregateActivity`，日期范围仅一天。输入为同一会话、同一日的本人消息，每条正文 100 个字符，其他集合为空。每个规模运行三次，耗时中位数依次为 100 条 5 ms、1,000 条 48 ms、5,000 条 232 ms。仅计纯函数，未计 SQLite 读取、IPC、页面渲染或竞争写入，未读取个人数据。

**建议与验收。** 用只读查询投影汇总需要的字段，先发布一致性快照，再聚合；可按时区复用日期格式化器，并按根任务、运行 ID 建索引。保留“整段留存历史摘要”与“所选日期日桶”的原有口径。用多会话消息和多个根任务验证结果等价，分别记录统计请求耗时和同时提交一条消息的等待时间。
