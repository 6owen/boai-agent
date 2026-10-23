# language: zh-CN
# [INPUT]: 显式真实Magpie开关、隔离Electron与本机PNG原件。
# [OUTPUT]: Composer保存none、宿主selectionId准备、关闭不误报/真实缺件仍报错、发送回答与重启零重放。
# [POS]: 第20组实际附件桌面代表验收；原生选择结果由现有BDD夹具注入。
# [PROTOCOL]: 修改同步Header及features/.folder.md。
@electron @magpie-materials
功能: 使用Magpie连接回答桌面聊天图片
  @magpie-materials-preview
  场景: 正常关闭真实图片预览不产生错误提示
    假如 隔离桌面已连接实际Magpie图片模型
    当 用户选择无思考并从附件菜单添加原图片
    那么 图片准备和预览没有触发模型或业务消息

  @magpie-materials-preview
  场景: 原件缺失时打开图片预览仍显示错误
    假如 隔离桌面已连接实际Magpie图片模型
    当 用户选择无思考并从附件菜单添加原图片
    那么 原件缺失时打开预览仍报告真实错误且不调用模型

  @magpie-materials-real
  场景: 原图片经桌面附件入口送达模型且推理选择保存为none
    假如 隔离桌面已连接实际Magpie图片模型
    当 用户选择无思考并从附件菜单添加原图片
    那么 图片准备和预览没有触发模型或业务消息
    当 用户发送图片识别问题给Magpie员工
    那么 实际图片回答与材料来源可核对且重启不重放
