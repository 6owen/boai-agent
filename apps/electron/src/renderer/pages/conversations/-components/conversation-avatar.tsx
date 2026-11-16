/*
 * [INPUT]: Current employee preset, host conversation/activity inputs and explicit preview controls.
 * [OUTPUT]: Lazy independent OpenAvatar player; hidden/reduced-motion pause, static fallback and full cleanup.
 * [POS]: Chat avatar host; no OS activity collection, TTS or employee state mutations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent } from '@boai/shared/domain'
import { defaultAvatar } from '@boai/shared/domain/avatars'
import type { AvatarInput, AvatarPlayer } from '@6owen/avatar-motion'
import { avatarImages } from '@/assets/avatars'
import { Avatar, showErrorToast } from '@/components/common'
import { SelectField } from '@/components/ui/select-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const presets = { fox: 'ox', cat: 'tiger', rabbit: 'rabbit' } as const
const states = ['idle', 'listening', 'thinking', 'speaking'] as const
const activities = ['', 'searching', 'working', 'waiting', 'error', 'done', 'sleeping'] as const
const userActivities = ['', 'coding', 'writing', 'reading', 'browsing', 'designing', 'form-filling', 'chatting', 'meeting', 'watching', 'listening-music', 'gaming', 'away']
type Preset = keyof typeof presets

function AvatarCanvas({ preset, input, active, large = false, playerRef }: { preset: Preset; input: AvatarInput; active: boolean; large?: boolean; playerRef?: { current: AvatarPlayer | null } }) {
  const canvas = useRef<HTMLCanvasElement>(null), player = useRef<AvatarPlayer | null>(null)
  const latest = useRef({ input, active }); latest.current = { input, active }
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true, observer: ResizeObserver | undefined
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const visible = () => player.current?.setActive(latest.current.active && !document.hidden && !reduced.matches)
    document.addEventListener('visibilitychange', visible); reduced.addEventListener('change', visible)
    void import('@6owen/avatar-motion').then(({ AvatarPlayer, characters }) => {
      if (!live || !canvas.current) return
      const instance = new AvatarPlayer(canvas.current, characters[presets[preset]], { quality: 'low', pixelRatio: 1, roomForEffects: large })
      player.current = instance
      if (playerRef) playerRef.current = instance
      instance.setInput(latest.current.input)
      observer = new ResizeObserver(() => instance.resize())
      observer.observe(canvas.current)
      instance.resize(); visible()
    }).catch(error => { if (live) { setFailed(true); showErrorToast(String(error)) } })
    return () => {
      live = false; observer?.disconnect(); document.removeEventListener('visibilitychange', visible); reduced.removeEventListener('change', visible)
      player.current?.dispose(); player.current = null
      if (playerRef) playerRef.current = null
    }
  }, [preset, large, playerRef])
  useEffect(() => {
    player.current?.setInput(input)
    player.current?.setActive(active && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [input, active])
  return failed ? <img src={avatarImages[preset]} alt="" className={large ? 'mx-auto h-64 object-contain' : 'size-8 object-contain'} /> : <canvas ref={canvas} className={large ? 'block h-64 w-full' : 'block size-8'} aria-label="角色动画" />
}

export function ConversationAvatar({ employee, input, active }: { employee: DigitalAgent; input: AvatarInput; active: boolean }) {
  const [open, setOpen] = useState(false), [manual, setManual] = useState<AvatarInput | null>(null)
  const preview = useRef<AvatarPlayer | null>(null)
  const preset = employee.avatar?.kind === 'preset' ? employee.avatar.id : defaultAvatar(employee.id)
  if (employee.avatar?.kind === 'image' || !(preset in presets)) return null
  const id = preset as Preset, value = manual ?? input
  const update = (patch: AvatarInput) => setManual({ ...value, ...patch })
  return <>
    <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="预览角色动画" onClick={() => setOpen(true)} />}>
      {active && !open ? <AvatarCanvas preset={id} input={input} active={active} /> : <Avatar name={employee.name} avatar={employee.avatar} seed={employee.id} />}
    </TooltipTrigger><TooltipContent>角色动画</TooltipContent></Tooltip>
    <Dialog open={active && open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[560px]">
      <DialogHeader><DialogTitle>{employee.name}</DialogTitle><DialogDescription className="sr-only">角色动画预览；默认跟随当前会话，也可手动触发状态和动作。</DialogDescription></DialogHeader>
      {open && <AvatarCanvas preset={id} input={value} active={active} large playerRef={preview} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="grid gap-2 text-sm">Conversation<SelectField aria-label="Conversation" value={value.state ?? 'idle'} onValueChange={state => update({ state: state as AvatarInput['state'], voice: state === 'speaking' ? 0.6 : 0 })} options={states.map(value => ({ value, label: value }))} /></label>
        <label className="grid gap-2 text-sm">Agent activity<SelectField aria-label="Agent activity" value={value.activity ?? ''} onValueChange={activity => update({ activity: activity as AvatarInput['activity'] || null })} options={activities.map(value => ({ value, label: value || 'none' }))} /></label>
        <label className="grid gap-2 text-sm">Your activity<SelectField aria-label="Your activity" value={value.userActivity ?? ''} onValueChange={userActivity => update({ userActivity: userActivity || null })} options={userActivities.map(value => ({ value, label: value || 'none' }))} /></label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Once">{['nod', 'hop', 'spin', 'wiggle'].map(motion => <Button key={motion} variant="secondary" size="sm" onClick={() => { preview.current?.playOnce(motion) }}>{motion}</Button>)}</div>
      <Button variant="ghost" size="sm" disabled={!manual} onClick={() => { preview.current?.stopMotion(); setManual(null) }}>跟随会话</Button>
    </DialogContent></Dialog>
  </>
}
