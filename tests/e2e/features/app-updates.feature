# language: zh-CN
# [INPUT]: 独立Electron应用副本与临时更新签名密钥。
# [OUTPUT]: 实际差分安装、完整包回退和损坏包拒绝。
# [POS]: 显式启用的macOS更新BDD。
# [PROTOCOL]: 修改同步Header与.folder.md。
@native-update
功能: 个人macOS应用后台更新
  场景大纲: 下载完成后只在安全退出时安装经过校验的版本
    那么 独立macOS应用完成"<mode>"更新验收
    例子:
      | mode                   |
      | delta-quit             |
      | delta-fallback-restart |
      | invalid-full           |

  @packaged-update
  场景: BOAI安装包加载原生更新组件并提供设置入口
    那么 独立BOAI安装包完成更新检查与主窗入口验收
