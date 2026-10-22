/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: 交互示例目录真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Preview } from './preview'
import ButtonExample from './examples/button'
import buttonSource from './examples/button.tsx?raw'
import InputExample from './examples/input'
import inputSource from './examples/input.tsx?raw'
import CardExample from './examples/card'
import cardSource from './examples/card.tsx?raw'
import SkeletonExample from './examples/skeleton'
import skeletonSource from './examples/skeleton.tsx?raw'
import BadgeExample from './examples/badge'
import badgeSource from './examples/badge.tsx?raw'
import SonnerExample from './examples/sonner'
import sonnerSource from './examples/sonner.tsx?raw'
import SettingsExample from './examples/settings'
import settingsSource from './examples/settings.tsx?raw'
import TypographyExample from './examples/typography'
import typographySource from './examples/typography.tsx?raw'

export { SettingsExample, TypographyExample }
export const exampleSources = {
  button: buttonSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  input: inputSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  card: cardSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  skeleton: skeletonSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  badge: badgeSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  sonner: sonnerSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  settings: settingsSource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
  typography: typographySource.replace(/^\/\*[\s\S]*?\*\/\s*/, ''),
}
const examples = { button: ButtonExample, input: InputExample, card: CardExample, skeleton: SkeletonExample, badge: BadgeExample, sonner: SonnerExample, settings: SettingsExample }
export function ComponentExample({ name, title }: { name: string; title: string }) {
  const key = name as keyof typeof examples
  const Example = examples[key]
  return Example ? <Preview code={exampleSources[key]} label={title}><Example /></Preview> : null
}
