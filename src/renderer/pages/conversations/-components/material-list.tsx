/*
 * [INPUT]: 当前会话成员、草稿条目、已发送材料回执及宿主预览/移除/重试/授权回调。
 * [OUTPUT]: 未发送材料的真实导入状态、显性失败/未知回执核对与明确共享对象、局部忙碌锁定；已发送材料身份和受管原文预览入口；授权变更交由宿主版本保存。
 * [POS]: 会话私有材料草稿条与消息内材料列表；不访问本机文件或自行宣布员工已读。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DigitalAgent } from '@shared/domain'
import type { ConversationMaterial } from '@shared/domain/materials'
import { sizeText } from '@/components/common'
import { FileText, LoaderCircle, RefreshCw, X } from '@/components/icons'
import { Attachment, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { materialDisplayName, materialErrorText, materialFormatLabel, materialStatusLabels, type MaterialDraftItem } from './material-draft'

export type { MaterialDraftItem } from './material-draft'

interface MaterialDraftBarProps {
  items: MaterialDraftItem[]
  members: DigitalAgent[]
  disabled?: boolean
  onRemove(item: MaterialDraftItem): void
  onRetry(item: MaterialDraftItem): void
  onPreview(material: ConversationMaterial): void
  onRecipients(item: MaterialDraftItem, agentIds: string[]): void
}

export function MaterialDraftBar({ items, members, disabled, onRemove, onRetry, onPreview, onRecipients }: MaterialDraftBarProps) {
  if (!items.length) return null
  return <section className="flex min-w-0 flex-col gap-2" aria-label="待发送材料">
    {items.map(item => {
      const material = item.material, status = material?.status ?? item.status
      const ready = status === 'ready' && Boolean(material), failed = ['failed', 'unavailable', 'removed'].includes(status)
      const name = materialDisplayName(material?.name ?? item.name)
      const locked = disabled || item.busy
      return <div key={item.id} className="min-w-0 rounded-xl bg-card p-2 text-card-foreground soft-card" data-material-draft-id={item.id} data-material-status={status}>
        <Attachment className="w-full border-0 bg-transparent" size="sm" state={status === 'preparing' ? 'processing' : failed ? 'error' : 'done'}>
          <AttachmentMedia>{status === 'preparing' ? <LoaderCircle className="spinner" /> : <FileText />}</AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{name}</AttachmentTitle>
            <AttachmentDescription>{materialFormatLabel(material?.format)} · {material && (material.size > 0 || ready) ? sizeText(material.size) : '大小待确认'} · {materialStatusLabels[status]}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions className="gap-1">
            {ready && material && <Button variant="ghost" size="xs" disabled={locked} aria-label={`预览材料 ${name}`} onClick={() => onPreview(material)}>预览</Button>}
            {failed && <Button variant="ghost" size="icon-xs" disabled={locked} aria-label={`${item.preparationState === 'unknown' ? '核对' : '重试'}材料 ${name}`} onClick={() => onRetry(item)}><RefreshCw /></Button>}
            <Button variant="ghost" size="icon-xs" disabled={locked} aria-label={`移除材料 ${name}`} onClick={() => onRemove(item)}><X /></Button>
          </AttachmentActions>
        </Attachment>
        {failed && <p role="alert" className="mt-1 break-words text-xs text-destructive">{materialErrorText(material?.error ?? item.error)}</p>}
        <MaterialRecipients name={name} members={members} agentIds={material?.authorizedAgentIds ?? item.authorizedAgentIds} disabled={locked || !ready} onChange={ids => onRecipients(item, ids)} />
      </div>
    })}
    {items.some(item => (item.material?.status ?? item.status) !== 'ready') && <p role="status" className="field-hint">请等待材料就绪；失败的材料需要重试或移除后才能发送。</p>}
  </section>
}

interface SentMaterialListProps {
  materials: ConversationMaterial[]
  members: DigitalAgent[]
  onPreview(material: ConversationMaterial): void
  onRecipients?(material: ConversationMaterial, agentIds: string[]): void
}

export function SentMaterialList({ materials, members, onPreview, onRecipients }: SentMaterialListProps) {
  if (!materials.length) return null
  return <section className="mt-2 flex min-w-0 flex-col gap-2" aria-label="消息材料">
    {materials.map(material => {
      const name = materialDisplayName(material.name), ready = material.status === 'ready'
      const failed = ['failed', 'unavailable', 'removed'].includes(material.status)
      return <div key={material.id} className="min-w-0 rounded-xl bg-card p-2 text-card-foreground soft-card" data-material-id={material.id} data-material-status={material.status}>
        <Attachment className="w-full border-0 bg-transparent" size="sm" state={material.status === 'preparing' ? 'processing' : failed ? 'error' : 'done'}>
          <AttachmentMedia>{material.status === 'preparing' ? <LoaderCircle className="spinner" /> : <FileText />}</AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{name}</AttachmentTitle>
            <AttachmentDescription>{materialFormatLabel(material.format)} · {sizeText(material.size)} · {materialStatusLabels[material.status]}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions><Button variant="ghost" size="xs" disabled={!ready} aria-label={`预览材料 ${name}`} onClick={() => onPreview(material)}>查看原文</Button></AttachmentActions>
        </Attachment>
        {failed && <p role="status" className="mt-1 break-words text-xs text-destructive">{materialErrorText(material.error)}</p>}
        <MaterialRecipients name={name} members={members} agentIds={material.authorizedAgentIds} disabled={!ready} onChange={onRecipients ? ids => onRecipients(material, ids) : undefined} />
      </div>
    })}
  </section>
}

function MaterialRecipients({ name, members, agentIds, disabled, onChange }: { name: string; members: DigitalAgent[]; agentIds: string[]; disabled?: boolean; onChange?(ids: string[]): void }) {
  const recipients = members.filter(member => agentIds.includes(member.id))
  const unknownIds = agentIds.filter(id => !members.some(member => member.id === id))
  const summary = [...recipients.map(member => member.name), ...(unknownIds.length ? [`${unknownIds.length} 位非当前成员`] : [])].join('、') || '尚未共享给员工'
  if (!onChange) return <p className="mt-1 break-words text-xs text-muted-foreground">共享给：{summary}</p>
  return <details className="mt-1 text-xs" aria-label={`${name} 的共享对象`}>
    <summary className="cursor-pointer break-words text-muted-foreground">共享给：{summary}</summary>
    <fieldset disabled={disabled} className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      <legend className="sr-only">选择可以读取 {name} 的员工</legend>
      {members.map(member => <label className="flex items-center gap-2" key={member.id}>
        <Checkbox checked={agentIds.includes(member.id)} disabled={disabled || (!member.active && !agentIds.includes(member.id))} onCheckedChange={checked => onChange(checked ? [...new Set([...agentIds, member.id])] : agentIds.filter(id => id !== member.id))} />
        <span>{member.name}{!member.active && '（已停用）'}</span>
      </label>)}
      {!members.length && <p className="field-hint">当前没有可共享的员工。</p>}
      {unknownIds.length > 0 && <Button variant="ghost" size="xs" disabled={disabled} onClick={() => onChange(agentIds.filter(id => !unknownIds.includes(id)))}>移除非当前成员</Button>}
    </fieldset>
    {disabled && <p className="field-hint">共享对象暂不可修改。</p>}
  </details>
}
