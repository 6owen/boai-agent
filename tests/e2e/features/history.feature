# language: zh-CN
# [INPUT]: 历史失败与当前群聊轮次隔离与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/history.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @history
功能: 历史失败与当前群聊轮次隔离

  场景: 历史失败与当前群聊轮次隔离
    假如 历史群场景具备独立员工模型和已有群聊
    当 旧轮产生回复与失败后再次向全群问候
    那么 活动面板区分本轮回复与历史失败
    那么 重启后活动分组与消息数量保持不变
