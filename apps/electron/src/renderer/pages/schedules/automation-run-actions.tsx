/*
 * [INPUT]: 已保存任务身份和手动运行请求。
 * [OUTPUT]: 立即运行始终保留原文字和尺寸，提交期间仅切换图标及禁用状态；收到回执恢复，未知回执复用请求 ID。
 * [POS]: 定时任务标题栏的运行按钮，聊天定位入口归执行记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, showErrorToast } from '@/components/common'
import { LoaderCircle, Play } from '@/components/icons'
import { Button } from '@/components/ui/button'

export function AutomationRunActions({ api, automationId, active, busy = false }: {
  api: DesktopApi; automationId: string; active: boolean; busy?: boolean
}) {
  const [submitting, setSubmitting] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const locked = useRef(false), requestId = useRef<string | undefined>(undefined)
  const start = async () => {
    if (!active || busy || locked.current) return
    locked.current = true
    setSubmitting(true)
    requestId.current ??= crypto.randomUUID()
    try {
      const receipt = await api.request('runAutomation', { id: automationId, requestId: requestId.current })
      requestId.current = undefined
      setUnknown(false)
      if (receipt.status === 'skipped' || receipt.status === 'failed') showErrorToast(errorText(receipt.reason ?? '定时指令未能发送'))
    } catch (error) {
      setUnknown(true)
      showErrorToast(errorText(error))
    } finally {
      locked.current = false
      setSubmitting(false)
    }
  }
  return <Button variant="default" className="ml-2 whitespace-nowrap" disabled={!active || busy || submitting} aria-busy={submitting}
    aria-label={submitting ? '正在提交…' : undefined} title={unknown ? '核对本次运行' : undefined} onClick={() => void start()}>
    {submitting ? <LoaderCircle className="animate-spin" /> : <Play />}立即运行
  </Button>
}
