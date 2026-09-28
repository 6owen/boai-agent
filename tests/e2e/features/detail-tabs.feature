# language: zh-CN
# [INPUT]: 多标签详情面板与隔离的 Electron 工作区。
# [OUTPUT]: 独立标签、保留草稿、定向保存关闭和会话隔离的行为验收。
# [POS]: tests/e2e/features/detail-tabs.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @detail-tabs
功能: 右侧面板同时打开多个窗口标签

  场景: 活动和员工窗口独立切换且编辑内容不会丢失
    假如 已打开群聊的任务与产物和员工配置标签
    当 重复打开并切换标签以及收起右侧面板
    那么 员工草稿和滚动位置保留且关闭仅影响对应标签
    那么 多份员工草稿只保存指定标签的内容
    那么 跨会话和窄窗口中的详情标签仍保持独立
