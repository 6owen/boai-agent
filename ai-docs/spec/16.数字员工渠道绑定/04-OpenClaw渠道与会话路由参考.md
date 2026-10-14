<!--
[INPUT]: 用户2026-10-14要求讨论员工机器人渠道、本人私聊镜像及外部群独立渠道会话，并从GitHub核对OpenClaw设计。
[OUTPUT]: 固定OpenClaw源码版本的渠道账号绑定、主会话、群/主题会话、授权/提及及WebChat投递事实；BOAI简化建议待决策，不替代03现行实施合同。
[OUTPUT]: 默认DM共享不代表所有发件人都是本人；BOAI保留明确本人关联与其他用户独立对话。
[POS]: 第16组第一方参考调研；仅研究，不修改生产代码、不启动真实机器人、不证明现有BOAI已完成双向镜像。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md；上游事实、BOAI推荐与实际实现分开。
-->

# OpenClaw渠道与会话路由参考

查询日期：2026-10-14。官方仓库：`openclaw/openclaw`。本次读取时的 `main` 固定为 **`3c23e90d297b07acc70a7871b798768e76f60a27`**，提交时间 `2026-10-14T07:27:17Z`。下方源码链接全部固定此版本；在线文档链接用于阅读入口，后续可能更新。没有使用二手博客，没有运行OpenClaw或真实机器人。

结论：用户提出的“本人机器人私聊进入员工主私聊，外部群提及另列渠道会话，同一员工处理”与OpenClaw默认会话分法接近。**一员工最多一个机器人可以作为BOAI首版产品限制，但不是OpenClaw的技术限制；共用历史也不等于平台消息全量双向镜像。**

## 1. 官方设计的关键事实

### 1.1 Agent是主体，Channel/Account是通信接入

OpenClaw区分Agent、渠道插件、渠道账号、入站路由Binding和上下文Session。Agent拥有工作目录和自己的会话存储；Binding根据账号/对话选择接收Agent，不创建机器人账号，也不替代平台授权。可以先把某机器人账号所有通信交给一个Agent，再按需增加更细的规则。[官方Agent bindings文档](https://docs.openclaw.ai/concepts/agent-bindings)，[固定源码：角色和绑定关系](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/concepts/agent-bindings.md#L11-L24)。

### 1.2 没有“一Agent只能一个渠道”的限制

Agent创建CLI的 `--bind` 可重复，多条Binding也可以指向同一Agent。反过来，同一渠道账号可按私聊发送者、群或频道匹配不同Agent。因此“一个机器人账号只对应一个员工、一个员工首版只绑定一个机器人”是BOAI可选择的更简单规则，不是上游强制关系。[固定源码：重复绑定入口](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/concepts/multi-agent.md#L67-L85)，[固定源码：单账号按发送者分流](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/concepts/multi-agent.md#L268-L305)。

飞书官方示例也把一个私聊Peer交给Agent A、一个群Peer交给Agent B，再配置渠道兜底。BOAI当前需求不必开放这种分流：机器人绑定谁，就由谁处理。[固定源码：飞书多Agent路由](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/feishu/advanced-configuration.md#L209-L250)。

### 1.3 默认直聊共享Agent主会话，BOAI只合并明确本人

默认 `dmScope: main` 将直聊归到 `agent:<agentId>:main`，网页和手机入口可以沿用同一上下文。还可选择按发送者、渠道或账号隔离的DM作用域。[官方主会话文档](https://docs.openclaw.ai/concepts/main-session)，[固定源码：DM会话键生成](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/src/routing/session-key.ts#L206-L250)。

OpenClaw的默认主会话并不自动证明所有发送者是同一个本人。它建议多用户机器人使用隔离DM作用域。BOAI应沿既有明确本人账号关联：只有本人渠道私聊与本地主私聊合并，其他授权用户保留独立渠道私聊。[固定源码：多用户隔离建议](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/concepts/main-session.md#L120-L139)。

### 1.4 默认群与主私聊分开，同一Agent可以有多个群上下文

默认 `groupScope: per-group`，群Session通常为 `agent:<agentId>:<channel>:group:<peerId>`。主体仍是原Agent，增加的是该Agent在外部群里的对话上下文，不要求创建一个新Agent。可选 `groupScope: main` 会改变上下文归并，但并不改变原群提及和回发地点。[官方渠道路由文档](https://docs.openclaw.ai/channels/channel-routing)，[固定源码：会话默认值](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/src/routing/resolve-route.ts#L271-L340)，[固定源码：群会话键](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/src/routing/session-key.ts#L251-L262)。

这支持BOAI把“研究员的飞书群A对话”放到渠道会话列表，而不是把群A注册成可添加多名BOAI员工的协作群。这个UI区分是针对BOAI需求的推荐，不是对OpenClaw界面的原样复制。

### 1.5 主题/回复链由各平台定义，不是一条回复建一个群

飞书 `groupSessionScope` 默认 `group`，另有按群发送者、主题、主题发送者划分上下文的选项。Telegram论坛Topic可形成带 `:topic:<id>` 的Session，回复仍送到对应Topic；它也提供可选的每Topic Agent路由。BOAI首版可保持每员工×外部群一个渠道会话，保存消息的原回复链；不要仅因一条消息出现回复链就增加BOAI群。[固定源码：飞书群作用域](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/feishu/advanced-configuration.md#L101-L114)，[固定源码：Telegram Topic](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/telegram/threads-and-sessions.md#L13-L55)。

### 1.6 群授权、发送者授权、提及触发是独立规则

飞书默认群策略为allowlist；群是否获准、群内哪些人获准，以及是否必须@机器人分别配置。有效策略为open时，当前版本提及默认值会变化，不能笼统说所有配置都默认要求@。用户的场景适合明确设置授权群及 `requireMention: true`。路由Binding只选择接收Agent，不扩大发送权限。[固定源码：飞书授权/提及](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/feishu/access-control.md#L15-L45)，[固定源码：群内发送者名单](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/feishu/access-control.md#L139-L158)，[固定源码：Binding不授予访问权](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/concepts/agent-bindings.md#L125-L127)。

### 1.7 普通群消息路由不是多Agent协作

普通入站路由一次选择一个Agent；精确Peer匹配优先于账号/渠道兜底。同一级多个匹配由配置顺序决定。OpenClaw另有显式 `broadcast` 多Agent机制，各参与者保持自己的Session。连接群机器人不意味着自动广播给它参与的所有内部团队。[固定源码：单Agent路由和独立广播机制](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/channel-routing.md#L96-L152)。

### 1.8 外部请求默认回复原入口

官方渠道合同将回复送回消息到达的渠道，模型不自行猜接收平台。共享主会话是上下文归并；本轮投递目标仍属于本轮来源。群消息、私聊消息和网页消息不应只凭“最近一次聊天地点”互相转发。[固定源码：原入口回复合同](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/channels/channel-routing.md#L8-L24)。

### 1.9 普通Control UI消息不会自动镜像到外部机器人

本次同时核对了服务器和当前UI调用链：

- 普通Control UI提交将当前Session交给 `requestChatSend`；该函数的 `chat.send` 请求明确传 **`deliver: false`**，没有指定外部 `originatingChannel/To`。这条标准发送路径即使选中包含平台历史的Session，也不因共用历史而自动投递平台。[固定源码：UI调用点](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/ui/src/pages/chat/chat-send-delivery.ts#L331-L346)，[固定源码：实际请求参数](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/ui/src/pages/chat/chat-send-request.ts#L64-L83)。
- 服务器在没有显式Origin且 `deliver` 不为true时，使用内部WebChat回复目标；即使 `deliver: true`，也禁止WebChat隐式继承已有外部投递路由。[固定源码：服务器Origin规则](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/src/gateway/server-methods/chat-origin-routing.ts#L93-L194)。
- 显式Origin是另一分支；相关请求字段受admin权限约束。因此上游仍有显式外部发送能力，不能将上面的默认行为扩大成“网页永远不能发平台消息”。[固定源码：显式来源字段授权](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/src/gateway/server-methods/chat-send-request.ts#L137-L159)。

“飞书发言和回复能在网页历史中看到”与“网页每条发言和回复都再发送一份给飞书”是两个能力。OpenClaw默认前者不构成后者合同；本次没有完整审计所有工具主动发送、插件发送或其他客户端路径。[固定源码：WebChat历史与投递分离](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/web/webchat.md#L53-L86)。

### 1.10 只参考会话路由，不照搬OpenClaw其余默认

当前OpenClaw主会话还会观察群活动摘要，并提供独立配置的跨Session访问能力。群Session独立不等于所有跨会话读取都禁用。BOAI这次只需参考“员工主体不变、私聊主会话、群上下文另存、原来源回发”，无需为了渠道接入额外引入Home通知、心跳或广播团队。[固定源码：Home的其他能力](https://github.com/openclaw/openclaw/blob/3c23e90d297b07acc70a7871b798768e76f60a27/docs/concepts/main-session.md#L52-L79)。

## 2. BOAI可采用的最小产品规则（待用户确认）

| 对象/入口 | 建议规则 |
| --- | --- |
| 数字员工 | 始终是唯一Agent主体，API/本机执行方式沿原员工配置 |
| 渠道绑定 | 首版每员工0或1个机器人绑定；一个机器人账号只绑定一个员工 |
| 本人主私聊 | BOAI本人私聊与已明确关联本人的机器人DM共用历史和上下文 |
| 其他人的机器人DM | 保留独立渠道私聊，不进入本人主私聊 |
| 外部群@机器人 | 打开该员工的渠道会话，按员工×平台×租户/账号×群识别；显示平台群名和实际发言者 |
| 渠道会话列表 | 可放在员工下或独立“渠道会话”分组；不因此新增一个可编辑成员的BOAI群 |
| 渠道会话中的员工 | 只有接入员工；不在BOAI侧添加其他员工或同步完整外部成员名单 |
| BOAI协作群 | 原有多员工协作入口；员工加入内部群不改变其机器人绑定与外部回复地点 |
| 普通回复 | 本轮渠道请求回原私聊/群及回复链；BOAI发起默认回BOAI |
| 本人DM双向镜像 | 若用户需要，应明确新增产品投递规则，固定到本人DM；不能凭共用历史或最近群消息自动完成 |

镜像还需明确：BOAI发出的本人文本是否作为机器人消息展示在飞书，员工回复是否也投递，附件/失败如何表现。平台中机器人代发的文本不应伪称为本人账号发出的原生消息；绑定和本人DM目标明确后才能外发。BOAI现有“本地消息不镜像”事实不会被此次研究自动改写。

## 3. 本次范围

本文件仅整理第一方源码和文档、提出针对BOAI的最小规则；未修改生产代码、未迁移会话、未新增渠道配置限制、未实现双向镜像、未提交或推送。03中的此前实施合同及02中的原验收事实保留；用户确认新规则后再统一更新领域合同。
