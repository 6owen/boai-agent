<!--
[OUTPUT]: 新增6.3完整离线快照候选：凭据/登录态/SQLite WAL及macOS元数据保持、独立重核/失败保留；不复用排除密钥的产品便携备份，不授安装恢复资格。
[OUTPUT]: Main迁移前同时检查userData/v2；持久意图的身份版本2仅对同scope旧客户端有效，完整桌面事务须维护整个userData，实际归03。
[OUTPUT]: profile准入拒绝悬空链接、任意祖先的控制命名空间与文件系统根；最低Node22.13/同卷别名/裸v2边界保持，实际归03。
[OUTPUT]: 本场userData可为profileRoot内原合法product子目录，仍要求完整字段、同场实际dataDir固定和跨场隔离。
[OUTPUT]: 冒烟逐启动完整字段绑定本场唯一临时profile和实际userData/asar，实际解包bundle清理前须再次与builder全清单相同。
[OUTPUT]: 新增release:smoke正式候选/verify入口合同：固定ZIP8/DMG2、长寿命受管挂载、逐启动实际包身份及原件；真实新包/故障演练待验。
[OUTPUT]: ZIP目录核验逐层统一显式/隐式父路径拼写，并以全部唯一节点共用5万上限，避免实际解包树合并/放大。
[OUTPUT]: 新增共用ZIP目录/CRC/模式/链接/空间阶段，真实c5全展开和深层签名通过；正式编排、main与升级仍未完成。
[OUTPUT]: c5实际ad-hoc arm64 DMG/ZIP候选及ZIP8/DMG2独立资产流程已验；完整main/正式发布/个人升级仍未通过，实际归03。
[OUTPUT]: release:build候选先排空旧账本、核实际链接路径；59合同/类型通过，实际打包与发布资格待验。
[OUTPUT]: 跨次重建仍须相同input/output/Node身份，createdAt只作记录；原CI子报告保持同一原构建，真实重建复验待跑。
[OUTPUT]: 发布前检迁本机main触发原件/最新状态双读；Tag/打包/升级仍待实施，Actions不提供当前发布资格。
[OUTPUT]: release:check只读核对稳定版本/buildVersion、同SHA main及最新完整验证；只提供前检，Tag/打包/发布/安装仍未实施。
[INPUT]: 用户当前macOS无Apple开发者签名、本机开发自用，要求先将Tag/Release/桌面升级落实为文档。
[OUTPUT]: 本机自用发布路线与已接个人候选入口；自动Tag接续、完整发布及本机升级回滚仍待实施。
[POS]: 第22组macOS个人发布与升级合同，实施实际进度统一归03第5节。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->

# macOS本机发布与升级方案

日期：2026-10-20。用户明确当前使用macOS，没有Apple开发者签名，长期通过本机源码开发并自用；最初批次仅落实文档；现有只读前检见第9节、个人候选构建入口见第10节。**已实际构建c5候选DMG/ZIP并作隔离资产验证，尚未创建Tag、发布Release、接入更新器或替换日常使用的应用。完整发布/升级仍待实现。**

## 1. 结论与推荐路线

Git Tag、GitHub Release与安装包构建可以先自动化；它们不要求Apple开发者证书。Electron在macOS上的标准`autoUpdater`基于Squirrel.Mac，要求应用签名并校验更新签名，因此当前不能把“生成Release安装包”称为已实现应用内静默更新。[Electron官方要求](https://www.electronjs.org/docs/latest/api/auto-updater#macos)

本机自用的推荐路线分两条：

| 通道 | 更新方式 | 目标 |
| --- | --- | --- |
| 源码开发版 | 使用明确源码版本、安装锁定依赖、构建并重启`pnpm dev` | 保持当前开发习惯，开发窗口不运行安装包更新器 |
| 本机安装版 | 固定版本提交 → Tag → CI验证/打包 → GitHub Release → 本机独立升级命令/脚本 → 退出并替换.app → 重开核对 | 获得可追溯安装包与可恢复的自用升级流程，无需先购买Developer ID证书 |

本机升级脚本是待开发功能，属于独立安装流程，不调用Squirrel.Mac来绕过签名要求。用户以后取得适合分发的签名与公证配置时，再接标准`electron-updater`路线。

```mermaid
flowchart LR
  A[版本提交与Tag] --> B[同一SHA测试]
  B --> C[macOS匹配架构打包]
  C --> D[产物冒烟与校验]
  D --> E[发布GitHub Release]
  E --> F[本机下载并核对]
  F --> G[退出目标应用和受管进程]
  G --> H[备份与替换app]
  H --> I[重启验证]
```

这条路线保留未来应用内“检查更新/打开下载”的接入位置；完全无人值守安装不是本轮已验证能力。未公证下载在目标Mac上的首次打开、系统确认与权限提示需要实际验收。

## 2. 当前仓库事实

| 项目 | 本次静态核对 |
| --- | --- |
| 构建器 | `electron-builder`、`app-builder-lib`均为`26.15.3`；Electron为`39.2.7` |
| 架构 | 本次本机Node进程为`arm64`；原生助手与依赖仍需随目标包验证，不由此推断支持x64/universal |
| 标识与名称 | `build.appId=com.boai.agent`，productName与Main的app名称为`BoAI Agent` |
| 版本 | 候选源码已统一`package.json.version=build.buildVersion=0.2.4`；原0.2.2/0.2.3不一致保留在历史，尚无该候选Tag/Release |
| 打包命令 | `dist:mac`是`pnpm build && electron-builder --mac dmg`，CLI明确只选择DMG |
| 产物目录 | `build.directories.output=release`；保留现有files、asarUnpack、原生文件及协议配置 |
| 更新器 | package依赖未接`electron-updater`，Main未发现`autoUpdater/checkForUpdates/quitAndInstall`接线 |
| CI | 用户已改本机执行，Actions停用；同仓库PR轮询已完整通过，main现有旧提交尚无新入口；无已接通Tag发布入口 |
| 数据 | `src/main/main.ts`设置app名称，支持`BOAI_DATA_DIR`覆盖userData，业务数据位于userData下`v2` |

这些是本次读源码与安装依赖类型得到的事实，不是运行通过或发布成绩。后续统一修改时重新核对实际版本和工作树，不覆盖其他开发中的依赖/构建变更。

## 3. 无Developer ID证书的构建配置

区分三个概念：完全不签名、无证书的ad-hoc签名、Apple开发者证书签名。个人构建可评估显式ad-hoc签名；它不提供Apple开发者身份或公证，也不能作为标准跨版本自动更新的可用保证。

当前个人候选采用以下**v26.15.3**配置片段，与原`build`合并，保留现有文件/原生资源/协议项：

```json
{
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg", "zip"],
    "identity": "-",
    "hardenedRuntime": false,
    "notarize": false
  }
}
```

本机安装依赖的`out/options/macOptions.d.ts`已核对：`identity: null`跳过签名，`identity: "-"`显式ad-hoc；没有自动发现证书时并不保证自动退回ad-hoc。ad-hoc配合默认hardened runtime会涉及library validation，个人配置先显式关闭hardened runtime，正式签名/公证路线再单独设置entitlements。[v26 macOS配置](https://www.electron.build/v26/docs/mac/)

当前`dist:mac`的`--mac dmg`会继续限制目标，实施时需同时更新命令或建立独立个人发布配置。候选构建命令为：

```bash
pnpm build
pnpm exec electron-builder --mac dmg zip --arm64 --publish never
```

上述是底层构建示意，实际通过第10节入口生成独立配置并执行，不包含发布和安装；c5真实结果归03。初版只构建需要的arm64，在匹配架构Mac执行。原生依赖、Rust/Swift等助手构建前提按`scripts/build.mjs`及其子脚本补齐；`npmRebuild: false`意味着不能假定打包阶段会修好错误架构的原生模块。

CI不配置`CSC_LINK`、`CSC_KEY_PASSWORD`或Apple公证凭据，使用上述显式个人配置；未来签名路线另设配置，避免把个人构建开关带入正式分发。不能用关闭全局Gatekeeper作为流水线步骤；对自己信任的下载应用按系统流程处理首次允许打开。[Apple说明](https://support.apple.com/en-us/102445)

## 4. 版本、Tag与Release门槛

用户切本地CI后，以下编排在本机执行，GitHub只保存Tag/Release与提交状态；当前不依赖Actions事件或分钟额度。正式发布仍必须取得远程main同SHA的完整本地资格。

1. 选定待发布提交；版本更新单独形成可追溯提交，`vX.Y.Z`必须与该提交的`package.json.version`一致。buildVersion建立单调且可解释的规则，初版可与发布版本一致，后续无需强制两者永远相同。
2. 本机发布入口接受明确版本/SHA/本地原件，前检通过后创建或核对该提交的Tag并显式接续；推送Tag本身不启动已停用的Actions。
3. 对同一SHA核对封存的main触发身份、完整原件与GitHub最新状态，不能复用其他SHA或用旧成功遮盖新pending/新尝试。
4. 在匹配架构的本机macOS构建、解包并执行产物冒烟；核对版本、原生模块、窗口、运行服务、文件与CLI入口及退出。源码`pnpm dev`通过不能代替产物通过。
5. 校验成功后发布固定版本资产与说明。初次可先形成draft，所有必需资产和结果齐备后再转正式Release；正式可下载集合不暴露半成品。
6. 同一Tag重复触发先核对已有Release、资产和hash，不静默覆盖不同内容。失败保留结果；取消/未知发布先查询远程状态，不重复创建或重发同一副作用。

自动创建Tag纳入实施范围：发布入口接受明确的版本与目标SHA，版本提交先进入仓库并满足既定交付条件，入口校验版本后创建或核对同名Tag。初版可手动启动这个入口，由程序完成后续发布；以后版本PR合并可调用同一入口，不默认每次普通提交都发一个版本。

本机通过当前本人gh授权处理Tag/Release，发布编排须显式接续。只读测试入口不创建Tag、资产或Release；后续写入入口在每次副作用前重新核验版本/SHA/最新资格并保留未知写入核对记录。未来若明确恢复云端，再独立接workflow_call等方式；当前不增加Tag自动工作流，不自动启用仓库Actions。

发布前与实际本机升级分别验收：候选资产先留在本机隔离目录或draft中，用隔离安装目录/数据完成启动、旧版升级和失败恢复演练，核对hash后发布同一份资产，不重新打包替换已验字节。正式Release存在后，本机升级入口再下载、校验并更新实际目标，记录个人数据与权限结果。首次发行没有历史正式包时，如实标记该场景未覆盖，可用明确标识的测试旧包验证机制；不能宣称已验证真实历史版本升级。发布成功与个人安装成功各自有终态，避免将“先从正式Release升级成功”设为该Release的发布前置条件。

| Release资产 | 用途 |
| --- | --- |
| 带版本/架构的DMG | 手工安装与留档 |
| 带版本/架构的ZIP | 本机升级工具读取完整.app；未来标准更新路线也需要ZIP |
| `SHA256SUMS` | 下载字节完整性核对；校验和不等于Apple代码签名，也不独立证明来源可信 |
| 版本说明/机器可读manifest | commit、appId、版本/buildVersion、OS/arch、资产名/大小/hash、数据兼容范围及检查结果 |

当前个人升级流程不依赖`latest-mac.yml`。以后接标准更新器时，再按其schema生成元数据、blockmap与发布配置，不能手工造一个latest文件就宣称自动更新已可用。[electron-builder v26更新文档](https://www.electron.build/v26/docs/features/auto-update/)

## 5. 本机安装与升级合同

推荐使用用户可写的固定安装位置，例如`~/Applications/BoAI Agent.app`，首次安装明确目标；若用户已有其他位置，按实际目标处理，不自动切换。CI只产出Release，本机独立安装器负责替换，不由远程runner直接改正在使用的个人Mac。

| 步骤 | 必需行为 |
| --- | --- |
| 检查 | 读取当前实际.app身份和版本，检测开发/安装版及受管runtime是否共用数据；选定明确Release版本/架构 |
| 下载 | 从配置的可信仓库取资产，暂存到独立目录，校验大小/hash与manifest；私有仓库使用本机已授权`gh`或合适凭据渠道，不把个人PAT打进App |
| 预检 | 检查解包路径、appId、版本、架构、原生文件与签名形态；错误或不完整内容禁止覆盖安装目标 |
| 等待退出 | 检查在途工作，通知用户保存；按原退出协议排空目标App的runtime、CLI连接、浏览器及受管子进程，等待实际退出；不误杀其他开发窗口和用户外部CLI |
| 备份 | 保存应用旧副本和必要一致性数据备份；若复用运行中应用的备份接口，在排空阶段先按原流程取得快照，退出后核对；离线备份须确认无写入并采用一致性方案，不能把运行中的SQLite主文件简单复制当完整备份 |
| 替换 | 在同一卷暂存并按确定步骤交换.app，记录安装事务；失败恢复原.app；不在正在运行的bundle内逐文件覆盖 |
| 重开 | 验证新版本启动、模型连接/凭据可读、会话/文件存在、CLI安装状态和运行服务；成功后才标记升级完成 |
| 核对/回滚 | 失联或中断读取原安装事务和实际文件身份，确认新旧版本位置；不重复覆盖或直接宣称成功 |

目标App涉及TCC/钥匙串等权限时，稳定appId和安装位置有助于保持身份，但未签名/ad-hoc升级的权限保持必须实测；不能保证每次更新都零提示。

## 6. 开发版、数据与回滚

`pnpm dev`仍沿源码构建与重启，禁止执行安装版更新器。以后应用内更新入口至少由`app.isPackaged`和明确发布通道门控，开发窗口不给安装流程签发替换目标。

当前开发/安装版均使用同一app名称，默认userData可能相同。实施时先检测并登记实际`BOAI_DATA_DIR`、userData与运行owner；测试使用独立profile。不得为了隔离而静默迁移现有个人数据；若开发版与安装版仍共用数据，升级/备份前必须确认所有相关写入owner已退出，无法确认时停止并提供核对入口。

只替换.app不主动删除userData中的`v2`、会话、员工、模型配置和文件。每次版本登记数据库schema与迁移方向；旧.app回滚不等于数据库可回滚，只有兼容旧schema或按受支持流程恢复成套备份后才能启动旧版。模型密钥解密、技能/插件路径和CLI启动器需与实际数据一起验收。

已安装CLI沿原`CliInstaller`的版本/所有权/回执规则更新，不额外覆盖用户同名命令。旧版副本与升级日志的清理由确认成功后的独立步骤处理，未知结果不清理唯一可恢复副本。

### 6.1 数据维护准入候选

`src/runtime/profile-access.ts`使用Node内置SQLite：正常应用持有共享读事务，维护工具取得独占事务后才能开始离线快照/恢复；控制文件为profile父目录下私有`.boai-profile-locks-<uid>/<profile叶名>/access.sqlite`，记录规范profile及版本。叶名交给同一父文件系统解析大小写/Unicode别名，不对路径字符串hash后另建别名锁；即使恢复期间profile暂时移走，别名仍对应同一准入。控制目录/文件仅当前用户可访问，已发布文件不删除或覆盖。首次初始化通过完整临时数据库原子发布，维护期间新程序不能先创建profile。桌面在single-instance/迁移前准入并持有至真实主进程退出；bootstrap覆盖迁移/服务排空，独立服务额外覆盖宿主、RPC和发现文件的最终清理。标准`userData/v2`同时持有外层userData和本身的准入。裸headless目录恰好名为v2且外层控制目录不存在、因父权限无法创建时，仅使用自身准入；已有外层锁、未知格式或无法核对控制目录时均不能回退。已有路径别名先规范化。

未知关闭不因GC丢掉访问锁，实际进程死亡由OS释放；失败/未来格式/非私有路径保留原件并拒绝，不靠PID或锁文件存在判断存活。维护准入不是实际进程退出证明，也不是旧版本协议的补丁：安装器仍须识别目标版本/实际进程和原runtime owner，当前旧开发进程不持有新协议时不能凭准入成功就认为它已退出。本候选不授完整一致性快照、安装/回滚或个人数据权限认证；实际结果只归03。

恢复期间目标缺失的符号链接及其子目录拒绝准入，不将其当作新的字面profile；规范路径任意层含`.boai-profile-locks-`保留名称或规范化别名时都不能作为profile，文件系统根目录同样拒绝，须在任何mkdir前完成检查。控制根及已发布scope均不能作为维护目标，避免移动其他profile正在持有的控制文件。Node最低版本继续为原22.13，不依赖其未提供的`isTransaction`属性；事务本身由真实BEGIN/读操作取得，busy等待通过SQLite PRAGMA设置，较新运行时仍核对实际事务状态。[Node22.13 SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html)

### 6.2 持久维护意图候选

只有取得维护准入后才能调用`beginMaintenance(事务UUID)`。它把最小意图（版本、原事务ID、开始时间）和控制身份版本2一起用FULL同步提交到同一控制SQLite；记录不在被替换profile内，不含模型密钥或聊天数据。维护连接设置`locking_mode=EXCLUSIVE`，提交意图后仍保持OS锁，直到明确释放/进程退出，不用跨COMMIT间隙抢回锁。[SQLite连接独占模式](https://www.sqlite.org/pragma.html#pragma_locking_mode)

持锁进程不得绕过SQLite直接打开/关闭控制数据库原文件来采集hash或备份；POSIX关闭同一inode的其他文件描述符可能撤销该进程的记录锁。控制命名空间不是用户数据快照内容，后续快照/恢复不得据普通文件复制改写它；所需状态应沿原SQLite连接读取。[SQLite关于直接文件读取与POSIX锁的说明](https://www.sqlite.org/howtocorrupt.html#posix_advisory_locks_are_canceled_by_a_close_system_call)

正常访问只接受没有未完成意图的状态。维护进程释放或崩溃后，版本2/原意图仍在，新桌面/独立服务拒绝初始化缺失profile；对同一个控制scope采用访问协议1的旧版也因不支持版本2而拒绝，不能忽略新表直接启动。b06等旧Main在迁移前仅检查外层userData，只有v2意图时仍可能先重建v2，不能把同scope旧读端实验外推到这一布局。本机完整桌面升级事务必须选择实际整个userData作为维护目标，并核对目标版本的实际能力与进程；v2单独准入不替代这个安装合同。更早完全没有该协议的旧版同样须由安装器核对，不能认定所有历史版本都已受保护。

恢复者重新取得维护连接后只读核对原ID；同ID可继续，其他ID不能覆盖，未知/未来格式或缺失记录保留并拒绝。安装器实际核对.app与数据成套一致后，才可调用`finishMaintenance(原UUID)`，原子清空意图并恢复控制身份版本1，关闭本租约；单纯`release()`、失联或GC不能清除记录。这个API只提供持久准入，不代替安装器核验数据、迁移和旧程序身份，也不证明完整备份/升级/回滚已通过。

### 6.3 完整离线快照候选

`src/runtime/profile-snapshot.ts`提供`createProfileSnapshot`与`verifyProfileSnapshot`，供独立安装事务使用。原产品`service.backup()`是便携业务备份，明确排除密钥/浏览器登录态并调整恢复策略；升级保留原数据不能改用它来缩小内容。本候选读取明确整个userData，保留凭据原字节、浏览器登录资料、SQLite主文件/WAL/SHM、用户配置和文件；仅排除维护控制命名空间。符号链接只保留链接本身，不读取外部目标；特殊文件、目录外硬链接或无法核对的内容拒绝，不能悄悄省略。原产品备份功能保持原合同。

调用方先核旧程序实际版本/进程与全部写入owner退出，再持有同一原ID的持久维护租约。快照阶段额外取得userData内已发布子profile的共享准入，已有子维护/未完成意图或未知控制格式均拒绝；不把外层锁当作子维护已结束的证据。快照成功不清除维护意图，后续安装器仍须沿原事务验证成套应用与数据。当前没有上线的安装入口调用本候选，更早不支持协议的程序退出证明、数据写回、应用交换及回滚仍待接线。

备份/核验输出为明确的新目录，父目录须本人拥有、0700且没有ACL，已有目录或与来源相互包含时不覆盖。清单工具以`private-root`检查目录隐私；显式受管执行器负责真实退出/取消/原始日志。`ditto --clone`可能退回普通复制，复制前按清单文件逻辑字节及256MiB余量预检空间。原生`scripts/profile-files.swift`核文件SHA、内部硬链接关系、uid/gid/mode、ACL、xattr字节hash、flags、纳秒mtime/创建时间；读取产生的atime/ctime不作为相等条件。复制后在副本恢复目录及符号链接等节点的时间，再完整比较来源前后清单和副本。原始控制SQLite不由持锁进程按普通文件读取；临时复制中的控制目录仅从新副本移除，不改原控制inode。

ACL通过成功的`lstatx_np`与`FILESEC_ACL`是否存在分别核对；不能把无ACL时的空返回/ENOENT当作真实读取失败。[Apple ACL实现](https://github.com/apple-oss-distributions/Libc/blob/main/posix1e/acl_file.c)。清单/复制/时间恢复在本机使用真实系统接口，未改变模型、员工权限或日常开发进程。

只有全部一致、数据与目录fsync后才写完成记录`snapshot.json`；最初`intent.json`不是完成证明。部分复制、取消、空间不足、源数据变化保留现场和原维护意图，不自动重放或清除。独立核验重新读取整个副本、清单hash和严格版本/ID字段，拒绝失败记录、未来格式、内容/元数据变化和目录权限放宽。成功仅证明该离线候选副本一致，不证明个人密钥可解密、原程序能力、安装/写回或TCC保持。实际红绿、旧候选只读核验及最新空间拒绝统一归03。

## 7. 未来标准自动更新路线

取得适合分发的Developer ID签名配置后，可补签名与公证、ZIP/DMG和发布provider、`electron-updater` Main事件及UI入口。macOS原生更新校验签名关系，证书/Team身份与版本通道需要保持兼容。[签名配置](https://www.electron.build/v26/docs/features/code-signing/)、[macOS更新签名关系](https://www.electron.build/docs/features/key-rotation/)

从个人ad-hoc版转正式签名版时，先计划一次明确的下载安装/替换与数据验证，不能假设旧个人版会通过尚未接入的更新器自动跨到正式版。签名/公证、GitHub Release与应用升级是三个独立检查环节。

## 8. 实施落点与验收

| 位置 | 后续修改 |
| --- | --- |
| `package.json`与必要锁文件 | 版本规则、个人构建配置、DMG/ZIP命令；正式路线需要时才增加更新依赖 |
| `.github/workflows/` | 保留停用的手动云端备份，不新增当前Tag自动事件 |
| `scripts/` | 已接release-check/release-build；资产隔离脚本已实际验证，继续正式封存/恢复/本机Tag/发布及安装事务 |
| `src/main/`及原退出/CLI服务 | 复用实际退出、数据身份和启动核对；未来标准更新器单独接线 |
| 本组02/03 | 更新测试分类与真实发布/升级结果，状态只有03维护 |

| 编号 | 验收 |
| --- | --- |
| RL01 | 自动创建或接收Tag后发布确实接续；Tag、package版本、buildVersion、SHA和产物一致；错误Tag/错误dispatch输入/未通过同SHA检查拒绝发布 |
| RL02 | arm64打包产物在实际目标Mac启动，所有原生助手/模块与退出有效 |
| RL03 | 无Developer ID时按个人配置构建；ad-hoc、公证和标准更新的能力分别呈现 |
| RL04 | ZIP/DMG及manifest齐备，错架构、错appId、损坏字节和不完整下载不覆盖目标 |
| RL05 | 有在途工作或共享数据owner未退出时不替换；不误杀其他实例/外部程序 |
| RL06 | 发布前隔离升级/回滚演练与发布后实际本机升级分别留证；实际升级保留会话、文件、员工、密钥可读和CLI配置，数据迁移/旧版回滚规则可验证 |
| RL07 | 下载失败、交换.app中断、启动失败、发布/安装结果未知均能核对恢复 |
| RL08 | 同Tag重复事件和安装重试不重复发布/替换；成功前不清理唯一旧副本 |
| RL09 | 开发模式不检查或安装桌面更新；开发和安装版profile冲突明确处理 |
| RL10 | 下载后的系统允许打开、权限变化与目标Mac实际体验单独留证，不拿CI可启动代替 |

以上是完整验收合同；c5候选及两个独立资产批次为RL02/03/04提供部分技术证据，其他条款与完整发布/升级未完成，不逐项预写通过。本路线可在S2准备构建/环境，在S6完成发布与升级闭环，不要求先完成开发画板联动；开发画板不随BOAI安装包分发。实际和原失败统一见[03第5节](./03-实施步骤与验收.md#5-唯一实际进度)。


## 9. 当前只读发布前检入口

`pnpm release:check --version X.Y.Z --sha 完整SHA --local-ci 原件目录`先核对当前干净源码、package.version/buildVersion，再实际调用本地完整原件verify（工程/T1/全UI、逐场原件与hash、相同源码/构建）。新CI封存repository/branch/runId并从核验器返回；只接受main触发，旧缺触发档案及PR绿均不能代替。随后只读查询远程main与最新BOAI local CI状态，最新项绑定本人、runId及manifest hash，不搜索旧成功。原件再次核验后重读最新状态及main，原件变化、新pending/新成功尝试、分支移动或package变化均拒绝，不访问Actions API。

成功记录及查询回执仅存.local/release-checks，不是可长期复用的发布许可；后续写入入口须在副作用前重新核验。当前仅协议负例/真实CLI夹具通过，尚无新合同的真实main正例，不创建Tag或资产。

跨次构建资格比较version/inputHash/outputHash/Node，createdAt只作记录，不将重新登记时间误作字节变化；verifyBuildIdentity仍重新哈希当前完整dist并核对源码输入。原封存CI中的T1/UI/总结果仍须共同指向同一个原始built对象，不把不同测试构建拼起来。相同源码但实际输出、输入或Node不一致仍拒绝；该能力的当前证据为真实文件正反例，真实完整CI后的同SHA重建复验另记03。

初次真实前检因版本0.2.2/buildVersion0.2.3不一致拒绝；后续候选源码统一为0.2.4，但完整main资格仍未通过，不能发布。该只读入口本身不改版本、不创建Tag、不构建/上传/安装。自动Tag接续、ad-hoc产物/冒烟、安装事务和回滚仍按上文继续实现，实际验证唯一归03。

## 10. 个人候选构建入口

`pnpm release:build --version X.Y.Z --sha 完整SHA`要求macOS arm64/Node24.16.0、当前干净的明确提交以及一致的version/buildVersion；不要求候选已合入main，候选成功不能代替main发布资格。先取得本机CI/轮询排他锁并重核源码，在任何dist写入前逐旧候选恢复原guard账本，活跃、未知或缺失监督器则拒绝，不能仅凭SQLite锁释放就重建。随后在`.local/release-candidates/<id>`保存独立配置与进程记录，复制不可变监督器后构建，避免dist重建移走当前监督器。

配置完整保留原files、asarUnpack、原生助手、协议、图标与现有extraMetadata，只覆盖输出、DMG/ZIP目标、ad-hoc签名、关闭hardened runtime/公证及嵌入明确源码SHA；固定`--publish never`。构建后核对bundle版本/appId、arm64、实际深层签名验证及ad-hoc身份，记录两资产大小/hash和bundle字节/执行模式/内部链接清单；同时核词法与实际realpath，拒绝链接链外逃、特殊文件或源码/dist变化。

终态`built`只表示候选构建，不签发Tag、Release、安装、main CI或产物冒烟资格；59项合同/类型通过后，c5已实际built并分别验证ZIP8场/DMG2场及签名/全部bundle字节，实际和旧失败归03。DMG需配对持有挂载生命周期，不能把会留后台挂载服务的attach当成普通短命进程、返回后立即排空其子树；正式封存/中断恢复入口仍待接。发布还需同SHA main资格、完整升级/回滚等条款。失败/取消保留日志，不覆盖日常应用或个人数据。

共用ZIP阶段位于`release-archive.mjs`：`inspectPersonalArchive`只检查中央目录/元数据，不授文件或链接实际资格；`unpackPersonalArchive`必须使用不存在的隔离输出目录，压缩/展开大小双上限和可取消hash/空间预检后先流式写普通文件、校验CRC/长度/SHA，再创建内部链接并核实际解析边界，保留模式，拒绝路径/归一化别名、特殊文件/权限、链接作为祖先、外逃/环/悬空或输入字节变化。每层显式或隐式父路径必须保持同一原始拼写，不能在默认macOS卷上静默合并大小写/Unicode别名；全部唯一节点（含递归创建的隐式父目录）共用50000上限，不仅限制中央目录行数。完整展开后仍须另核plist/架构/签名及实际应用行为。当前26 ZIP合同与修复后WIP对真实c5资产展开/签名通过，属于RL04的共用步骤，尚无正式发布/升级事务入口；不是通用安装命令。

## 11. 正式产物冒烟候选入口

`pnpm release:smoke --candidate .local/release-candidates/<id>`要求当前干净源码对应的built候选；在CI/轮询排他锁内核资产、builder完整清单、原源码/构建。新原件位于`.local/release-asset-runs`，与旧一次性探路目录分开。使用本批不可变监督器运行长寿命worker，DMG只读attach、全部验证/BDD、配对detach均在该worker生命周期内，不再用短命attach guard。新批启动前核旧监督器身份并依次排空controller/根/ZIP/DMG账本，活跃或未知拒绝；仅核本批确切镜像及唯一挂载点后才能退挂，不操作其他镜像/卷。失败保留现场，不自动重放未知任务。

ZIP固定8场：创建、API连续文件/重启、两个本机文件/重启、两个目录授权场景、外观和图片背景；DMG固定创建及CLI安装/无系统Node/独立服务/移动更新/卸载2场。沿完整标题和实际ID选择原BDD，开发版Dock场景仍在源码固定28内，不进入包清单。两种实际.app均核完整builder清单、plist/arm64/ad-hoc签名、三个原生助手、asar源码SHA和构建；每次窗口启动核实际execPath/isPackaged/隔离userData并存原件，CLI场景允许其明示副本路径。报告须完整一次通过，原截图/trace/逐启动身份/生成文件字节均重核。

逐启动字段必须完整：本场profileRoot为系统临时目录下独立boai-bdd目录，dataDir可以是该根或其合法子目录（原目录审批场景为root/product），expected/actual的程序及dataDir分别存在并相等，observed实际程序、asar及userData经已知系统路径别名规范后对应；同场各次同时保持profileRoot与实际dataDir，各场不得复用或指向邻场。两种实际bundle在BDD后、删除ZIP解包或退挂DMG之前，再次核全部文件字节/执行模式及链接与builder清单相同，保存before/after原件；变化失败并保留现场，不能只重核未运行的原builder包。

`pnpm release:smoke --verify .local/release-asset-runs/<id>`只读重核同源码候选、完整原件/hash、两资产选择/原报告和启动身份；成功封存不代替main资格、发布/个人安装或升级回滚。当前22项冒烟合同（清单/挂载所有权/完整profile协议、实际bundle修改和真实CLI旧guard拒绝）通过；小型真实DMG实际验证活跃guard不被恢复、owner SIGKILL后worker及挂载实际退出，仅为机制证据，正式新应用包入口/中断恢复仍待执行；旧c5两批探路不套用此入口。
