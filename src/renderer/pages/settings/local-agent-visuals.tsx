/*
 * [INPUT]: Agent 来源名称/程序身份、Lobe 本地品牌 SVG 与透明毛绒 WebP。
 * [OUTPUT]: Codex、Claude Code、Gemini CLI、OpenCode、Cursor、Copilot 的离线品牌图标及通用回退；本机 Agent 向导的毛绒桌面伙伴及扫描/配置提示。
 * [POS]: settings 的本机 Agent 视觉组件，不加载远程图标。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import codex from '@lobehub/icons-static-svg/icons/codex.svg'
import claude from '@lobehub/icons-static-svg/icons/claude.svg'
import gemini from '@lobehub/icons-static-svg/icons/gemini.svg'
import opencode from '@lobehub/icons-static-svg/icons/opencode.svg'
import cursor from '@lobehub/icons-static-svg/icons/cursor.svg'
import copilot from '@lobehub/icons-static-svg/icons/githubcopilot.svg'
import { Terminal } from '@/components/icons'
import select from '@/assets/local-agent-select.webp'
import configure from '@/assets/local-agent-configure.webp'

const brands = [
  { match: /\bcodex\b/i, icon: codex },
  { match: /\bclaude(?:[ -]code)?\b/i, icon: claude },
  { match: /\bgemini\b/i, icon: gemini },
  { match: /\bopen[ -]?code\b/i, icon: opencode },
  { match: /\bcursor\b/i, icon: cursor },
  { match: /\b(?:github[ -]?)?copilot\b/i, icon: copilot },
]

export function AgentBrandIcon({ name, executable = '' }: { name: string; executable?: string }) {
  const program = executable.split(/[\\/]/).at(-1) ?? ''
  const brand = brands.find(brand => brand.match.test(name) || brand.match.test(program))
  return <span className="connection-provider-icon" aria-hidden="true">{brand ? <span className="connection-brand-icon" style={{ maskImage: `url("${brand.icon}")` }} /> : <Terminal size={24} />}</span>
}

export function LocalAgentIllustration({ configuring }: { configuring: boolean }) {
  return <img className="connection-illustration select-none" src={configuring ? configure : select} width={80} height={64} alt="" aria-hidden="true" draggable={false} />
}
