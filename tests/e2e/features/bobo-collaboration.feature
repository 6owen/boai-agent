# [INPUT]: 独立组织员工/群与固定离线协议。
# [OUTPUT]: 原八项组织场景纳入协作用例集，业务断言保持。
# [POS]: tests/e2e/features/bobo-collaboration.feature。
# [PROTOCOL]: 一旦本文件变化，必须同步更新Header和所属.folder.md。
@electron @bobo-collaboration @collaboration-suite
Feature: bobo 组织独立员工进行群协作
  原讨论会话持续保留，通讯录员工使用自己的身份和工作区参与独立群。

  Scenario: 讨论需求只保存交流，不提前创建员工或群
    Given bobo 和已有员工已配置组织协作验证模型
    When 用户只与 bobo 讨论写作需求
    Then 原讨论会话保留且没有组织对象或实际工作

  Scenario: 全用已有员工只组群，原讨论页提供真实入口
    Given bobo 和已有员工已配置组织协作验证模型
    When 用户要求只用已有研究员和写作员组织群
    Then 新群复用两名员工并以 bobo 身份公开目标而不开工
    And 原 bobo 会话保留且结果不会自动抢导航

  Scenario: 缺少写作员时只补缺员，并由独立员工协作交付
    Given bobo 和研究员已配置缺员混合验证模型
    When 用户要求组织成员并完成有依赖的报告任务
    Then 仅补齐写作员并在独立群实际交付两个员工的成果
    And 组织与群工作使用同一累计预算和明确来源

  Scenario: 只创建员工时提供真实联系人，不制造群或群工作
    Given bobo 和已有员工已配置组织协作验证模型
    When 用户要求只创建一位编辑员工而不拉群
    Then 原讨论页提供实际员工入口且没有新增群或群工作

  Scenario: 已发布群在重启后只核对原回执，不重新组织或开工
    Given bobo 已用已有员工发布独立协作群
    When 用户重启桌面并回到原 bobo 讨论
    Then 原群和员工入口仍绑定原身份且没有模型或工具重放

  Scenario: 结果核对暂不可读时保持未知，恢复读取不重复创建
    Given bobo 已用已有员工发布独立协作群
    When 原组织结果查询暂时失联
    Then 原讨论页显示核对失败并保留已提交对象
    When 原组织结果恢复可读
    Then 结果核对原操作且群和员工数量保持不变

  Scenario: 删除原讨论和解散群分别保留独立员工及其他交流
    Given bobo 已用已有员工发布独立群并受理真实群工作
    When 用户清理原 bobo 讨论会话
    Then 已发布群与成员仍存在且原协作预算仍可核对
    When 用户解散这个协作群
    Then 独立员工和其私聊工作区仍然存在

  Scenario: 停止组织后迟到模型结果不能发布员工或群
    Given bobo 的组织模型结果尚未返回
    When 用户停止组织并释放迟到模型结果
    Then 本次组织没有发布员工群或目标消息并且重启不重放
