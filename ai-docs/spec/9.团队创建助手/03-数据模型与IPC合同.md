<!--
[INPUT]: T1 用户流程、内置助手输出、现有 DigitalAgent/Conversation 和类型化 IPC。
[OUTPUT]: 拟新增实体、字段约束、状态、请求身份、IPC 与兼容合同。
[POS]: ai-docs/spec/9.团队创建助手/03-数据模型与IPC合同.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md；字段调整时同步 02/04/09。
-->
# 数据模型与 IPC 合同

状态：T1 待实施。以下名称为拟新增合同，现有代码还没有这些接口。类型归 shared/domain，业务校验和权威状态归 runtime。

## 1. 助手输出与宿主方案分开

模型输出使用判别联合：`kind: plan` 返回下表正文；`kind: needs_adjustment` 只返回 schemaVersion=1、reason（1–500 字符）和 suggestedPrompt（1–4,000 字符），不返回可创建方案。后者用于明确超出人数上限等请求，不能把 50 人静默改成 12 人。普通“写作”属于可生成请求。

| plan 正文字段 | 约束 |
| --- | --- |
| schemaVersion | 固定 1 |
| name | 1–80 字符 |
| purpose | 1–1,000 字符 |
| scenarioKind | work / roleplay；狼人杀玩家配置为 roleplay |
| assumptions | 最多 5 条，每条最多 300 字符 |
| collaborationGuide | 最多 2,000 字符；允许空，不能作为代码调度指令 |
| members | 1–12 项，每项 name 1–80、role 1–300、instructions 1–2,000 字符 |
| capabilityNotes | 最多 8 条，每条最多 300 字符，只说明需求或缺口 |

文本经 trim 后按 JavaScript 字符串 length 校验，前后端一致；成员 instructions 总长度最多 16,000 字符。schema 拒绝未知字段。创建后的单个员工继续服从既有员工/系统文件组合长度限制。

宿主在有效输出上增加每项唯一 `memberKey`、预设头像/现有颜色、plannerVersion 和源 generationId。memberKey 只在本草稿内识别一张卡；最终映射到独立 agentId。手动新增成员也由宿主分配 memberKey。修改、排序不改变 key；重新生成整份方案产生新 key。

模型不输出 connectionId、modelId、allowCommands、skillIds、knowledgeIds、目录或真实员工 ID。未知权限字段使结果失效，不能静默当作已授权。

### 完整的模型成功输出示例

```json
{
  "kind": "plan",
  "schemaVersion": 1,
  "name": "短文写作组",
  "purpose": "根据用户提供的材料完成短文和修改建议",
  "scenarioKind": "work",
  "assumptions": ["暂按两人小组设计，主要使用用户提供的材料"],
  "collaborationGuide": "先明确读者和要点，再撰写与检查。具体工作由用户发消息提出。",
  "members": [
    {
      "name": "阿文",
      "role": "整理要点并撰写短文",
      "instructions": "表达自然简洁，根据已提供材料写作。事实不确定时标记待核对，不宣称已经联网。"
    },
    {
      "name": "小审",
      "role": "检查结构与事实并提出修改建议",
      "instructions": "给出具体且有依据的修改意见，区分事实错误与风格建议，不替其他成员发言。"
    }
  ],
  "capabilityNotes": ["实时网页资料需要另行接通相应能力"]
}
```

这是格式示例，不是固定模板回退。用户模型/建群选项仍来自草稿；宿主为两项生成 memberKey 后，才能在后续编辑和 operation 映射中引用它们。

## 2. TeamDraft：未发布草稿

| 字段组 | 必要信息 |
| --- | --- |
| 身份/版本 | id、version、createdAt、updatedAt、schemaVersion |
| 用户输入 | prompt、selectedConnectionId、selectedModelId（空值表示当时默认）、createGroup、groupTitle |
| 有效配置快照 | resolvedModelId、connectionFingerprint；指纹包含 provider/baseUrl/api/默认模型等公开配置，不包含 Key |
| 方案 | 当前 plan、最近有效方案输入摘要、generationId、用户是否手工修改 |
| 生成状态 | generationStatus：idle / running / succeeded / needs_adjustment / failed / cancelled / interrupted |
| 创建关联 | creationOperationId，可空；受理后方案不可修改 |
| 提交检查 | planHash、validationErrors、可否提交的派生状态 |

planHash 由宿主对规范化创建载荷计算，包含成员顺序/文本/预设、有效模型、建群选择与群名/背景。不要信任 Renderer 自报 hash；返回给 UI 后，提交时用于验证用户确认的版本。计划名不是幂等身份。

提示词或模型变化会使旧生成方案失效；成员文本、群标题/开关、团队目的的手动调整不必再次调用模型，但必须形成新版本和新 planHash。草稿只允许一个未结束实例；在事务中查验，不靠某个窗口的 React 状态保证。

版本冲突不会默默丢弃本地编辑。UI 保留副本供用户比较/重填，宿主拒绝覆盖。创建操作失败且用户需要修改方案时，应先放弃并清理该操作，再从原内容复制新草稿；不能修改已冻结载荷。

## 3. TeamGeneration：有界生成记录

保存 generationId、draftId、请求 requestId、受理时 draftVersion、输入摘要、planner/schema 版本、连接/有效模型、status、deadline、attempts、开始/结束时间、脱敏错误及结果摘要。

attempts 每项记录独立 callId、阶段 initial/repair、状态和已知/未知用量。不保存凭据或未经脱敏的供应商原始请求。保存的方案属于草稿，生成日志不能变成第二份可编辑真源。

同一 requestId 和相同输入返回原记录；不同输入使用同一 requestId 返回冲突。不同 requestId 不能并发占用同一草稿。重启把未结束调用标为 interrupted/用量未知，不重发模型请求。

## 4. TeamCreationOperation：冻结的创建账本

| 字段组 | 必要信息 |
| --- | --- |
| 受理身份 | operationId、requestId、draftId、acceptedDraftVersion、payloadHash |
| 冻结配置 | 经最终校验的成员定义、建群选择、有效模型与群背景，不含密钥 |
| 结果映射 | memberKey → agentId；可选 conversationId；在首次受理事务内分配 |
| 操作状态 | accepted / preparing / ready_to_commit / interrupted / needs_attention / committed / cancelled |
| 文件日志 | 每个受管相对路径、归属标记、预期内容 hash、已完成步骤、待清理项 |
| 竞争保护 | version、执行持有者/attempt、取消门禁；条件更新不能由旧运行覆盖新状态 |
| 回执 | committedAt、真实结果 ID、错误码/可重试步骤；committed 与对象在同一事务落库 |

可以复用 ProductStore 的 records 机制，建议集合 teamDrafts/teamGenerations/teamCreations；不另建数据库。字段可以在实现中按现有命名调整，但请求、版本、归属、冻结载荷与原子边界不可省略。

创建状态和生成状态独立：生成成功不等于创建成功。committed 是终态；后来删掉员工不使旧操作变成“未完成”。

## 5. 现有实体的最小扩展

DigitalAgent 可增加可选 creationSource：kind=team-planner、operationId、memberKey、plannerVersion。新员工仍为普通 DigitalAgent，默认 mastra-model、active=true、allowCommands=false、skillIds=[]、knowledgeIds=[]、modelId=冻结的有效模型名。明确冻结模型名，避免确认期间连接默认值改变导致实际模型换掉。

Conversation 可增加同类 creationSource 与可选 teamSetup：purpose、collaborationGuide、scenarioKind。只给本次新群写入。teamSetup 显示在群资料且能由用户编辑/删除，沿用群 configVersion；传给模型时作为有来源的群背景，不能改变权限、发言调度或开启游戏。

创建时所有成员 ID、顺序和群标题以冻结方案为准。T1 群共享知识为空，不自动把员工私有资源分享进群。现有员工和旧群缺少 creationSource/teamSetup 时保持原行为，无需推断补填。

不增加 Team 权限实体，不预建各成员单聊，不在 Conversation 里复制一份员工配置。不向 workspace 写入其他成员的私有目录。

## 6. 拟新增 IPC

| 方法 | 关键输入 | 输出/行为 |
| --- | --- | --- |
| openTeamDraft | 可空的 draftId | 返回既有未结束草稿或新草稿；重复打开不多建 |
| saveTeamDraft | draftId、expectedVersion、editableFields | 校验并返回新版本；拒绝已受理草稿编辑 |
| generateTeamPlan | draftId、expectedVersion、requestId | 快速返回生成记录；宿主后台执行，UI 查询/订阅状态 |
| cancelTeamGeneration | generationId | 设置取消门禁；迟到结果不得安装 |
| getTeamDraft | draftId | 无副作用地返回草稿及当前生成/创建摘要 |
| acceptTeamCreation | draftId、expectedVersion、planHash、requestId | 返回 operationId 及状态；受理冻结方案而非从 UI 任意创建实体 |
| getTeamCreation | operationId | 无副作用查询真实结果；响应丢失时使用 |
| resumeTeamCreation | operationId、expectedVersion | 明确继续未发布操作，仅文件/事务步骤，不调用模型 |
| abandonTeamDraft | draftId、expectedVersion | 未创建时取消生成并清理草稿；已受理时走操作取消/清理 |
| listTeamCreationRecovery | 无 | 返回未结束草稿、需处理操作和最近结果的简要入口 |

所有写入口由宿主做严格 schema 校验。未知操作沿用当前 IPC 兼容错误。状态变化使用既有应用变更通知再重读，或增加专题事件；实现时只选择一种，不复制平行 UI 真源。不得把 API Key 加进 DTO。

受理和模型/文件准备分开：方法先提交短事务，再启动后台任务；不能让一次长模型调用阻塞普通聊天、停止按钮或其他页面。

## 7. 幂等与错误码

相同请求先查幂等记录，再检查其原草稿是否仍可编辑；因此已成功请求即使草稿版本变化仍返回原回执。相同 requestId 携带不同 payloadHash 必须报 REQUEST_CONFLICT，不能再次创建。

建议错误码：VALIDATION、DRAFT_CONFLICT、REQUEST_CONFLICT、MODEL_UNAVAILABLE、GENERATION_FAILED、GENERATION_INTERRUPTED、CONFIG_CHANGED、INITIALIZATION_FAILED、FILES_CONFLICT、CLEANUP_REQUIRED。错误正文面向用户说明下一步；错误码用于稳定测试与 UI 分支。

模型配置指纹改变导致创建拒绝时，保留冻结操作与文件，不擅自切换另一连接。用户可修复原配置后重试，或放弃旧操作并生成新方案。凭据轮换不把旧 Key 存入方案；实际调用始终读取当前凭据。

## 8. 保存、删除和备份

草稿可能含用户需求，按本地产品数据保护。放弃成功后删除输入、方案及相关生成内容，保留不含正文的取消/请求墓碑以拒绝旧请求复活；committed 回执与来源记录用于历史定位，不代表删除权限。

创建文件交换与数据库提交期间拒绝并发备份。未结束文件操作必须先完成或成功放弃清理后才允许备份；仅有草稿/已中断生成可备份。恢复后进行只读核对，不重发模型、不自动创建对象、不复活后来已删除的员工。

完整备份应包含新增记录和已提交成员/群文件，仍不包含 Key。清理源需求和创建记录的行为必须保留防重身份，细节见 04。不能以清空聊天记录为理由删除其他员工或其创建来源。
