/*
 * [INPUT]: 三家商店原生列表与详情能力。
 * [OUTPUT]: 提供商身份、分页/排序能力、缓存和安装目标的跨进程合同。
 * [POS]: Skills 商店领域合同；映射迁自 boai-app。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
/** Public Skill marketplace providers supported by BoAI. */
export type SkillMarketplaceProvider = 'skills-sh' | 'clawhub' | 'skillhub'

/** Sort modes are mapped to the closest native capability of each provider. */
export type SkillMarketplaceSort =
  | 'all-time'
  | 'recommended'
  | 'downloads'
  | 'trending'
  | 'hot'
  | 'updated'

export interface SkillMarketplaceListRequest {
  provider: SkillMarketplaceProvider
  query?: string
  sort?: SkillMarketplaceSort
  limit?: number
  /** Zero-based page for page-oriented providers. */
  page?: number
  /** Opaque continuation token for cursor-oriented providers. */
  cursor?: string
}

export interface SkillMarketplaceDetailRequest {
  provider: SkillMarketplaceProvider
  /** Provider-stable identity returned by the list endpoint. */
  id: string
}

export interface SkillMarketplaceInstallTarget {
  /** Install a known Git repository directly, or scan a provider ZIP first. */
  kind: 'git' | 'url'
  source: string
  slug: string
}

export interface SkillMarketplaceSecurityReport {
  provider: string
  status: string
  statusText?: string
  reportUrl?: string
}

export interface SkillMarketplaceItem {
  id: string
  provider: SkillMarketplaceProvider
  slug: string
  name: string
  owner?: string
  source?: string
  description?: string
  homepage: string
  repository?: string
  iconUrl?: string
  version?: string
  installs?: number
  downloads?: number
  stars?: number
  updatedAt?: number
  verified?: boolean
  suspicious?: boolean
  content?: string
  install?: SkillMarketplaceInstallTarget
  securityReports?: SkillMarketplaceSecurityReport[]
}

export interface SkillMarketplaceListResult {
  items: SkillMarketplaceItem[]
  total?: number
  /** True when the provider can continue returning more results. */
  hasMore?: boolean
  /** Zero-based page to request next, when the provider uses pages. */
  nextPage?: number
  /** Opaque cursor to request next, when the provider uses cursors. */
  nextCursor?: string
}

export interface SkillMarketplaceCapabilities {
  label: string
  sorts: { value: SkillMarketplaceSort; label: string }[]
  pagination: 'page' | 'cursor'
  minQueryLength: number
  searchPagination: false
  sortScope: 'provider' | 'page'
}
export const skillMarketplaces: Record<SkillMarketplaceProvider, SkillMarketplaceCapabilities> = {
  'skills-sh': { label: 'skills.sh', sorts: [{ value: 'all-time', label: '累计安装' }, { value: 'trending', label: '趋势' }, { value: 'hot', label: '热门' }], pagination: 'page', minQueryLength: 2, searchPagination: false, sortScope: 'provider' },
  clawhub: { label: 'ClawHub', sorts: [{ value: 'recommended', label: '推荐' }, { value: 'downloads', label: '下载' }, { value: 'trending', label: '趋势' }, { value: 'updated', label: '最近更新' }], pagination: 'cursor', minQueryLength: 1, searchPagination: false, sortScope: 'provider' },
  skillhub: { label: 'SkillHub', sorts: [{ value: 'recommended', label: '默认' }, { value: 'downloads', label: '本页下载量' }, { value: 'updated', label: '本页更新时间' }], pagination: 'page', minQueryLength: 1, searchPagination: false, sortScope: 'page' },
}
export type MarketplaceResult<T> = { value: T; fetchedAt: string; stale: boolean; error?: string }
