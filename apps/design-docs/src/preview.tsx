/*
 * [INPUT]: 共享tokens解析、组件示例和可复制源码。
 * [OUTPUT]: 隔离的明暗/窄宽/字号预览与源码展示，错误沿Sonner反馈。
 * [POS]: 设计站组件预览外壳；数值范围来自排版注册表。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@boai/ui'
import { typographyControls, typographyDefaults, typographyVariables } from '@boai/tokens'
import { toast } from 'sonner'
import { cn } from 'cn'

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success('已复制') }
  catch { toast.error('复制失败，请选中源码后手动复制。') }
}

export function CodeSample({ code, label = 'React' }: { code: string; label?: string }) {
  return <div className="code-sample"><div className="code-header"><span>{label}</span><Button variant="ghost" size="sm" onClick={() => void copyText(code)}>复制</Button></div><pre><code>{code}</code></pre></div>
}

export function Preview({ children, code, label }: { children: ReactNode; code: string; label: string }) {
  const [both, setBoth] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [size, setSize] = useState<number>(typographyControls.ui.defaultSize)
  const style = typographyVariables({ ...typographyDefaults, ui: { ...typographyDefaults.ui, sizePx: size } }) as CSSProperties
  return <section className="component-preview" aria-label={`${label}交互预览`}>
    <div className="preview-toolbar"><span>交互预览</span><div className="preview-options">
      <label className="preview-size">字号<input type="range" aria-label="预览UI字号" min={typographyControls.ui.min} max={typographyControls.ui.max} step={typographyControls.ui.step} value={size} onChange={event => setSize(Number(event.currentTarget.value))} /><output>{size}</output></label>
      <Button variant="ghost" size="xs" aria-pressed={narrow} onClick={() => setNarrow(!narrow)}>窄屏</Button>
      <Button variant="ghost" size="xs" aria-pressed={both} onClick={() => setBoth(!both)}>明暗对照</Button>
    </div></div>
    <div className="preview-frames" data-both={both} data-narrow={narrow}>
      {(both ? ['light', 'dark'] as const : ['page'] as const).map(mode => <div className={cn('preview-frame', mode !== 'page' && mode)} key={mode} style={style}>
        {both && <span className="preview-mode-label">{mode === 'light' ? '浅色' : '深色'}</span>}
        <div className="preview-content">{children}</div>
      </div>)}
    </div>
    <details className="preview-source"><summary>查看源码</summary><CodeSample code={code} /></details>
  </section>
}
