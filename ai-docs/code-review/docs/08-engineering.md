<!--
[INPUT]: 05909997 的仓库源码、调用方与定向检查。
[OUTPUT]: 模块质量、审查发现及修复验收条件。
[POS]: ai-docs/code-review/docs/08-engineering.md。
[PROTOCOL]: 一旦本文件变化，请同步更新 Header，并检查所属目录 .folder.md。
-->

# 构建、分发、测试与 CI

<a id="build-01"></a>

## BUILD-01 · P2 · 方法提炼 Skill 在源码目录可见，构建后从内置目录消失

这是“默认绑定给 bobo”和“可从内置目录手动发现”两种行为共用一份名单造成的。源码有 42 个 Skill 目录。清单列出 40 个默认项，另把语音列入停用项；方法提炼属于可选普通 Skill。构建时先清空 `dist/agent-skills`，只复制 40 个默认项。桌面 worker 与 headless 随后从编译输出旁读取 Skill，内置目录失去方法提炼。已有测试把整个源码目录复制进夹具，且明确要求能列出这个可选项。本次也检查了本地已有 dist，该文件缺失。[构建复制](../../../scripts/build.mjs#L60) · [桌面发现入口](../../../apps/electron/src/worker/index.ts#L91) · [headless 入口](../../../packages/runtime/src/headless.ts#L62) · [测试夹具](../../../tests/bundled-skills.test.ts#L29) · [可见性断言](../../../tests/bundled-skills.test.ts#L105)

分别表达分发范围、默认绑定和停用列表，并让“可见但未绑定”的测试至少一次指向真实构建输出。修复验收要同时看到方法提炼可手动选用、全新 bobo 的默认绑定数保持原合同、停用的语音 Skill 仍不可见。

<a id="build-02"></a>

## BUILD-02 · P2 · 增量构建可把已经删去的旧运行时插件带进候选包

插件构建只为当前清单逐个创建或更新 `dist/runtime-plugin-packages/<provider>`。若上一个版本留下某个 provider 目录，此次构建没有清理分发目录或将实际文件集与当前清单比对。完整构建身份会把当下 dist 字节一起登记，而 electron-builder 的收集范围包含 `dist/**/*`。因此，同一份干净源码在复用旧 dist 和干净 dist 时可能得到不同安装内容。正式候选也经过这条 build → 身份校验 → 打包链。启动时只枚举当前内置清单，残留目录不会自动启用。本次确认了安装内容的选择逻辑，没有构建安装包，也没有证据说明已发布包带有旧插件。[运行时登记](../../../packages/runtime/src/modules/backends/runtime-plugins.ts#L42)[插件输出](../../../scripts/build-runtime-plugins.mjs#L24) · [登记输出哈希](../../../scripts/build-identity.mjs#L60) · [打包范围](../../../package.json#L166) · [候选入口](../../../scripts/release-build.mjs#L116)

将本次拥有的插件分发子目录在临时位置完整生成后替换，或按清单清除已退出的产物。测试可在隔离构建目录预放旧 provider，对比干净与复用两种构建的文件清单。不要清空存放发布资产的整个 dist。

<a id="build-03"></a>

## BUILD-03 · P2 · UI 预览能在未到达改动界面时标记为“本次改动页面”

UI 检测识别全部 renderer 路径，但默认定位仅覆盖部分页面目录及个别组件。实际把员工任务看板的路径传给 `screenshotTarget` 且不给 PR 额外提示，输出是空点击列表，唯一断言是主导航可见。BDD 因此可在预置聊天页保存 `preview.png`，发布端仍标注为“本次改动页面”。这里确认的是路由选择与断言，未声称某个历史 PR 的图片有误。[路径检测](../../../.github/ui-preview/publish.mjs#L38) · [目标选择](../../../.github/ui-preview/screenshot-target.mjs#L12) · [截图断言](../../../tests/e2e/steps/ci-screenshot.steps.ts#L25) · [图片标签](../../../.github/ui-preview/publish.mjs#L194)

把任务面板、编辑器、独立弹窗等需要二次操作的入口映射到可见的业务元素；无法推导时输出“目标未定位”，保留独立的全局图。已有显式点击提示可继续复用。用上述路径检查最终可见断言指向任务面板。

<a id="build-04"></a>

## BUILD-04 · P3 · 本地语音能力重装可报成功，但运行环境仍缺失

`setup.py --download` 发现已有安装回执后，只比较源文件摘要并验证模型，随即返回 `installed: true`。若用户保留模型和回执、只移除损坏的 venv，再运行安装器会一直提前成功。实际状态查询还要求存在 `venv/bin/python`，所以使用者被卡在“已安装”和“未就绪”之间。隔离目录验证中模拟支持平台和模型校验通过，安装输出成功，同一目录的真实状态函数返回 `Runtime installation incomplete`。此项针对可选 TTS 安装脚本，当前默认停用的范围使其优先级较低。[安装器](../../../resources/capabilities/voice/setup.py#L24) · [状态谓词](../../../resources/capabilities/voice/voice.py#L41) · [分发清单](../../../resources/agent-skills/manifest.json#L45)

复用同一就绪检查。已验证的大模型仍可保留，只修复缺失的解释器与依赖，修复失败时给出对应错误。验收需覆盖正常已安装、模型损坏和仅缺 venv 三种状态。

## 工程模块判断

| 模块 | 实读入口 | 质量判断与验证边界 |
| --- | --- | --- |
| 工作区与工具链 | [工作区约束](../../../scripts/check-workspace-boundaries.mjs) · [公共导出映射](../../../scripts/workspace-packages.mjs) · [Vite](../../../vite.config.ts) | 包依赖方向有可执行规则，构建和测试复用源码 alias。本轮边界检查覆盖 16 个项目、1124 个 JS/TS 源文件。 |
| 开发、构建与静态资源 | [CLI 开发](../../../scripts/dev-cli.mjs#L22) · [应用构建](../../../scripts/build.mjs#L110) · [分发](../../../scripts/build-runtime-plugins.mjs) | CLI 单目标、完整 Electron 和部分构建的身份分开；增量构建的旧文件与可选 Skill 是两个独立缺口。图标资源由 manifest 驱动。 |
| 设计包与开发者 SDK | [设计包生成](../../../scripts/design-packages.mjs#L17) · [外部消费检查](../../../scripts/check-design-distribution.mjs) · [插件开发工具](../../../scripts/runtime-plugin-devkit.mjs) | 同步构建声明、CSS 和包导出，有仓库外消费者入口。本轮没有重新打 npm tarball。 |
| 开发画板与 Git 交付 | [设计宿主生命周期](../../../scripts/design/lifecycle.mjs#L16) · [Git 交付脚本](../../../scripts/git-cpf.mjs#L123) | 开发画板为在途操作提供 drain；快速合并要求核对 head 并恢复保护。本轮只读源码，未启动画板或发起合并。 |
| 自动开发与恢复 | [检查报告解释](../../../scripts/development/checks.ts#L8) · [检查点及恢复](../../../scripts/development/recovery.ts#L53) | 区分断言失败、未运行、重复与框架错误；检查点保留回执。只审查状态处理，未实际创建开发任务或 PR。 |
| PR、Release 与本机 CI | [当前 Test 计划](../../../scripts/test-ci-plan.mjs#L17) · [release 身份](../../../scripts/release-check.mjs#L20) · [资产核验及发布](../../../scripts/release-publish.mjs#L19) · [本机证据验证](../../../scripts/ci-result.mjs) | release 复核 main、SHA 和实际 Test 尝试；文档、普通 PR 与明确发起的完整测试有独立路径。源码检查未访问线上 Actions。 |
| 单元、桌面与性能测试 | [Vitest](../../../vitest.config.ts) · [截图步骤](../../../tests/e2e/steps/ci-screenshot.steps.ts) · [性能数据汇总](../../../tests/performance/summarize-dialog.mjs#L35) | 用例有隔离夹具，也有真实产物入口；源码夹具和实际分发存在上述差异。性能汇总读取已有固定批次，本轮未采集新性能样本。 |
| 业务评估、诊断与原生探测 | [预算账本](../../../tests/evaluation/budget.ts#L13) · [评分](../../../tests/evaluation/scorers.ts#L9) · [语音诊断判定](../../../scripts/diagnostics/voice-input-result.mjs#L7) | 预算预留先于请求，聚合评分保留 pending，诊断同时看输出与退出状态。未调用真实模型、原生程序或语音服务。 |
| 技能与示例资源 | [技能清单](../../../resources/agent-skills/manifest.json) · [内置技能发现](../../../packages/runtime/src/modules/resources/local-skill-catalog.ts#L102) · [示例插件](../../../examples/runtime-plugins/text-inspector/src/index.ts) | 实际目录与默认清单已逐名比对。外部示例、知识样本和开发用 Skill 不计入产品默认绑定。 |
