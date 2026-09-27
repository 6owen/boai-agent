<!--
[INPUT]: 仓库全局约束、无 Node 版本门禁的 pnpm runtime、初始化 CLI、统一位于 `.agents` 的项目 skills、三应用、Web/Admin Base UI 与 Web Iconify UI、客户端 API/Server Route/后端实现分层、含 Web emailAndPassword/loopback local credential sign-in 的 Capability Profile、共享 Auth/Admin role-permission-ban/Consent/Analytics/Newsletter/Observability/Jobs/Webhooks、Admin audit、Data Operations、Projects/Content/Search/User Assets/Developer API/Product AI、Manifest/Environment/DB、部署/CI、Canvasight 与文档协议。
[OUTPUT]: AI 统一规约、无 Node pin 的 runtime/CLI、clone 后 retained-source discovery/spec/显式授权实现 skill、顶级目录/Web 分层与 Base UI/Iconify-only 边界/Social-only 可用且本地开发不受 OAuth 阻塞的 Capability Profile/持久化管理员权限与公开端点隔离/Analytics/Newsletter/Content/Search/Developer API/Product AI/异步基础设施/共享表现层/数据恢复/配置索引、统一 skill 来源、自动化边界与同步检查清单。
[POS]: 位于仓库根目录，作为 Codex / Claude / 其他代理的权威操作手册。

[PROTOCOL]:
1. 一旦仓库协作规则、目录结构或文档协议变化，必须同步更新我。
2. 我的内容若与某个目录 .folder.md 或文件 Header 冲突，以“更严格且不破坏运行时”的规则为准，并回写冲突处。
-->

# AGENTS.md

本文件是仓库内 AI 代理工作的唯一权威规约。Claude 或其他代理兼容入口应指向我，而不是维护另一套平行规则。

以下规则由共享规则源码编译而来；如果要长期修改行为规则，优先回到 `kata-governance/rules/` 修改源文件，再重新安装到新项目。

# General Rules

## 规则 1：编码前先思考 (Think Before Coding)

- 明确陈述假设。
- 不确定的地方要提问，而不是靠猜。
- 存在歧义时提供多种解释。
- 如果存在更简单的方法，要明确反驳复杂方案。

## 规则 2：简约至上 (Simplicity First)

- 只写能解决问题的最少代码。
- 不写投机性功能。
- 不为单次使用的代码做抽象。

## 规则 3：外科手术式修改 (Surgical Changes)

- 只触碰必须修改的地方。
- 不要顺便“优化”无关的代码、注释或格式。
- 不修复没坏的东西。
- 保持并匹配现有风格。

## 规则 4：目标驱动执行 (Goal-Driven Execution)

- 先定义成功标准，再开始执行。
- 围绕“成功是什么样”迭代，而不是机械复述步骤。
- 直到验证满足成功标准之前，不应将任务视为完成。

## 规则 5：仅将模型用于判断 (Judgment Calls Only)

- 模型负责分类、草稿、总结、方案比较与判断。
- 代码负责路由、重试、确定性转换与可重复执行的逻辑。
- 不要把确定性流程长期留在自然语言判断里。

## 规则 6：严格的 Token 预算 (Hard Token Budgets)

- 把 token 预算作为行为偏好而不是绝对机械约束。
- 当上下文开始膨胀时，优先压缩、总结并重开上下文。
- 预算接近上限时必须先总结再继续，而不是无控制扩写。

## 规则 7：暴露冲突而非中庸化 (Surface Conflicts)

- 当代码库存在两种冲突模式时，选择其中一种并标记另一种。
- 不要把两套互斥模式混合成表面折中方案。
- 如果必须暂时共存，要明确指出冲突边界。

## 规则 8：先读后写 (Read Before You Write)

- 在添加代码前，必须阅读导出项、调用者和共享工具库。
- 先确认是否已有现成能力，避免写出重复功能。
- 对共享抽象、公共工具与上游依赖尤其要先读再写。

## 规则 9：测试验证意图而非行为 (Tests Verify Intent)

- 测试必须编码“为什么要这么做”，而不仅仅是“做了什么”。
- 不能因为逻辑改变而暴露意图偏差的测试，就是弱测试。
- 测试应约束业务意图、边界条件与关键不变量。

## 规则 10：重要步骤后设置检查点 (Checkpoints)

- 多步任务中，每完成一步都要总结进度。
- 如果失去逻辑追踪，立即停止并重述现状、目标与下一步。
- 检查点要服务于继续执行，而不是形式化重复。

## 规则 11：惯例胜过新奇 (Convention Beats Novelty)

- 即使模型认为自己的写法更好，也要优先遵从代码库现有的命名和架构惯例。
- 当仓库已经明确采用某种命名或目录模式时，不要引入第二套体系。

## 规则 12：失败必须显性化 (Fail Loud)

- 如果不能确定任务 100% 成功，必须明确说明。
- 如果跳过了某些记录、测试、迁移或验证步骤，必须显式披露。
- 严禁默认成功或含糊表达完成状态。

## 规则 13：范式复用清单 (Follow Existing Paradigms)

写代码前先问：系统里有人解决过吗？有则遵循，无则以范式标准创建。逐项检查：

- 错误处理：复用统一的报错规范与已有错误类型。
- 日志：使用项目已有 logger，禁止散落 console.log。
- 工具函数：先查 utils/ 等共享位置，扩展已有实现而非另起炉灶。
- 常量：归入已有常量文件，禁止魔法数字。
- 网络请求：走已有 HTTP 封装，禁止裸写 fetch / axios。
- 状态管理：遵循已有方案，禁止混用第二套。

验收标准：十人同作，其代码若一人所书。

## 规则 14：品味自检 (Taste Check)

- 非琐碎实现完成后，对照自检：单一职责、DRY、KISS、YAGNI。
- 坏味道发现即指出：僵化、冗余、循环依赖、脆弱、晦涩、数据泥团、过度设计。
- 自检结论只在有实际发现时输出，不为形式而输出。

## 规则 15：模块化品味自检 (Modularity Taste Check)

- 非琐碎实现过程中及完成前，自主审视模块边界与职责归属。
- 坏味道发现即处理：职责混杂、边界模糊、变化扩散、知识泄露、依赖纠缠、接口臃肿、巨石模块、过度拆分、浅层抽象。
- 以高内聚、低耦合、局部理解、独立演进为判断标准；该拆则拆、该合则合，不机械套用结构。
- 自检结论只在有实际发现时输出，不为形式而输出。

# Frontend Rules

## 前端样式优先复用全局变量 (Prefer global.css)

- 前端样式修改时，优先复用项目现有的全局颜色变量与语义类。
- 如果项目存在类似 `globals.css` 的全局 token 源，应先检查并复用它。
- 优先采用现有语义表达，而不是新建平行颜色体系。

## 避免新增颜色函数表达式 (Avoid new color-function styling)

- 除非用户明确要求，否则不要主动新增 `color-mix()`、`oklch()`、`light-dark()`。
- 不要为了颜色表达引入新的复杂 arbitrary value。
- 优先复用现有全局变量、语义 token 与现有颜色系统。

## apps/web 图标固定使用 Iconify (Iconify Only)

- `apps/web` runtime 产品 UI 图标固定使用 `@egoist/tailwindcss-icons` 提供的 `i-solar-*` / `i-carbon-*` class；只有真实品牌标志可使用 `i-simple-icons-*`，禁止把 Simple Icons 用于通用按钮或状态图标。
- 禁止导入 `lucide-react`；品牌标志也必须通过本地 Iconify collection 构建，不能在运行时请求远程图标。
- shadcn 当前不提供 Iconify generator；`components.json.iconLibrary` 的 `lucide` 只作为 CLI 生成元数据，不代表 runtime 选型。
- 每次 shadcn add/apply 后，必须把生成的图标组件改为 Solar/Carbon Iconify class，并通过 ESLint 的 `no-restricted-imports` 门禁。

# Repository Documentation Rules

## 三层文档结构 (Three-Layer Map)

代码是实体的机器相，文档是实体的语义相，两相必须同构：任何一相变化，必须在另一相显现，否则视为未完成。

| 层级 | 位置                               | 职责                        | 触发更新                       |
| ---- | ---------------------------------- | --------------------------- | ------------------------------ |
| L1   | `/AGENTS.md` + `/README.md` 治理段 | 全局规约·根目录索引         | 架构变更 / 顶级目录增删        |
| L2   | `各目录/.folder.md`                | 局部架构·成员清单           | 文件增删 / 重命名 / 职责变更   |
| L3   | 文件 Header                        | `INPUT / OUTPUT / POS` 契约 | 依赖变更 / 导出变更 / 职责变更 |

L1 是 L2 的折叠，L2 是 L3 的折叠，L3 是代码逻辑的折叠。

## 文档同步协议 (Mandatory)

1. 任何功能、架构、写法更新完成后，必须立刻执行同步链路：文件实现 -> 文件 Header -> 所属目录 `.folder.md` -> 若影响全局则 `/README.md`
2. 每个受管目录都必须有一个 `.folder.md`，用 3 行内概括局部架构，并列出当前文件或直属子目录的名字、地位、功能。
3. 每个可注释文件都必须在开头声明：`INPUT`、`OUTPUT`、`POS`
4. 每个文件 Header 还必须声明：一旦本文件被更新，务必同步更新 Header 与所属目录 `.folder.md`
5. 每个 `.folder.md` 还必须声明：一旦所属文件夹变化，请更新我

## 回环工作流 (Loop Workflow)

正向流（代码 → 文档），代码修改完成后按序回环：

1. L3：更新被改文件的 Header。
2. L2：更新所属目录 `.folder.md`。
3. L1：若影响全局结构，更新 `/README.md` 与 `/AGENTS.md`。

三层检查完毕，任务才算完成。

逆向流（进入目录），动手之前先读地图：

1. 准备进入新目录时，先读该目录的 `.folder.md`。
2. 修改文件前，先读目标文件的 Header。
3. 然后才开始实际工作。

范围约束：回环只覆盖本次变更触及的链路。对未触及文件的批量补齐属于 bootstrap 脚本的职责，不要在日常任务中即兴扩散大 diff。

## 违规分级 (Violation Levels)

阻塞级（发现即停下，补齐后才能宣布任务完成）：

- FATAL-001 孤立代码变更：改了代码但未回环检查文档。停下补文档，禁止回滚已完成的代码。
- FATAL-002 缺失 Header 却继续：本次任务触及的可注释文件缺少 Header，必须先补齐再继续。
- FATAL-003 删文件不更新清单：删除或重命名文件后，`.folder.md` 中残留旧成员。
- FATAL-004 新目录无锚点：新建目录却不创建 `.folder.md`。

警告级（发现后修复，不阻塞当前任务，但必须在结果中披露）：

- SEVERE-001 Header 过时：Header 描述与代码现实不符。
- SEVERE-002 清单不完整：目录中存在未列入 `.folder.md` 的文件。
- SEVERE-003 全局索引过时：目录结构变化未反映到 `/README.md`。

## 固定句式 (Fixed Protocol Sentences)

协议句子必须写进文档自身，让每份文档自带同步提醒：

- 每个 `.folder.md` 正文必须包含：`一旦我所属的文件夹有所变化，请更新我。`
- 每个文件 Header 必须包含 `[PROTOCOL]:` 段，声明一旦本文件变化必须同步更新 Header，并上浮检查所属目录 `.folder.md`。

## 文件头规则 (Header Rules)

- Markdown 文件使用 HTML 注释作为 Header。
- JavaScript / TypeScript / MJS / CJS 文件使用块注释作为 Header。
- YAML 文件使用 `#` 注释作为 Header。
- 带 frontmatter 的 Markdown 文件，Header 放在 frontmatter 之后。
- 带 shebang 的脚本，Header 放在 shebang 之后。

## 严格数据文件例外 (Non-Commentable Files)

- `package.json`
- `plugin.json`
- `turbo.json`
- 其他要求严格 JSON 的机器读取文件

这些文件的 `INPUT / OUTPUT / POS` 说明必须写入它们所属目录的 `.folder.md`，并在 `.folder.md` 中明确这是 “JSON 例外文件”。

## 注释风格 (Comment Style)

大模块：

```ts
/* ==========================================================================
 * Module Name
 * ========================================================================== */
```

次级逻辑组：

```ts
// --- Logic Group ---
```

## 文档输出路径 (Documentation Output Path)

- 严禁在项目根目录新建任意其他 `.md` 文件。
- 根目录允许的文档只有：`README.md`、`AGENTS.md`、`CLAUDE.md`、`.folder.md`。
- 计划、总结、架构稿、修复记录、分析文档统一放到 `ai-docs/`。
