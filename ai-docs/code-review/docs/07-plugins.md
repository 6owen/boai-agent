<!--
[INPUT]: 05909997 的仓库源码、调用方与定向检查。
[OUTPUT]: 模块质量、审查发现及修复验收条件。
[POS]: ai-docs/code-review/docs/07-plugins.md。
[PROTOCOL]: 一旦本文件变化，请同步更新 Header，并检查所属目录 .folder.md。
-->

# 插件与外部开发者接口

本篇覆盖七个插件相关包及仓库自带的外部提供方示例。插件本体与宿主一起阅读，才能判断一次调用由谁授权、由谁保留状态、退出后由谁释放资源。

<a id="plug-01"></a>

## PLUG-01 · P2 · 桌面子进程退出后仍可能一直占用桌面

`runDesktopCommand` 在 CLI 的 `close` 事件里撤销 30 秒定时器并移除取消监听，然后每 10 毫秒检查一次进程组。若主进程已经退出，另一个同组进程继续存活且已关闭继承的管道，循环没有截止点。外层只在这个 Promise 完成后释放全局桌面互斥锁，停止运行或关闭插件也要等待同一个 Promise。触发条件属于 POSIX 进程组生命周期，本次未在用户桌面制造该状态。[子进程关闭处理](../../../packages/desktop-plugin/src/host.ts#L63) · [桌面调用与停止](../../../packages/runtime/src/modules/desktop-plugin/service.ts#L104)

修复时让超时和取消覆盖整个进程组回收期，主进程退出后仍能终止本次调用拥有的残留进程。保留“核实真实退出后才放行下一次操作”的约束。现有用例验证单个子进程的取消，可加一个主进程先退出、受控辅助进程稍后退出的生命周期用例，并核对下一个调用能否获得锁。[现有测试](../../../tests/desktop-plugin-host.test.ts#L24)

<a id="plug-02"></a>

## PLUG-02 · P2 · 单轮工具调用会保留该轮已返回的完整结果

Pi、ACP 的本地工具桥按调用 ID 去重。每个新 ID 在 `calls` 保存序列化输入和结果 Promise；结束时只从 `active` 移除。同一执行轮次中可通过这些已完成的 Promise 访问原始结果，包括图片。宿主在本次 submit 结束后关闭驱动和桥，本项影响单轮峰值，跨轮累计尚无此证据。静态代码可确认引用仍在，未采集堆快照或测量单次会话的内存峰值。[工具桥](../../../packages/runtime-plugins/src/tool-server.ts#L10) · [Pi 创建桥](../../../packages/runtime-plugins/src/pi.ts#L76) · [ACP 创建桥](../../../packages/runtime-plugins/src/acp.ts#L59)

宿主也维护本轮的工具回执，修复需同步核对这两处引用。[宿主生命周期](../../../packages/runtime/src/adapters/plugins/host.ts#L123)

建议区分轻量去重回执与大输出，用字节预算控制驻留内容。即使结果已移出内存，相同调用 ID 也应返回既有回执或明确报告内容已过期，不能重新执行有副作用的工具。验收应同时检查长会话保留字节和重复调用次数。

<a id="plug-03"></a>

## PLUG-03 · P3 · 文件树缩短后键盘无法再次 Tab 进入

文件树虚拟列表会把渲染索引限制在当前行数内，但 `tabIndex` 仍与旧的 `focused` 比较。用户选中较深的子项，再用工具栏“折叠所有目录”使行数降到旧索引以下，剩余行都是 `tabIndex=-1`，树容器本身也没有 Tab 停靠点。鼠标点击可重新建立焦点，键盘用户则会跳过整棵树。[渲染范围](../../../packages/file-explorer-plugin/src/explorer.tsx#L35) · [折叠入口与行焦点](../../../packages/file-explorer-plugin/src/explorer.tsx#L99)

建议按相对路径保存当前项，消失后优先选择可见祖先，至少让一个可见行拥有 `tabIndex=0`。用有两个层级的树覆盖折叠、隐藏文件及刷新后行数减少。现有树模型测试主要核对行展开与名称；本次没有实机键盘验收。[树模型测试](../../../tests/file-explorer-tree.test.ts)

<a id="plug-04"></a>

## PLUG-04 · P3 · 插件清单可声明一个无法赋值的配置字段

SDK 分别验证配置字段的 `type` 和 `enum`，没有核对枚举成员与声明类型一致。实际填写时却要求同时满足两者。对示例的布尔字段附上字符串枚举 `["true", "false"]`，本次调用源码得到清单校验成功，布尔值和字符串值四种输入都被拒绝。字段可以留空，但开发者按已经通过校验的清单无法为它赋值。[清单与配置校验](../../../packages/runtime-plugin-sdk/src/manifest.ts#L9) · [运行时安装与解析](../../../packages/runtime/src/modules/backends/runtime-plugins.ts#L72)

建议在安装阶段拒绝含异类型枚举的字段，并把配置键写入错误路径。在 SDK 用例同时覆盖有效的字符串、数字、布尔枚举和上述矛盾声明。实际发布的示例清单未使用这种声明。[示例清单](../../../examples/runtime-plugins/text-inspector/manifest.json)

## 模块判断与覆盖

| 模块 | 实读入口 | 判断 |
| --- | --- | --- |
| Browser 插件 | [会话宿主](../../../packages/browser-plugins/src/host.ts#L55) · [业务调度](../../../packages/runtime/src/modules/browser/plugins.ts#L118) | 每个 run 的调用排队，失败的关闭步骤允许重试，临时目录在浏览器与 CLI 都完成后删除。宿主清理测试已运行，真实浏览器未启动。 |
| Canvas 插件 | [控制器](../../../packages/canvas-plugin/src/controller.ts#L83) · [导出保存](../../../packages/canvas-plugin/src/host.ts#L169) | 编辑前后记录可合并；固定 revision 的导出会复核文件与回执摘要，临时目录完成后再发布。定向用例覆盖重启复用、冲突、禁用、删除。实际渲染另需桌面环境。 |
| Desktop 插件 | [执行及图片返回](../../../packages/desktop-plugin/src/host.ts#L43) | 子进程参数、环境和图片结果有明确边界；进程树回收期见上。 |
| File Explorer 插件 | [目录分页与预览](../../../packages/file-explorer-plugin/src/host.ts#L41) · [交互](../../../packages/file-explorer-plugin/src/explorer.tsx#L43) | 游标校验目录版本，读取前后复核目标。每页 100 项仍重扫排序整个目录，接近 20,000 项上限时连续翻页应单独测耗时。键盘缺陷见上。 |
| Runtime Plugin SDK | [接口](../../../packages/runtime-plugin-sdk/src/runtime-api.ts) · [声明](../../../packages/runtime-plugin-sdk/src/manifest.ts) | 模型来源、能力声明与提交事件有显式类型，清单拒绝未知字段。跨字段校验存在上述遗漏。 |
| Runtime Plugins | [Pi](../../../packages/runtime-plugins/src/pi.ts#L88) · [ACP](../../../packages/runtime-plugins/src/acp.ts#L53) · [OpenCode](../../../packages/runtime-plugins/src/opencode.ts#L13) · [JSONL](../../../packages/runtime-plugins/src/transport.ts#L23) | Pi 区分接收输入与执行结束，ACP 根据握手发布能力，OpenCode 复用 ACP。共用工具桥的结果保留需要容量测试。 |
| Voice Input 插件 | [模型安装](../../../packages/voice-input-plugin/src/models.ts#L33) · [输入控制器](../../../packages/voice-input-plugin/src/controller.ts) | 单模型操作共享进行中请求，分块下载计算摘要，提交时校验草稿位置。当前产品暂停此输入入口。本次运行隔离宿主测试，未调用麦克风、识别服务或下载模型。 |
| 外部插件示例 | [Text Inspector](../../../examples/runtime-plugins/text-inspector/src/index.ts#L19) | 实际拒绝未声明的恢复、图片和工具，适合作为 SDK 消费者样本。示例的同步文本计数不覆盖长任务停止、并发提交和断线恢复。 |
