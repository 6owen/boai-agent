/*
 * [INPUT]: Original task-session dispatches waiting to execute.
 * [OUTPUT]: Task-conversation-scoped queue projection and revision-aware remove/send-now actions.
 * [POS]: Composer queue contract; task status and internal Agent todos remain independent.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
export interface ConversationQueueItem {
  id: string
  conversationId: string
  revision: number
  content: string
  createdAt: string
  attachmentCount: number
}
export interface ConversationQueueAction {
  conversationId: string
  id: string
  expectedRevision: number
  action: 'remove' | 'send-now'
  requestId: string
}
export interface MessageQueueMethods {
  listConversationQueue: { input: { conversationId: string }; output: { items: ConversationQueueItem[] } }
  actOnConversationQueue: { input: ConversationQueueAction; output: { accepted: true } }
}
