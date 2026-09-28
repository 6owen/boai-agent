# language: zh-CN
# [INPUT]: 窗口顶栏详情标签与内容对齐与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/detail-panel.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @detail-panel
功能: 窗口顶栏详情标签与内容对齐

  场景: 窗口顶栏详情标签与内容对齐
    假如 群详情以窗口顶栏标签打开
    当 改变窗口尺寸缩放并拖动详情分栏
    那么 长标题截断且关闭时可保存未保存的群名
    当 嵌套员工详情放弃修改后返回群详情
    那么 深色窄窗口的详情标题固定且关闭后焦点回到入口
