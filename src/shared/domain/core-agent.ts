/*
 * [OUTPUT]: 核心首发可显式标记sourceCreation，复用原受理回执而不授予普通聊天创建工具。
 * [OUTPUT]: 定时任务页可明确创建专用bobo计划会话；原核心首发回执保持。
 * [OUTPUT]: 核心首发携带固定技能引用，与普通消息共用宿主绑定核验。
 * [INPUT]: 员工和会话的稳定产品身份。
 * [OUTPUT]: 核心会话非空首发或具名团队请求合同、团队名称/需求上限；预置核心 Agent 的固定 ID、默认姓名与宿主身份判断；显示名称不作为权限依据。
 * [POS]: shared/domain 核心 Agent 纯身份合同，记忆仍复用员工统一记忆。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Conversation, DigitalAgent } from './index'

export const CORE_AGENT_ID = 'bobo'
export const CORE_AGENT_DEFAULT_NAME = 'bobo'
export const CORE_TEAM_NAME_MAX_LENGTH = 80
export const CORE_TEAM_REQUIREMENTS_MAX_LENGTH = 4000

export type StartCoreConversationInput =
  | { requestId: string; content: string; automationCreation?: boolean; sourceCreation?: boolean; composerReferences?: import('./composer-references').ComposerReference[]; team?: never }
  | { requestId: string; team: { name: string; requirements: string }; content?: never; composerReferences?: never }

export function isCoreAgent(agent: Pick<DigitalAgent, 'id' | 'systemRole'> | undefined): boolean {
  return agent?.id === CORE_AGENT_ID && agent.systemRole === 'core'
}

export function isCoreConversation(conversation: Pick<Conversation, 'purpose'>): boolean {
  return conversation.purpose === 'core'
}
