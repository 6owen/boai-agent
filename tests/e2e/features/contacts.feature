# language: zh-CN
# [INPUT]: 通讯录配置与会话复用与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/contacts.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @contacts
功能: 通讯录配置与会话复用

  场景: 通讯录配置与会话复用
    假如 通讯录展示员工和已有群聊且浏览不创建会话
    当 搜索和折叠通讯录保留当前查看对象
    那么 切换联系人时未保存保护能够继续编辑或保存
    当 从联系人往返会话复用私聊和草稿
    那么 群配置保存和放弃都保留正确持久状态
    那么 通讯录在窄窗口和重新加载后仍可用
