<!--
[OUTPUT]: 2026-10-16按用户要求清理未纳入Git的验收原件；历史结果保留，已删除原件的链接不再可用。
[INPUT]: 真实 Electron 验收原图/trace、工程结果与固定 Craft 来源。
[OUTPUT]: 图片换肤可视结果、失败/修复记录和验证范围。
[POS]: 2026-10-15-craft-scenic 审阅入口；实际合同归第3组19。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

> 清理记录（2026-10-16）：本批未提交的截图、回放、生成报告及临时文件已按用户要求删除。下文保留当时的通过、失败和未验证结论；原件路径仅作历史记录，已提交的参考源码及核对记录仍保留。

# Craft 图片换肤验收

[实施合同与完整实际结果](../../spec/3.前端重构与功能/19-Craft图片换肤迁入.md)。场景使用确定性绘制的 PNG 测试图片；它不是内置壁纸，也没有改动用户现有背景。

- 原外观/原生尺寸与缩放回归：attempt-1 通过。
- Scenic：attempt-1 发现生产 CSS 丢失标准 backdrop-filter，已修正声明顺序；原失败保留。
- attempt-2 磨砂验证通过，但新数据无会话导致用例误等 composer；补真实“与 bobo 新建会话”入口后复测。
- attempt-3：选图/背景玻璃、菜单实色可读、取消/损坏文件保持、聊天编辑、删除原图后两次启动、移除恢复原主题全部通过。
- 外观单测9项、类型、UI lint、BDD生成和构建通过。构建保留已有大 chunk 提示。未打新安装包；本轮没有全仓库或长期性能认证。用户视觉审阅待定。

## 实际画面

![聊天玻璃背景](attempt-3/scenarios/7c48f78691b927cd71a7-d98d9eba33692cf9cbb4-retry0-repeat0-NFRv0P/005-图片玻璃聊天与全局导航.native.png)

![设置与实色菜单](attempt-3/scenarios/7c48f78691b927cd71a7-d98d9eba33692cf9cbb4-retry0-repeat0-NFRv0P/003-图片玻璃设置与可读菜单.native.png)

![移除后原浅色](attempt-3/scenarios/7c48f78691b927cd71a7-d98d9eba33692cf9cbb4-retry0-repeat0-NFRv0P/010-移除图片恢复原浅色及自定义颜色.native.png)

全部图片由 Electron `webContents.capturePage()` 原样整幅截取，旁边的 capture JSON 记录原生尺寸、缩放和 hash。检查结果及对应源码 hash 在 `verification.json`；原失败、trace 和 Playwright 结果按 attempt 保存。
