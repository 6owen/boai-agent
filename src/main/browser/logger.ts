/*
 * [INPUT]: 迁入代码的原日志调用与脱敏诊断消费者。
 * [OUTPUT]: 只输出有界分类标识，不将 URL、网页文本或网站日志写入共享日志。
 * [POS]: src/main/browser/logger.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
type Diagnostic = (entry: { level: 'info' | 'warn' | 'error'; component: string }) => void
let diagnostic: Diagnostic | undefined
export function setBrowserDiagnostic(callback?: Diagnostic): void { diagnostic = callback }
function emit(level: 'info' | 'warn' | 'error', value: unknown): void {
  const component = typeof value === 'string' ? value.match(/^\[([a-z-]+)\]/)?.[1] ?? 'browser' : 'browser'
  diagnostic?.({ level, component })
}
export const mainLog = { info: (...values: unknown[]) => emit('info', values[0]), warn: (...values: unknown[]) => emit('warn', values[0]), error: (...values: unknown[]) => emit('error', values[0]) }
