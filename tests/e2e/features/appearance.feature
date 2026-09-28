# language: zh-CN
# [INPUT]: 外观即时生效与原生窗口持久化与隔离的 Electron 环境。
# [OUTPUT]: 可执行的行为验收。
# [POS]: tests/e2e/features/appearance.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @appearance
功能: 外观即时生效与原生窗口持久化

  场景: 外观即时生效与原生窗口持久化
    假如 外观场景在独立桌面启动
    当 调整原生窗口大小和界面缩放
    那么 字体和自定义配色立即生效
    那么 重启恢复外观且原生菜单缩放与重置保持同步
