# [INPUT]: 固定历史/本机技能、原生Electron与版本化UI场景清单。
# [OUTPUT]: 新增定时任务标签管理/历史明暗四场，原20场保持。
# [OUTPUT]: 原18项及新增语音设置明暗两项的真实行为、布局、自动保存与严格截图比较。
# [POS]: UI回归BDD入口；不建立平行spec入口。
# [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
# language: zh-CN
@ui-regression
功能: 持续保护已有界面及交互
  场景大纲: 已登记界面 <caseId> 保持行为布局和视觉基线
    假如 UI回归已准备隔离的固定历史和资源
    当 用户打开UI基准场景 "<caseId>"
    那么 当前场景的真实交互和布局满足原约定
    并且 当前场景与已接受的UI截图一致

    例子:
      | caseId |
      | chat-light |
      | chat-dark |
      | chat-narrow-light |
      | chat-narrow-dark |
      | empty-chat-light |
      | empty-chat-dark |
      | employee-light |
      | employee-dark |
      | settings-light |
      | settings-dark |
      | resources-light |
      | resources-dark |
      | detail-light |
      | detail-dark |
      | preview-light |
      | preview-dark |
      | shortcuts-light |
      | shortcuts-dark |
      | voice-settings-light |
      | voice-settings-dark |
      | schedules-light |
      | schedules-dark |
      | schedule-manager-light |
      | schedule-manager-dark |
