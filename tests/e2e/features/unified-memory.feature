# language: zh-CN
# [INPUT]: 真实 Electron 员工记忆管理、版本竞争和独立旧库。
# [OUTPUT]: Working Memory编辑/重启/冲突草稿/来源收紧与清空；旧迁移由独立存储回归覆盖。
# [POS]: T2.5/UM17 管理体验。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @unified-memory
功能: 同一员工管理统一记忆
  场景: 统一管理保留来源范围并持久化
    假如 在隔离桌面打开员工统一记忆
    当 编辑员工 Working Memory 并重启保留
    那么 记忆编辑版本冲突保留草稿并可核对
    那么 来源聊天限制和清空记忆持久化
