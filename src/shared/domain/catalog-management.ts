/*
 * [INPUT]: bobo普通会话中的实际目录操作回执。
 * [OUTPUT]: 可核对目标身份的结果卡，不保存配置或凭据。
 * [POS]: 技能/数据源管理的聊天导航合同。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
export interface CatalogActivity {
  id: string; conversationId: string; messageId: string
  kind: 'skill' | 'source'; action: string; createdAt: string
  targetId?: string; name: string; operationId?: string; removed?: boolean
}
export interface CatalogResult extends CatalogActivity { status?: string; available: boolean }
