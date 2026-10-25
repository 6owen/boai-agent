/*
 * [OUTPUT]: 只读 builtin 来源与共享/插件来源分开，员工绑定仍使用原 local 身份。
 * [INPUT]: 受管技能、用户收藏、扫描计划、已保存员工和管理操作。
 * [OUTPUT]: 本机来源/hash 与员工版本冻结的单技能绑定计划，原子绑定结果和只读请求回执；本机来源身份与运行副本独立。
 * [OUTPUT]: 冻结 ZIP 的实际相对文件路径/类型/大小清单供二级导出预览；外部 CLI 来源的未知内容基线标识； 本地安装目标与员工资源隔离；本机身份与受管 ID 共用原版技能库导出预览；本机技能发现与详情、独立收藏标识、前后排序与原子跨组移动；多来源安装/更新、便携库/收藏恢复及持久操作合同。
 * [POS]: shared/domain/skills.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Resource } from './index'
import type { SkillMarketplaceProvider } from './skill-marketplace'

export type SkillSource =
  | { kind: 'local'; identity: string; reason?: string }
  | { kind: 'snapshot'; identity: string; reason?: string }
  | { kind: 'url'; identity: string; url: string; skillPath: string }
  | { kind: 'git'; identity: string; repository: string; ref: string; skillPath: string; resolvedCommit?: string }
  | { kind: 'marketplace'; identity: string; provider: SkillMarketplaceProvider; providerItemId: string; skillPath: string; resolvedCommit?: string }
export interface ScanSkillSourceInput {
  source: string
  kind?: 'folder' | 'zip' | 'url' | 'github' | 'marketplace'
  target?: 'local'
  ownerAgentId?: string
  requestId?: string
  provider?: SkillMarketplaceProvider
  ref?: string
  subpath?: string
}

export interface SkillCollections {
  revision: number
  /** 按用户顺序持久化；每个分组按此顺序投影。 */
  favoriteResourceIds: string[]
  groups: { id: string; name: string }[]
  groupByResourceId: Record<string, string>
}
export type SkillCollectionAction =
  | { kind: 'favorite'; resourceId: string; favorite: boolean }
  | { kind: 'create-group'; name: string }
  | { kind: 'rename-group'; groupId: string; name: string }
  | { kind: 'delete-group'; groupId: string }
  | { kind: 'move-group'; groupId: string; targetId: string; placement?: 'before' | 'after' }
  | { kind: 'move-skill'; resourceId: string; targetId: string; placement: 'before' | 'after' }
  | { kind: 'assign-group'; resourceId: string; groupId?: string }
export interface SkillInstallation {
  resourceId: string
  revision: number
  source: SkillSource
  contentHash: string
  /** 旧 CLI 记录未保存可比较的安装内容，替换前必须确认。 */
  baselineUnknown?: boolean
  installedAt: string
  updatedAt?: string
  /** 显式本机绑定的发现身份；不能按名称或上游来源推断同一副本。 */
  localSkillId?: string
}
export interface SkillUpdateCheck {
  resourceId: string
  checkedAt: string
  status: 'current' | 'available' | 'unsupported' | 'failed'
  error?: string
  planId?: string
  candidateId?: string
  expectedRevision?: number
  expectedHash?: string
  candidateHash?: string
  source?: SkillSource
  currentSource?: SkillSource
  localModified?: boolean
  baselineUnknown?: boolean
  affectedEmployees?: { id: string; name: string }[]
  fileChanges?: { added: string[]; removed: string[]; modified: string[]; unchanged: number }
}
export interface UpdateSkillInput { requestId: string; planId: string; expectedRevision: number; expectedHash: string; replaceLocalChanges?: boolean }
export interface SkillUpdateBatch {
  id: string
  createdAt: string
  status: 'running' | 'completed' | 'cancelled' | 'interrupted'
  items: { resourceId: string; name: string; status: 'pending' | SkillUpdateCheck['status']; error?: string; localModified?: boolean }[]
}
export interface ResourceCleanup { id: string; name: string; kind: Resource['kind']; status: 'pending' | 'failed'; error?: string; createdAt: string }
export interface SkillFile { path: string; size: number; hash: string }
export interface SkillDetail {
  resource: Resource
  installation?: SkillInstallation
  content: string
  contentHash: string
  files: SkillFile[]
  warnings: string[]
}
export interface SkillFileContent { path: string; size: number; content?: string; binary: boolean }
export interface SkillPreview { content: string; files: SkillFile[] }
export interface SkillCandidate {
  id: string
  relativePath: string
  name: string
  description: string
  bytes: number
  fileCount: number
  contentHash?: string
  warnings: string[]
  error?: string
  existingResourceId?: string
  conflict?: string
  source?: SkillSource
}
export interface SkillScan {
  id: string
  target?: 'local'
  ownerAgentId?: string
  expiresAt: string
  candidates: SkillCandidate[]
  warnings?: string[]
  library?: { name: string; groups: string[]; favoriteCount: number }
}
export interface InstallSkillsInput {
  requestId: string
  scanId: string
  candidateIds: string[]
  addToFavorites: boolean
  restoreCollections?: boolean
}
export interface SkillOperation {
  id: string
  kind?: 'install' | 'update' | 'library-import' | 'library-export' | 'binding'
  outputName?: string
  scanId: string
  status: 'running' | 'completed' | 'cancelled' | 'interrupted'
  createdAt?: string
  items: { candidateId: string; name: string; resourceId?: string; status: 'pending' | 'installed' | 'updated' | 'reused' | 'exported' | 'failed' | 'skipped'; error?: string }[]
}
/** resourceIds 可为已发现的 local: 身份或受管技能 ID；不接收任意磁盘路径。 */
export interface PlanSkillLibraryExportInput { resourceIds: string[]; name: string }
export interface ExportSkillLibraryInput { planId: string; requestId: string }
export interface SkillLibraryExportPlan {
  id: string
  name: string
  expiresAt: string
  warnings: string[]
  files: { path: string; kind: 'file' | 'directory'; size: number }[]
  items: { resourceId: string; name: string; fileCount: number; bytes: number; excluded: string[]; warnings: string[]; error?: string }[]
}

export interface LocalSkill {
  id: string
  slug: string
  name: string
  description: string
  path: string
  source: 'global' | 'agent' | 'plugin' | 'builtin'
  sourceLabel: string
  pluginName?: string
}
export interface LocalSkillCatalog { skills: LocalSkill[]; issues: { path: string; message: string }[] }
export interface LocalSkillDetail { skill: LocalSkill; content: string; filePath: string }

/** 只对已保存员工准备；扫描/准备不授予权限，也不执行脚本。 */
export interface PrepareLocalSkillBindingInput { localSkillId: string; agentId: string; expectedConfigVersion: number }
export interface SkillBindingPlan extends PrepareLocalSkillBindingInput {
  id: string
  candidateId: string
  localSkill: LocalSkill
  expiresAt: string
  source: SkillSource
  contentHash: string
  warnings: string[]
  existingResourceId?: string
}
export interface BindLocalSkillInput extends PrepareLocalSkillBindingInput { requestId: string; planId: string; contentHash: string }
export interface SkillBindingReceipt extends PrepareLocalSkillBindingInput {
  id: string
  planId: string
  contentHash: string
  source: SkillSource
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  createdAt: string
  resource?: Resource
  agent?: import('./index').DigitalAgent
  error?: string
  /** 保留外改副本或提交后的工作区同步失败；不意味着重放绑定。 */
  cleanupError?: string
  synchronizationError?: string
}
