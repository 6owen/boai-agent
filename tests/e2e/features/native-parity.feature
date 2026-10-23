# language: zh-CN
# [INPUT]: 用户要求本机直跑与BOAI接入真实对照，不逐工具重建功能。
# [OUTPUT]: 相同材料/命令/修订/只读续聊；Claude独立重复和长命令/停止/重启探针，保留全部失败。
# [POS]: 原Electron BDD入口；显式真实模式、同场留证、无安装包。
# [PROTOCOL]: 变化同步Header和features/.folder.md。
@native_parity_suite
功能: 本机Agent直跑与BOAI接入对照
  @native_parity_boot
  场景: 评估副本能够打开实际开发窗口
    假如启动不调用模型的对照评估窗口
    那么对照评估窗口显示会话列表
    并且对照评估窗口能够准备三种原件附件而不发送消息

  @native_entry_parity
  场景大纲: 同一任务通过两个入口执行
    假如登记 "<runtime>" 的 "<task>" 本机接入对照任务
    当直接本机执行该任务及后续消息
    并且通过BOAI执行相同任务及重启后的后续消息
    那么保存两种入口的实际结果并核对差异
    例子:
      | runtime | task |
      | codex   | orders |
      | claude  | orders |
      | codex   | code |
      | claude  | code |

  @native_input_delivery @native_entry_parity
  场景大纲: 真实附件输入提问补充及重启只读
    假如登记 "<runtime>" 的 "inputs" 本机接入对照任务
    当直接本机执行该任务及后续消息
    并且通过BOAI执行相同任务及重启后的后续消息
    那么保存两种入口的实际结果并核对差异
    例子:
      | runtime |
      | codex |
      | claude |

  @native_stream_stability
  场景: Claude原生命令跨五分钟完成并在用户停止后重启只读
    假如登记Claude双向流长命令与停止探针
    当通过BOAI执行长命令并停止下一次命令
    那么重启后不重放且明确新消息只读已有日志
