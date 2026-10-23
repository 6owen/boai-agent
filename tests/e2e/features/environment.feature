# language: zh-CN
# [INPUT]: 技能执行产物与环境快照与隔离的 Electron 环境。
# [OUTPUT]: 技能产物、运行与业务结果分离、重启行为验收。
# [POS]: tests/e2e/features/environment.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @environment
功能: 技能执行产物与环境快照

  场景: 技能执行产物与环境快照
    假如 员工已绑定本地技能和报告模型
    当 员工读取技能写入并发布真实报告
    那么 工作区显示技能与命令授权状态
    那么 活动区区分运行结束与业务交付
    那么 重启保留产物与执行环境且不再次调用模型
