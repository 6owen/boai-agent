/*
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 固定文件修改草稿的选区与用户位置说明。
 * [OUTPUT]: 复核/移除引用原文、补充修改位置；正文要求仍使用同一聊天 composer。
 * [POS]: 文件修改草稿展示，不发送消息、不读取文件。
 * [PROTOCOL]: 修改时同步 Header 和所属 .folder.md。
 */
import { FILE_EDIT_LOCATION_LIMIT, type FileEditAnnotation } from '@shared/domain/file-edit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function FileEditNote({ annotation, disabled, onChange }: { annotation?: FileEditAnnotation; disabled?: boolean; onChange(value: FileEditAnnotation): void }) {
  return <div className="flex min-w-0 flex-col gap-2 px-3 pb-2" aria-label="文件修改标注">
    {annotation?.quote && <div className="flex items-start gap-2">
      <blockquote className="max-h-24 min-w-0 flex-1 overflow-auto whitespace-pre-wrap border-l-2 pl-2 text-xs text-muted-foreground">{annotation.quote}</blockquote>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ ...annotation, quote: undefined })}>移除选文</Button>
    </div>}
    <Input aria-label="文件修改位置" placeholder="修改位置（可选）：页码、段落、工作表或单元格…" maxLength={FILE_EDIT_LOCATION_LIMIT} value={annotation?.location ?? ''} disabled={disabled} onChange={event => onChange({ ...annotation, location: event.target.value })} />
  </div>
}
