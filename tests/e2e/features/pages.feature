# language: zh-CN
# [INPUT]: 页面表单校验与焦点恢复与隔离的 Electron 环境。
# [OUTPUT]: 页面表单、通讯录搜索与菜单焦点的行为验收。
# [POS]: tests/e2e/features/pages.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
@electron @pages
功能: 页面表单校验与焦点恢复

  场景: 页面表单校验与焦点恢复
    假如 页面控件测试使用独立桌面数据
    当 键盘打开创建菜单并校验未保存员工表单
    那么 切换页面前保存员工启用状态
    当 通讯录搜索保留结果且添加菜单关闭后恢复焦点
    那么 模型连接支持回车提交并且任务筛选保留选中项
