/*
 * [INPUT]: Agent 来源名称/程序身份、Lobe 本地彩色/单色品牌 SVG 与透明毛绒 WebP。
 * [OUTPUT]: Agent品牌图标无背景/内边距，支持Pi及常见编程Agent，彩色SVG保留原色、单色随主题适配，未知品牌通用回退；本机Agent向导的毛绒桌面伙伴及扫描/配置提示。
 * [POS]: settings 的本机 Agent 视觉组件，不加载远程图标。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import codex from '@lobehub/icons-static-svg/icons/codex-color.svg'
import claude from '@lobehub/icons-static-svg/icons/claude-color.svg'
import gemini from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import opencode from '@lobehub/icons-static-svg/icons/opencode.svg'
import cursor from '@lobehub/icons-static-svg/icons/cursor.svg'
import copilot from '@lobehub/icons-static-svg/icons/githubcopilot.svg'
import pi from '@lobehub/icons-static-svg/icons/pi.svg'
import amp from '@lobehub/icons-static-svg/icons/amp-color.svg'
import goose from '@lobehub/icons-static-svg/icons/goose.svg'
import cline from '@lobehub/icons-static-svg/icons/cline.svg'
import roo from '@lobehub/icons-static-svg/icons/roocode.svg'
import kilo from '@lobehub/icons-static-svg/icons/kilocode.svg'
import qwen from '@lobehub/icons-static-svg/icons/qwen-color.svg'
import kimi from '@lobehub/icons-static-svg/icons/kimi-color.svg'
import windsurf from '@lobehub/icons-static-svg/icons/windsurf.svg'
import trae from '@lobehub/icons-static-svg/icons/trae-color.svg'
import { Terminal } from '@/components/icons'
import select from '@/assets/local-agent-select.webp'
import configure from '@/assets/local-agent-configure.webp'

const brands = [
  { match: /\bcodex\b/i, icon: codex, color: true },
  { match: /\bclaude(?:[ -]code)?\b/i, icon: claude, color: true },
  { match: /\bgemini\b/i, icon: gemini, color: true },
  { match: /\bopen[ -]?code\b/i, icon: opencode },
  { match: /\bcursor\b/i, icon: cursor },
  { match: /\b(?:github[ -]?)?copilot\b/i, icon: copilot },
  { match: /\bpi\b/i, icon: pi },
  { match: /\bamp\b/i, icon: amp, color: true },
  { match: /\bgoose\b/i, icon: goose },
  { match: /\bcline\b/i, icon: cline },
  { match: /\broo(?:[ -]?code)?\b/i, icon: roo },
  { match: /\bkilo(?:[ -]?code)?\b/i, icon: kilo },
  { match: /\bqwen(?:[ -]?code)?\b/i, icon: qwen, color: true },
  { match: /\bkimi\b/i, icon: kimi, color: true },
  { match: /\bwindsurf\b/i, icon: windsurf },
  { match: /\btrae\b/i, icon: trae, color: true },
]

export function AgentBrandIcon({ name, executable = '' }: { name: string; executable?: string }) {
  const program = executable.split(/[\\/]/).at(-1) ?? ''
  const brand = brands.find(brand => brand.match.test(program)) ?? brands.find(brand => brand.match.test(name))
  return <span className="connection-provider-icon local-agent-brand-icon" aria-hidden="true">
    {brand?.color ? <img className="connection-brand-icon" src={brand.icon} width={24} height={24} alt="" draggable={false} />
      : brand ? <span className="connection-brand-icon" style={{ maskImage: `url("${brand.icon}")` }} /> : <Terminal className="size-full" />}
  </span>
}

export function LocalAgentIllustration({ configuring }: { configuring: boolean }) {
  return <img className="connection-illustration select-none" src={configuring ? configure : select} width={80} height={64} alt="" aria-hidden="true" draggable={false} />
}
