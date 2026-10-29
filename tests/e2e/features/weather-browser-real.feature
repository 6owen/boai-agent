# language: zh-CN
# [INPUT]: 显式天气真实验收开关、指定已保存模型连接和隔离数据目录。
# [OUTPUT]: 原天气指令经真实定时任务/DeepSeek/内置浏览器完成并交付来源。
# [POS]: 天气故障真实业务复验；默认跳过，仅一次新触发、不自动重试。
# [PROTOCOL]: 变化同步Header和所属.folder.md。
@electron @weather-browser-real
功能: 天气定时任务使用浏览器查询并交付
  场景: 同一原始指令能完整返回南京天气
    假如 我准备隔离的真实DeepSeek天气定时任务
    当 我仅触发一次原始南京天气查询
    那么 本次天气任务完成且回复包含天气和网页来源
