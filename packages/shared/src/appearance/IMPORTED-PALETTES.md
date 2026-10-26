<!--
[INPUT]: 用户指定的bobo项目base46-themes目录。
[OUTPUT]: 本地色值快照的来源、ID兼容与BOAI适配规则。
[POS]: imported-palettes.json及其纯适配器的维护说明。
[PROTOCOL]: 变化同步Header与所属.folder.md。
-->
# 导入配色来源

2026-10-26按用户要求，从`/Users/wangwenbo/Desktop/demo/bobo/apps/admin/src/styles/base46-themes`迁入21套CSS色值。来源工作区该目录干净，提交为`a3273affec4e44563308cc4cf5ca16aef1a4b41c`。每个快照记录源文件相对路径、SHA-256及原注释中的参考链接；这些链接是来源文件的说明，本次不把它们当作重新核验过的上游原版色表。

- 深色15套：Gruvchad、Everforest、Tokyonight、Catppuccin Mocha、OneDark、Nightfox、Kanagawa、Solarized Dark、GitHub Dark、Nord、Rose Pine、Ayu Dark、Moegi Dark、Moegi Black、VS Code Dark Modern。
- 浅色6套：Solarized Light、GitHub Light、Ayu Light、Moegi Light、Moegi Dawn、VS Code Light Modern。

这里只复制色值数据，BOAI运行不读取另一个项目。源目录名是`base46-themes`，其中也包含Moegi、VS Code Modern等主题的CSS适配，不能将整个集合声称为NvChad原生Base16数据。

## 接入规则

1. 源主题ID移除`base46-`前缀。Nord和Catppuccin复用BOAI已有ID，更新为源项目当前色值；Latte及BoAI/VS Code Plus保持。原Base46插件合计22套，整个应用26套，不增加主题设置字段或单独插件。
2. UI映射：`background → background`、`card → surface`、`foreground → foreground`、`muted-foreground → muted`、`border → border`、`primary → accent`。其余表面和交互状态继续使用BOAI的语义token派生，不复制bobo的布局、选择器或样式加载器。
3. 源JSON保留全部CSS色值。八位透明边框合成到card底色，以满足当前六位颜色合同；正文和次要文字仅在低于现有4.5对比度时，逐步向当前模式的白/黑色修正。既有对比度断言不降低。
4. 终端读取同一快照，`terminalColorKeys`依次指定红、绿、黄、蓝、品红、青的CSS来源；深浅中性色使用原表面/文字，亮色槽复用相同彩色。源CSS没有完整原生ANSI表，因此这是BOAI的颜色角色映射，不冒充上游终端色表。VS Code Modern继续使用已核验的VS Code ANSI色表。程序RGB、扩展色和OSC覆写保持原行为。
5. 明暗选择、系统模式、持久化、插件停用回退、全局自定义颜色及Scenic图片覆盖均走现有流程，不写入用户当前选择。

本次验证和运行边界见[外观规格第8节](../../../../ai-docs/spec/3.前端重构与功能/14-外观设置与主题系统.md#8-2026-10-26导入bobo项目主题色)。
