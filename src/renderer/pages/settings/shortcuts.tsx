/*
 * [INPUT]: 第22组08第4节冻结的四种默认组合与设置文档/Card/appearance-row样式。
 * [OUTPUT]: 按当前平台以设置文档标题及行样式只读展示四组快捷键；不保存或编辑绑定。
 * [POS]: 设置分类中的快捷键页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'

const shortcuts = [
  { label: 'Open Search / 全局搜索', key: 'K' },
  { label: '切换侧边栏', key: 'B' },
  { label: '后退', key: '[' },
  { label: '前进', key: ']' },
] as const

export function ShortcutSettings() {
  const modifier = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'
  return <section className="settings-document">
    <header className="settings-document-heading"><h2>快捷键</h2></header>
    <Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">
      {shortcuts.map(shortcut => <div className="appearance-row" key={shortcut.label}>
        <span>{shortcut.label}</span>
        <kbd className="rounded-md border bg-muted px-2 py-1 font-mono text-xs">{modifier} {shortcut.key}</kbd>
      </div>)}
    </CardContent></Card>
  </section>
}
