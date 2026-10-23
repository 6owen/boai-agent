# language: zh-CN
# [INPUT]: 旧版数据升级且不重放工作与隔离的 Electron 环境。
# [OUTPUT]: 无资料库入口且技能主导航保留；旧格式备份的技能/知识升级、真实 IPC 文件核读与原绑定新任务读取；不重放旧工作的行为验收。
# [POS]: tests/e2e/features/upgrade.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @upgrade
功能: 旧版数据升级且不重放工作

  场景: 旧版数据升级且不重放工作
    假如 旧版数据保留员工历史产物和未完成运行
    当 真实桌面打开旧版数据目录
    那么 历史和产物完整迁移且未完成运行标记中断
    那么 旧格式备份保留的技能绑定可用于新的明确任务
