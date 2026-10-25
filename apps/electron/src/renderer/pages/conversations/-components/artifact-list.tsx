/*
 * [OUTPUT]: 文件展示不再附加版号，预览/修改沿文件身份办理。
 * [INPUT]: 已发布的 Artifact 实体、固定版本预览与宿主打开文件回调。
 * [OUTPUT]: 消息和单群聊详情共用的紧凑文件行，所有已登记成果进入应用内只读预览，不支持格式显示原文件信息；缺失时间不伪造、打开不采用或重新发布。
 * [POS]: 会话私有文件展示组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Artifact } from '@boai/shared/domain'
import { Button } from '@/components/ui/button'
import { FileText } from '@/components/icons'
import { sizeText, timeText } from '@/components/common'

export function ArtifactList({ artifacts, onOpenPath, onPreview, dates = false }: { artifacts: Artifact[]; onOpenPath: (path: string) => void; onPreview?: (artifact: Artifact) => void; dates?: boolean }) {
  return <div className="chat-artifacts">{artifacts.map(artifact => {
    const preview = Boolean(onPreview && artifact.id)
    return <Button key={artifact.id ?? artifact.path} variant="ghost" size="content" className="chat-artifact" aria-label={`打开 ${artifact.name}`} onClick={() => preview ? onPreview!(artifact) : onOpenPath(artifact.path)}>
      <FileText size={20} /><span className="chat-artifact-copy"><strong>{artifact.name}</strong><small>{sizeText(artifact.size)}{dates && artifact.publishedAt && <> · {timeText(artifact.publishedAt)}</>}</small></span><span className="chat-artifact-open">{preview ? '预览' : '打开'}</span>
    </Button>
  })}</div>
}
