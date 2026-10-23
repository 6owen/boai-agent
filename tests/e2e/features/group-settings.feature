# language: zh-CN
# [INPUT]: 群成员配置和通讯录的隔离桌面环境。
# [OUTPUT]: 头像添加/确认移除、固定页脚与文档流布局验证。
# [POS]: tests/e2e/features/group-settings.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @group-settings
功能: 紧凑的群成员设置

  场景: 头像网格管理成员并分别采用面板和文档页脚
    假如 打开包含两位员工的群聊设置
    当 在末尾添加员工并确认移除原成员
    那么 保存后的群成员和头像一致
    那么 右侧页脚在滚动和窗口缩放时固定在底部
    那么 通讯录编辑页脚跟随表单自然滚动
