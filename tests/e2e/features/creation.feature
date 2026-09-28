# language: zh-CN
# [INPUT]: 创建员工与群聊并保持手动列表状态与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/creation.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @creation @smoke
功能: 创建员工与群聊并保持手动列表状态

  场景: 创建员工与群聊并保持手动列表状态
    假如 桌面已就绪并提供员工与群聊创建入口
    当 填写员工名称职责和工作规则并保存
    那么 取消群聊选择不会创建会话
    当 创建双人群聊并在右侧修改群名
    那么 窗口尺寸变化保留列表状态且仅手动开关改变状态
