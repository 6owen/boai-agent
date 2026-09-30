/*
 * [INPUT]: 同一时区的日聚合 DTO 与项目 Chart/Tooltip 原语。
 * [OUTPUT]: 页面/分享共用日期范围、色阶与周偏移；精简的七行年度热力图、每周柱图和区间累计曲线；日期/缺口保留在图格 tooltip 和可访问名称。
 * [POS]: 个人资料只读活动展示；粒度切换不重新请求模型或历史正文。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bar, BarChart, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { ActivityDay, ProfileActivity } from '@shared/domain/profile'
import { Button } from '@/components/ui/button'
import { InfoIcon } from '@/components/icons'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
export const tokenText = (value: number | null) => value === null ? '暂无记录' : value.toLocaleString('zh-CN')
export function profileActivityRange() {
  const now = new Date(), date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const to = ['year', 'month', 'day'].map(type => date.find(part => part.type === type)!.value).join('-')
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().slice(0, 10)
  return { from, to, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
}
const dateOffset = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
export const mondayOffset = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
export function activityThresholds(days: ActivityDay[]) {
  const positives = days.flatMap(day => day.tokens !== null && day.tokens > 0 ? [day.tokens] : []).sort((a, b) => a - b)
  return [...new Set([.25, .5, .75, 1].flatMap(q => positives.length ? [positives[Math.ceil(positives.length * q) - 1]!] : []))]
}
const dayLabel = (day: ActivityDay) => `${day.date}：${day.tokens === null ? day.unknownCalls ? '用量未记录' : '暂无记录' : `已知 ${tokenText(day.tokens)} Token`}${day.unknownCalls ? '，部分用量未记录' : ''}`

export function ActivityChart({ activity }: { activity: ProfileActivity }) {
  const [mode, setMode] = useState<'daily' | 'weekly' | 'cumulative'>('daily'), scroll = useRef<HTMLDivElement>(null)
  const days = activity.days, start = days[0]?.date
  const { thresholds, weeks, cumulative } = useMemo(() => {
    const thresholds = activityThresholds(days)
    const buckets = new Map<string, { date: string; end: string; tokens: number | null; unknown: boolean }>()
    let total: number | null = null, unknown = false
    const cumulative = days.map(day => {
      const monday = dateOffset(day.date, -mondayOffset(day.date)), week = buckets.get(monday) ?? { date: day.date, end: day.date, tokens: null, unknown: false }
      week.end = day.date; if (day.tokens !== null) { week.tokens = (week.tokens ?? 0) + day.tokens; total = (total ?? 0) + day.tokens }
      week.unknown ||= !!day.unknownCalls; unknown ||= !!day.unknownCalls; buckets.set(monday, week)
      return { date: day.date, tokens: total, label: `${day.date} · 区间累计${unknown ? '（部分已知）' : ''}` }
    })
    return { thresholds, weeks: [...buckets.values()].map(week => ({ ...week, label: `${week.date} 至 ${week.end}${week.unknown ? '（部分已知）' : ''}` })), cumulative }
  }, [days])
  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth }, [start, mode])
  const leading = start ? mondayOffset(start) : 0, columns = Math.ceil((days.length + leading) / 7)
  return <section className="profile-activity" aria-label="Token 活动">
    <div className="profile-section-heading"><div className="profile-section-title"><h3>Token 活动</h3><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="统计说明" />}><InfoIcon /></TooltipTrigger><TooltipContent className="block max-w-sm">{activity.limitations.map(line => <p key={line}>{line}</p>)}<p>{activity.range.from} — {activity.range.to} · {activity.range.timezone}</p></TooltipContent></Tooltip></div><div className="button-row" role="group" aria-label="活动粒度">{([['daily', '每日'], ['weekly', '每周'], ['cumulative', '累计']] as const).map(([value, label]) => <Button key={value} size="sm" variant={mode === value ? 'secondary' : 'ghost'} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</Button>)}</div></div>
    {mode === 'daily' ? <>
      <div className="profile-heatmap-scroll" ref={scroll} tabIndex={0} aria-label="年度活动图，可横向滚动"><div className="profile-heatmap" style={{ '--weeks': columns } as CSSProperties}>
        <TooltipProvider delay={150}>{Array.from({ length: leading }, (_, i) => <span key={`empty-${i}`} />)}{days.map((day, index) => {
          const level = day.tokens === null ? -1 : day.tokens === 0 ? 0 : thresholds.findIndex(value => day.tokens! <= value) + 1
          return <Tooltip key={day.date}><TooltipTrigger render={<Button variant="ghost" size="content" className="profile-day" data-level={level} data-partial={!!day.unknownCalls} aria-label={dayLabel(day)} onKeyDown={event => {
            const shift = ({ ArrowRight: 7, ArrowLeft: -7, ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[event.key]
            if (shift !== undefined) { event.preventDefault(); const buttons = scroll.current?.querySelectorAll<HTMLButtonElement>('.profile-day'); buttons?.[Math.max(0, Math.min(days.length - 1, index + shift))]?.focus() }
          }} />}><span aria-hidden="true">{day.unknownCalls ? '?' : day.tokens === 0 ? '·' : ''}</span></TooltipTrigger><TooltipContent>{dayLabel(day)}</TooltipContent></Tooltip>
        })}</TooltipProvider>
      </div><div className="profile-months" style={{ '--weeks': columns } as CSSProperties}>{days.flatMap((day, index) => index === 0 || day.date.endsWith('-01') ? [<span key={day.date} style={{ gridColumn: Math.floor((index + leading) / 7) + 1 }}>{Number(day.date.slice(5, 7))}月</span>] : [])}</div></div>
    </> : <ChartContainer className="profile-chart" config={{ tokens: { label: mode === 'weekly' ? '每周已知 Token' : '区间累计 Token', color: 'var(--primary)' } }}>
      {mode === 'weekly' ? <BarChart data={weeks} accessibilityLayer><XAxis dataKey="date" tickFormatter={value => String(value).slice(5)} minTickGap={36} /><YAxis width={55} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload.label} />} /><Bar dataKey="tokens" fill="var(--color-tokens)" radius={3} isAnimationActive={false} /></BarChart> : <LineChart data={cumulative} accessibilityLayer><XAxis dataKey="date" tickFormatter={value => String(value).slice(5)} minTickGap={36} /><YAxis width={55} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload.label} />} /><Line dataKey="tokens" stroke="var(--color-tokens)" dot={false} isAnimationActive={false} /></LineChart>}
    </ChartContainer>}
    {!days.some(day => day.tokens !== null) && <p className="empty-note">暂无可核对的 Token 用量记录</p>}

  </section>
}
