# language: zh-CN
# [INPUT]: 已保存员工与隔离Electron、BOAI原渠道表单和实际保存回执。
# [OUTPUT]: 渠道UI、真实本地绑定、保存响应失联的原请求核对与草稿保护；不连接外部平台。
# [POS]: 第16组Electron BDD入口。
# [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
@electron @employee-channels
功能: 数字员工绑定外部渠道
  场景: 飞书绑定保存失联后按原请求核对并保留独立Lark配置
    假如 在通讯录中编辑研究员配置
    当 打开员工渠道并模拟保存响应失联
    那么 核对原渠道保存回执后只有一份飞书绑定
    那么 Lark独立配置且渠道草稿受原未保存守卫保护
