# language: zh-CN
# [INPUT]: 隔离的本地 Codex/Claude 配置与 Electron 模型连接页面。
# [OUTPUT]: 无密钥扫描、补全模型导入、重复导入/重启持久化、目录选择与 Codex ACP 登录执行的行为验收。
# [POS]: 本地 Agent 配置迁移的桌面场景。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @connections @local-connections
功能: 从本地 Agent 配置添加模型连接

  场景: 扫描预览后显式导入并保留原配置及接口协议
    假如 本地配置导入使用独立的 Codex 和 Claude 配置
    当 在模型连接中扫描本地 Agent
    那么 扫描只展示来源且尚未保存连接或泄露密钥
    当 导入 Codex 并补填 Claude 的默认模型
    那么 编辑和重启后仍保留导入连接且重复导入不新增
    当 选择其他配置目录并遇到 Codex 网页登录
    那么 网页登录可接入 ACP 且取消目录选择保留当前结果
    当 接入 Codex 并测试现有登录
    那么 本地 Agent 可以执行任务且重启后不会重复导入
