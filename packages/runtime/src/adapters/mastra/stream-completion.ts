/*
 * [INPUT]: SDK finish reason for each step/final result after known length/tool limits are handled.
 * [OUTPUT]: Only a confirmed normal completion accepts final results; explicit tool completion permits the next step.
 * [POS]: Shared API stream completion guard; incomplete transport is never a format-repair signal.
 * [PROTOCOL]: Update Header and mastra/.folder.md when this contract changes.
 */
export function assertStreamCompleted(reason: string | undefined, allowToolStep = false) {
  if (reason !== 'stop' && !(allowToolStep && (reason === 'tool-calls' || reason === 'tool_calls'))) throw new Error('模型响应未确认正常完成，请核对本次结果')
}
