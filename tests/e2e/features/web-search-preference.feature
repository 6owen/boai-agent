# [INPUT]: 隔离员工配置、DeepSeek API及Tavily/Exa MCP连接定义；不连接供应商。
# [OUTPUT]: 三提供方首选搜索/浏览器、停用状态、解绑重置与重启的真实桌面检查。
# [POS]: Web Search配置桌面验收，搜索业务另验。
# [PROTOCOL]: 变化同步Header与所属.folder.md。
# language: zh-CN
功能: 员工首选检索方式
  场景大纲: <提供方>保存首选检索方式并保留停用和解绑的真实状态
    假如 员工已绑定"<提供方>"搜索源且另一份未绑定
    当 在数据源分区选择搜索源和浏览器并保存
    那么 首选重启后保持且来源停用与解绑状态准确

    例子:
      | 提供方 |
      | Tavily |
      | Exa |
      | DeepSeek |
