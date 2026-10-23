# language: zh-CN
# [INPUT]: 显式真实模型开关、现有本机登录、隔离表单与页面引用。
# [OUTPUT]: 三后端同页图片识别/填写/保存/回读、重启零重放证据。
# [POS]: 真实供应商业务验收；默认跳过，零重试，每后端一条新消息。
# [PROTOCOL]: 变化同步Header和.folder.md。
@electron @employee-browser-real
功能: 员工操作已引用的网页
  场景大纲: 员工核读图片并保存同一页面
    假如 我为网页任务准备真实的 "<runtime>" 员工和隔离页面
    当 我要求员工识别图中数字并填写保存
    那么 网站实际保存正确数字且重启不重放
    例子:
      | runtime |
      | codex   |
      | claude  |
      | api     |
