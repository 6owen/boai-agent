# language: zh-CN
# [INPUT]: 显式真实供应商、本机登录和隔离BOAI业务数据。
# [OUTPUT]: API/混合群分工与两种本机员工通过聊天建计划、实际执行和两次重启零重放。
# [POS]: EA1/EA2真实模型验收；每场一条新消息、一次手动运行、零重试。
# [PROTOCOL]: 变化同步Header和.folder.md。
@electron @employee-automations-real
功能: 员工在真实对话中建立并执行自动化
  场景大纲: 员工创建暂停计划后按归属执行
    假如 真实自动化场景使用 "<backend>" 员工
    当 我明确要求建立暂停的自动化并手动运行一次
    那么 本次真实交付符合分工且两次重启没有重复执行
    例子:
      | backend |
      | api     |
      | codex   |
      | claude  |
      | mixed   |
