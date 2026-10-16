/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: Rovai ExecutionToolGroup.tsx @ f9acc239 (MIT)，ToolCallDetail/键盘导航原实现。
 * [OUTPUT]: 完整结果读取、缓存/重试、展开激活与焦点恢复；键盘导航共用HTMLElement支持代码块和diff容器。
 * [POS]: BOAI执行工具详情；许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { AgentRun } from '@shared/domain'
import type { ExecutionEvidence } from '@shared/domain/execution'
import { executionEvidenceResultText } from '@shared/rovai'
import { Button } from '@/components/ui/button'
import { TypesetCode } from '@/components/ui/typeset'
import { useExecutionRetainedState } from './ExecutionVirtualList'
import { readExecutionEvidence } from './execution-content'
type ToolResultLoadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'failed'

interface ToolResultViewState {
  evidenceId: string | null
  status: ToolResultLoadStatus
  text: string
  errorDetail: string | null
}

export function ToolOutputTruncationNotice({ visible }: { visible: boolean }): JSX.Element | null {
  return visible
    ? <p className="tool-result-truncation-note" role="note">结果过长，部分内容已省略。</p>
    : null
}

export function handleToolResultKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  summary: HTMLElement | null
): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    summary?.focus({ preventScroll: true })
    return
  }

  const result = event.currentTarget
  const lineHeight = Number.parseFloat(window.getComputedStyle(result).lineHeight) || 16
  const page = Math.max(lineHeight * 4, result.clientHeight * 0.85)
  let nextScrollTop: number | null = null
  switch (event.key) {
    case 'ArrowDown':
      nextScrollTop = result.scrollTop + lineHeight
      break
    case 'ArrowUp':
      nextScrollTop = result.scrollTop - lineHeight
      break
    case 'PageDown':
      nextScrollTop = result.scrollTop + page
      break
    case 'PageUp':
      nextScrollTop = result.scrollTop - page
      break
    case ' ':
      nextScrollTop = result.scrollTop + (event.shiftKey ? -page : page)
      break
    case 'Home':
      nextScrollTop = 0
      break
    case 'End':
      nextScrollTop = result.scrollHeight
      break
    default:
      return
  }
  event.preventDefault()
  const maximum = Math.max(0, result.scrollHeight - result.clientHeight)
  result.scrollTop = Math.min(maximum, Math.max(0, nextScrollTop))
}

export function ToolCallDetail({
  api, run,
  detail,
  completeEvidence,
  expanded,
  resultKey,
  title,
  summaryRef,
  inputOnly = false
}: {
  api?: DesktopApi; run?: AgentRun
  detail: string
  completeEvidence?: ExecutionEvidence
  expanded: boolean
  resultKey: string
  title: string
  summaryRef: RefObject<HTMLElement | null>
  inputOnly?: boolean
}): JSX.Element {
  const t = (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)]))
  const evidenceId = completeEvidence?.id ?? null
  const outputWasTruncated = !inputOnly && false
  const resultLabel = outputWasTruncated ? t('结果') : t('完整结果')
  const [result, setResult] = useExecutionRetainedState<ToolResultViewState>(`result:${resultKey}:${evidenceId}`, () => ({
    evidenceId,
    status: evidenceId ? 'idle' : 'ready',
    text: evidenceId ? '' : detail,
    errorDetail: null
  }))
  const requestSequence = useRef(0)
  const previousEvidenceId = useRef(evidenceId)
  const restoreFocusAfterLoad = useRef(false)
  const resultRef = useRef<HTMLPreElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const scrollHelpId = useId()

  useEffect(() => {
    if (previousEvidenceId.current === evidenceId) return
    previousEvidenceId.current = evidenceId
    requestSequence.current += 1
    restoreFocusAfterLoad.current = false
    setResult({
      evidenceId,
      status: evidenceId ? 'idle' : 'ready',
      text: evidenceId ? '' : detail,
      errorDetail: null
    })
  }, [detail, evidenceId])

  useEffect(() => {
    if (evidenceId !== null) return
    setResult((current) => current.text === detail && current.status === 'ready'
      ? current
      : { evidenceId: null, status: 'ready', text: detail, errorDetail: null })
  }, [detail, evidenceId])

  useEffect(() => () => {
    requestSequence.current += 1
  }, [])

  const loadCompleteResult = useCallback(async (restoreFocus: boolean): Promise<void> => {
    if (!completeEvidence) return
    const sequence = ++requestSequence.current
    restoreFocusAfterLoad.current = restoreFocus
    setResult({
      evidenceId: completeEvidence.id,
      status: 'loading',
      text: '',
      errorDetail: null
    })
    try {
      if (!api || !run) throw new Error('执行内容读取未接入')
      const response = await readExecutionEvidence(api, run, completeEvidence)
      const fullText = executionEvidenceResultText(
        completeEvidence.eventType,
        response.payload,
        completeEvidence.canonical
      )
      if (requestSequence.current !== sequence) return
      setResult({
        evidenceId: completeEvidence.id,
        status: fullText === null ? 'empty' : 'ready',
        text: fullText ?? '',
        errorDetail: null
      })
    } catch (error) {
      if (requestSequence.current !== sequence) return
      setResult({
        evidenceId: completeEvidence.id,
        status: 'failed',
        text: '',
        errorDetail: error instanceof Error ? error.message : String(error)
      })
    }
  }, [api, run, completeEvidence])

  useEffect(() => {
    if (
      expanded
      && completeEvidence
      && result.evidenceId === completeEvidence.id
      && result.status === 'idle'
    ) {
      void loadCompleteResult(false)
    }
  }, [completeEvidence, expanded, loadCompleteResult, result.evidenceId, result.status])

  useLayoutEffect(() => {
    if (!restoreFocusAfterLoad.current) return undefined
    const target = result.status === 'ready'
      ? resultRef.current
      : result.status === 'empty'
        ? summaryRef.current
      : result.status === 'failed'
        ? retryRef.current
        : null
    if (!target) return undefined
    restoreFocusAfterLoad.current = false
    const frame = window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [result.status])

  const idleMessage = outputWasTruncated ? t('展开后读取结果。') : t('展开后读取完整结果。')
  const loadingMessage = outputWasTruncated ? t('正在读取结果…') : t('正在读取完整结果…')
  const failedHeading = outputWasTruncated ? t('未能读取结果') : t('未能读取完整结果')
  const failedDetail = result.errorDetail
    ? outputWasTruncated
      ? t('读取结果失败：{0}', result.errorDetail)
      : t('读取完整结果失败：{0}', result.errorDetail)
    : outputWasTruncated
      ? t('读取结果失败：未知错误')
      : t('读取完整结果失败：未知错误')
  const scrollHelp = inputOnly
    ? t('入参区域获得焦点后，可使用方向键、Page Up、Page Down、空格、Home 和 End 滚动；按 Escape 返回对应指令行。')
    : t('结果区域获得焦点后，可使用方向键、Page Up、Page Down、空格、Home 和 End 滚动；按 Escape 返回对应指令行。')

  return (
    <div className="tool-call-detail" aria-busy={result.status === 'loading'}>
      {result.status === 'ready' && (
        <>
          <span className="sr-only" id={scrollHelpId}>{scrollHelp}</span>
          <TypesetCode
            ref={resultRef}
            data-tool-result-key={resultKey}
            tabIndex={0}
            role="region"
            aria-label={t("{0}的{1}，可滚动", title, inputOnly ? t('入参') : resultLabel)}
            aria-describedby={scrollHelpId}
            onKeyDown={(event) => handleToolResultKeyDown(event, summaryRef.current)}
          >
            {result.text}
          </TypesetCode>
          <ToolOutputTruncationNotice visible={outputWasTruncated} />
        </>
      )}
      {result.status === 'idle' && (
        <div className="tool-result-state" role="status">
          <span>{idleMessage}</span>
        </div>
      )}
      {result.status === 'loading' && (
        <div className="tool-result-state" role="status" aria-live="polite">
          <span className="tool-result-spinner" aria-hidden="true" />
          <span>{loadingMessage}</span>
        </div>
      )}
      {result.status === 'empty' && (
        <div className="tool-result-state" role="status">没有可展示的公开结果。</div>
      )}
      {result.status === 'failed' && (
        <div className="tool-result-state is-error">
          <span className="tool-result-state-copy">
            <strong>{failedHeading}</strong>
            <span>{failedDetail}</span>
          </span>
          <Button variant="secondary" size="sm"
            ref={retryRef}
            className="mt-2"
            type="button"
            onClick={() => void loadCompleteResult(true)}
          >重试</Button>
        </div>
      )}
    </div>
  )
}

