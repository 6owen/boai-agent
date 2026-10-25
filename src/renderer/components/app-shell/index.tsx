/*
 * [OUTPUT]: 审批传递本次运行同类操作选择；目录回执核对包括该选择，未知回答不冒充成功。
 * [OUTPUT]: 员工右键配置跳转通讯录；定时运行图标沿原主会话定位与详情导航。
 * [OUTPUT]: 员工会话右键配置跳转现有通讯录选中项；定时运行按用户点击查看过程/聊天。
 * [OUTPUT]: 个人资料技能菜单经原导航守卫进入资源库全部技能，清除旧定位，不打开设置页资源详情。
 * [OUTPUT]: 头像菜单由Base UI内部管理开关，避免重渲染Shell与聊天历史；保留导航关闭、Escape及快捷键门禁，移除会话header网页预览回调。
 * [OUTPUT]: 普通/材料/明确回复发送通过原校验后通知当前聊天回到最新窗口；清除历史定位并使旧分页失效，核对未知回执不触发跳转。
 * [OUTPUT]: 管理入口切到普通核心会话并追加去重的管理技能标签，保留草稿和未知首发身份；定时创建不再使用专用聊天。
 * [OUTPUT]: 清理同时隔离详情和分页请求的迟到结果与错误。
 * [OUTPUT]: 四项应用快捷键由 Main 已保存快照匹配，录入不执行，原上下文守卫保持。
 * [OUTPUT]: 会话侧栏只打开网页预览，忽略旧终端show事件，原员工执行路径保持。
 * [OUTPUT]: 清理操作和宿主清理窗口暂停详情读取并失效迟到错误；隐藏完成即时退出原会话，刷新失败不重报删除失败。
 * [OUTPUT]: 阅读历史锚点的有界页不再改写侧栏最新摘要/时间；仅尾页读取与原实时消息更新列表，历史定位/分页/草稿保持。
 * [OUTPUT]: 四组默认应用快捷键与工具栏共用搜索、三页列表和原历史动作；输入、自定义选择控件、组合键与浮层保留自身按键。
 * [OUTPUT]: 主聊天按选中会话元信息立即保留ChatView外框，不再以会话ID重建整个聊天；首屏40条、刷新保留已加载窗口且最多80条，原请求代次/锚点/清理隔离保持。
 * [OUTPUT]: 同会话终端/预览侧栏；设置不再透传桌面活动日报首发回调。
 * [OUTPUT]: 保留挂载的主会话与渠道聊天各提供浮层可见作用域，切页/隐藏详情立即撤下Portal，不清理正文、草稿和阅读位置。
 * [OUTPUT]: 会话消息与群标题头像的配置入口统一跳转通讯录并选中对应员工，bobo与创建的员工共用原导航守卫。
 * [OUTPUT]: 2026-10-19 员工配置检索服务入口导航到独立设置页，沿原未保存守卫。
 * [OUTPUT]: 已发布知识引用按宿主实际读取身份打开原全局预览；明确重开更新定位，失效不跳到新内容。
 * [OUTPUT]: 员工文件中的旧知识资料携带员工身份进入统一预览，保留全局资源管理入口。
 * [OUTPUT]: Dialog/Popover的Escape事件不继续关闭底层详情标签；知识共享返回原文件视图。
 * [OUTPUT]: 员工知识资料经原文件标签管理，受管知识内容沿全局资源标签共用预览组件；未另建主导航。
 * [OUTPUT]: 组合命令目录审批响应未知时只核对原目录回执，不重发批准或命令。
 * [OUTPUT]: 目录审批响应未知时只读核对原审批回执，已提交则刷新；不重发原文件操作。
 * [OUTPUT]: 群聊资料保存回执局部更新会话快照并隔离旧读取，不因更名/成员配置刷新页面。
 * [OUTPUT]: 员工身份保存按回执局部替换对应员工，保留其余快照和页面；旧版本/已删员工不回填，已发旧快照请求失效。
 * [OUTPUT]: 看板移除后暂时注释主侧栏“任务”入口，任务页面代码与会话内任务入口保留。
 * [OUTPUT]: 员工资源查看复用资源库数据源/受管资源详情与原导航，编辑器先处理草稿并关闭弹窗；主页面原守卫保持。
 * [OUTPUT]: 版本化Magpie系统导入先持久草稿、明确确认后事务保存连接/回执；冷启动有界队列、未知核对和Sonner反馈，完整应用验收仍待运行。
 * [OUTPUT]: 通讯录员工/群执行列表在当前全局右侧标签打开固定Run，沿原未保存守卫与聊天定位。
 * [OUTPUT]: 数据源列表删除后按ID关闭当前资源库中对应详情标签，其他标签保持。
 * [OUTPUT]: 定时执行历史删除后关闭各页面对应过程标签，保留其他详情与主聊天。
 * [OUTPUT]: AI管理不注入管理话术；目录入口保留草稿，单资源入口仅追加去重ID，普通bobo导航保持。
 * [OUTPUT]: 普通和定时执行卡片共用聊天定位，复用消息滚动高亮与导航草稿守卫。
 * [OUTPUT]: 数据源列表/侧栏/聊天结果共用右侧配置标签，沿技能面板位置与显隐生命周期。
 * [OUTPUT]: 全局标题/分割线名称统一资源库，内部skills路由与历史偏好保持。
 * [OUTPUT]: AI管理进入普通bobo首发草稿并保留原输入，真实结果定位全局目录；bobo所有设置入口统一通讯录。
 * [OUTPUT]: 员工主私聊的任务公开回复沿automationPublication打开原occurrence执行过程，不创建第二份运行。
 * [OUTPUT]: 定时任务执行记录进入独立右侧标签，仅显示本次执行卡片；主区配置/检索保持，隐藏停读。
 * [OUTPUT]: 自定义本机/商城技能选择进入共用右侧详情标签，主目录与搜索状态保留；商城详情沿active暂停隐藏读取。
 * [OUTPUT]: 审批可明确保存当前员工的永久命令授权，原一次批准/拒绝保持。
 * [OUTPUT]: Composer管理模型经导航守卫定位通讯录员工/群；配置保存回传真实员工版本，连续选择不使用旧版本。
 * [OUTPUT]: 技能旧路由进入自定义工作区，统一技能与数据源导航。
 * [OUTPUT]: 定时任务创建位于主区，员工只读入口通过同一导航上下文定位计划。
 * [OUTPUT]: Composer仅修改当前连接模型/推理，保存时保留nativeOptions原权限配置。
 * [OUTPUT]: 会话任务/员工文件移入右侧独立详情标签；取消互斥视图和旧偏好读取，主聊天持续读取/发送/滚动，文件保留固定员工或群范围。
 * [OUTPUT]: 会话/全局任务仅占位；员工文件跨可见会话汇总，群/渠道文件按原会话读取；旧工作入口归执行过程。
 * [OUTPUT]: 会话标题配置经原导航守卫跳转通讯录并选中实际员工/群；渠道信息仍在原面板核对。
 * [OUTPUT]: 左侧会话/通讯录/任务及右侧详情共用 transitions-dev 宽度过渡，拖动时即时调整，显隐业务状态不延迟。
 * [OUTPUT]: 员工事件刷新在显式分页完成后按已加载窗口补读，不取消或淘汰新页；实时消息合并、阅读锚点及卸载/清理隔离保持。
 * [OUTPUT]: 实时正文仅在当前聊天读取期间缓冲，结束/替换/清理释放；不累计全应用历史消息。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 内部答复明确外发仅携带本轮实际渠道引用，具体内容草稿独立；发送页返回同一渠道容器。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 文件预览编辑归独立文件会话，不再由Shell改写原聊天草稿/导航；历史未决草稿兼容保持。
 * [OUTPUT]: 渠道侧边聊天与单个详情视图共用员工根标签；列表Popover、返回及替换经本标签守卫，来源导航显式携带容器身份，不递归开面板。
 * [OUTPUT]: 右侧容器常驻全局layout，统一宽度/缩放归DetailPanel；渠道与其他内容切换不改变分栏尺寸。
 * [OUTPUT]: 2026-10-15渠道列表和聊天进入员工专属右侧标签，主会话保持；两处共用发送/材料/修订，独立阅读窗口与来源导航。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 当前网页引用附于原消息草稿；固定实例/页面版本随发送回执持久，标题URL只展示宿主核验来源，原附件工具栏保持。
 * [OUTPUT]: 员工/群自动化沿原详情页和精确结果导航，全局计划与归属面板共数据。
 * [OUTPUT]: 2026-10-14现行分离合同：员工专属渠道页面/返回主聊天；搜索和Work来源导航按真实房间进入对应页面，草稿/详情作用域保持。
 * [OUTPUT]: 渠道会话详情复用只读来源/接入员工面板，外部私聊与群均不进入BOAI群编辑器。
 * [OUTPUT]: 2026-10-14已选旧房间归档后自动定位主房间，沿用稳定消息ID和原页面，不在归档房间继续发送。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [OUTPUT]: 2026-10-10 员工执行详情经来源/current与可见会话核对导航原聊天；复用原主页面/未保存守卫，不新建会话。
 * [OUTPUT]: 聊天及核心首发统一选择模型API/本机Agent；底部原子保存含后端与具体来源，区分真实保存回执/尚未提交/未知，刷新失败不改已保存事实，保留配置版本/实际退出门禁。
 * [OUTPUT]: 底部本机设置只读核对原员工/绑定再导航到原向导；离开原页面的迟到结果不导航，员工设置复用原标签与草稿守卫。
 * [OUTPUT]: 用户原消息打开执行过程时不把user身份当员工筛选，原轮次及全部实际员工记录保持可见。
 * [OUTPUT]: 普通IM与ACP共用持久冻结请求，跨重启只读核对，存储失败禁止首次提交且不覆盖未知记录。
 * [OUTPUT]: 可信工作来源回查固定定时触发，宿主核对/目标清理代际/来源与页面资格隔离迟到响应，零执行。
 * [OUTPUT]: 任务审批按原approval/run身份二次核对后聚焦原聊天请求卡；未发布Run正文不冒充Message，清理移除定位。
 * [OUTPUT]: 常驻会话聊天/任务/文件、独立全局任务导航与员工任务筛选；隐藏聊天暂停主动窗口读取/阅读观测，草稿和锚点保留，源消息导航再次核对不恢复隐藏会话。
 * [OUTPUT]: 全局检索按钮位于浏览器图标右侧，Shell承载同一普通Dialog与明确会话检索，侧栏收起及跨页仍可打开，材料/成果预览保留发起页详情作用域，换页/关闭停读，实际导航成功才关闭。
 * [OUTPUT]: 聊天附件随消息发到当前聊天，移除所有草稿/消息共享设置与授权修改回调。
 * [OUTPUT]: 图片/文件附件粘贴与拖入沿现有材料草稿/发送回执接线；不按模型视觉能力限制，消息列表复用真实附件原件预览。
 * [OUTPUT]: ACP未决请求仅在成功权威快照后清理已删除聊天，首次读取失败保持原身份；按原通道/载荷/key持久化，跨重启只读核对，执行过程精确停止原run；composer仅发送消息，无停止本轮/停止并发送按钮或即时停止回调；普通发送不主动取消当前处理，员工回复继续沿消息流展示。
 * [INPUT]: sidebar 主页面及其独立详情标签作用域、领域类型、员工思考强度配置、IPC 事件、独立页面组件与桌面请求入口、统一 UI 基础组件与 Sonner 操作提示。
 * [OUTPUT]: 成果采用/稍后处理与修订未知回执留在原聊天；修订通过同一composer固定原成果版本和明确员工，右侧仅只读预览，提交失败立即复核已开正文。
 * [OUTPUT]: 顶栏始终打开应用级独立浏览器，不绑定员工/会话、不创建工作或调用模型；页面瞬时操作/校验/宿主错误使用 Sonner，成果未决身份的本地存储故障保留持续提醒；核心会话行/右键/更多和聊天标题菜单共用明确会话标题弹窗，仅调用列表rename且刷新快照，失败留在弹窗不重写成员/配置；边界滚动有界分页的同步请求门禁/保留当前位置与请求期间实时消息，方向反转后不淘汰当前阅读锚点，清空/删除同步移除固定消息定位与导航历史定位，过期详情失败不显示顶栏错误；独立个人有界历史/真实完成未读与稳定锚点、普通 Dialog 会话/正文/文件混合搜索点击复核和固定目标导航；搜索不隐式恢复隐藏会话，编辑器延迟导航后再次只读核对原目标与当前可见元信息，实际导航成功才关闭弹窗，弹窗期间暂停背景阅读，隐藏会话暂停查询；撤销独立待处理主页面，原问题消息通过聊天输入框明确关联回复；补充未决载荷持久化并只读核对，原审批和任务记录保留；员工技能绑定按主页面/详情标签传递活跃状态与作用域，隐藏暂停回执读取；成果按逻辑家族复用明确版本标签，未决修订/采用身份沿页面隔离并持久化，关闭/重启只读核对、清理删除私有输入；会话材料原生选择/drop、按聊天保留草稿与稳定发送请求、未知准备/发送回执只读核对、当前聊天发送范围、独立材料来源标签与清理失效；聊天头像资料导航指定员工配置或本人资料，复用既有导航/详情标签并保留未保存守卫；真实群删除清除选中会话、草稿和导航历史，群编辑解散使用独立刷新回调；核心助手空白页重复打开保留输入、首次发送稳定受理才持久化、失败只读核对原请求回执；团队名称与需求弹窗受理后即时会话导航及当前工作团队结果/恢复入口，普通单聊复用排除核心会话；头像菜单首项展示本人头像/名称，后接分享/设置/帮助；分享直接打开全屏弹窗并恢复头像按钮焦点；个人资料导航及唯一快照、设置分类/滚动与聊天 DOM 保留；定时任务常驻阅读状态与隐藏暂停读取，七项手动/Agent/专用监控共用编辑标签；通讯录加号菜单团队创建弹窗； 发送时分离 composer 行内标签和正文，沿用结构化成员 ID；移除独立外部 Agent 设置路由与导航菜单项；设置与定时任务复用列表拖拽线、键盘调宽、双击复位及宽度记忆；右侧标签按 sidebar 页面分别保留顺序/选中/显隐与编辑草稿，切换主页面不混用标签；技能更新复用任务与产物所在的 Shell 右侧详情 Tabs，重复打开激活既有标签、保留技能主详情并在升级后刷新/定位本机技能；移除 Skills 统计并回退旧分类偏好；技能/商城复用会话可调分栏，旧更新/记录页面偏好回到本地； 单一技能图标与统一页面、本地/收藏/商城顶部 Tabs、独立于员工资源、独立列表详情及重启不自动联网；启动与删除当前会话后保持未选中，仅展示居中的共用毛绒伙伴插画，不含标题、按钮或模板卡片；消费系统提醒导航，重载后定位具体结果或无消息的执行记录；独立定时任务编辑标签/选中计划、指定结果消息导航与普通单聊复用隔离；商店详情复用独立标签；回复旁图标打开固定消息/员工的执行过程标签；Carbon 导航、会话页按手动宽度和显式开关控制的分栏容器、保留草稿和独立会话上下文的顶栏多标签及下方配置、通讯录/会话路由、共用创建入口、列表排序/置顶/隐藏恢复、创建弹窗、头像配置保存、工作树停止及支持局部标签切换的退出编辑保护。 置顶仅归列表，列表和标题下拉菜单共用清理能力、会话清理缓存及右侧窗口排序。
 * [OUTPUT]: 聊天标题栏不提供阅读状态或返回未读/最新按钮，滚动锚点/历史加载/可见阅读观测保持。
 * [OUTPUT]: 删除资料库主页面与导航；旧资料库启动偏好回退会话，技能页及共享资源详情保留。
 * [POS]: src/renderer/components/app-shell/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { shortcuts } from '@/stores/shortcuts'
import { matchShortcut } from '@shared/shortcuts'
import { WorkspacePanel } from '../detail-panel/workspace-panel'
import { appendDraftReference, draftResourceReferences } from '@/pages/conversations/inline-mentions'
import { managementSkillReference } from '@/pages/conversations/composer-commands'
import type { ManagementSkillId } from '@shared/domain/management-skills'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { FloatingLayerScope } from '@/components/ui/floating-layer-scope'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { detailWorkspacesReducer, detailTargetKey, emptyDetailTabs, type DetailWorkspaces, type DetailTabsAction, type DetailTarget as Panel } from '../detail-panel/tabs-state'
import { DetailTabSession, type DetailTabHandle } from '../detail-panel/tab-session'
import { ChannelPublishPanel } from '../detail-panel/channel-publish-panel'
import { ChannelsTab, type ChannelChatWindow } from '../detail-panel/channels-tab'
import { EmployeeExecutionNavigation } from '../employee/execution-pane'
import { EmployeeResourceNavigation } from '../employee/resource-navigation'
import { TraceTab } from '../detail-panel/trace-tab'
import { MaterialTab } from '../detail-panel/material-tab'
import { ArtifactTab } from '../detail-panel/artifact-tab'
import { useChatArtifacts } from '@/pages/conversations/use-chat-artifacts'
import type { ArtifactRevisionInput } from '@shared/domain/artifacts'
import { fileEditContent } from '@shared/domain/file-edit'
import { artifactRevisionTarget } from '../detail-panel/artifact-state'
import { ARTIFACT_PENDING_KEY, restoreArtifactPending, updateArtifactPending, type ArtifactPending, type ArtifactPendingMap } from '../detail-panel/artifact-state'
import { useChatMaterials } from './use-chat-materials'
import { getDesktopClient } from '@/services/request/desktop-client'
import { DesktopToolbar } from './desktop-toolbar'
import { PanelResize } from '@/components/common/panel-resize'
import { HeaderBrowser } from './header-browser'
import { GatewayImportDialog } from '@/pages/settings/gateway-import-dialog'
import { SourceDetailPanel } from '@/pages/sources/source-detail'
import { SkillsNavigation } from './skills-navigation'
import { DetailPanel, DetailPanelHeader, useDetailPanelLayout } from '../detail-panel'
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, Clock, Home, Contact, CircleHelp, MessageCircle, Users, FileText, Workflow, RefreshCw, Search, Settings, Share } from '@/components/icons/index'
import { channelConversations, mainConversations, isChannelConversation, type ConversationListChange } from '@shared/domain/conversation-list'
import type { AppEvent } from '@shared/ipc'
import type { Artifact, DigitalAgent, Conversation, Message, Snapshot } from '@shared/domain'
import { READING_LIMITS, type ConversationReadingState, type ConversationSearchResult, type ConversationSearchTarget, type ConversationView } from '@shared/domain/reading'
import { mergeMessagePages, mergeReadingState, readingSourceKey, sameSearchTarget, updateLiveMessage } from '@/pages/conversations/reading-state'
import { LiveMessageBuffer } from '@/pages/conversations/live-message-buffer'
import { ConversationSearch, type ConversationSearchRequest } from '@/pages/conversations/-components/conversation-search'
import { MATERIAL_LIMITS, type ConversationMaterial } from '@shared/domain/materials'
import { isCoreAgent, isCoreConversation } from '@shared/domain/core-agent'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { ConversationFiles } from '@/components/work-views/conversation-files'
import { KnowledgePreviewPane } from '@/components/work-views/employee-knowledge'
import { KnowledgeCitationPane } from '@/components/work-views/knowledge-citation'
import { TasksPage, TasksPlaceholder } from '@/pages/tasks'
import type { ConversationFileItem, ConversationFileTarget } from '@shared/domain/work-views'
import { ChatView, type ChatViewProps } from '@/pages/conversations/-components/chat-view'
import { useChatQuestionReplies } from '@/pages/conversations/question-reply'
import { CoreChatStart } from '@/pages/conversations/-components/core-chat-start'
import type { ComposerAgentPatch, ComposerAgentSaveResult } from '@/pages/conversations/-components/composer-toolbar'
import { ConversationList } from '@/pages/conversations/-components/conversation-list'
import { ConversationTitleDialog } from '@/pages/conversations/-components/conversation-title-dialog'
import { MESSAGE_SEND_PENDING_KEY, pendingMessageRequests, restorePendingMessageDrafts, draftFingerprint } from '@/pages/conversations/message-send-state'
import type { ChatDraft } from '@/pages/conversations/presentation'
import { draftContent } from '@/pages/conversations/inline-mentions'
import { GroupEditor } from '@/components/employee/editors'
import { ChannelConversationInfo } from '@/components/employee/channel-conversation-info'
import { CreateAgentDialog, CreateGroupDialog } from '@/components/employee/creation-dialogs'
import { EmployeeDetail } from '@/components/employee/index'
import { TeamCreator } from '@/pages/contacts/team-creator'
import { ContactsPage, type ContactSelection } from '@/pages/contacts'
import { HelpPage } from '@/pages/help'
import { type SkillsSection } from '@/pages/library/skills-workspace'
import { LocalSkillPanel } from '@/pages/library/skills-workspace'
import { CustomizationWorkspace } from '@/pages/library/customization-workspace'
import type { SkillMarketplaceProvider } from '@shared/domain/skill-marketplace'
import { SkillMarketplaceDetail } from '@/pages/library/skill-marketplace'
import { SkillUpdateBatchView } from '@/pages/library/skill-update-batch'
import { ResourceDetail } from '@/pages/library/resource-detail'
import { ScheduleNavigationContext } from '@/pages/schedules/owner-automations'
import { ScheduleDetail, SchedulePage, type ScheduleLocation } from '@/pages/schedules'
import { AutomationOccurrenceView } from '@/pages/schedules/automation-history'
import { AutomationEditorTab } from '@/pages/schedules/automation-editor'
import { UserAvatar } from '@/components/common/user-avatar'
import { ProfileShare } from '@/pages/settings/profile-share'
import { SettingsPage, type SettingsTab } from '@/pages/settings'
import type { LocalAgentTarget } from '@/pages/settings/local-agents'
import { Avatar, Banner, errorText, GuardContext, Loading } from '@/components/common/index'
import { toast } from 'sonner'

type Page = 'conversations' | 'tasks' | 'contacts' | 'schedules' | 'skills' | 'settings' | 'help'
type Creation = { type: 'agent'; template?: number } | { type: 'group' | 'team' }
interface Route { page: Page; conversationId: string | null; coreDraft?: true; focusMessage?: { id: string; requestId: string }; focusApproval?: { id: string; requestId: string } }
const EMPTY: Snapshot = { agents: [], conversations: [], connections: [], resources: [], approvals: [], dataPath: '' }
const DEFAULT_LIST_WIDTH = 312
const EMPTY_DRAFT: ChatDraft = { text: '', mentionIds: [] }
const labels: Record<Page, string> = { conversations: '会话', tasks: '任务', contacts: '通讯录', schedules: '定时任务', skills: '资源库', settings: '设置', help: '帮助' }
function pref(key: string, fallback: number) { try { return Number(localStorage.getItem(`boai.v2.${key}`)) || fallback } catch { return fallback } }
function initialRoute(): Route { try { const p = localStorage.getItem('boai.v2.page'); return { page: p === 'marketplace' ? 'skills' : p && p in labels ? p as Page : 'conversations', conversationId: null } } catch { return { page: 'conversations', conversationId: null } } }

export function AppShell() {
  const api = getDesktopClient()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY), [detail, setDetail] = useState<ConversationView | null>(null)
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot
  const [snapshotReady, setSnapshotReady] = useState(false)
  const [restoredArtifacts] = useState(() => {
    try { return { pending: restoreArtifactPending(JSON.parse(localStorage.getItem(ARTIFACT_PENDING_KEY) ?? 'null')), error: '' } }
    catch { return { pending: {} as ArtifactPendingMap, error: '未能读取成果未决请求，请恢复本地存储后核对原请求。' } }
  })
  const [artifactPending, setArtifactPending] = useState<ArtifactPendingMap>(restoredArtifacts.pending), artifactPendingRef = useRef(restoredArtifacts.pending)
  const [route, setRoute] = useState<Route>(initialRoute)
  const routeRef = useRef(route); routeRef.current = route
  const sourceNavigationRequest = useRef(0), sourceNavigationEpochs = useRef(new Map<string, number>())
  const detailRef = useRef(detail); detailRef.current = detail
  const viewLocations = useRef(new Map<string, { messageId?: string; offset?: number; initialized: boolean; focusRequestId?: string }>())
  const [searchRequest, setSearchRequest] = useState<ConversationSearchRequest>(), [conversationSearchOpen, setConversationSearchOpen] = useState(false), [paging, setPaging] = useState(false), [pageEdges, setPageEdges] = useState({ before: true, after: true })
  useEffect(() => { setConversationSearchOpen(false) }, [route.page])
  const [editingTitle, setEditingTitle] = useState<Conversation | null>(null)
  const pagingFlight = useRef(0), refreshAfterPaging = useRef(false)
  const clearingConversations = useRef(new Set<string>()), cleanupRequests = useRef(new Set<string>())
  const [sourceChecks, setSourceChecks] = useState<Record<string, number>>({})
  const [skillsSection, setSkillsSection] = useState<SkillsSection>('all')
  const [skillProvider, setSkillProvider] = useState<SkillMarketplaceProvider>(() => { try { const value = localStorage.getItem('boai.skills.provider'); return ['skills-sh','clawhub','skillhub'].includes(value ?? '') ? value as SkillMarketplaceProvider : 'skills-sh' } catch { return 'skills-sh' } })
  useEffect(() => { try { localStorage.setItem('boai.skills.section', skillsSection); localStorage.setItem('boai.skills.provider', skillProvider) } catch { /* Optional navigation preferences. */ } }, [skillsSection, skillProvider])
  const [focusedSkill, setFocusedSkill] = useState<{ id: string; requestId: string }>()
  const [focusedSource, setFocusedSource] = useState<{ id: string; requestId: string }>()
  const [skillsRevision, setSkillsRevision] = useState(0)
  const skillUpdated = useCallback(() => setSkillsRevision(value => value + 1), [])
  const skillsNavigation = route.page === 'skills'
  const [scheduleLocation, setScheduleLocation] = useState<ScheduleLocation>({ kind: 'overview' })
  const [detailWorkspaces, dispatchWorkspace] = useReducer(detailWorkspacesReducer, {} as DetailWorkspaces)
  const detailTabs = detailWorkspaces[route.page] ?? emptyDetailTabs
  const allDetailTabs = Object.entries(detailWorkspaces).flatMap(([scope, state]) => state.tabs.map(tab => ({ scope, ...tab })))
  const dispatchDetails = (action: DetailTabsAction, scope: string = route.page) => dispatchWorkspace({ scope, action })
  const tabHandles = useRef(new Map<string, DetailTabHandle>())
  const [tabDirty, setTabDirty] = useState<Record<string, boolean>>({})
  const onTabDirty = useCallback((key: string, value: boolean) => setTabDirty(previous => {
    if (Boolean(previous[key]) === value) return previous
    const next = { ...previous }; if (value) next[key] = true; else delete next[key]; return next
  }), [])
  const [contactSelection, setContactSelection] = useState<ContactSelection | null>(null)
  const [creation, setCreation] = useState<Creation | null>(null)
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [artifactStorageError, setArtifactStorageError] = useState(restoredArtifacts.error)
  const saveArtifactPending = useCallback((key: string, value?: ArtifactPending) => {
    const next = updateArtifactPending(artifactPendingRef.current, key, value)
    artifactPendingRef.current = next; setArtifactPending(next)
    try { if (Object.keys(next).length) localStorage.setItem(ARTIFACT_PENDING_KEY, JSON.stringify(next)); else localStorage.removeItem(ARTIFACT_PENDING_KEY); return true }
    catch { setArtifactStorageError('未能保存成果请求身份，跨重启核对尚无保证。请恢复本地存储后重试。'); return false }
  }, [])
  const clearArtifactPending = useCallback((conversationId: string) => {
    for (const [key, value] of Object.entries(artifactPendingRef.current)) if (value.conversationId === conversationId) saveArtifactPending(key)
  }, [saveArtifactPending])
  useEffect(() => {
    if (!snapshotReady) return
    for (const value of Object.values(artifactPendingRef.current)) if (!snapshot.conversations.some(conversation => conversation.id === value.conversationId)) clearArtifactPending(value.conversationId)
  }, [snapshotReady, snapshot.conversations, clearArtifactPending])
  const [busy, setBusy] = useState(false), busyRef = useRef(false)
  const [panelGeneration, setPanelGeneration] = useState(0)
  const { guard, dirty, dirtyRef, navigate, saved, leaving, confirmation } = useEditorGuard({
    reset: () => setPanelGeneration(value => value + 1),
  })
  const anyDirty = dirty || Object.values(tabDirty).some(Boolean)
  const [listShown, setListShown] = useState(true), [listWidth, setListWidth] = useState(() => { const width = pref('listWidth', DEFAULT_LIST_WIDTH); return width === 272 ? DEFAULT_LIST_WIDTH : width })
  const detailLayout = useDetailPanelLayout()
  const [listResizing, setListResizing] = useState(false)
  const [restoredMessages] = useState(() => { try { return { drafts: restorePendingMessageDrafts(JSON.parse(localStorage.getItem(MESSAGE_SEND_PENDING_KEY) ?? '{}')), error: '' } } catch { return { drafts: new Map<string, ChatDraft>(), error: '未决消息请求无法读取，请恢复本地存储并重启后核对原请求。' } } })
  const [messageStorageError, setMessageStorageError] = useState(restoredMessages.error)
  const [, setDraftVersion] = useState(0), drafts = useRef(restoredMessages.drafts), scrollPositions = useRef(new Map<string, number>())
  const persistMessageRequests = useCallback(() => {
    if (restoredMessages.error) return false // Never overwrite an unreadable startup record with an empty map.
    try { localStorage.setItem(MESSAGE_SEND_PENDING_KEY, JSON.stringify(pendingMessageRequests(drafts.current))); setMessageStorageError(''); return true }
    catch { setMessageStorageError('未能保存原消息请求，请恢复本地存储后核对原请求。'); return false }
  }, [restoredMessages.error])
  const bumpDrafts = useCallback(() => setDraftVersion(value => value + 1), [])
  useEffect(() => {
    if (!snapshotReady) return
    let changed = false
    for (const [id, draft] of drafts.current) if (draft.submission && !snapshot.conversations.some(conversation => conversation.id === id)) { drafts.current.delete(id); changed = true }
    if (changed) { persistMessageRequests(); bumpDrafts() }
  }, [snapshotReady, snapshot.conversations, persistMessageRequests, bumpDrafts])
  const materialDrafts = useChatMaterials({ api, snapshot, drafts, onChange: bumpDrafts, onError: toast.error })
  const [previews, setPreviews] = useState<Record<string,string>>({})
  const [messageTimes, setMessageTimes] = useState<Record<string,string>>({})
  const settingsMounted = useRef(route.page === 'settings')
  if (route.page === 'settings') settingsMounted.current = true
  const [settingsSection,setSettingsSection]=useState<SettingsTab>('connections')
  const [localAgentTarget, setLocalAgentTarget] = useState<LocalAgentTarget>()
  const userMenuOpen = useRef(false)
  const userMenuActions = useRef<{ close(): void; unmount(): void } | null>(null)
  const [sharingProfile, setSharingProfile] = useState(false), userMenuButton = useRef<HTMLButtonElement>(null)
  const detailTrigger = useRef<{ scope: string; element: HTMLElement | null } | null>(null)
  const history = useRef<Route[]>([route]), historyIndex = useRef(0)
  const mounted = useRef(true), selectedRef = useRef<string | null>(route.conversationId), snapshotRequest = useRef(0), detailRequest = useRef(0)
  const coreConversationRequest = useRef<{ requestId: string; content: string; composerReferences?: import('@shared/domain/composer-references').ComposerReference[] } | undefined>(undefined)
  const coreDraft = useRef<ChatDraft>(EMPTY_DRAFT)
  const liveMessages = useRef(new LiveMessageBuffer())
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTab = detailTabs.tabs.find(tab => tab.key === detailTabs.activeKey)
  const panel = detailTabs.shown ? activeTab?.detail ?? activeTab?.target : undefined, selectedId = route.conversationId
  const panelRef = useRef(panel); panelRef.current = panel
  const conversation = snapshot.conversations.find(c => c.id === selectedId)
  const currentDetail = detail?.conversation.id === selectedId ? detail : null
  useEffect(() => {
    const target = snapshot.conversations.find(room => room.id === selectedRef.current)?.mergedInto
    if (!target) return
    const next = { ...routeRef.current, conversationId: target }
    routeRef.current = next; selectedRef.current = target; setRoute(next)
  }, [snapshot.conversations])
  useEffect(() => { const trigger = detailTrigger.current; if (!panel && trigger?.scope === route.page && trigger.element?.isConnected) trigger.element.focus() }, [Boolean(panel), route.page])

  const refreshSnapshot = useCallback(async () => {
    if (!api) return
    const token = ++snapshotRequest.current, result = await api.request('snapshot', undefined)
    if (mounted.current && token === snapshotRequest.current) { setSnapshot(result); setSnapshotReady(true); setLoading(false) }
  }, [api])
  const updateAgentSnapshot = useCallback((agent: DigitalAgent) => {
    if (!mounted.current) return
    // An earlier whole-snapshot response must not roll back this committed employee.
    snapshotRequest.current++
    setSnapshot(current => {
      const existing = current.agents.find(item => item.id === agent.id)
      if (!existing || existing.configVersion >= agent.configVersion) return current
      return { ...current, agents: current.agents.map(item => item.id === agent.id ? agent : item) }
    })
  }, [])
  const updateGroupSnapshot = useCallback((group: Conversation) => {
    if (!mounted.current) return
    snapshotRequest.current++
    setSnapshot(current => {
      const existing = current.conversations.find(item => item.id === group.id)
      if (!existing || (existing.configVersion ?? 0) > (group.configVersion ?? 0)) return current
      return { ...current, conversations: current.conversations.map(item => item.id === group.id ? { ...item, title: group.title, agentIds: group.agentIds, sharedKnowledgeIds: group.sharedKnowledgeIds, memoryScope: group.memoryScope, memoryContextRef: group.memoryContextRef, teamSetup: group.teamSetup, mode: group.mode, configVersion: group.configVersion, updatedAt: group.updatedAt } : item) }
    })
  }, [])
  const clearConversationLocation = useCallback((id: string, removed: boolean) => {
    sourceNavigationEpochs.current.set(id, (sourceNavigationEpochs.current.get(id) ?? 0) + 1)
    viewLocations.current.delete(id); scrollPositions.current.delete(id)
    history.current = history.current.map(entry => entry.conversationId === id ? { ...entry, conversationId: removed ? null : id, focusMessage: undefined, focusApproval: undefined } : entry)
    if (selectedRef.current !== id) return
    detailRequest.current++; pagingFlight.current = 0; refreshAfterPaging.current = false; setPaging(false)
    setDetail(null); setDetailLoading(!removed)
    const next = { ...routeRef.current, conversationId: removed ? null : id, focusMessage: undefined, focusApproval: undefined }
    routeRef.current = next; selectedRef.current = next.conversationId; setRoute(next)
  }, [])
  const refreshDetail = useCallback(async (id: string, window?: ConversationView['messagePage'], isCurrent: () => boolean = () => true) => {
    if (!api || !mounted.current || selectedRef.current !== id || routeRef.current.page !== 'conversations' || clearingConversations.current.has(id) || cleanupRequests.current.has(id)) return
    if (pagingFlight.current) { refreshAfterPaging.current = true; return }
    const token = ++detailRequest.current, capture = liveMessages.current.begin(id), focus = routeRef.current.focusMessage
    const current = () => mounted.current && token === detailRequest.current && selectedRef.current === id && routeRef.current.page === 'conversations' && !clearingConversations.current.has(id) && !cleanupRequests.current.has(id) && isCurrent()
    try {
      let location = viewLocations.current.get(id) ?? { initialized: false }
      if (focus && location.focusRequestId !== focus.requestId) location = { initialized: true, messageId: focus.id, focusRequestId: focus.requestId }
      if (!location.initialized) {
        const reading = await api.request('getConversationReading', { conversationId: id })
        if (!current()) return
        location = { initialized: true, messageId: reading.anchor?.messageId, offset: reading.anchor?.offset }
      }
      viewLocations.current.set(id, location)
      // Refresh the loaded range around its center, not around the visible row:
      // recentering on the scroll anchor would evict the page the user just loaded.
      const loadedWindow = window ?? (detailRef.current?.conversation.id === id ? detailRef.current.messagePage : undefined)
      const aroundMessageId = location.messageId && loadedWindow?.conversationId === id && loadedWindow.items.some(item => item.messageId === location.messageId)
        ? loadedWindow.items[Math.floor((loadedWindow.items.length - 1) / 2)]?.messageId : location.messageId
      const limit = Math.min(READING_LIMITS.maxPage, Math.max(READING_LIMITS.page, loadedWindow?.items.length ?? 0))
      const result = await api.request('getConversationView', { conversationId: id, limit, aroundMessageId })
      if (!current()) return
      const anchor = viewLocations.current.get(id)?.messageId
      if (anchor && anchor !== aroundMessageId && !result.messagePage.items.some(item => item.messageId === anchor)) return
      let messagePage = result.messagePage
      for (const message of capture.messages.values()) messagePage = updateLiveMessage(messagePage, message, !location.messageId)
      const updated: ConversationView = { ...result, messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) }
      const previous = detailRef.current
      if (previous?.conversation.id === id) updated.reading = mergeReadingState(previous.reading, updated.reading)
      materialDrafts.reconcile(id, result.materials ?? [])
      setDetail(updated); setDetailLoading(false); setPageEdges({ before: true, after: true })
      const last = updated.messages.at(-1)
      // An anchored reading window is not the conversation tail. Preserve the
      // latest list summary from the snapshot or live messages while browsing it.
      if (last && !aroundMessageId) {
        setPreviews(previous => ({ ...previous, [id]: `${last.senderName}：${last.content.slice(0,90)}` }))
        setMessageTimes(previous => ({ ...previous, [id]: previous[id] && previous[id] > last.createdAt ? previous[id] : last.createdAt }))
      }
      return true
    } catch (failure) { if (current()) { setDetail(null); setDetailLoading(false); toast.error(errorText(failure)) } }
    finally { liveMessages.current.finish(capture) }
  }, [api, materialDrafts.reconcile])
  const showLatestMessages = async (id: string, isCurrent: () => boolean) => {
    if (selectedRef.current !== id || routeRef.current.page !== 'conversations' || !isCurrent()) return false
    // A send starts a new reading window; older page responses must not restore it.
    detailRequest.current++; pagingFlight.current = 0; refreshAfterPaging.current = false; setPaging(false)
    viewLocations.current.set(id, { initialized: true, focusRequestId: routeRef.current.focusMessage?.requestId })
    return Boolean(await refreshDetail(id, undefined, isCurrent))
  }
  const questionReplies = useChatQuestionReplies(api, {
    conversationId: selectedId ?? undefined, active: route.page === 'conversations' && !conversationSearchOpen,
    conversationIds: route.page === 'conversations' && !conversationSearchOpen ? [selectedId, panel?.type === 'channels' ? panel.conversationId : undefined].filter((id): id is string => Boolean(id)) : [],
    onSubmitted: (message, target) => {
      const current = drafts.current.get(message.conversationId)
      if (current?.questionReply?.itemId === target.itemId && current.questionReply.questionMessageId === target.questionMessageId && (current.questionReply.occurrenceId ? current.questionReply.occurrenceId === target.occurrenceId : current.questionReply.revision === target.revision)) {
        if (draftContent(current) === message.content && !current.materials?.length && !current.mentionIds.length) drafts.current.delete(message.conversationId)
        else drafts.current.set(message.conversationId, { ...current, questionReply: undefined, replyId: undefined })
        bumpDrafts()
      }
      void refreshSnapshot().catch(failure => toast.error(`补充已提交，列表刷新未完成：${errorText(failure)}`))
      if (selectedRef.current === message.conversationId) void refreshDetail(message.conversationId)
    },
  })
  const artifactActions = useChatArtifacts(api, artifactPending, saveArtifactPending, (target, kind, input) => {
    if (kind === 'revision') {
      const revision = input as ArtifactRevisionInput, current = drafts.current.get(target.conversationId)
      if (current?.artifactRevision?.artifactId === revision.artifactId && current.artifactRevision.contentHash === revision.contentHash && current.artifactRevision.targetAgentId === revision.targetAgentId) {
        if (fileEditContent(draftContent(current), current.artifactRevision.annotation) === revision.content && !current.materials?.length && !current.mentionIds.length) drafts.current.delete(target.conversationId)
        else drafts.current.set(target.conversationId, { ...current, artifactRevision: undefined })
        bumpDrafts()
      }
    }
    if (selectedRef.current === target.conversationId) void refreshDetail(target.conversationId)
  }, (conversationId, artifactId) => {
    const key = readingSourceKey({ kind: 'artifact', conversationId, artifactId })
    setSourceChecks(previous => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }))
  })
  useEffect(() => {
    mounted.current = true
    if (!api) { setLoading(false); return }
    const report = (e: unknown) => { if (mounted.current) { toast.error(errorText(e)); setLoading(false); setDetailLoading(false) } }
    void refreshSnapshot().catch(report)
    const schedule = () => { if (refreshTimer.current) return; refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void refreshSnapshot().catch(report); if (selectedRef.current && routeRef.current.page === 'conversations') void refreshDetail(selectedRef.current, detailRef.current?.messagePage) }, 100) }
    const openAutomationNotice = () => { void api.request('getPendingAutomationNavigation', undefined).then(target => {
      if (!target || !mounted.current) return
      navigate(() => {
        if (target.conversationId && target.messageId) applyRoute({ page: 'conversations', conversationId: target.conversationId, focusMessage: { id: target.messageId, requestId: crypto.randomUUID() } })
        else { setScheduleLocation({ kind: 'occurrence', id: target.occurrenceId, requestId: crypto.randomUUID() }); applyRoute({ ...routeRef.current, page: 'schedules' }) }
      })
    }).catch(report) }
    const unsubscribe = api.subscribe((event: AppEvent) => {
      if (event.type === 'workspace:show') { if (event.view !== 'preview') return; dispatchDetails({ type: 'open', target: { type: 'workspace', id: event.conversationId, employeeId: event.employeeId, view: event.view } }, 'conversations'); return }
      if (event.type === 'automation:history-deleted') { dispatchWorkspace({ type: 'remove-automation-occurrence', id: event.occurrenceId }); schedule(); return }
      if (event.type === 'automation:navigate') { openAutomationNotice(); return }
      if(event.type==='focus-conversation'){navigate(()=>applyRoute({page:'conversations',conversationId:event.conversationId,focusMessage:event.messageId?{id:event.messageId,requestId:crypto.randomUUID()}:undefined}));return}
      if (event.type === 'runtime-error') { toast.error(event.error); return }
      if (event.type === 'conversation:clearing') {
        clearingConversations.current.add(event.conversationId)
        if (selectedRef.current === event.conversationId) detailRequest.current++
        return
      }
      if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') {
        const id = event.conversationId
        clearingConversations.current.delete(id)
        dispatchWorkspace({ type: 'remove-workspace', id })
        clearArtifactPending(id)
        materialDrafts.invalidate(id)
        liveMessages.current.clear(id)
        drafts.current.delete(id); persistMessageRequests()
        clearConversationLocation(id, event.type === 'conversation:deleted' || Boolean(event.hidden))
        setPreviews(previous => ({ ...previous, [id]: '' })); setMessageTimes(previous => ({ ...previous, [id]: '' }))
        schedule(); return
      }
      if (event.type === 'changed') { if (!event.conversationId) skillUpdated(); schedule(); return }
      if (event.type !== 'message') return
      setMessageTimes(previous => { const id = event.message.conversationId, time = event.message.createdAt; return previous[id] && previous[id] >= time ? previous : { ...previous, [id]: time } })
      liveMessages.current.add(event.message)
      if (event.message.conversationId === selectedRef.current && routeRef.current.page === 'conversations') setDetail(previous => { if (!previous || previous.conversation.id !== event.message.conversationId) return previous; const messagePage = updateLiveMessage(previous.messagePage, event.message, !viewLocations.current.get(event.message.conversationId)?.messageId); return { ...previous, messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) } })
      if (event.message.status !== 'streaming') { setPreviews(previous => ({ ...previous, [event.message.conversationId]: `${event.message.senderName}：${event.message.content.slice(0,90)}` })); schedule() }
    })
    openAutomationNotice()
    return () => { mounted.current = false; liveMessages.current.clear(); unsubscribe(); if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = null }
  }, [api, refreshSnapshot, refreshDetail, materialDrafts.invalidate, clearArtifactPending, clearConversationLocation])
  useEffect(() => {
    selectedRef.current = selectedId
    liveMessages.current.clear()
    pagingFlight.current = 0; refreshAfterPaging.current = false; setPaging(false)
    if (!selectedId) { setDetail(null); setDetailLoading(false); return }
    if (route.page !== 'conversations') { detailRequest.current++; setDetailLoading(false); return }
    setDetailLoading(true)
    void refreshDetail(selectedId)
  }, [selectedId, route.page, route.focusMessage?.requestId, route.focusApproval?.requestId, refreshDetail])
  useEffect(() => { try { localStorage.setItem('boai.v2.listWidth', String(listWidth)); localStorage.setItem('boai.v2.page', route.page); localStorage.removeItem('boai.v2.conversation') } catch { /* Preferences are optional. */ } }, [listWidth, route.page])
  useEffect(() => { if (api) void api.request('setUnsavedChanges', { dirty: anyDirty }).catch(e => toast.error(errorText(e))) }, [api, anyDirty])
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !event.composedPath().some(node => node instanceof Element && node.matches('[role=dialog], [role=alertdialog], [role=menu], [data-slot=popover-content]')) && !userMenuOpen.current && !sharingProfile && !leaving && !creation && panel && !document.querySelector('[role=dialog], [role=alertdialog], [data-slot=popover-content][data-open], [data-slot=dropdown-menu-content][data-open]')) { const handle = tabHandles.current.get(detailTabs.activeKey!); if (activeTab?.detail) handle?.navigate(() => dispatchDetails({ type: 'back', key: activeTab.key })); else handle?.close() } }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [sharingProfile, panel, leaving, creation, detailTabs.activeKey, activeTab?.detail])
  const action = async (fn: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await fn() } catch (e) { if (mounted.current) toast.error(errorText(e)) } finally { busyRef.current = false; if (mounted.current) setBusy(false) } }
  const applyRoute = (requested: Route, addHistory = true, navigated?: () => void) => {
    const target = snapshotRef.current.conversations.find(room => room.id === requested.conversationId)
    if (requested.page === 'conversations' && target?.purpose === 'channel-internal' && target.channelDiscussion) {
      const agentId = target.agentIds[0]!
      openPanel({ type: 'channels', id: agentId, conversationId: target.channelDiscussion.conversationId, requestId: crypto.randomUUID() }, 'conversations', undefined, () => {
        dispatchDetails({ type: 'open', withinKey: `conversations/channels:${agentId}`, target: { type: 'channel-discussion', id: target.id, agentId, requestId: crypto.randomUUID(), focusMessage: requested.focusMessage } }, 'conversations')
        if (routeRef.current.page !== 'conversations') applyRoute({ ...routeRef.current, page: 'conversations' }, addHistory)
        navigated?.()
      })
      return
    }
    if (requested.page === 'conversations' && target && isChannelConversation(target)) {
      const agentId = target.channel?.agentId ?? target.agentIds[0]
      if (agentId) openPanel({ type: 'channels', id: agentId, conversationId: target.id, requestId: crypto.randomUUID(), focusMessage: requested.focusMessage, focusApproval: requested.focusApproval }, 'conversations', undefined, () => {
        if (routeRef.current.page !== 'conversations') applyRoute({ ...routeRef.current, page: 'conversations' }, addHistory)
        navigated?.()
      })
      return
    }
    const next = requested
    if (addHistory && (next.page !== route.page || next.conversationId !== route.conversationId || next.coreDraft !== route.coreDraft)) { history.current = history.current.slice(0, historyIndex.current + 1); history.current.push(next); historyIndex.current++ }
    if (next.conversationId !== selectedRef.current || next.page !== routeRef.current.page || next.focusMessage?.requestId !== routeRef.current.focusMessage?.requestId || next.focusApproval?.requestId !== routeRef.current.focusApproval?.requestId) detailRequest.current++
    if (next.conversationId !== selectedRef.current) { selectedRef.current = next.conversationId; setDetail(null); setDetailLoading(Boolean(next.conversationId && next.page === 'conversations')) }
    routeRef.current = next
    if (next.page !== 'skills') { setFocusedSkill(undefined); setFocusedSource(undefined) }
    if (next.page !== 'settings') setLocalAgentTarget(undefined)
    setRoute(next); setCreation(null); userMenuActions.current?.close(); navigated?.()
  }
  const goPage = (page: Page) => navigate(() => applyRoute({ ...route, page }))
  const openUserProfile = () => navigate(() => { setSettingsSection('profile'); applyRoute({ ...route, page: 'settings' }) })
  const selectConversation = (id: string, _clearSearch = false, messageId?: string, current?: () => boolean, navigated?: () => void) => {
    let pending: Promise<void> | undefined
    navigate(() => {
      const open = () => { if (current && !current()) return; applyRoute({ page: 'conversations', conversationId: id, focusMessage: messageId ? { id: messageId, requestId: crypto.randomUUID() } : undefined }, true, navigated) }
      if (!snapshot.conversations.find(item => item.id === id)?.list?.hidden) { open(); return }
      if (api) pending = action(async () => { await api.request('updateConversationList', { id, action: 'show' }); await refreshSnapshot(); open() })
    })
    return pending
  }
  const updateReading = (reading: ConversationReadingState) => setDetail(previous => previous?.conversation.id === reading.conversationId ? { ...previous, reading: mergeReadingState(previous.reading, reading) } : previous)
  const loadMessagePage = async (direction: 'before' | 'after') => {
    if (!api || pagingFlight.current || paging || routeRef.current.page !== 'conversations') return
    const previous = detailRef.current, id = selectedRef.current
    if (!previous || previous.conversation.id !== id || clearingConversations.current.has(id) || cleanupRequests.current.has(id)) return
    const cursor = direction === 'before' ? previous.messagePage.beforeCursor : previous.messagePage.afterCursor
    if (!cursor) return
    const token = ++detailRequest.current, capture = liveMessages.current.begin(id); pagingFlight.current = token; setPaging(true)
    let refreshedWindow = previous.messagePage
    try {
      const next = await api.request('getConversationView', { conversationId: previous.conversation.id, limit: READING_LIMITS.page, [direction]: cursor })
      if (!mounted.current || token !== detailRequest.current || selectedRef.current !== id || routeRef.current.page !== 'conversations' || clearingConversations.current.has(id) || cleanupRequests.current.has(id)) return
      if (!next.messagePage.items.length) { setPageEdges(value => ({ ...value, [direction]: false })); return }
      let messagePage = mergeMessagePages(previous.messagePage, next.messagePage, direction)
      for (const message of capture.messages.values()) messagePage = updateLiveMessage(messagePage, message, false)
      const anchorId = viewLocations.current.get(id)?.messageId
      if (anchorId && !messagePage.items.some(item => item.messageId === anchorId)) return
      const latestReading = detailRef.current?.conversation.id === id ? detailRef.current.reading : previous.reading
      refreshedWindow = messagePage
      setDetail({ ...next, reading: mergeReadingState(latestReading, next.reading), messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) }); setPageEdges({ before: true, after: true })
    } catch (failure) { if (mounted.current && token === detailRequest.current && selectedRef.current === id && routeRef.current.page === 'conversations' && !clearingConversations.current.has(id) && !cleanupRequests.current.has(id)) toast.error(errorText(failure)) }
    finally {
      liveMessages.current.finish(capture)
      if (token === pagingFlight.current) {
        pagingFlight.current = 0; setPaging(false)
        if (refreshAfterPaging.current) { refreshAfterPaging.current = false; void refreshDetail(id, refreshedWindow) }
      }
    }
  }
  const saveConversationTitle = async (id: string, title: string) => {
    if (!api) throw new Error('桌面连接暂不可用')
    await api.request('updateConversationList', { id, action: 'rename', title })
    await refreshSnapshot()
  }
  const changeConversationList = (change: ConversationListChange) => {
    const update = () => { if (!api) return; void action(async () => {
      if (change.action === 'hide') sourceNavigationEpochs.current.set(change.id, (sourceNavigationEpochs.current.get(change.id) ?? 0) + 1)
      await api.request('updateConversationList', change)
      if (change.action === 'hide') {
        history.current = history.current.map(entry => entry.conversationId === change.id ? { ...entry, conversationId: null, focusMessage: undefined, focusApproval: undefined } : entry)
        if (selectedRef.current === change.id) {
          applyRoute({ ...route, conversationId: null, focusMessage: undefined, focusApproval: undefined }, false)
        }
      }
      await refreshSnapshot()
    }) }
    if (change.action === 'hide') navigate(update); else update()
  }
  const clearConversationHistory = async (id: string, hide: boolean) => {
    if (!api) throw new Error('桌面服务尚未就绪')
    if (cleanupRequests.current.has(id)) throw new Error('此会话正在清理，请等待当前操作完成')
    cleanupRequests.current.add(id)
    if (selectedRef.current === id) detailRequest.current++
    try { await api.request('clearConversationHistory', { id, hide }) }
    finally { cleanupRequests.current.delete(id) }
    clearingConversations.current.delete(id)
    clearConversationLocation(id, hide)
    materialDrafts.invalidate(id)
    liveMessages.current.clear(id)
    drafts.current.delete(id); persistMessageRequests()
    setPreviews(previous => ({ ...previous, [id]: '' }))
    setMessageTimes(previous => ({ ...previous, [id]: '' }))
    if (hide) {
      history.current = history.current.map(entry => entry.conversationId === id ? { ...entry, conversationId: null, focusMessage: undefined, focusApproval: undefined } : entry)
      if (selectedRef.current === id) {
        applyRoute({ ...route, conversationId: null, focusMessage: undefined, focusApproval: undefined }, false)
      }
    } else if (selectedRef.current === id) await refreshDetail(id)
    await refreshSnapshot().catch(failure => toast.error(`会话清理已完成，列表刷新未完成：${errorText(failure)}`))
  }
  const openPanel = (next: Panel, scope: string = route.page, current?: () => boolean, navigated?: () => void, withinKey?: string) => {
    const trigger = document.activeElement as HTMLElement | null
    const replacingKey = withinKey ?? (next.type === 'channels' ? `${scope}/${detailTargetKey(next)}` : undefined)
    const commit = () => {
      if (current && !current()) return
      if (!panel) detailTrigger.current = { scope, element: trigger }
      dispatchDetails({ type: 'open', target: next, withinKey }, scope); userMenuActions.current?.close(); navigated?.()
    }
    navigate(() => {
      if (current && !current()) return
      const handle = replacingKey ? tabHandles.current.get(replacingKey) : undefined
      if (handle) handle.navigate(commit)
      else if (!withinKey) commit()
    })
  }
  const openLocalSkill = (id: string) => navigate(() => {
    setSkillsSection('all'); setFocusedSkill({ id, requestId: crypto.randomUUID() }); applyRoute({ ...route, page: 'skills' })
  })
  const openCreation = (next: Creation) => navigate(() => { setCreation(next); userMenuActions.current?.close() })
  const createdConversation = async (result: Conversation) => { await refreshSnapshot(); saved(() => { applyRoute({ page: 'conversations', conversationId: result.id }) }) }
  const coreConversationStarted = (result: Conversation) => {
    setSnapshot(previous => ({ ...previous, conversations: previous.conversations.some(item => item.id === result.id) ? previous.conversations : [...previous.conversations, result] }))
    navigate(() => { applyRoute({ page: 'conversations', conversationId: result.id }) })
    void refreshSnapshot().catch(failure => toast.error(errorText(failure)))
  }
  const createCoreConversation = () => navigate(() => {
    applyRoute({ page: 'conversations', conversationId: null, coreDraft: true })
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.core-chat-start [aria-label="消息内容"]')?.focus())
  })
  const openCatalogResult = (kind: 'skill' | 'source' | 'resource', id: string, name?: string) => navigate(() => {
    if (kind === 'source') { const requestId = crypto.randomUUID(); setFocusedSource({ id, requestId }); setFocusedSkill(undefined); dispatchDetails({ type: 'open', target: { type: 'source', id, name: name ?? '数据源', requestId } }, 'skills') }
    else if (kind === 'resource') { setFocusedSource(undefined); setFocusedSkill(undefined); dispatchDetails({ type: 'open', target: { type: 'resource', id } }, 'skills') }
    else { setFocusedSource(undefined); setSkillsSection('all'); setFocusedSkill({ id, requestId: crypto.randomUUID() }) }
    skillUpdated(); applyRoute({ ...routeRef.current, page: 'skills' })
  })
  const openCatalogManagement = (kind: ManagementSkillId, item?: { id: string; name: string }) => navigate(() => {
    const core = snapshot.agents.find(isCoreAgent)
    if (!core) return
    if (coreConversationRequest.current) { toast.error('上一条消息的发送结果尚未确认，请先在会话中核对'); return }
    coreDraft.current = appendDraftReference(coreDraft.current, managementSkillReference(kind, core.id))
    if (item && !draftContent(coreDraft.current).includes(item.id)) {
      coreDraft.current = { ...coreDraft.current, text: [coreDraft.current.text, item.id].filter(Boolean).join('\n') }
    }
    setDraftVersion(value => value + 1)
    applyRoute({ page: 'conversations', conversationId: null, coreDraft: true })
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.core-chat-start [aria-label="消息内容"]')?.focus())
  })
  const closeTab = (key: string, scope: string = route.page) => {
    dispatchDetails({ type: 'close', key }, scope)
  }
  const requestCloseTab = (key: string) => {
    if (tabDirty[key]) dispatchDetails({ type: 'select', key })
    tabHandles.current.get(key)?.close()
  }
  const openAgent = (agent: DigitalAgent, configurationRequest?: string) => isCoreAgent(agent) ? openContact({ kind: 'agent', id: agent.id }) : openPanel({ type: 'agent', id: agent.id, conversationId: selectedId ?? undefined, configurationRequest })
  const openContact = (selection: ContactSelection) => navigate(() => {
    setContactSelection(selection)
    applyRoute({ ...route, page: 'contacts' })
  })
  const openModelSettings = (agent?: DigitalAgent, sourceCurrent: () => boolean = () => true) => {
    if (!api) return
    const origin = routeRef.current, backend = agent?.executionBackend
    const profileId = backend && backend.kind !== 'mastra-model' ? backend.profileId : undefined
    const current = () => mounted.current && routeRef.current === origin && sourceCurrent()
    navigate(() => {
      if (!current()) return
      if (!agent || !profileId) { setLocalAgentTarget(undefined); setSettingsSection('connections'); applyRoute({ ...origin, page: 'settings' }); return }
      void action(async () => {
        try {
          const profiles = await api.request('listLaunchProfiles', undefined)
          if (!current()) return
          const latest = snapshotRef.current.agents.find(item => item.id === agent.id)?.executionBackend
          if (!latest || latest.kind === 'mastra-model' || latest.kind !== backend?.kind || latest.profileId !== profileId) { toast.error('员工运行配置已变化，请重新打开。'); return }
          setLocalAgentTarget({ profileId, profiles, requestId: crypto.randomUUID() })
          setSettingsSection('connections'); applyRoute({ ...origin, page: 'settings' })
        } catch (failure) { if (current()) throw failure }
      })
    })
  }
  const openDirect = (agent: DigitalAgent) => {
    if (isCoreAgent(agent)) { createCoreConversation(); return }
    navigate(() => { if (!api) return; void action(async () => { const existing = mainConversations(snapshot.conversations).find(c => c.kind === 'direct' && !c.mergedInto && (c.mainPrivate || !c.channel) && c.purpose !== 'automation' && !isCoreConversation(c) && c.agentIds[0] === agent.id); const result = existing ?? await api.request('createConversation', { kind: 'direct', title: agent.name, agentIds: [agent.id], mode: 'natural' }); await api.request('updateConversationList', { id: result.id, action: 'show' }); await refreshSnapshot(); applyRoute({ page: 'conversations', conversationId: result.id }) }) })
  }
  const openChannels = (agent: DigitalAgent, id?: string) => {
    const rooms = channelConversations(snapshot.conversations, agent.id, messageTimes)
    const previous = detailTabs.tabs.find(tab => tab.target.type === 'channels' && tab.target.id === agent.id)?.target
    const target = rooms.find(room => room.id === id) ?? rooms.find(room => (room.channelUnreadCount ?? 0) > 0) ?? rooms.find(room => previous?.type === 'channels' && room.id === previous.conversationId) ?? rooms[0]
    openPanel({ type: 'channels', id: agent.id, conversationId: target?.id, requestId: crypto.randomUUID() })
  }
  const messageContact = (selection: ContactSelection) => {
    if (selection.kind === 'agent') { const agent = snapshot.agents.find(item => item.id === selection.id); if (agent) openDirect(agent) }
    else { selectConversation(selection.id, true) }
  }
  const draft = route.coreDraft ? coreDraft.current : selectedId ? drafts.current.get(selectedId) ?? EMPTY_DRAFT : EMPTY_DRAFT
  const setDraft = (value: ChatDraft) => { if (route.coreDraft) coreDraft.current = value; else if (selectedId) drafts.current.set(selectedId, value); else return; setDraftVersion(v => v+1) }
  const acceptMessage = async (id: string, submission: NonNullable<ChatDraft['submission']>) => {
    const current = drafts.current.get(id)
    if (current?.submission?.requestId === submission.requestId) {
      if (draftFingerprint(current) === submission.fingerprint) drafts.current.delete(id)
      else {
        const sentMaterials = new Set(submission.input.materialSelections?.map(material => material.id))
        drafts.current.set(id, { ...current, submission: undefined, materials: current.materials?.filter(item => !item.material || !sentMaterials.has(item.material.id)) })
      }
      persistMessageRequests()
      bumpDrafts()
    }
    if (selectedRef.current === id) await refreshDetail(id)
    await refreshSnapshot()
  }
  const updateSubmission = (id: string, requestId: string, status: NonNullable<ChatDraft['submission']>['status']) => {
    const current = drafts.current.get(id)
    if (current?.submission?.requestId !== requestId) return
    drafts.current.set(id, { ...current, submission: { ...current.submission, status } }); persistMessageRequests(); bumpDrafts()
  }
  const clearUnacceptedSubmission = (id = selectedId) => {
    if (!api || !id) return
    const submission = drafts.current.get(id)?.submission
    if (submission?.status !== 'not_accepted') return
    void action(async () => {
      const receipt = submission.kind === 'external' ? await api.request('getExternalTaskReceipt', { conversationId: id, requestId: submission.requestId }) : await api.request('getMessageReceipt', { requestId: submission.requestId })
      if (receipt) { await acceptMessage(id, submission); return }
      const current = drafts.current.get(id)
      if (current?.submission?.requestId === submission.requestId) { drafts.current.set(id, { ...current, submission: undefined }); persistMessageRequests(); bumpDrafts() }
    })
  }
  const send = (conversationId = selectedId, onDispatch?: () => void) => {
    const sendingDraft = conversationId ? drafts.current.get(conversationId) ?? EMPTY_DRAFT : draft
    const conversation = snapshot.conversations.find(room => room.id === conversationId)
    const text = draftContent(sendingDraft)
    if (!api || busyRef.current || questionReplies.busy) return
    if (route.coreDraft && !conversationId) {
      if (!text) return
      void action(async () => {
        // Keep the original request until its receipt is known, including after a lost response.
        coreConversationRequest.current ??= { requestId: crypto.randomUUID(), content: text, ...(draftResourceReferences(sendingDraft).length ? { composerReferences: draftResourceReferences(sendingDraft) } : {}) }
        const request = coreConversationRequest.current
        let result: Conversation
        try { result = await api.request('startCoreConversation', request) }
        catch (failure) {
          let accepted: Conversation | null | undefined
          try { accepted = await api.request('getCoreConversationStart', { requestId: request.requestId }) } catch { /* Preserve the request when its receipt cannot be checked. */ }
          if (!accepted) { if (accepted === null) coreConversationRequest.current = undefined; throw failure }
          result = accepted
        }
        if (draftContent(coreDraft.current) !== request.content) drafts.current.set(result.id, coreDraft.current)
        coreDraft.current = EMPTY_DRAFT; coreConversationRequest.current = undefined
        setSnapshot(previous => ({ ...previous, conversations: previous.conversations.some(item => item.id === result.id) ? previous.conversations : [...previous.conversations, result] }))
        history.current = history.current.map(entry => entry.coreDraft ? { ...entry, coreDraft: undefined, conversationId: result.id } : entry)
        setRoute(previous => previous.coreDraft ? { ...previous, coreDraft: undefined, conversationId: result.id } : previous)
        setDraftVersion(value => value + 1); await refreshSnapshot()
      })
      return
    }
    if (!conversationId) return
    const id = conversationId, sent = drafts.current.get(id) ?? sendingDraft, sentText = draftContent(sent)
    const pendingQuestions = Object.values(questionReplies.values).filter(request => request.conversationId === id)
    if (sent.artifactRevision) {
      const target = sent.artifactRevision
      if (sent.submission || sent.questionReply || sent.materials?.length || sent.mentionIds.length || draftResourceReferences(sent).length) { toast.error('修改文件时请只发送修改要求，先移除材料和成员点名。'); return }
      if (!sentText) return
      if (pendingQuestions.length || Object.values(artifactPendingRef.current).some(value => value.conversationId === id && value.logicalArtifactId === target.logicalArtifactId && (value.revision || value.adoption || value.acceptance))) { toast.error('请先核对原请求结果，再提交这条修改要求。'); return }
      const member = snapshot.agents.find(agent => agent.id === target.targetAgentId && conversation?.agentIds.includes(agent.id))
      if (!artifactRevisionTarget(member, snapshot.connections)) { toast.error('请选择当前聊天中可执行的员工。'); return }
      if (artifactStorageError) { toast.error(artifactStorageError); return }
      onDispatch?.()
      void artifactActions.execute({ scope: 'conversations', conversationId: id, logicalArtifactId: target.logicalArtifactId }, 'revision', { conversationId: id, artifactId: target.artifactId, contentHash: target.contentHash, targetAgentId: target.targetAgentId, content: fileEditContent(sentText, target.annotation), requestId: crypto.randomUUID() })
      return
    }

    if (sent.questionReply) {
      if (sent.submission || sent.materials?.length || sent.mentionIds.length || draftResourceReferences(sent).length) { toast.error('回复原问题时请只发送补充正文；可取消问题关联后发送材料、提及或新的要求。'); return }
      if (!sentText) return
      if (questionReplies.storageError) { toast.error(questionReplies.storageError); return }
      if (pendingQuestions.some(request => request.itemId !== sent.questionReply!.itemId)) { toast.error('请先核对本聊天的原补充请求，再回复其他问题。'); return }
      void action(async () => { onDispatch?.(); await questionReplies.submit(sent.questionReply!, sentText) })
      return
    }
    if (pendingQuestions.length) { toast.error('本聊天有补充结果尚未确认，请先核对原补充请求。'); return }
    if (restoredMessages.error) { toast.error(restoredMessages.error); return }
    const external = conversation?.kind === 'direct' && snapshot.agents.find(agent => agent.id === conversation.agentIds[0])?.executionBackend?.kind === 'acp-local'
    if (sent.submission ? sent.submission.kind === 'external' : external) {
      if (!sentText && !sent.submission) return
      if (sent.materials?.length) { toast.error('外部聊天不支持材料输入，请先移除草稿中的材料。'); return }
      let submission = sent.submission
      if (submission?.status === 'pending') return
      if (!submission) {
        submission = { kind: 'external', requestId: crypto.randomUUID(), status: 'pending', fingerprint: draftFingerprint(sent), input: { content: sentText, mentionIds: [] } }
        drafts.current.set(id, { ...sent, submission }); bumpDrafts()
        if (!persistMessageRequests()) { updateSubmission(id, submission.requestId, 'not_accepted'); return }
      }
      const request = submission
      void action(async () => {
        if (request.status !== 'pending') {
          const receipt = await api.request('getExternalTaskReceipt', { conversationId: id, requestId: request.requestId })
          if (receipt) { await acceptMessage(id, request); return }
          if (request.status === 'unknown') { updateSubmission(id, request.requestId, 'not_accepted'); return }
        }
        if (!persistMessageRequests()) return
        updateSubmission(id, request.requestId, 'pending')
        onDispatch?.()
        try { await api.request('sendExternalTask', { conversationId: id, content: request.input.content, requestId: request.requestId }) }
        catch (failure) {
          updateSubmission(id, request.requestId, 'unknown')
          let receipt: Message | null | undefined
          try { receipt = await api.request('getExternalTaskReceipt', { conversationId: id, requestId: request.requestId }) } catch { /* Preserve the original identity while acceptance is unknown. */ }
          if (receipt) { await acceptMessage(id, request); return }
          if (receipt === null) updateSubmission(id, request.requestId, 'not_accepted')
          throw failure
        }
        await acceptMessage(id, request)
      })
      return
    }
    let submission = sent.submission
    if (submission?.status === 'pending') return
    if (!submission) {
      if (sent.materialEdit && (sent.questionReply || sent.artifactRevision || sent.materials?.length || sent.mentionIds.length || draftResourceReferences(sent).length || sent.browserReference || !artifactRevisionTarget(snapshot.agents.find(agent => agent.id === sent.materialEdit!.targetAgentId && conversation?.agentIds.includes(agent.id)), snapshot.connections))) { toast.error('请选择可执行的员工，并移除其他引用、材料和成员点名。'); return }
      const items = sent.materials ?? []
      if (!sentText && !items.length) return
      if (items.some(item => item.status !== 'ready' || item.material?.status !== 'ready' || item.busy)) { toast.error('请等待材料就绪；失败材料需要重试或移除后才能发送。'); return }
      if (items.reduce((total, item) => total + (item.material?.format === 'txt' || item.material?.format === 'markdown' ? item.material.characterCount ?? MATERIAL_LIMITS.messageCharacters + 1 : 0), 0) > MATERIAL_LIMITS.messageCharacters) { toast.error(`每条消息的材料正文最多 ${MATERIAL_LIMITS.messageCharacters} 字，请分批发送。`); return }
      if (items.length && sentText.length > MATERIAL_LIMITS.messageTextCharacters) { toast.error(`带材料消息的正文最多 ${MATERIAL_LIMITS.messageTextCharacters} 字，请拆分发送。`); return }
      submission = { requestId: crypto.randomUUID(), status: 'pending', fingerprint: draftFingerprint(sent), input: { ...(draftResourceReferences(sent).length ? { composerReferences: draftResourceReferences(sent) } : {}), ...(sent.channelReference ? { channelReference: sent.channelReference } : {}), ...(sent.browserReference ? {browserReference:{instanceId:sent.browserReference.instanceId,pageVersion:sent.browserReference.pageVersion}}:{}), ...(sent.materialEdit ? { materialReference: sent.materialEdit.reference } : {}), content: sent.materialEdit ? fileEditContent(sentText, sent.materialEdit.annotation) : sentText, mentionIds: sent.materialEdit ? [sent.materialEdit.targetAgentId] : [...sent.mentionIds], replyToMessageId: sent.replyId, materialSelections: items.length ? items.map(item => ({ id: item.material!.id, revision: item.material!.revision })) : undefined } }
      drafts.current.set(id, { ...sent, submission }); bumpDrafts()
      if (!persistMessageRequests()) { updateSubmission(id, submission.requestId, 'not_accepted'); return }
    }
    const request = submission
    void action(async () => {
      if (request.status === 'unknown') {
        const receipt = await api.request('getMessageReceipt', { requestId: request.requestId })
        if (receipt) await acceptMessage(id, request)
        else updateSubmission(id, request.requestId, 'not_accepted')
        return
      }
      if (request.status === 'not_accepted') {
        const receipt = await api.request('getMessageReceipt', { requestId: request.requestId })
        if (receipt) { await acceptMessage(id, request); return }
      }
      if (!persistMessageRequests()) return
      updateSubmission(id, request.requestId, 'pending')
      onDispatch?.()
      try { await api.request('sendMessage', { conversationId: id, requestId: request.requestId, ...request.input }) }
      catch (failure) {
        updateSubmission(id, request.requestId, 'unknown')
        let receipt: Message | null | undefined
        try { receipt = await api.request('getMessageReceipt', { requestId: request.requestId }) } catch { /* Preserve the frozen request while its receipt is unknown. */ }
        if (receipt) { await acceptMessage(id, request); return }
        if (receipt === null) updateSubmission(id, request.requestId, 'not_accepted')
        throw failure
      }
      await acceptMessage(id, request)
    })
  }
  const changeComposerAgent = async (agent: DigitalAgent, patch: ComposerAgentPatch): Promise<ComposerAgentSaveResult> => {
    if (!api || busyRef.current || dirtyRef.current || Object.values(tabDirty).some(Boolean)) return { status: 'not-submitted' }
    let result: ComposerAgentSaveResult = { status: 'not-submitted' }
    await action(async () => {
      result = { status: 'unconfirmed' }
      const savedAgent = await api.request('saveAgent', {
        id: agent.id, expectedConfigVersion: agent.configVersion, executionBackend: agent.executionBackend,
        avatar: agent.avatar, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color,
        nativeOptions: agent.nativeOptions, connectionId: agent.connectionId, modelId: agent.modelId, thinkingLevel: agent.thinkingLevel, skillIds: agent.skillIds,
        knowledgeIds: agent.knowledgeIds, allowCommands: agent.allowCommands, active: agent.active, ...patch,
      })
      result = { status: 'saved', agent: savedAgent }
      try { await refreshSnapshot() } catch (failure) { if (mounted.current) toast.error(`配置已保存，但资料刷新失败：${errorText(failure)}。请重新打开员工设置核对。`) }
    })
    return result
  }
  const onOpenPath = (path: string) => { if (!api) return; void action(async () => { await api.request('openPath', { path }) }) }
  const previewMaterial = (material: ConversationMaterial, line?: number, scope = 'conversations', current?: () => boolean, navigated?: () => void, withinKey?: string) => openPanel({ type: 'material', id: material.id, conversationId: material.conversationId, name: material.name, revision: material.revision, line, requestId: crypto.randomUUID() }, scope, current, navigated, withinKey)
  const previewArtifact = (artifact: Artifact, conversationId: string, scope: string = route.page, current?: () => boolean, navigated?: () => void, withinKey?: string) => {
    if (!artifact.id) { toast.error('本版成果尚无可核对身份，请刷新后重试。'); return }
    openPanel({ type: 'artifact', id: artifact.id, logicalArtifactId: artifact.logicalArtifactId ?? artifact.id, conversationId, name: artifact.name, contentHash: artifact.contentHash ?? '', contentVersion: artifact.contentVersion, requestId: crypto.randomUUID() }, scope, current, navigated, withinKey)
  }
  const searchSourceUnavailable = (target: ConversationSearchTarget) => {
    const key = readingSourceKey(target); setSourceChecks(values => ({ ...values, [key]: (values[key] ?? 0) + 1 }))
    if (target.kind === 'message' && selectedRef.current === target.conversationId) void refreshDetail(target.conversationId)
  }
  const openSearchTarget = async (target: ConversationSearchTarget, current: () => boolean, navigated: () => void, withinKey?: string) => {
    if (!api || !current()) return
    const originPage = routeRef.current.page
    const visible = () => mounted.current && current() && routeRef.current.page === originPage && snapshotRef.current.conversations.some(item => item.id === target.conversationId && !item.list?.hidden)
    let pending: Promise<void> | undefined
    navigate(() => {
      pending = (async () => {
        if (!visible()) return
        const checked = await api.request('resolveConversationSearchTarget', target)
        if (!visible()) return
        if (!sameSearchTarget(target, checked.target) || checked.status !== 'available') throw new Error(checked.reason ?? '原检索对象已不可用，请重新搜索。')
        const metadata = await api.request('getConversationMetadata', { id: target.conversationId })
        if (!visible()) return
        if (metadata.conversation.id !== target.conversationId || metadata.conversation.list?.hidden) throw new Error('原会话已从列表移除，请重新搜索。')
        if (target.kind === 'conversation' || target.kind === 'message') {
          applyRoute({ page: 'conversations', conversationId: target.conversationId, focusMessage: target.kind === 'message' ? { id: target.messageId, requestId: crypto.randomUUID() } : undefined }, true, navigated); return
        }
        if (target.kind === 'material') {
          const preview = await api.request('getMaterialPreview', { id: target.materialId, expectedRevision: target.revision })
          if (!visible()) return
          if (preview.material.conversationId !== target.conversationId || target.contentHash && preview.material.contentHash !== target.contentHash) throw new Error('原材料版本已变化，请重新搜索。')
          previewMaterial(preview.material, undefined, originPage, visible, navigated, withinKey); return
        }
        const preview = await api.request('getArtifactPreview', { id: target.artifactId, expectedHash: target.contentHash })
        if (!visible()) return
        if (preview.artifact.conversationId !== target.conversationId || target.logicalArtifactId && preview.artifact.logicalArtifactId !== target.logicalArtifactId || target.contentVersion !== undefined && preview.artifact.contentVersion !== target.contentVersion) throw new Error('原成果版本已变化，请重新搜索。')
        previewArtifact(preview.artifact, target.conversationId, originPage, visible, navigated, withinKey)
      })()
      void pending.catch(failure => { if (visible()) { searchSourceUnavailable(target); toast.error(errorText(failure)) } })
    })
    await pending
  }
  const openSearchResult = (result: ConversationSearchResult, current: () => boolean, navigated: () => void) => openSearchTarget(result.target, current, navigated)
  const openFileSource = (target: ConversationFileTarget, sourceCurrent: () => boolean = () => true, withinKey?: string) => {
    const token = ++sourceNavigationRequest.current, origin = routeRef.current
    const sourceEpoch = sourceNavigationEpochs.current.get(target.conversationId) ?? 0
    const current = () => mounted.current && sourceCurrent() && (sourceNavigationEpochs.current.get(target.conversationId) ?? 0) === sourceEpoch && snapshotRef.current.conversations.some(item => item.id === target.conversationId && !item.list?.hidden) && sourceNavigationRequest.current === token && routeRef.current.page === origin.page && routeRef.current.conversationId === origin.conversationId
    const source: ConversationSearchTarget = { kind: 'message', conversationId: target.conversationId, messageId: target.messageId }
    void openSearchTarget(source, current, () => {}, withinKey).catch(() => { /* Source errors are shown by the guarded navigation. */ })
  }
  const previewConversationFile = (row: ConversationFileItem, sourceCurrent: () => boolean = () => true, withinKey?: string) => {
    const token = ++sourceNavigationRequest.current, origin = routeRef.current
    const sourceEpoch = sourceNavigationEpochs.current.get(row.conversationId) ?? 0, originPanel = panelRef.current
    const current = () => mounted.current && sourceCurrent() && (sourceNavigationEpochs.current.get(row.conversationId) ?? 0) === sourceEpoch && sourceNavigationRequest.current === token && routeRef.current.page === origin.page && routeRef.current.conversationId === origin.conversationId && panelRef.current === originPanel
    const target: ConversationSearchTarget = row.kind === 'material'
      ? { kind: 'material', conversationId: row.conversationId, materialId: row.id, revision: row.revision ?? 0, contentHash: row.contentHash }
      : { kind: 'artifact', conversationId: row.conversationId, artifactId: row.id, logicalArtifactId: row.logicalArtifactId, contentHash: row.contentHash ?? '', contentVersion: row.contentVersion }
    void openSearchTarget(target, current, () => {}, withinKey).catch(() => { /* Preview failures invalidate the original source. */ })
  }
  const title = route.page === 'conversations' ? conversation?.title ?? '会话' : labels[route.page]
  const describePanel = (item: Panel) => {
    const title = item.type === 'workspace' ? '网页预览' : item.type === 'files' ? '文件' : item.type === 'tasks' ? '任务' : item.type === 'channel-discussion' ? '历史会话' : item.type === 'channel-publish' ? '发送到渠道' : item.type === 'channel-files' ? '渠道文件' : item.type === 'channels' ? '渠道会话' : item.type === 'artifact' ? '成果预览' : item.type === 'material' ? '材料原文' : item.type === 'skill-updates' ? '技能更新' : item.type === 'automation-editor' ? (item.id ? '编辑定时任务' : '新建定时任务') : item.type === 'agent' ? '数字员工' : item.type === 'group' ? (snapshot.conversations.some(room => room.id === item.id && isChannelConversation(room)) ? '渠道信息' : '群聊详情') : item.type === 'trace' || item.type === 'activity' || item.type === 'automation-occurrence' ? '执行过程' : item.type === 'source' ? '数据源详情' : item.type === 'local-skill' ? '技能详情' : item.type === 'resource' ? '资源详情' : item.type === 'marketplace' ? '商店详情' : '任务详情'
    const name = item.type === 'files' || item.type === 'tasks' ? `${item.owner === 'employee' ? snapshot.agents.find(agent => agent.id === item.id)?.name ?? '员工' : snapshot.conversations.find(room => room.id === item.id)?.title ?? '会话'} · ${title}` : item.type === 'channels' ? `${snapshot.agents.find(a => a.id === item.id)?.name ?? '员工'}的渠道` : item.type === 'artifact' || item.type === 'material' ? item.name : item.type === 'automation-editor' ? item.name : item.type === 'marketplace' || item.type === 'local-skill' || item.type === 'source' ? item.name : item.type === 'trace' ? '执行' : item.type === 'agent' ? snapshot.agents.find(a => a.id === item.id)?.name : item.type === 'group' ? snapshot.conversations.find(c => c.id === item.id)?.title : item.type === 'resource' ? snapshot.resources.find(r => r.id === item.id)?.name : undefined
    const context = item.type === 'agent' || item.type === 'artifact' || item.type === 'material' ? snapshot.conversations.find(c => c.id === item.conversationId)?.title : (item.type === 'activity' || item.type === 'trace') ? snapshot.conversations.find(c => c.id === item.id)?.title : undefined
    const sameType = detailTabs.tabs.filter(tab => tab.target.type === item.type && (item.type !== 'agent' || (tab.target.type === 'agent' && tab.target.id === item.id))).length > 1
    const label = `${name ?? title}${sameType && context ? ` · ${context}` : ''}`
    const Icon = item.type === 'channels' ? MessageCircle : item.type === 'skill-updates' ? RefreshCw : item.type === 'agent' ? Contact : item.type === 'group' ? Users : item.type === 'artifact' || item.type === 'material' || item.type === 'resource' || item.type === 'marketplace' || item.type === 'local-skill' || item.type === 'source' || item.type === 'files' ? FileText : item.type === 'trace' || item.type === 'activity' || item.type === 'automation-occurrence' || item.type === 'tasks' ? Workflow : Clock
    return { title, label, description: [title, name, context].filter(Boolean).join(' · '), icon: <Icon /> }
  }
  const panelTitle = panel ? describePanel(panel).title : '详情'
  const effectiveList = listShown
  const startListResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    setListResizing(true)
    const startX = event.clientX, initial = listWidth, target = event.currentTarget
    const move = (e: globalThis.PointerEvent) => setListWidth(Math.max(232, Math.min(360, initial + e.clientX - startX)))
    const end = () => { setListResizing(false); target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); target.removeEventListener('lostpointercapture', end) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end); target.addEventListener('lostpointercapture', end)
  }
  const resizeListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') setListWidth(DEFAULT_LIST_WIDTH)
    else setListWidth(width => Math.max(232, Math.min(360, width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10))))
  }
  const toggleDetails = () => {
    if (detailTabs.tabs.length) dispatchDetails({ type: 'visibility', shown: !detailTabs.shown })
    else if (conversation && route.page === 'conversations') openPanel(conversation.kind === 'group' || isChannelConversation(conversation) ? { type: 'group', id: conversation.id } : { type: 'agent', id: conversation.agentIds[0]!, conversationId: conversation.id })
    else if (route.page === 'schedules') openPanel({ type: 'schedule' })
  }
  const openSearch = () => { setSearchRequest({ requestId: crypto.randomUUID() }); setConversationSearchOpen(true) }
  const goBack = () => navigate(() => { if (historyIndex.current <= 0) return; historyIndex.current--; applyRoute(history.current[historyIndex.current]!, false) })
  const goForward = () => navigate(() => { if (historyIndex.current >= history.current.length - 1) return; historyIndex.current++; applyRoute(history.current[historyIndex.current]!, false) })
  const toggleList = () => setListShown(shown => !shown)
  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (!api || event.defaultPrevented || event.isComposing || event.repeat || shortcuts.store.getState().capturing || userMenuOpen.current || sharingProfile || leaving || creation) return
      const shortcutSnapshot = shortcuts.store.getState().snapshot
      if (!shortcutSnapshot) return
      const shortcut = matchShortcut(event, shortcutSnapshot)
      if (!shortcut) return
      if (event.composedPath().some(node => node instanceof HTMLElement && (node.matches('input, textarea, select, [role="textbox"], [role="combobox"], [aria-haspopup="listbox"], [data-slot="select-trigger"], [data-slot="combobox-trigger"]') || node.isContentEditable))) return
      const overlay = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-slot="select-content"], [data-slot="context-menu-content"]'
      if ([...document.querySelectorAll(overlay)].some(node => node.getClientRects().length > 0)) return
      if (shortcut === 'search') { event.preventDefault(); openSearch() }
      else if (shortcut === 'sidebar' && (route.page === 'conversations' || route.page === 'contacts' || route.page === 'schedules')) { event.preventDefault(); toggleList() }
      else if (shortcut === 'back' && historyIndex.current > 0) { event.preventDefault(); goBack() }
      else if (shortcut === 'forward' && historyIndex.current < history.current.length - 1) { event.preventDefault(); goForward() }
    }
    document.addEventListener('keydown', onShortcut)
    return () => document.removeEventListener('keydown', onShortcut)
  })
  const listResizer = <div className="resize-handle list-resizer" role="separator" tabIndex={0} aria-label={`调整${labels[route.page]}${route.page === 'settings' ? '分类' : '列表'}宽度`} aria-orientation="vertical" aria-valuemin={232} aria-valuemax={360} aria-valuenow={listWidth} onPointerDown={startListResize} onDoubleClick={() => setListWidth(DEFAULT_LIST_WIDTH)} onKeyDown={resizeListKey} />
  const renderChat = (window: Omit<ChannelChatWindow, 'detail'> & Pick<ChatViewProps, 'detail' | 'conversation' | 'loading' | 'onRetry'>, scope = 'conversations', withinKey?: string, headerActions?: ReactNode) => {
    const source = window.conversation ?? window.detail?.conversation
    if (!source) return null
    const room = snapshot.conversations.find(room => room.id === source.id) ?? source
    const showPanel = (target: Panel) => openPanel(target, scope, undefined, undefined, withinKey)
    const id = room.id, channel = isChannelConversation(room), internal = room.purpose === 'channel-internal'
    const owner = room.kind === 'group' || !room.agentIds[0] ? 'conversation' as const : 'employee' as const
    const ownerId = owner === 'employee' ? room.agentIds[0]! : id
    return <FloatingLayerScope active={window.pageActive}><ChatView {...window} headerActions={headerActions} api={api!} snapshot={snapshot}
      onPublish={channel ? message => {
        if (!message) return
        void action(async () => {
          const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([message.id, message.conversationId, message.content, message.status])))
          const contentHash = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
          await api!.request('publishChannelReply', { conversationId: id, messageId: message.id, contentHash, requestId: `channel-reply:${message.id}:${contentHash}` })
          await refreshSnapshot()
        })
      } : undefined} onFiles={() => showPanel(channel || internal ? { type: 'channel-files', id } : { type: 'files', owner, id: ownerId })}
      onTasks={!channel && !internal ? () => showPanel({ type: 'tasks', owner, id: ownerId }) : undefined}
      onChannels={room.kind === 'direct' && !channel && !internal ? () => { const agent = snapshot.agents.find(agent => agent.id === room.agentIds[0]); if (agent) openChannels(agent) } : undefined}
      questionReplies={questionReplies} artifactActions={artifactActions}
      onOpenCatalog={openCatalogResult} onTeamGroup={id => selectConversation(id, true)} draft={drafts.current.get(id) ?? EMPTY_DRAFT} setDraft={value => { drafts.current.set(id, value); bumpDrafts() }} busy={busy || questionReplies.busy} onSend={onDispatch => send(id, onDispatch)}
      onDetails={() => {
        if (channel) { showPanel({ type: 'group', id }); return }
        openContact(room.kind === 'group' ? { kind: 'group', id } : { kind: 'agent', id: room.agentIds[0]! })
      }}
      onManageModels={agent => openContact(room.kind === 'group' && !channel ? { kind: 'group', id } : { kind: 'agent', id: agent.id })}
      onConfigureAgent={agent => openContact({ kind: 'agent', id: agent.id })} onProfile={openUserProfile}
      onEditTitle={setEditingTitle} onClear={clearConversationHistory}
      onTrace={message => showPanel(message?.automationPublication ? { type: 'automation-occurrence', id: message.automationPublication.occurrenceId } : { type: 'trace', requestId: crypto.randomUUID(), id, messageId: message?.id, turnId: message?.turnId, agentId: message?.senderType === 'agent' ? message.senderId : undefined })}
      onSettings={agent => { const originPanel = panelRef.current; openModelSettings(agent, () => !isChannelConversation(room) || panelRef.current === originPanel) }} onChangeAgent={changeComposerAgent} configurationLocked={anyDirty}
      onApprove={(approvalId, approved, always, allowSameKind) => { void action(async () => {
        try { await api!.request('approve', { id: approvalId, approved, always, allowSameKind }) }
        catch (error) {
          if (!snapshot.approvals.some(approval => approval.id === approvalId && (approval.kind === 'directory' || approval.commandDirectories?.length))) throw error
          const receipt = await api!.request('getDirectoryApprovalReceipt', { id: approvalId }).catch(() => null)
          if (receipt?.choice !== (!approved ? 'deny' : always ? 'employee' : 'run') || Boolean(receipt?.allowSameKind) !== Boolean(allowSameKind)) throw error
        }
        await refreshSnapshot(); if (selectedRef.current) await refreshDetail(selectedRef.current)
      }) }}
      onOpenPath={onOpenPath} onPreviewArtifact={artifact => previewArtifact(artifact, artifact.conversationId ?? id, scope, undefined, undefined, withinKey)} onAddMaterial={() => { void materialDrafts.choose(id) }} onDropMaterials={files => { void materialDrafts.drop(id, files) }} onPasteMaterials={files => { void materialDrafts.paste(id, files) }}
      onRemoveMaterial={item => { void materialDrafts.remove(id, item) }} onRetryMaterial={item => { void materialDrafts.retry(id, item) }} onPreviewMaterial={(material, line) => previewMaterial(material, line, scope, undefined, undefined, withinKey)} onKnowledgePreview={(citation, reference, agentId) => dispatchDetails({ type: 'open', withinKey, target: { type: 'resource', id: reference.resourceId, agentId, citation: { ...citation, requestId: crypto.randomUUID() } } }, scope)} onDiscardSubmission={() => clearUnacceptedSubmission(id)} /></FloatingLayerScope>
  }
  if (!api) return <div className="unavailable-page"><MessageCircle size={34}/><h1>请在桌面应用打开</h1><p>当前浏览器没有本地运行接口，无法访问员工、文件或模型。</p></div>
  const headerActions = <><HeaderBrowser api={api} /><Dialog open={conversationSearchOpen} onOpenChange={setConversationSearchOpen}>
    <DialogTrigger render={<Button className="titlebar-no-drag" variant="ghost" size="icon-sm" aria-label="搜索会话内容" title="搜索" />} onClick={openSearch}><Search /></DialogTrigger>
    <ConversationSearch api={api} active={conversationSearchOpen} snapshot={snapshot} selectedId={selectedId} request={searchRequest} onOpen={(result, current) => openSearchResult(result, current, () => setConversationSearchOpen(false))} onUnavailable={searchSourceUnavailable} />
  </Dialog></>
  return <GuardContext.Provider value={guard}><ScheduleNavigationContext.Provider value={id => { setScheduleLocation({ kind: 'definition', id }); applyRoute({ ...routeRef.current, page: 'schedules' }) }}><EmployeeResourceNavigation.Provider value={target => target.kind === 'web-search-settings' ? (() => { setSettingsSection('web-search'); applyRoute({ ...routeRef.current, page: 'settings' }) })() : target.kind === 'knowledge-files' ? openPanel({ type: 'files', owner: 'employee', id: target.id, view: 'knowledge', requestId: crypto.randomUUID() }) : openCatalogResult(target.kind, target.id, target.name)}><EmployeeExecutionNavigation.Provider value={target => openPanel({ type: 'trace', id: target.conversationId, agentId: target.agentId, runId: target.runId, title: target.title })}><Tabs value={detailTabs.activeKey} onValueChange={value => { if (typeof value === 'string') dispatchDetails({ type: 'select', key: value }) }} className={`app-shell gap-0${effectiveList ? ' list-open' : ''}${skillsNavigation ? ' skills-navigation' : ''}`} data-page={route.page} data-panel-resizing={listResizing || detailLayout.resizing} style={{'--list-width':`${listWidth}px`,'--detail-width':`${detailLayout.width}px`} as CSSProperties}>
    <DesktopToolbar title={title} browserAction={headerActions} detailHeader={panel && <DetailPanelHeader focusOnMount={!route.focusMessage && !route.focusApproval} tabs={detailTabs.tabs.map(tab => ({ key: tab.key, ...describePanel(tab.target), dirty: Boolean(tabDirty[tab.key]) }))} activeKey={detailTabs.activeKey} onClose={requestCloseTab} onMove={(key, targetKey, placement) => dispatchDetails({ type: 'move', key, targetKey, placement })} />} showListToggle={route.page === 'conversations' || route.page === 'contacts' || route.page === 'schedules'} listLabel={route.page === 'conversations' ? '显示或隐藏会话列表' : route.page === 'contacts' ? '显示或隐藏通讯录列表' : '显示或隐藏任务列表'} listShown={listShown} detailOpen={Boolean(panel)} canBack={historyIndex.current > 0} canForward={historyIndex.current < history.current.length - 1} detailDisabled={!detailTabs.tabs.length && !(conversation && route.page === 'conversations') && route.page !== 'schedules'} onBack={goBack} onForward={goForward} onToggleList={toggleList} onToggleDetails={toggleDetails} />
    <div className="app-body"><nav className="navigation-rail" aria-label="主导航"><div className="rail-top">{([
      {page:'conversations',icon:Home,label:'会话'},
      {page:'contacts',icon:Contact,label:'通讯录'},
      // 看板已移除，暂时隐藏任务入口。
      // {page:'tasks',icon:Workflow,label:'任务'},
      {page:'schedules',icon:Clock,label:'定时任务'},
    ] as const).map(item=><Button variant="ghost" size="content" className={`rail-item${route.page===item.page?' selected':''}`} key={item.page} aria-label={item.label} title={item.label} aria-current={route.page===item.page?'page':undefined} onClick={()=>goPage(item.page)}><item.icon size={16}/>{item.page==='conversations'&&snapshot.approvals.length>0&&<i className="attention-dot"/>}</Button>)}<SkillsNavigation page={route.page} onSkills={()=>goPage('skills')} /></div><div className="rail-bottom"><DropdownMenu actionsRef={userMenuActions} onOpenChange={open => { userMenuOpen.current = open }}>
      <DropdownMenuTrigger render={<Button ref={userMenuButton} variant={route.page === 'settings' ? 'secondary' : 'ghost'} size="icon-lg" className="rail-item" aria-label="我的菜单" title="我" />}><UserAvatar profile={snapshot.userProfile} /></DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-[224px] data-open:duration-250 data-closed:duration-150 motion-reduce:animate-none">
        <DropdownMenuItem className="user-menu-profile" aria-label="个人资料" onClick={openUserProfile}><UserAvatar profile={snapshot.userProfile} /><span><strong>{snapshot.userProfile?.displayName ?? '我'}</strong>{snapshot.userProfile?.username && <small>@{snapshot.userProfile.username}</small>}</span></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => { userMenuActions.current?.close(); setSharingProfile(true) }}><Share />分享</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(() => { setSettingsSection('connections'); applyRoute({ ...route, page: 'settings' }) })}><Settings />设置</DropdownMenuItem>
          <DropdownMenuItem onClick={() => goPage('help')}><CircleHelp />帮助</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu></div></nav>
    <div className={`content-frame${panel?' detail-open':''}${effectiveList?' list-open':''}`}>
      <div className="content-main">{messageStorageError && <Banner>{messageStorageError}</Banner>}{artifactStorageError&&<Banner onClose={()=>setArtifactStorageError('')}>{artifactStorageError}</Banner>}
      {<FloatingLayerScope active={route.page === 'conversations'}><div className="conversation-layout" style={{ display: route.page === 'conversations' ? undefined : 'none' }}><PanelResize open={effectiveList} side="left" divider={listResizer}><aside className="conversation-list-container"><ConversationList onConfigureAgent={agent => openContact({ kind: 'agent', id: agent.id })} onOpenChannels={openChannels} snapshot={snapshot} selectedId={selectedId} previews={previews} messageTimes={messageTimes} drafts={drafts.current} onCreateCore={createCoreConversation} onConfigureCore={() => { const core = snapshot.agents.find(isCoreAgent); if (core) openContact({ kind: 'agent', id: core.id }) }} onSelect={selectConversation} onChange={changeConversationList} onEditTitle={setEditingTitle} onClear={clearConversationHistory} busy={busy} onCreate={type=>openCreation({type})}/></aside></PanelResize>
        <div className="conversation-stage">{route.coreDraft?<CoreChatStart api={api} snapshot={snapshot} draft={draft} setDraft={setDraft} busy={busy} onSend={send} onSettings={openModelSettings} onConfigureAgent={agent => openContact({ kind: 'agent', id: agent.id })} onChangeAgent={changeComposerAgent} configurationLocked={anyDirty}/>:conversation?renderChat({ detail: currentDetail, conversation, loading: !currentDetail && (loading || detailLoading), onRetry: () => { setDetailLoading(true); void refreshDetail(conversation.id) }, pageActive: route.page === 'conversations' && !conversationSearchOpen,
          onReading: updateReading, onLocation: (messageId, following, offset) => { const id = conversation.id; viewLocations.current.set(id, { initialized: true, messageId: following ? undefined : messageId, offset, focusRequestId: viewLocations.current.get(id)?.focusRequestId }) },
          onPage: direction => void loadMessagePage(direction), onLatest: isCurrent => showLatestMessages(conversation.id, isCurrent), paging, pageEdges, restoreAnchor: viewLocations.current.get(conversation.id)?.messageId ? { messageId: viewLocations.current.get(conversation.id)!.messageId!, offset: viewLocations.current.get(conversation.id)?.offset } : undefined,
          focusMessage: route.focusMessage, focusApproval: route.focusApproval, scrollPosition: scrollPositions.current.get(conversation.id), onScrollPosition: position => scrollPositions.current.set(conversation.id, position),
         }):loading||detailLoading?<Loading>正在载入工作空间…</Loading>:<IllustratedEmpty kind="conversations" />}</div>
      </div></FloatingLayerScope>}
      <TasksPage active={route.page === 'tasks'} />
      {route.page==='contacts'&&<ContactsPage onConversation={(id, messageId) => selectConversation(id, true, messageId)} active={route.page === 'contacts'} onCreateTeam={() => openCreation({ type: 'team' })} api={api} snapshot={snapshot} selected={contactSelection} onSelect={setContactSelection} onMessage={messageContact} onCreate={type=>openCreation({type})} refresh={refreshSnapshot} onAgentSaved={updateAgentSnapshot} onGroupSaved={updateGroupSnapshot} sidebarShown={effectiveList} divider={listResizer} generation={panelGeneration} busy={busy}/>}
      {route.page==='skills'&&<CustomizationWorkspace onRemoveSource={id => { for (const tab of detailTabs.tabs) if (tab.target.type === 'source' && tab.target.id === id) dispatchDetails({ type: 'close', key: tab.key }) }} focusSource={focusedSource} selectedSource={panel?.type === 'source' ? panel.id : undefined} onOpenSource={source => openPanel({ type: 'source', id: source.id, name: source.name, requestId: crypto.randomUUID() })} onManage={openCatalogManagement} onOpenSkill={skill => openPanel({ type: 'local-skill', id: skill.id, name: skill.name, requestId: crypto.randomUUID() })} onOpenMarketplace={item => openPanel({ type: 'marketplace', provider: item.provider, id: item.id, name: item.name })} api={api} section={skillsSection} onSection={setSkillsSection} provider={skillProvider} onProvider={setSkillProvider} divider={listResizer} onCheckUpdates={()=>openPanel({type:'skill-updates'})} focusSkill={focusedSkill} revision={skillsRevision} />}
      <SchedulePage onNavigateMessage={(id, messageId, current) => selectConversation(id, true, messageId, current)} api={api} snapshot={snapshot} active={route.page==='schedules'} sidebarShown={effectiveList} divider={listResizer} location={scheduleLocation} onLocation={setScheduleLocation} onCreateConversation={() => openCatalogManagement('automations')} onInfo={()=>openPanel({type:'schedule'})} selectedOccurrenceId={panel?.type === 'automation-occurrence' ? panel.id : undefined} onOccurrence={id => openPanel({ type: 'automation-occurrence', id }, 'schedules')}/>
      {settingsMounted.current && <div style={{ display: route.page === 'settings' ? 'contents' : 'none' }}><SettingsPage key={panelGeneration} divider={listResizer} tab={settingsSection} setTab={tab => { setLocalAgentTarget(undefined); setSettingsSection(tab) }} localAgentTarget={localAgentTarget} active={route.page === 'settings'} onOpenSkills={() => navigate(() => { setFocusedSource(undefined); setFocusedSkill(undefined); setSkillsSection('all'); applyRoute({ ...routeRef.current, page: 'skills' }) })} api={api} snapshot={snapshot} refresh={refreshSnapshot}/></div>}
      {route.page==='help'&&<HelpPage/>}
      </div>
      <DetailPanel title={panelTitle} hidden={!panel} layout={detailLayout}>
        {/* Keep content DOM order stable when only the header tabs move. */}
        {[...allDetailTabs].sort((a, b) => a.key.localeCompare(b.key)).map(tab => {
          const root = tab.target, target = tab.detail ?? root, active = tab.scope === route.page && detailTabs.shown && tab.key === detailTabs.activeKey
          const withinKey = root.type === 'channels' ? tab.key : undefined
          const showPanel = (next: Panel) => openPanel(next, tab.scope, undefined, undefined, withinKey)
          const closeView = () => withinKey ? dispatchDetails({ type: 'back', key: tab.key }, tab.scope) : closeTab(tab.key, tab.scope)
          const fileRoom = target.type === 'artifact' ? snapshot.conversations.find(room => room.id === target.conversationId) : undefined
          const fileChannelId = fileRoom?.channel ? fileRoom.id : fileRoom?.channelDiscussion?.conversationId
          const targetRoom = target.type === 'group' ? snapshot.conversations.find(room => room.id === target.id) : undefined
          const content = <>
            {target.type === 'workspace' && target.view === 'preview' && <WorkspacePanel api={api} active={active} scope={{ employeeId: target.employeeId, conversationId: target.id }} />}
            {target.type === 'channel-publish' && <ChannelPublishPanel key={target.requestId} api={api} snapshot={snapshot} target={target} active={active} onBack={() => closeView()} />}
            {(target.type === 'files' || target.type === 'tasks') && <div className="conversation-panel-content">
              {target.type === 'tasks' ? <TasksPlaceholder /> : <ConversationFiles api={api} snapshot={snapshot} active={active} {...(target.owner === 'employee' ? { ownerAgentId: target.id, viewRequest: target.requestId ? { view: target.view ?? 'files', id: target.requestId } : undefined } : { conversationId: target.id })} onKnowledgePreview={resource => showPanel({ type: 'resource', id: resource.id, agentId: target.owner === 'employee' ? target.id : undefined })} onPreview={(row, current) => previewConversationFile(row, current, withinKey)} onNavigate={(source, current) => openFileSource(source, current, withinKey)} />}
            </div>}
            {target.type === 'channel-files' && <ConversationFiles api={api} snapshot={snapshot} active={active} conversationId={target.id} onPreview={(row, current) => previewConversationFile(row, current, withinKey)} onNavigate={(source, current) => openFileSource(source, current, withinKey)} />}
            {target.type === 'channel-discussion' && snapshot.agents.find(agent => agent.id === target.agentId) && <ChannelsTab internal api={api} agent={snapshot.agents.find(agent => agent.id === target.agentId)!} target={{ type: 'channels', id: target.agentId, conversationId: target.id, requestId: target.requestId, focusMessage: target.focusMessage }} active={active} chatActive={!conversationSearchOpen} onMaterials={materialDrafts.reconcile}
              listProps={{ snapshot, selectedId: target.id, previews, messageTimes, drafts: drafts.current, busy, onSelect: () => {}, onChange: changeConversationList, onClear: clearConversationHistory, onEditTitle: setEditingTitle, onCreate: type => openCreation({ type }), onCreateCore: createCoreConversation, onConfigureCore: () => {} }}
              renderChat={window => renderChat(window, tab.scope, withinKey)} />}
            {target.type === 'agent' && (snapshot.agents.find(a => a.id === target.id) ? <EmployeeDetail onConversation={(id, messageId) => selectConversation(id, true, messageId)} api={api} snapshot={snapshot} agent={snapshot.agents.find(a => a.id === target.id)!} conversationId={target.conversationId} configurationRequest={target.configurationRequest} active={active} scope={tab.scope} refresh={refreshSnapshot} onClose={() => closeView()} /> : <p className="empty-note">该员工已不存在。</p>)}
            {target.type === 'group' && (targetRoom ? isChannelConversation(targetRoom) ? <ChannelConversationInfo conversation={targetRoom} snapshot={snapshot} onOpenAgent={id => showPanel({ type: 'agent', id, conversationId: target.id })} /> : <GroupEditor active={active} onConversation={(id, messageId) => selectConversation(id, true, messageId)} api={api} snapshot={snapshot} conversation={snapshot.conversations.find(c => c.id === target.id)} onOpenAgent={id => showPanel({ type: 'agent', id, conversationId: target.id })} onClose={() => closeView()} onSaved={async result => { await refreshSnapshot(); if (selectedRef.current === result.id) await refreshDetail(result.id) }} onDeleted={refreshSnapshot} /> : <p className="empty-note">该群聊已解散。</p>)}
            {target.type === 'artifact' && <ArtifactTab onPublish={fileChannelId ? artifact => showPanel({ type: 'channel-publish', id: fileChannelId, artifact: { id: artifact.id, conversationId: artifact.conversationId, contentHash: artifact.contentHash, name: artifact.name }, requestId: crypto.randomUUID() }) : undefined} sourceRevision={sourceChecks[readingSourceKey({ kind: 'artifact', conversationId: target.conversationId, artifactId: target.id })] ?? 0} api={api} conversationId={target.conversationId} id={target.id} logicalArtifactId={target.logicalArtifactId} contentHash={target.contentHash} expectedContentVersion={target.contentVersion} requestId={target.requestId} active={active} snapshot={snapshot} onVersion={artifact => previewArtifact(artifact, artifact.conversationId ?? target.conversationId, tab.scope, undefined, undefined, withinKey)} onPreviewMaterial={(material, line) => previewMaterial(material, line, tab.scope, undefined, undefined, withinKey)} onMessage={messageId => selectConversation(target.conversationId, true, messageId)} onExecution={artifact => showPanel({ type: 'trace', id: artifact.conversationId, messageId: artifact.sourceMessageId, agentId: artifact.ownerAgentId, requestId: crypto.randomUUID() })} onOpenPath={onOpenPath} />}
            {target.type === 'material' && <MaterialTab snapshot={snapshot} onResult={artifact => previewArtifact(artifact, artifact.conversationId ?? target.conversationId, tab.scope, undefined, undefined, withinKey)} sourceRevision={sourceChecks[readingSourceKey({ kind: 'material', conversationId: target.conversationId, materialId: target.id, revision: target.revision })] ?? 0} api={api} conversationId={target.conversationId} id={target.id} revision={target.revision} active={active} line={target.line} requestId={target.requestId} />}
            {(target.type === 'trace' || target.type === 'activity') && <TraceTab key={target.type === 'trace' && target.runId ? target.runId : target.id} runId={target.type === 'trace' ? target.runId : undefined} title={target.type === 'trace' ? target.title : undefined} onNavigateMessage={(id, messageId, current) => selectConversation(id, true, messageId, current)} api={api} conversationId={target.id} messageId={target.type === 'trace' ? target.messageId : undefined} agentId={target.type === 'trace' ? target.agentId : undefined} active={active} snapshot={snapshot} busy={busy} onStop={runId => { void action(async () => { await api.request('cancelRun', { conversationId: target.id, runId }); if (selectedRef.current === target.id) await refreshDetail(target.id) }) }} onRetry={id => { void action(async () => { await api.request('retryRun', { id, requestId: crypto.randomUUID() }); if (selectedRef.current === target.id) await refreshDetail(target.id) }) }} />}
            {target.type === 'resource' && (target.citation ? <KnowledgeCitationPane api={api} active={active} target={target.citation} /> : target.agentId && !snapshot.agents.find(agent => agent.id === target.agentId)?.knowledgeIds.includes(target.id) ? <p className="empty-note">该员工已移除此资料。</p> : snapshot.resources.find(r => r.id === target.id) ? snapshot.resources.find(r => r.id === target.id)?.knowledge || target.agentId ? <KnowledgePreviewPane api={api} resource={snapshot.resources.find(r => r.id === target.id)!} active={active} agentId={target.agentId} /> : <ResourceDetail api={api} resource={snapshot.resources.find(r => r.id === target.id)!} snapshot={snapshot} refresh={refreshSnapshot} onRemoved={() => closeView()} onAgent={agent => showPanel({ type: 'agent', id: agent.id })} /> : <p className="empty-note">该资源已被移除。</p>)}
            {target.type === 'source' && <SourceDetailPanel api={api} id={target.id} name={target.name} requestId={target.requestId} active={active} onManage={item => openCatalogManagement('sources', item)} onRemoved={closeView} />}
            {target.type === 'local-skill' && <LocalSkillPanel api={api} id={target.id} requestId={target.requestId} revision={skillsRevision} active={active} onUpdated={skillUpdated} />}
            {target.type === 'marketplace' && <SkillMarketplaceDetail active={active} api={api} provider={target.provider} id={target.id} refresh={async () => { await refreshSnapshot(); skillUpdated() }} onResource={openLocalSkill} />}
            {target.type === 'skill-updates' && <div className="detail-section"><SkillUpdateBatchView api={api} active={active} autoStart localOnly onUpdated={skillUpdated} onResource={openLocalSkill} /></div>}
            {target.type === 'automation-occurrence' && <AutomationOccurrenceView onNavigateMessage={(id, messageId, current) => selectConversation(id, true, messageId, current)} api={api} snapshot={snapshot} id={target.id} active={active} />}
            {target.type === 'schedule' && <ScheduleDetail />}
            {target.type === 'automation-editor' && <AutomationEditorTab api={api} snapshot={snapshot} id={target.id} mode={target.mode} onClose={() => closeView()} onSaved={(value, created) => { setScheduleLocation({ kind: 'definition', id: value.id }); if (created) closeView(); else showPanel({ type: 'automation-editor', id: value.id, name: value.name }) }} />}
          </>
          return <DetailTabSession key={tab.key} tabKey={tab.key} active={active} ref={handle => { if (handle) tabHandles.current.set(tab.key, handle); else tabHandles.current.delete(tab.key) }} onClose={() => closeTab(tab.key, tab.scope)} onDirty={onTabDirty}>
            {root.type === 'channels' && (snapshot.agents.find(agent => agent.id === root.id) ? <ChannelsTab api={api} agent={snapshot.agents.find(agent => agent.id === root.id)!} target={root} active={active && !tab.detail} chatActive={!conversationSearchOpen} onMaterials={materialDrafts.reconcile}
              listProps={{ snapshot, selectedId: root.conversationId ?? null, previews, messageTimes, drafts: drafts.current, busy,
                onSelect: id => { openPanel({ ...root, conversationId: id, requestId: crypto.randomUUID(), focusMessage: undefined, focusApproval: undefined }, tab.scope) },
                onChange: changeConversationList, onClear: clearConversationHistory, onEditTitle: setEditingTitle, onCreate: type => openCreation({ type }), onCreateCore: createCoreConversation, onConfigureCore: () => {},
              }} renderChat={(window, headerActions) => renderChat(window, tab.scope, tab.key, headerActions)} /> : <p className="empty-note">该员工已不存在。</p>)}
            {tab.detail ? <div className="channel-detail-view" key={detailTargetKey(target)}>
              <header className="channel-detail-header"><Button variant="ghost" size="icon-sm" aria-label="返回渠道聊天" onClick={() => tabHandles.current.get(tab.key)?.navigate(closeView)}><ArrowLeft /></Button><h2>{describePanel(target).title}</h2></header>
              <div className="channel-detail-body">{content}</div>
            </div> : content}
          </DetailTabSession>
        })}
      </DetailPanel>
      <GatewayImportDialog api={api} />
      {editingTitle && <ConversationTitleDialog conversation={editingTitle} busy={busy} onSave={saveConversationTitle} onClose={() => setEditingTitle(null)} />}
      {creation?.type==='agent'&&<CreateAgentDialog key={`agent-${panelGeneration}`} api={api} snapshot={snapshot} template={creation.template} onClose={()=>setCreation(null)} onCreated={createdConversation}/>}
      {creation?.type==='group'&&<CreateGroupDialog key={`group-${panelGeneration}`} api={api} snapshot={snapshot} onClose={()=>setCreation(null)} onCreated={createdConversation}/>}
      <TeamCreator open={creation?.type==='team'} api={api} snapshot={snapshot} onOpenChange={open=>{if(!open)setCreation(null)}} onStarted={coreConversationStarted} onConfigure={()=>{setSettingsSection('connections');goPage('settings')}}/>
      {sharingProfile && <ProfileShare api={api} profile={snapshot.userProfile} onClose={() => setSharingProfile(false)} finalFocus={userMenuButton} />}
      {confirmation}
    </div></div>
  </Tabs></EmployeeExecutionNavigation.Provider></EmployeeResourceNavigation.Provider></ScheduleNavigationContext.Provider></GuardContext.Provider>
}
