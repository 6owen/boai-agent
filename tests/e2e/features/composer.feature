# language: zh-CN
# [INPUT]: 输入框配置持久化与员工隔离与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/composer.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @composer
功能: 输入框配置持久化与员工隔离

  场景: 输入框配置持久化与员工隔离
    假如 输入框场景具备两条模型连接与私聊群聊
    当 通过输入框菜单修改权限和模型
    那么 运行中的员工配置锁定且群成员修改相互隔离
    那么 窄窗口菜单完整可见并恢复键盘焦点
