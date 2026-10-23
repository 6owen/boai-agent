# language: zh-CN
# [INPUT]: Real Electron cumulative CPU counters, original GC/heap sampling and bounded deliberate Renderer/Main activity.
# [OUTPUT]: Original five-percent gate rejects both actual busy processes, then accepts real quiet windows; unknown counters are not zero.
# [POS]: Resource measurement calibration; not a business stability or real-model evaluation.
# [PROTOCOL]: Update Header and features/.folder.md when changed.
@electron @resource-cpu
功能: 资源CPU门槛区分真实活动和观测自身
  场景: 实际Renderer和Main高CPU均被原门槛拒绝而自然空闲通过
    假如 CPU校准使用隔离的实际桌面
    当 我分别制造真实Renderer和Main持续活动并采样
    那么 原5%门槛拒绝两类高CPU并且真实空闲通过
