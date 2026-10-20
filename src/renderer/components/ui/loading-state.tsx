/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: Beautiful UI loading-state.json / foundation.json（2026-10-16）与宿主真实开始时间、活动状态。
 * [OUTPUT]: 紧凑浅色3×3像素波/环绕、12px常规shimmer标签/11px计时并居中对齐；隐藏停表，无模拟进度。
 * [POS]: 共享LoadingState展示原语，颜色沿BOAI主题；上游 https://www.beautifului.dev/r/loading-state.json。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { useEffect, useState } from 'react'
import './execution-state.css'

const chevron = Array.from({ length: 9 }, (_, i) => (i % 3 + Math.abs(Math.floor(i / 3) - 1)) * 90)
const orbitOrder = [0, 1, 2, 5, 8, 7, 6, 3]
const patterns = {
  Drive: { delays: chevron, duration: 650, round: false },
  Dots: { delays: chevron, duration: 650, round: true },
  Orbit: { delays: Array.from({ length: 9 }, (_, i) => orbitOrder.includes(i) ? orbitOrder.indexOf(i) * 110 : null), duration: 950, round: false },
}

export function LoadingState({ label = '正在处理', variant = 'Drive', startedAt, active = true, working = true }: {
  label?: string; variant?: keyof typeof patterns; startedAt?: string; active?: boolean; working?: boolean
}) {
  const [now, setNow] = useState(Date.now)
  const start = startedAt ? Date.parse(startedAt) : NaN
  useEffect(() => {
    if (!active || !Number.isFinite(start)) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [active, start])
  const total = Math.max(0, (now - start) / 1000)
  const elapsed = total < 60 ? `${total.toFixed(1)}s` : `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
  const { delays, duration, round } = patterns[variant]
  return <div data-slot="loading-state" className="flex min-w-0 items-center gap-2 leading-5" data-working={working && active}>
    <span aria-hidden="true" className="grid shrink-0 grid-cols-[repeat(3,2.5px)] gap-px">
      {delays.map((delay, index) => <span key={index} className={`execution-loader-pixel size-[2.5px] bg-muted-foreground/65 ${round ? 'rounded-full' : 'rounded-[0.5px]'}`}
        style={{ opacity: delay === null ? 0.07 : 0.15, animation: delay === null ? 'none' : `execution-pixel-on ${duration}ms ease-in-out ${delay}ms infinite` }} />)}
    </span>
    <span role="status" className="execution-state-label min-w-0 truncate text-[length:var(--text-ui-secondary)] font-normal text-muted-foreground">{label}</span>
    {Number.isFinite(start) && <span aria-hidden="true" className="shrink-0 font-mono text-[length:var(--text-ui-caption)] text-muted-foreground/70 tabular-nums">{elapsed}</span>}
  </div>
}
