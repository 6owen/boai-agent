# language: zh-CN
# [INPUT]: 员工头像上传与跨页面持久化与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/avatars.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @avatars
功能: 员工头像上传与跨页面持久化

  场景: 员工头像上传与跨页面持久化
    假如 员工头像场景使用独立桌面
    当 选择预设头像并尝试上传损坏图片
    那么 有效图片保存为员工头像且配置修改不覆盖头像
    那么 群成员列表与会话列表具有一致尺寸和头像
    那么 重启后头像跨页面保留并可换回预设
