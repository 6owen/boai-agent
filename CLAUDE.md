<!--
[INPUT]: /AGENTS.md 中定义的全局 AI 规约。
[OUTPUT]: 给 Claude 兼容读取的治理入口与跳转说明。
[POS]: 位于仓库根目录，作为 Claude 侧的兼容入口文件。

[PROTOCOL]:
1. 一旦 /AGENTS.md 的权威规则变化，必须同步更新我。
2. 我只做入口与指针，不应复制出第二套相互独立的仓库规则。
-->

# CLAUDE.md

本仓库的 AI 规约以 `/AGENTS.md` 为唯一权威来源，通过下方导入自动加载：

@AGENTS.md

- Claude 在本仓库工作时，先遵守 `/AGENTS.md`。
- 进入任意子目录后，继续遵守该目录的 `.folder.md`。
- 修改任意可注释文件后，继续遵守该文件 Header 的同步要求。
