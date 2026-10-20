# language: zh-CN
# [INPUT]: 统一业务协议、CLI、员工简单/高级创建与桌面设置宿主。
# [OUTPUT]: 隔离 pnpm dev 应用的真实界面、CLI、持久回执与重启验证；零外部模型。
# [POS]: M0/M1 应用业务协议桌面验收。
# [PROTOCOL]: 修改同步 Header 与所属 .folder.md。
@electron @application-protocol
功能: 应用协议与员工预设
  场景: 简单员工高级人格与CLI业务操作使用同一服务
    假如 应用协议验收已启动隔离开发应用
    当 用户以默认模型创建员工并展开人格配置
    那么 CLI可以创建群和定时计划并更新同一桌面主题
    而且 重启后业务回执与员工人格保持且没有重复执行
