<!--
[OUTPUT]: 原生Codex明确选区局部改图通过并导出revision5新文件，原01保持；v5五场/独立审查/PR4完成，完整CI及pnpm dev仍待验。
[INPUT]: 第22组08四动作需求及真实编辑器导出。
[OUTPUT]: 当前可编辑设计、08第4节冻结组合及当前base检查与待验边界；视觉基线仍待采集审阅。
[POS]: 快捷键设计导航，不是UI测试基准或用户批准。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->

# 快捷键设计

需求见[第22组08](../../spec/22.开发自动化与持续测试/08-快捷键流程验收任务.md)。原初稿为[01-editor-draft.excalidraw](./01-editor-draft.excalidraw)，插件文档keyboard-settings revision4，SHA256 `e42a55f22a503ddaf9797418ce2504379fda293793edc0f071ce2ac5ee3daf23`。

[SVG审阅图](./01-editor-draft.svg)由真实编辑器导出，嵌入字体许可见[FONT-LICENSES](./FONT-LICENSES.md)。重启宿主及页面后相同已保存文字/布局恢复；撤销历史按原编辑器仅当前打开期间保留，重开不宣称恢复历史。

画板包含Open Search、侧边栏、后退和前进。首次真实界面编辑将搜索名称补为“Open Search / 全局搜索”；Codex已通过明确选区读到同一内容。实际产品组合由第22组08第4节补充冻结：macOS为⌘ K、⌘ B、⌘ [、⌘ ]，其他平台以Ctrl替代⌘；设置只读展示，不开放编辑。画板右侧原占位文字不作为实现值，原设计文件及hash保持。

打开和接续方法见[开发画板05](../../spec/22.开发自动化与持续测试/05-Codex与Excalidraw开发设计流程.md#6-当前开发工具的运行方法)。已有文件保留，导出新修订后更新本页当前路径/hash，浏览器未导出草稿不是仓库设计。


当前交接修订为[02-codex-roundtrip.excalidraw](./02-codex-roundtrip.excalidraw)，keyboard-settings revision5，SHA256 `01a84ea23b079e89305c635bdbbcb6d46ce7505d65c72df4b02dcc52d2fb0635`。真实Codex0.163通过明确search-row选区，恰好一次以expectedRevision4将其文字改为“Open Search / 全局搜索               ⌘ K”，read_scene回读和实际编辑器显示均核验；完整导出只有目标文字/版本字段变化，其余11元素及坐标保持。原01及对应SVG仍描述初稿，不覆盖。宿主关闭/重启的SDK持久化回读通过，重开GUI因浏览器连接不可用未认证。

v5候选57d3385c已通过原五场真实BDD/工程检查及新独立Codex审查，交付[draft PR4](https://github.com/6owen/boai-agent/pull/4)，目标infra/dev-automation；原v4未知用量不改写。新增两页和两张设置导航的本机/CI基准已分别审阅接受；本机完整18项只读通过，CI18只读重复、完整门禁和实际pnpm dev界面对照仍待验。画板不是实际产品截图基准，也没有用户人工设计批准。
