# language: zh-CN
# [INPUT]: 生产 Electron 和隔离群资料。
# [OUTPUT]: 群基础配置入口和成员头像导航。
# [POS]: 群资料和高级配置桌面验收。
# [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
@electron @employee-automations
功能: 查阅群资料和配置
  场景: 群高级配置只保留基础配置且头像可打开员工资料
    假如 通讯录存在三名员工组成的群聊
    当 我打开群聊高级配置
    那么 群聊高级配置只显示基础配置
    并且 从头像宫格打开指定数字员工的配置
