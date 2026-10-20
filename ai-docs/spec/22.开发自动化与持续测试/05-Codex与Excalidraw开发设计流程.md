<!--
[OUTPUT]: 实际4331 pnpm dev快捷键五场和界面对照已验；原生改图与实现先后分开记录，完整同序DG仍待完成。
[OUTPUT]: 隔离Codex0.163原生MCP三工具逐项授权后真实选区修改/回读通过，新文件修订5保存；首次超时和第二次审批拒绝保持。
[INPUT]: 用户明确使用Codex开发BOAI，画板用于仓库开发设计；本地ZCode UI_PLUGIN.md提供流程参考。
[OUTPUT]: 开发侧原插件/外部页面/HTTP MCP及明确选区桥已接首版；文件往返与当前Codex客户端兼容分别验收，设计图不是产品截图基准。
[POS]: 第22组开发画板现行合同，替代第19组10的产品内嵌误解；唯一实际进度归03。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->

# Codex与Excalidraw开发设计流程

日期：2026-10-20。用户明确：日常使用Codex开发BOAI Agent，画板用于开发过程，文件放在BOAI仓库。**前版把这个需求写成“BOAI软件内集成UI Plugin与画板”属于范围误解，现已撤销该实施目标。** 最初批次只纠正文档；当前实际实现和验收归03 §5.1。

## 1. 三个对象的职责

| 对象 | 在这次工作中的职责 |
| --- | --- |
| Codex | 开发助手：读取需求/设计，创建或修改可编辑画板文件，编写BOAI代码、测试与文档 |
| Excalidraw | 开发用画板界面：用户查看、拖动、改字、调整布局并保存；界面在外部画板工具或经过验证的开发宿主中 |
| BOAI Agent仓库及软件 | 仓库保存设计文件、源码和测试；软件是根据设计实现和验收的对象 |

例如让Codex设计“BOAI员工配置页面”：画板保存于仓库，用户在Excalidraw里调整布局，Codex读取确定后的设计来修改BOAI页面，再用`pnpm dev`查看实际效果。画板不是BOAI的新产品页面，也不交给BOAI里的员工运行。

## 2. ZCode UI Plugin的含义与适配边界

本地参考文件为`/Users/wangwenbo/Desktop/demo/ZCode/UI_PLUGIN.md`，固定版本见[README](./README.md#4-固定参考)。该文档明确：

- ZCode Desktop提供页面宿主；Excalidraw插件提供编辑器、MCP工具及文档服务。
- 原版交互包括Agent创建、用户编辑、引用选区回ZCode会话、Agent按元素ID局部修改及导出。
- 业务场景保存在插件自己的SQLite文档库；导出`.excalidraw`到工作区是独立步骤，不等于每次手工编辑都自动写回仓库文件。

因此，“参考ZCode流程”不能直接推导出“Codex能原样加载ZCode UI Plugin”。实施前分别验证当前使用的Codex客户端、MCP工具连接、交互页面宿主、选区上下文传递及本地保存。工具调用成功不证明页面可显示，页面显示也不证明选区能传回当前Codex对话。

采用开发侧的两步接入：

| 步骤 | 目标 | 通过条件 |
| --- | --- | --- |
| 文件往返 | Codex生成/编辑`.excalidraw`，用户在独立Excalidraw界面打开编辑，再保存回明确的仓库路径 | Codex下一次实际读取的是用户保存后的内容；不声称具备自动同步或原版选区桥 |
| 工具与页面联动 | 核对并复用ZCode插件中适用的MCP服务、文档/版本和编辑交互；让开发工具完成选区传递与局部修改 | 当前Codex环境真实走通；若缺少宿主能力，登记开发侧适配缺口，再确定最小接线方案 |

用户继续以Codex为开发主入口。不能为了获得ZCode侧栏而默认要求用户换开发工具，也不能把缺失的开发宿主能力转化为BOAI产品改造。完整联动尚未全部核实，后续必须区分文件往返与实时页面联动的完成状态。

## 3. 仓库文件与保存约定

建议后续在`ai-docs/design/`按功能放置设计，实际目录在实施时建立并补`.folder.md`。例如：

```text
ai-docs/design/employee-settings/
  .folder.md
  README.md
  employee-settings.excalidraw
  employee-settings.png
```

当前已创建`ai-docs/design/keyboard-shortcuts/`，保存真实编辑器导出的初稿；其他路径仍按实际任务建立。`.excalidraw`是可编辑交付，PNG/SVG按需要导出便于审阅；说明文件记录关联需求、设计决定、源码位置及设计版本。沿已有`ai-docs/spec`引用对应产品合同，不复制第二套业务要求。

文件往返阶段以明确路径的已保存文件为交接依据。浏览器内未导出的草稿不能当作仓库最新版；普通网页不会因为打开了文件就被假定能自动覆盖本地文件。每次交给Codex前核对保存路径、修改内容及文件hash。

若后续复用插件文档库，必须明确“插件工作文档—仓库导出文件”的映射与保存时机，并保证待实施设计已导出为可审查的仓库文件。不能让SQLite、浏览器草稿和Git文件各自成为不一致的当前版本。

## 4. 每个开发任务的操作流程

1. 在Codex中说明BOAI功能需求，关联原`ai-docs/spec`合同。
2. Codex创建架构图、流程图或界面草图，并保存可编辑画板文件。
3. 用户在Excalidraw界面查看、手工修改；修改后保存回对应文件或通过已验证的桥提交。
4. Codex读取最新内容，按选定元素/明确区域局部修改。选区桥尚未建立时使用明确元素、文字或截图说明，不能声称自动读取了当前选区。
5. 设计明确后，Codex修改BOAI源码和测试；通过实际`pnpm dev`界面与设计核对。
6. 设计、实现及检查结果进入同一开发任务/PR；后续修改同时更新关联设计。

“先画板再实现”是需要设计的单个任务流程；不要求所有小修复都先画图，也不把草图直接当作最终产品可用性的证明。

产品实现后按[06 UI回归基准与PR门禁](./06-UI回归基准与PR门禁.md)测试实际BOAI界面。新增功能补行为场景与实际渲染基线；设计要求中的预期变化经审阅后才更新旧基线。Excalidraw导出图不能直接替代产品截图基准。

## 5. 后续实现与验收

| 编号 | 要证明的行为 |
| --- | --- |
| DG01 | Codex生成的`.excalidraw`在选定编辑界面可打开，文字、图形和连线可继续编辑 |
| DG02 | 用户手工修改保存后，Codex读取到相同最新内容；路径、版本和hash可核对 |
| DG03 | Codex局部修改保留无关元素；外部变化或未保存草稿不会被静默覆盖 |
| DG04 | 选区/整图上下文在实际Codex开发会话中准确传递；文件往返与页面桥分别登记 |
| DG05 | 关闭重开恢复已保存设计，原生文件和PNG/SVG导出可审阅；撤销历史范围按实际编辑器验证 |
| DG06 | 一个真实BOAI功能完成“设计—手工调整—Codex改图—源码实现—开发界面核对—PR” |
| DG07 | 开发画板配置与资料留在开发侧；BOAI生产包不因本任务增加画板宿主、编辑器或员工画图工具 |
| DG08 | 采用MCP/插件时，实际启动、保存、断开重连、版本冲突及源码来源可追溯；未支持能力明确列出 |

来源清单按实际复用补全：本地ZCode宿主源码保持研究材料；独立`zcode-plugins`已按清单固定commit构建和smoke。首版外部开发宿主已实际启动，文件/编辑器往返与SDK MCP已验；当前Codex原生客户端联动仍须单列证明。没有把编辑器放入BOAI产品，也没有改全局Codex配置。

实际阶段与验收结果只登记[03](./03-实施步骤与验收.md#5-唯一实际进度)。旧第19组10的UP/EX产品矩阵已撤销，不作为此次开发工具目标的必需项。


## 6. 当前开发工具的运行方法

上游固定commit为`4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6`，插件路径为`ui-plugins/excalidraw`，原版0.3.4/Excalidraw0.18.1。当前工作树的构建缓存位于`.local/references/zcode-plugins`。全新checkout需先准备原版：

```sh
git clone --filter=blob:none https://github.com/zai-org/zcode-plugins .local/references/zcode-plugins
git -C .local/references/zcode-plugins checkout --detach 4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6
npx --yes pnpm@10.33.2 --dir .local/references/zcode-plugins install --frozen-lockfile --filter @zcode/plugin-excalidraw...
npx --yes pnpm@10.33.2 --dir .local/references/zcode-plugins --filter @zcode/plugin-excalidraw build
pnpm design:prepare --upstream .local/references/zcode-plugins
pnpm design:serve
```

`prepare`核对干净上游commit/源文件，并登记完整dist字节；`serve`启动前重核。缓存和SQLite在`.local/design`，不提交仓库。服务打印外部编辑器地址及MCP地址，只监听127.0.0.1；Ctrl+C等待原插件退出。同一worktree只允许一个宿主。重启会换端口/会话地址，继续使用时读本轮输出或`.local/design/server.json`。

MCP客户端使用本轮打印的URL，例如临时Codex调用配置：

```toml
[mcp_servers.boai_design]
url = "http://127.0.0.1:本轮端口/session/本轮会话/mcp"
enabled_tools = ["get_editor_context", "read_scene", "apply_operations"]
[mcp_servers.boai_design.tools.get_editor_context]
approval_mode = "approve"
[mcp_servers.boai_design.tools.read_scene]
approval_mode = "approve"
[mcp_servers.boai_design.tools.apply_operations]
approval_mode = "approve"
```

以上是本次隔离CLI已验证的三工具配置；用单次`-c`参数传入，没有修改全局配置，不表示当前对话已加载该服务器。逐工具approval_mode语义见[Codex官方配置](https://developers.openai.com/codex/config-reference/)。首次120秒模型连接超时/用量未知保持，第二次因未配置工具审批而拒绝且没有修改。第三次在一CLI/50万已知token/10分钟预设内，真实读取编辑器search-row引用，expectedRevision4修改目标文字一次，再回读revision5；exit0且完整用量133946已知token，零shell。独立回读和实际页面确认⌘ K显示正确，原件/消费与未完成边界见03。export_diagram本次由独立SDK显式调用保存新文件，未将其算作这三项原生CLI工具验证。

编辑器里的保存沿原插件SQLite；需`export_diagram`或编辑器导出，文件才进入仓库。首版宿主只允许`ai-docs/design/`内的新文件，拒绝覆盖已有文件和路径符号链接。后续修订使用明确新文件名，并在功能README指向当前交接文件；已有文件受到外改时不会被静默覆盖。原生工具`expectedRevision/operationId`保护插件文档的局部修改。

选区通过编辑器“引用选区/整图”明确提交；Codex调用`get_editor_context`读取`editorConnected/reference/stale/scene/sequence`。断开或版本过期的引用不能称为当前选区。此桥不自动注入聊天输入框，也不承诺Codex原生MCP Apps页面；原宿主的成功提示由开发桥改成准确提示。局部修改结果通过本机事件流返回原编辑器，未保存草稿处理仍沿原插件控制器并另验。

现行设计修订为keyboard-shortcuts/02-codex-roundtrip.excalidraw（revision5），原01及SVG保留。原生Codex局部改图、实际页面显示和完整原生文件的无关元素保持已核对；宿主重启后的SDK持久化回读已验，新修订的GUI重开因Chrome连接不可用未认证。快捷键源码/五场测试和draft PR4已另行交付，CI90d完整18项只读及4331隔离pnpm dev八场/界面对照已验；新集成完整CI、同序单任务DG及人工设计评价仍待完成。
