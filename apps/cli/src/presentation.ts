/*
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: animation only on interactive stderr, separate structured diagnostics, no payload logging.
 * [INPUT]: Fixed Craft spinner pattern, terminal capabilities and explicit CLI display options.
 * [OUTPUT]: TTY-only connection animation, clean stdout and bounded lifecycle diagnostics.
 * [POS]: CLI presentation only; never changes requests or service ownership.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
export type CliDiagnostic = { event: 'connecting' | 'connected' | 'service_start' | 'service_ready' | 'service_reused' | 'service_exit' | 'service_background' | 'service_failed'; pid?: number; serverId?: string; logPath?: string; elapsedMs?: number; code?: string }
type Sink = { isTTY?: boolean; write(text: string): unknown }
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export class CliPresentation {
  private timer?: ReturnType<typeof setInterval>
  private drawn = false
  constructor(private readonly options: { stdout: Sink; stderr: Sink; json: boolean; verbose?: boolean; noSpinner?: boolean; noColor?: boolean; term?: string }) {}
  private clear() { if (this.drawn) { this.options.stderr.write('\r\x1b[2K'); this.drawn = false } }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.clear() }
  wait(label: string) {
    this.stop()
    if (!this.options.stdout.isTTY || !this.options.stderr.isTTY || this.options.json || this.options.noSpinner || this.options.noColor || this.options.term === 'dumb') return
    let index = 0
    const paint = () => { this.clear(); this.options.stderr.write(label + ' ' + frames[index++ % frames.length]); this.drawn = true }
    paint(); this.timer = setInterval(paint, 80); this.timer.unref()
  }
  stdout(text: string) { this.stop(); this.options.stdout.write(text) }
  stderr(text: string) { this.stop(); this.options.stderr.write(text) }
  diagnostic(value: CliDiagnostic) {
    if (!this.options.verbose) return
    this.clear()
    // Copy the declared fields, never an RPC payload, environment or error object.
    const { event, pid, serverId, logPath, elapsedMs, code } = value
    this.options.stderr.write(JSON.stringify({ type: 'diagnostic', event, pid, serverId, logPath, elapsedMs, code }) + '\n')
  }
}
