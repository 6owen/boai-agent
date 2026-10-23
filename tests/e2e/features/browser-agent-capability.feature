# language: zh-CN
# [INPUT]: 用户授权真实员工浏览器能力验收，临时网站页面与现有模型连接。
# [OUTPUT]: 原员工自主点击/拖拽/中文输入/连线/修改的页面事实；不保存或导出画布。
# [POS]: 浏览器独立能力的真实Electron验收，零测试自动重试。
# [PROTOCOL]: 变化同步Header和所属.folder.md。
@electron @browser-agent-capability
功能: 员工自主操作真实画布网站
  场景大纲: <backend> 员工在 <site> 绘制并调整两步流程
    假如 为浏览器能力验收准备 "<backend>" 员工和 "<site>" 临时网页
    当 员工自主在当前网页绘制并移动流程节点
    那么 页面实际具有目标文字图形连线且操作由员工完成
    例子:
      | backend | site       |
      | codex   | tldraw     |
      | codex   | excalidraw |
      | claude  | tldraw     |
      | claude  | excalidraw |
      | api     | tldraw     |
      | api     | excalidraw |

  场景大纲: API员工在 <site> 通过两轮对话绘制并修改流程
    假如 为浏览器能力验收准备 "api" 员工和 "<site>" 临时网页
    当 员工先绘制流程再根据下一条消息移动节点
    那么 页面实际具有目标文字图形连线且操作由员工完成
    例子:
      | site       |
      | tldraw     |
      | excalidraw |
