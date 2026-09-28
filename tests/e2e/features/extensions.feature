# language: zh-CN
# [INPUT]: 主题外部执行与自动化持久化与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/extensions.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @extensions
功能: 主题外部执行与自动化持久化

  场景: 主题外部执行与自动化持久化
    假如 扩展场景具备独立桌面与本地模型
    当 保存主题和受管背景并验证窄窗口
    那么 外部协议任务发布真实文件
    当 手动运行自动化并导出包含外观的备份
    那么 重启恢复主题与已完成的自动化记录
