# language: zh-CN
# [INPUT]: 隔离桌面、已保存 API 连接和超过单页的私有 UTF-8 文件。
# [OUTPUT]: 真实员工分页读取、精确修改并交付；其他原始字节保持。
# [POS]: Hermes 文件工具策略的真实能力验收，显式开关、一次请求零重试。
# [PROTOCOL]: 修改后同步 Header 和所属 .folder.md。
@electron @hermes-file-tools-real
功能: 真实员工安全修改长文件
  场景: API 员工分页读取并精确修改长文件末尾
    假如 Hermes 文件验收准备真实 API 员工和长文件
    当 用户要求员工只修改长文件末尾的日期
    那么 员工通过分页和精确修改工具交付且其他字节保持
