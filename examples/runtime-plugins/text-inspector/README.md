<!--
[INPUT]: Generated project with a local portable BOAI SDK tarball.
[OUTPUT]: Independent build, preflight and existing BOAI installation instructions.
[POS]: Text Inspector deterministic external-provider example.
[PROTOCOL]: Keep this guide aligned with src/index.ts, tools/ and manifest.json.
-->
# Text Inspector

Text Inspector是确定性Runtime Provider示例。输入文本后，它返回Unicode码点数、按空白划分的词段数和行数。空文本为0行，末尾换行计入一个空行；字符数不等于用户感知字符数。它不调用模型，不读取文件，不执行命令，不支持图片、工具、审批、续聊或运行中追加输入。`includePreview: true`会附带最多300个码点的输入预览。

## 创建与运行

在BOAI仓库执行`node scripts/runtime-plugin-devkit.mjs create /绝对路径/新目录`。生成器将可安装的SDK tarball放在项目内`vendor/`，拒绝覆盖现有目录。不要直接在BOAI的模板目录中安装依赖。

之后只需要这个独立项目：

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm check
```

生成器从BOAI根package.json继承固定的packageManager以及TypeScript/esbuild版本；当前包管理器为pnpm@10.13.1。使用项目声明的pnpm版本，以免全局不同主版本选择另一套store，使已有缓存的离线安装仍然失败。依赖安装需要网络或该版本已缓存的依赖；`check`不联网、不执行插件。`build`会清理并重建本项目的`package/`目录。

在BOAI设置 → 插件 → Agent运行时中选择“安装或更新插件”，选择生成的`package/`目录。然后通过现有本机运行时连接配置选择Text Inspector，使用本机`node`程序测试连接、保存并绑定员工。它不启动模型服务。

## 修改

- `src/index.ts`：Provider生命周期与确定性统计实现。
- `manifest.json`：稳定插件/Provider身份、包版本、模块入口和配置。改成自己的插件时选择自己的ID；升级时保留ID并增加版本，同时更新probe回执的版本。
- `package.json`：仅开发项目依赖；`vendor/`中的SDK文件让本项目不依赖BOAI源码目录。
- `tools/build.mjs`：先类型检查，再把SDK运行常量和依赖打入单文件模块。
- `tools/check-package.mjs`：校验清单、目录限制、模块静态依赖和必要导出；不会import模块。
- `LICENSE.txt`：私有开发占位声明。对外分发前替换为适用许可，并加入你引入的第三方声明。

Runtime API使用v2，清单`apiVersion`使用2，probe回执`protocolVersion`使用1。预检不会执行模块来读取`runtimeApiVersion`值；BOAI现有runner在初始化时检查它与清单是否相等，不兼容会拒绝。

## 分发

可安装内容只有`package/`目录，不是这个开发项目，也不是SDK tarball。第三方运行依赖须打包进模块，Node内置模块可以保留。不要依赖动态拼接的import/require；静态预检无法证明这类依赖的运行可用性。插件是受信任的本机代码，预检不是安全沙箱或运行认证。

此例不调用`services.tool`或`services.action`；实际适配器只能在声明支持并实现对应能力后调用它们。模型凭据只通过现有私有`modelSource`传入，不能写进清单、配置、日志或事件。
