/*
 * [INPUT]: Agent 来源名称/程序身份、Lobe 本地 SVG 与全局语义颜色。
 * [OUTPUT]: Codex、Claude Code、Gemini CLI、OpenCode、Cursor、Copilot 的离线品牌图标及通用回退；本机 Agent 向导的独立桌面伙伴插画。
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
  return <svg className="connection-illustration select-none" viewBox="0 0 80 64" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="40" cy="57" rx="27" ry="4" fill="var(--primary)" opacity=".08" />
    <circle cx="40" cy="30" r="26" fill="var(--primary)" opacity=".06" />
    <g stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 22v6m-3-3h6M67 10v6m-3-3h6" opacity=".4" />
      <path d="M35 48v6m10-6v6M29 55h22" />
      <rect x="17" y="16" width="46" height="33" rx="9" fill="var(--card)" />
      <rect x="23" y="22" width="34" height="21" rx="5" fill="var(--muted)" stroke="var(--border)" />
      <path d="M32 29v3m16-3v3" strokeWidth="2.5" />
      <path d="M36 36q4 4 8 0" />
      {configuring ? <><circle cx="62" cy="43" r="10" fill="var(--card)" /><path d="m57 43 3 3 6-7" /></> : <><circle cx="62" cy="43" r="8" fill="var(--card)" /><path d="m68 49 6 6M59 43h6m-3-3v6" /></>}
    </g>
    <ellipse cx="29" cy="35" rx="3" ry="1.5" fill="var(--primary)" opacity=".15" />
    <ellipse cx="51" cy="35" rx="3" ry="1.5" fill="var(--primary)" opacity=".15" />
  </svg>
}
