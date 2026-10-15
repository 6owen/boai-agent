/*
 * [OUTPUT]: 同一渠道标签内替换详情/返回沿本标签未保存守卫；只替换详情，不重建常驻聊天阅读状态。
 * [INPUT]: 标签身份、活跃状态、编辑内容与关闭/脏状态回调。
 * [OUTPUT]: 保留隐藏标签状态、独立未保存守卫和限定表单提交范围、供固定页脚布局使用的标签会话。
 * [POS]: detail-panel 中每个已打开标签的生命周期边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { GuardContext } from '@/components/common'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { TabsContent } from '@/components/ui/tabs'

export interface DetailTabHandle { close(): void; navigate(action: () => void): void }
export function DetailTabSession({ tabKey, active, onClose, onDirty, ref, children }: {
  tabKey: string; active: boolean; onClose(): void; onDirty(key: string, dirty: boolean): void
  ref: Ref<DetailTabHandle>; children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [generation, setGeneration] = useState(0)
  const { guard, dirty, navigate, confirmation } = useEditorGuard({ reset: () => setGeneration(value => value + 1), getForm: () => root.current?.querySelector('[data-edit-form]') ?? null })
  useImperativeHandle(ref, () => ({ close: () => navigate(onClose), navigate: action => navigate(action, { resetOnDiscard: false }) }), [navigate, onClose])
  useEffect(() => { onDirty(tabKey, dirty) }, [onDirty, tabKey, dirty])
  useEffect(() => () => onDirty(tabKey, false), [onDirty, tabKey])
  return <GuardContext.Provider value={guard}>
    <TabsContent value={tabKey} keepMounted className="detail-content" hidden={!active} ref={root}>
      <div className="detail-session" key={generation}>{children}</div>
    </TabsContent>
    {confirmation}
  </GuardContext.Provider>
}
