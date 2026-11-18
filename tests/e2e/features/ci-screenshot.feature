# language: zh-CN
# [OUTPUT]: 每场一张 PNG，PR 目标和全局启动冒烟分别选场。
@electron
功能: CI 单张界面截图
  @pr-screenshot
  场景: 展示本次 PR 的目标界面
    那么 打开本次 PR 的目标并保存一张截图

  @global-screenshot
  场景: 应用启动后显示主导航
    那么 启动隔离应用并保存一张主界面截图
