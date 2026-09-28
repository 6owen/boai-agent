# language: zh-CN
# [INPUT]: 员工详情/资料库共享标签页和隔离的 Electron 环境。
# [OUTPUT]: 跨页面统一样式、键盘切换及未保存修改保护的行为验收。
# [POS]: tests/e2e/features/employee-tabs.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @employee-tabs
功能: 员工详情使用统一标签页

  场景: 通讯录与会话详情保持同款标签和编辑保护
    假如 在通讯录中编辑研究员配置
    当 切换员工标签时继续编辑或放弃修改
    那么 保存配置后进入目标标签且键盘可以访问其他分类
    那么 会话侧栏使用相同标签样式且深色窄窗口完整显示
    那么 资料库分类共用标签样式并保留筛选内容
