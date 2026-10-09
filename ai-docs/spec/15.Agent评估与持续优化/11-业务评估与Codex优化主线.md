<!--
[INPUT]: 用户确认按原文章改为真实BOAI业务评估，deepseek-flash作为初步独立judge。
[OUTPUT]: eval:build/hillclimb、原服务执行器、独立judge/校准、分组比较与隔离补丁；dev:repair降为工程辅助。
[POS]: 第15组当前业务eval入口；实际结果和剩余范围唯一登记07。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# 业务评估与Codex优化主线

评估对象是BOAI执行真实用户任务的表现。Codex负责分析开发轨迹并提出改动；确定性检查和独立judge负责评分。原`eval:iterate`已移除，原功能保留为`dev:repair`，其测试通过不得作为业务质量提升。

## 1. 操作入口

| 入口 | 实际职责 |
| --- | --- |
| `eval:build` | 固定业务计划、生成输入/材料/代码检查/语义rubric审阅页，零模型调用 |
| `eval:hillclimb` | 真实BOAI基线→独立评分→开发轨迹分析→Codex补丁→隔离候选→真实业务复测→保留或拒绝 |
| `eval:experiment review/status` | 原件绑定的独立评审追加、校准门禁与只读状态 |
| `dev:repair` | 辅助修复Vitest/类型错误，不能替代上述流程 |

开发代理可使用项目技能[boai-evals](../../../.agents/skills/boai-evals/SKILL.md)。技能负责按用户目标建立题目与诊断，代码负责预算、执行、评分合同和停止。

## 2. 首批业务题

[探路配置](../../../tests/evaluation/business-collaboration-pilot.json)选两道已有真实服务题：开发题`reviewed-operations`要求清理订单、委派计算、写稿、读取审核、审定发布；独立验证题`independent-files`要求不同员工并行交付两份真实文件。全部原语义标准保留。

这两题是明确来源的合成探路，尚未覆盖完整多轮编辑部、固定版本修订与所有业务机制；相关第14组BDD继续有效。新增任务应根据用户目标扩展原执行协议，不能把已有简单题包装成完整业务验收。

复制配置到本地，替换三个`SET_...`项；`dataPath`指已有BOAI配置数据目录，凭据仍由原只读Electron桥经内存传递。当前用户选择被测`deepseek-v4-pro`、初步judge`deepseek-flash`。

```sh
pnpm eval:build --config .local/business-plan.json --root .local/business-experiment
pnpm eval:hillclimb --root .local/business-experiment --source .
pnpm eval:experiment status --root .local/business-experiment
```

`build`保存`plan.json`和`design-review.html/json`，页面展示每项输入、材料、确定性检查和语义标准。`cases`是开发集，`validationCases`是独立验证集，两组不能重题或跨同一业务簇；原冻结holdout与独立MD-v1协议拒绝混入此普通多人runner。

探路每题1次、全实验120次请求，目的为测量和准备评审，不能自动选优。正式优化至少两个任务簇/组、每题三次，这只是数据完整性下限；区间可能仍无法支持任何提升。按探路开销和波动重新登记正式题目/预算，不修改已启动计划。

## 3. 评分器

原`checks.ts`检查实际产物、数值、来源、依赖和被审核字节；只存在文件或模型自称完成不能通过业务标准。原`semantic`要求始终参与最终质量判定。

配置`judge`后，使用显式独立连接和模型，每份原件评价两次，要求逐rubric给出0/1/2及真实证据ID。两次逐项分数不同、引用不存在、缺项、截断或请求失败都不接受模型结论。v2沿项目文本JSON协议解析，先保存原始文本、终态和已知用量，再严格校验，不自动请求修复；旧SDK缺失原文的失败保持原样。角色没有工具、记忆或任务执行权限，不向其提供基线/候选身份；这是按rubric绝对判分，尚未实现随机盲序的成对偏好评审。

原校准合同要求至少20个不同正负人工样本、固定judge版本、至少90%一致和零关键漏判。没有这些标签时模型结果始终pending，包括技术失败样本的语义评分器状态；不能借失败分数绕过评分器校准。生成页中的`casesReviewed:false`与`graderCalibrated:false`不伪造已审阅。

人工可直接标注当前原件，或先标注校准样例。追加操作：

```sh
pnpm eval:experiment review --root .local/business-experiment \
  --reviews .local/actual-reviews.json --calibration .local/actual-calibration.json
```

`source: human`只用于实际人工判断；模型建议必须保持`model-assisted`。正式实验可在`judge.calibration`预先登记实际标签，后续轮自动按同一judge身份核验。后补校准只作用于当前轮，新正式计划需带入标签才能使后续评分自动生效。

## 4. 优化与验证

`hillclimb`先冻结当前工作树（包括未提交修改），在隔离候选内运行真实AppService/Mastra；共用`optimization.ts`的准备/原件/hash核验和实验账本。基线满足评分与采样门槛后，Codex只收到开发集真实输入、公开过程、工具回执和成果，以及确定性检查、已登记判定和最新独立评分理由；不收到验证输入/答案/轨迹。

每次调用只允许一个因果假设和登记文件内的精确替换。控制器应用到新副本，重跑两组真实业务；开发改善但验证平坦、退化、成本超限或区间不足均不保留。继续时从上个已保留源码开始。最终补丁和逐轮失败都留下，原工作树不被循环写入。

待评、评分不一致、采样不足、基线重复波动大于最小收益、质量饱和、无有效建议、调用结果未知、原件变更、连续无提升/轮数/共享预算耗尽时停止。人工评审补齐后再次运行会读取原轮次，不重跑基线；中断或已开始但未完成的优化器尝试拒绝盲目重放。

已有仓库题和本轮开发代理此前可能读过的题不宣称秘密。独立验证只从自动优化器输入中排除；只读上下文不是操作系统级保密边界。验证集参与选优，最终未见泛化需要新的隔离题与访问控制，当前没有认证。

## 5. 分数、区间与成本口径

两组分别按业务簇等权、簇内题等权、题内重复等权。重复执行降低同题测量噪声，不增加不同业务题数量。报告包括成功/失败/pending、簇/题/重复数量、重复评分波动与未知token。

差值区间使用有界独立trial-pair假设下的Hoeffding诊断界，按登记最大轮数和两组分配名义5%错误额度。改善必须超过预登记门槛且下界大于0；小样本时该界非常保守，不能为了得到候选放宽它。该名义区间依赖独立性/固定候选假设，复用基线、自适应生成候选和访问验证集会限制其推断；不是自适应搜索的无条件95%覆盖保证，也不是线上总体或发布认证。

共享请求预算包含BOAI探针、失败、运行各阶段及judge两次评分。模型调用未知不补发。BOAI样本token、judge原始用量、优化者Codex会话/token分别留证；不知道供应商账单时不声称金额。Codex每个候选最多一次会话、180秒，最多计划候选轮数；同一未知尝试不重发。

## 6. 实现与验收

- `business.ts`：任务权重、波动、差值区间与分组门槛。
- `optimization.ts`：共用真实runner、独立judge、原账本、分组判定及评审链。
- `judge.ts` / `judge-evaluation.mjs`：原Mastra模型配置及只读凭据桥，保存两次原始评分与未知。
- `hillclimb.ts`：审阅页、开发反馈、隔离Codex候选与真实业务闭环，复用原快照/补丁工具。

相关回归必须覆盖开发涨分/验证不涨、待评、缺样本、噪声、成本、同模型自评、评分不一致、越界补丁、中断不重发和失败原件。真实验收保存应用输出与judge原文；没有独立人工标签前只报告技术结果和待校准状态。具体结果唯一见[07](./07-实施阶段与进度.md)。

方法来自[原文章](https://claude.dev/blog/automating-eval-design-and-hillclimbing/)。当前首版实现与文章尚有差异：首批题目手工按业务簇分组，模型/effort对照、完整多轮新题、盲序成对judge、最终隔离留出及正式泛化统计仍待实施；不再用开发测试修复替代业务eval。
