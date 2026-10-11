/*
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [OUTPUT]: 本机运行许可归入高级设置并默认勾选；折叠箭头仅使用共享展开旋转，收起向右、展开向下。
 * [OUTPUT]: 单个手动入口按精确命令名识别已接入协议；未知程序需明确兼容协议，原扫描/保存协议优先，不能自动冒充ACP。
 * [OUTPUT]: Claude受管参数和无个人登录；测试只显示程序核对，不冒充供应商认证或实际调用成功。
 * [OUTPUT]: 保留原生Codex协议身份和固定启动参数，复用测试/保存和明确本机授权。
 * [INPUT]: 扫描预填或已有ACP/明确原生配置草稿、目录加载/来源详情插槽、DesktopApi、未保存守卫和统一兼容接口表单布局。
 * [OUTPUT]: 手动添加仅名称/命令/可选参数列表；扫描配置默认折叠启动信息，登录/来源归入高级设置；自动运行方式、简短显式授权与草稿测试/保存。
 * [POS]: 模型连接页本机 Agent 向导的第二步，不提供独立设置页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { LaunchProfileInput } from '@shared/domain'
import { localAgentProtocol } from '@shared/domain/local-configs'
import type { DesktopApi } from '@shared/ipc'
import { Banner, GuardContext, useDirty, useMutation } from '@/components/common'
import { ArrowLeft, Check, ChevronRight, FolderOpen, InfoIcon, Key, List, LoaderCircle, Pencil, Plus, Terminal, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConnectionForm, ConnectionSettingRow } from './connection-layout'

export type LocalAgentDraft = Omit<LaunchProfileInput, 'hostAccessAcknowledged'>

export function LocalAgentEditor({ api, initial, onBack, onSaved, onWorking, leading, details, manual = false, pending = false }: {
  api: DesktopApi; initial: LocalAgentDraft; onBack: () => void; onSaved: () => Promise<void>; onWorking: (busy: boolean) => void; leading?: ReactNode; details?: ReactNode; manual?: boolean; pending?: boolean
}) {
  const [form, setForm] = useState({ name: initial.name, executable: initial.executable, args: initial.args, codexHome: initial.codexHome ?? '', useExistingLogin: initial.useExistingLogin, acknowledged: true, protocol: (initial.protocol ?? (initial.id ? 'acp' : 'auto')) as NonNullable<LaunchProfileInput['protocol']> | 'auto' })
  const [advanced, setAdvanced] = useState(false)
  const showCommand = manual || !initial.executable
  const protocol = form.protocol === 'auto' ? localAgentProtocol(form.executable) : form.protocol
  const codexConfig = protocol !== 'claude-cli' && (!!form.codexHome || protocol === 'codex-app-server' || localAgentProtocol(form.executable) === 'codex-app-server')
  const [operation, setOperation] = useState<'test' | 'save' | null>(null)
  const [feedback, setFeedback] = useState('')
  const { busy, error, run, setError } = useMutation(), guard = useContext(GuardContext)
  const working = busy || pending
  const editor = useRef<HTMLFormElement>(null), fieldId = useId()
  useDirty(form)
  useEffect(() => { onWorking(busy); return () => onWorking(false) }, [busy, onWorking])
  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) => { setFeedback(''); setError(''); setForm(current => ({ ...current, [key]: value })) }
  const input = (): LaunchProfileInput => {
    if (!form.executable.trim()) { setAdvanced(true); throw new Error('请填写启动命令。') }
    if (!form.acknowledged) throw new Error('请先确认允许此 Agent 在本机运行。')
    if (!protocol) { setAdvanced(true); throw new Error('尚不能识别这个程序的接入方式；如果它支持 ACP，请在高级设置中选择 ACP 兼容程序。') }
    const useExistingLogin = form.useExistingLogin
    return { id: initial.id, expectedRevision: initial.expectedRevision, localConfigId: protocol === 'claude-cli' ? undefined : initial.localConfigId, protocol, name: form.name.trim(), executable: form.executable.trim(), args: protocol === 'acp' ? form.args : [], runtime: form.executable.trim() === initial.executable ? initial.runtime : undefined, useExistingLogin, codexHome: protocol !== 'claude-cli' && useExistingLogin ? form.codexHome.trim() || undefined : undefined, hostAccessAcknowledged: true }
  }
  const submit = (operation: 'test' | 'save') => {
    if (working || !editor.current?.reportValidity()) return
    void run(async () => {
      setOperation(operation); setFeedback('')
      try {
        const draft = input()
        if (operation === 'test') {
          const verified = await api.request('testLaunchProfileDraft', draft)
          setFeedback(`${draft.protocol === 'claude-cli' ? '程序已核对' : '测试成功'} · ${verified.name} ${verified.version}`)
        } else {
          await api.request('saveLaunchProfile', draft)
          await onSaved()
        }
      } finally { setOperation(null) }
    })
  }
  const commandFields = <>
    <ConnectionSettingRow label="启动命令" htmlFor={`${fieldId}-executable`} icon={<Terminal />} hint="填写已安装程序的名称或绝对路径；已知命令自动识别，其他兼容程序可在高级设置中选择接入协议。"><Input id={`${fieldId}-executable`} required value={form.executable} onChange={event => set('executable', event.target.value)} placeholder="例如 codex、claude，或程序绝对路径" /></ConnectionSettingRow>
    {(!protocol || protocol === 'acp') && <ConnectionSettingRow label="启动参数" icon={<List />} hint="可选；每项为一个参数，可包含空格，无需添加引号。">
      <div className="flex min-w-0 flex-col items-start gap-2">
        {form.args.map((arg, index) => <InputGroup key={index}>
          <InputGroupInput aria-label={`参数 ${index + 1}`} value={arg} onChange={event => set('args', form.args.map((value, i) => i === index ? event.target.value : value))} placeholder="例如 --experimental-acp" />
          <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={`移除参数 ${index + 1}`} onClick={() => set('args', form.args.filter((_, i) => i !== index))}><X /></InputGroupButton></InputGroupAddon>
        </InputGroup>)}
        <Button type="button" variant="ghost" size="sm" disabled={form.args.length >= 32} onClick={() => set('args', [...form.args, ''])}><Plus />添加参数</Button>
      </div>
    </ConnectionSettingRow>}
  </>
  return <ConnectionForm ref={editor} disabled={working} onSubmit={event => { event.preventDefault(); submit('save') }} footer={<>
      <Button type="button" variant="ghost" disabled={working} onClick={() => guard.navigate(onBack, { resetOnDiscard: false })}><ArrowLeft />返回</Button>
      <div className="connection-editor-actions">
        {feedback && <p className="connection-feedback connection-draft-feedback connection-inline-feedback" data-status="success" role="status" title={feedback}><Check /><span>{feedback}</span></p>}
        <Button type="button" variant="outline" className="relative" aria-label="测试" aria-busy={operation === 'test'} disabled={working || !form.acknowledged} onClick={() => submit('test')}><span className={operation === 'test' ? 'invisible' : undefined}>测试</span>{operation === 'test' && <span className="absolute inset-0 flex items-center justify-center"><LoaderCircle className="spinner" /></span>}</Button>
        <Button type="submit" disabled={working || !form.acknowledged}>{operation === 'save' && <LoaderCircle className="spinner" />}保存</Button>
      </div>
    </>}>
    {leading}
    {error && <Banner>{error}</Banner>}
    <ConnectionSettingRow label="Agent 名称" htmlFor={`${fieldId}-name`} icon={<Pencil />}><Input id={`${fieldId}-name`} autoFocus required maxLength={100} value={form.name} onChange={event => set('name', event.target.value)} placeholder="为这个 Agent 起个名字" /></ConnectionSettingRow>
    {showCommand && commandFields}
    <Collapsible open={advanced} onOpenChange={setAdvanced}>
      <CollapsibleTrigger render={<Button type="button" variant="ghost" className="w-full justify-between px-0" />} disabled={working}>高级设置<ChevronRight /></CollapsibleTrigger>
      <CollapsibleContent><div className="soft-divide-y">
        {!showCommand && commandFields}
        <ConnectionSettingRow label="接入协议" htmlFor={`${fieldId}-protocol`} icon={<Terminal />} hint="仅选择程序实际支持的协议；选择协议不会安装或增加程序能力。"><SelectField id={`${fieldId}-protocol`} value={form.protocol} onValueChange={value => set('protocol', value as typeof form.protocol)} options={[{ value: 'auto', label: '自动识别' }, { value: 'acp', label: 'ACP 兼容程序' }, { value: 'codex-app-server', label: 'Codex 原生程序' }, { value: 'claude-cli', label: 'Claude 原生程序' }]} /></ConnectionSettingRow>
        <ConnectionSettingRow label="登录与配置" htmlFor={`${fieldId}-login`} icon={<Key />}>
          <label className="flex min-h-9 items-center gap-2"><Checkbox id={`${fieldId}-login`} checked={form.useExistingLogin} onCheckedChange={checked => set('useExistingLogin', checked)} /><span>使用本机已有配置</span></label>
        </ConnectionSettingRow>
        {form.useExistingLogin && codexConfig && <ConnectionSettingRow label="Codex 配置目录" htmlFor={`${fieldId}-home`} icon={<FolderOpen />} hint="仅 Codex 需要；留空使用默认目录，扫描时会自动填写。"><Input id={`${fieldId}-home`} value={form.codexHome} onChange={event => set('codexHome', event.target.value)} placeholder="使用默认目录" /></ConnectionSettingRow>}
        {details}
        <div className="flex items-center gap-2 py-3">
          <label className="flex items-center gap-2 text-sm"><Checkbox id={`${fieldId}-access`} required checked={form.acknowledged} onCheckedChange={checked => set('acknowledged', checked)} /><span>允许此 Agent 在本机运行</span></label>
          <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="本机运行说明" />}><InfoIcon /></TooltipTrigger><TooltipContent>可访问本机文件、网络和自己的工具；BoAI 仅能审批程序通过协议发来的请求。</TooltipContent></Tooltip>
        </div>
      </div></CollapsibleContent>
    </Collapsible>
  </ConnectionForm>
}
