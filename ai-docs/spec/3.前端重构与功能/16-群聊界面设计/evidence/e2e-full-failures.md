<!--
[INPUT]: 2026-09-29 全量 pnpm test:electron 的 Playwright 日志与 error-context。
[OUTPUT]: 53 条桌面场景中 26 条失败的原始失败摘要，保留未通过事实。
[POS]: 第二版群聊的全量回归证据；与专项通过结果分开记录。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# 全量 Electron 回归失败摘要

执行结果：**27 passed / 26 failed**，53 条场景均已执行。没有跳过或减少原有业务断言。

失败主要来自已有页面/控件定位和旧测试接口不匹配，例如 Base UI 下拉框被当作原生 select。下面是此次实际错误，不能据此宣称整套应用已通过回归。未在未修改版本上另跑全量对照。

运行期间补充了群聊的长内容场景步骤，导致本轮 Cucumber 汇总时发生 Gherkin 版本不匹配；上述数量来自已完成的 Playwright 场景结果。最终专项在冻结文件并重新 bddgen 后单独重跑，Cucumber 汇总正常。全量日志未因此被记作通过。

## appearance.feature.spec.js · 外观即时生效与原生窗口持久化 · 外观即时生效与原生窗口持久化

```text
Error: locator.selectOption: Error: Element is not a <select> element
- waiting for getByLabel('界面缩放', { exact: true })
- waiting for element to be visible and enabled
```

## automation-monitor.feature.spec.js · 自动化检查数据变化 · 保存规则后监控只提醒重要变化并保留失败前的检查点

```text
Error: locator.selectOption: Error: Element is not a <select> element
- waiting for getByLabel('任务类型', { exact: true })
- waiting for element to be visible and enabled
```

## composer.feature.spec.js · 输入框配置持久化与员工隔离 · 输入框配置持久化与员工隔离

```text
Error: expect(locator).toHaveText(expected) failed
Locator: getByRole('button', { name: '选择模型', exact: true })
Expected: "writing-v1"
Error: element(s) not found
- waiting for getByRole('button', { name: '选择模型', exact: true })
```

## conversation-list.feature.spec.js · 整理会话并识别群成员 · 会话只在主动打开时选中

```text
Error: expect(locator).toBeVisible() failed
Locator: getByRole('img', { name: '等你开聊的小伙伴' })
Expected: visible
Error: strict mode violation: getByRole('img', { name: '等你开聊的小伙伴' }) resolved to 2 elements:
- waiting for getByRole('img', { name: '等你开聊的小伙伴' })
```

## conversation-list.feature.spec.js · 整理会话并识别群成员 · 通讯录统一添加入口和成员头像拼图

```text
Error: expect(locator).toHaveCount(expected) failed
Locator:  getByRole('complementary', { name: '通讯录列表' }).locator('.list-heading button')
Expected: 1
Received: 2
- waiting for getByRole('complementary', { name: '通讯录列表' }).locator('.list-heading button')
```

## desktop.feature.spec.js · 自主群聊隔离取消与重启 · 自主群聊隔离取消与重启

```text
Error: expect(locator).toBeVisible() failed
Locator: getByRole('heading', { name: '安排任务', exact: true })
Expected: visible
Error: element(s) not found
- waiting for getByRole('heading', { name: '安排任务', exact: true })
```

## detail-tabs.feature.spec.js · 右侧面板同时打开多个窗口标签 · 活动和员工窗口独立切换且编辑内容不会丢失

```text
Error: locator.inputValue: Error: Node is not an <input>, <textarea> or <select> element
- waiting for getByRole('combobox', { name: '记忆范围', exact: true })
```

## employee-tabs.feature.spec.js · 员工详情使用统一标签页 · 通讯录与会话详情保持同款标签和编辑保护

```text
Error: locator.selectOption: Error: Element is not a <select> element
- waiting for getByRole('combobox', { name: '选择员工', exact: true })
- waiting for element to be visible and enabled
```

## extensions.feature.spec.js · 主题外部执行与自动化持久化 · 主题外部执行与自动化持久化

```text
Error: locator.selectOption: Error: Element is not a <select> element
- waiting for getByLabel('深色配色', { exact: true })
- waiting for element to be visible and enabled
```

## extensions.feature.spec.js · 主题外部执行与自动化持久化 · 自动化编辑复用详情标签并创建独立任务聊天

```text
Error: expect(locator).toHaveValue(expected) failed
Locator: locator('.detail-content:visible').getByLabel('系统通知', { exact: true })
Expected: "important_only"
Error: Not an input element
- waiting for locator('.detail-content:visible').getByLabel('系统通知', { exact: true })
```

## history.feature.spec.js · 历史失败与当前群聊轮次隔离 · 历史失败与当前群聊轮次隔离

```text
Error: expect(locator).toHaveValue(expected) failed
Locator: locator('.detail-content:visible').getByRole('combobox', { name: '筛选员工', exact: true })
Expected: "researcher"
Error: Not an input element
- waiting for locator('.detail-content:visible').getByRole('combobox', { name: '筛选员工', exact: true })
```

## local-connections.feature.spec.js · 从本地 Agent 配置添加模型连接 · 扫描预览后显式导入并保留原配置及接口协议

```text
Error: expect(locator).toHaveText(expected) failed
Locator:  getByRole('dialog', { name: '连接 OpenAI 兼容接口' }).getByRole('combobox', { name: '接口协议' })
Expected: "Responses"
Received: "Responses▼"
- waiting for getByRole('dialog', { name: '连接 OpenAI 兼容接口' }).getByRole('combobox', { name: '接口协议' })
```

## local-skills.feature.spec.js · 本机技能管理使用图标导航与会话式列表详情 · 技能分组沿用会话拖拽并保存整理结果

```text
TimeoutError: locator.click: Timeout 30000ms exceeded.
- waiting for getByRole('menuitem', { name: '全部技能', exact: true })
```

## local-skills.feature.spec.js · 本机技能管理使用图标导航与会话式列表详情 · 首次打开即可发现本机技能并整理分组

```text
TimeoutError: locator.click: Timeout 30000ms exceeded.
- waiting for getByRole('menuitem', { name: '全部技能', exact: true })
```

## native-skills.feature.spec.js · 原生桌面的 Skills 安装与维护 · 下载在响应体中途断开时不能安装残缺内容

```text
TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
- waiting for getByRole('dialog', { name: '导入 Skills', exact: true }).getByLabel('技能来源', { exact: true })
```

## native-skills.feature.spec.js · 原生桌面的 Skills 安装与维护 · 从商店预览安装并更新同一个已绑定副本

```text
TimeoutError: locator.click: Timeout 30000ms exceeded.
- waiting for getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能商城', exact: true })
```

## native-skills.feature.spec.js · 原生桌面的 Skills 安装与维护 · 原生下载可取消且不能访问私有网络

```text
TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
- waiting for getByRole('dialog', { name: '导入 Skills', exact: true }).getByLabel('技能来源', { exact: true })
```

## pages.feature.spec.js · 页面表单校验与焦点恢复 · 模型连接向导保留草稿和密钥并反馈测试结果

```text
Error: locator.selectOption: Error: Element is not a <select> element
- waiting for getByRole('dialog').getByLabel('默认模型', { exact: true })
- waiting for element to be visible and enabled
```

## pages.feature.spec.js · 页面表单校验与焦点恢复 · 首次连接先获取模型并测试成功后再保存

```text
Error: expect(locator).toHaveValue(expected) failed
Locator: getByRole('dialog').getByLabel('默认模型', { exact: true })
Expected: ""
Error: Not an input element
- waiting for getByRole('dialog').getByLabel('默认模型', { exact: true })
```

## skill-marketplace.feature.spec.js · 技能商店 · 商店失败和迟到结果不干扰当前浏览或本地资料

```text
Error: expect(locator).toContainText(expected) failed
Locator: getByRole('combobox', { name: '商店排序' })
Error: element(s) not found
- waiting for getByRole('combobox', { name: '商店排序' })
```

## skill-updates.feature.spec.js · 检查并确认技能更新 · 批量检查后逐项确认更新并保留绑定

```text
Error: expect(locator).toContainText(expected) failed
Locator: getByLabel('全部技能更新检查')
- waiting for getByLabel('全部技能更新检查')
```

## skill-updates.feature.spec.js · 检查并确认技能更新 · 本地修改可保留或在明确确认后替换

```text
TimeoutError: locator.click: Timeout 30000ms exceeded.
- waiting for getByLabel('技能更新详情').getByRole('button', { name: '检查更新', exact: true })
```

## skills.feature.spec.js · 本地技能管理 · 将收藏技能导出为离线库并恢复到本应用

```text
TimeoutError: locator.click: Timeout 30000ms exceeded.
- waiting for getByRole('dialog', { name: '导入 Skills', exact: true }).getByRole('button', { name: '选择技能目录' })
```

## skills.feature.spec.js · 本地技能管理 · 文件清理失败后保留记录并允许重试

```text
TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
- waiting for getByRole('dialog', { name: '导入 Skills', exact: true }).getByLabel('技能来源', { exact: true })
```

## skills.feature.spec.js · 本地技能管理 · 检查压缩包后安装并在重启后打开安装记录

```text
TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
- waiting for getByRole('dialog', { name: '导入 Skills', exact: true }).getByLabel('技能来源', { exact: true })
```

## skills.feature.spec.js · 本地技能管理 · 预览安装后整理技能而不自动授予员工权限

```text
TimeoutError: locator.click: Timeout 30000ms exceeded.
- waiting for getByRole('dialog', { name: '导入 Skills', exact: true }).getByRole('button', { name: '选择技能目录' })
```
