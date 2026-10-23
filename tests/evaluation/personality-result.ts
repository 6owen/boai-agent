/*
 * [INPUT]: Actual terminal conversation snapshot from the personality runner.
 * [OUTPUT]: A withheld or absent public reply is a failed observation even when its execution run completed.
 * [POS]: Evaluation-only completion gate; never changes product publication or work evidence.
 * [PROTOCOL]: Update Header and evaluation/.folder.md when changed.
 */
import type { ConversationDetail } from '../../src/shared/domain'
export function personalityTurnFailure(detail: Pick<ConversationDetail, 'messages' | 'runs' | 'turns'>): string | undefined {
  if (detail.runs.some(run => ['failed', 'interrupted', 'cancelled'].includes(run.status))) return 'run_failed'
  const source = [...detail.messages].reverse().find(message => message.senderType === 'user')
  const sourceIndex = source ? detail.messages.indexOf(source) : -1
  if (detail.runs.some(run => run.triggerMessageId === source?.id && run.draft?.status === 'withheld')) return 'reply_withheld'
  if (sourceIndex < 0 || !detail.messages.slice(sourceIndex + 1).some(message => message.senderType === 'agent' && message.content.trim())) return 'public_reply_missing'
  if (detail.turns?.some(turn => turn.triggerMessageId === source?.id && ['failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status))) return 'turn_failed'
  return undefined
}
