# language: zh-CN
# [INPUT]: 基础组件实际渲染与可访问交互与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/ui.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @ui @development
功能: 基础组件实际渲染与可访问交互

  场景: 基础组件实际渲染与可访问交互
    假如 基础组件测试页在真实桌面加载所有模块
    当 打开嵌套浮层再逐层关闭
    那么 选择开关菜单折叠与提示组件能够交互
    那么 深色对话框正确显示在独立浮层容器
