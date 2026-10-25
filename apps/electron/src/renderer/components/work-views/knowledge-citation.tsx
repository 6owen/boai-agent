/*
 * [INPUT]: 已发布消息的真实知识读取引用与宿主实时核验。
 * [OUTPUT]: 复用全局文件预览定位原行，更新/撤权/隐藏立即停显；失败统一Sonner与重试。
 * [POS]: 知识引用预览，不接受模型文件路径作为读取参数。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { DesktopApi } from '@boai/shared/ipc'
import type { KnowledgeCitationInput, KnowledgePreview } from '@boai/shared/domain/knowledge'
import { Banner, Loading } from '@/components/common'
import { FilePreview } from '@/components/common/file-preview'
import { Button } from '@/components/ui/button'
import { usePagedQuery } from './use-paged-query'

export function KnowledgeCitationPane({ api, active, target }: { api: DesktopApi; active: boolean; target: KnowledgeCitationInput & { requestId: string } }) {
  const { messageId, referenceIndex, line } = target
  const { page, error, loading, reload } = usePagedQuery<KnowledgePreview, string, { items: KnowledgePreview[]; total: number }>({
    api, active, queryKey: `knowledge-citation:${JSON.stringify(target)}`,
    read: async () => ({ items: [await api.request('getKnowledgeCitationPreview', { messageId, referenceIndex, line })], total: 1 }),
    identity: item => `${item.resource.id}:${item.contentHash}`,
  })
  const current = page?.items[0]
  return <div className="flex h-full min-h-0 flex-col gap-2" aria-label="知识引用原文">
    {error && <><Banner>{error}</Banner><Button size="sm" variant="ghost" onClick={reload}>重新核对知识引用</Button></>}
    {loading && <Loading />}
    {current && <FilePreview name={current.fileName ?? current.resource.name} active={active} file={current.filePreview} binary={current.binaryPreview} line={line} />}
  </div>
}
