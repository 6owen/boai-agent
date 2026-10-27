/*
 * [OUTPUT]: 2026-10-27 Qwen实际实时协议、确认片段排序/去重及未知用量，不重传。
 * [INPUT]: Explicit Qwen Realtime endpoint/key and ordered PCM16 chunks.
 * [OUTPUT]: Actual partial/final segments, bounded transport and truthful partial failure; no reconnect/replay/fallback.
 * [POS]: Main-side ASR adapter; protocol frozen against official client/server events on 2026-10-27.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import type { VoiceEvent, VoiceResult, VoiceSettings } from './protocol'
import { voiceEndpoint } from './settings'
export class QwenRecognition {
  private socket: WebSocket
  private segments = new Map<string, { sequence: number; revision: number; text: string; final: boolean }>()
  private finishing = false
  private ended = false
  private error?: string
  private resolve!: (complete: boolean) => void
  private done = new Promise<boolean>(resolve => { this.resolve = resolve })
  readonly ready: Promise<void>
  constructor(private sessionId: string, settings: VoiceSettings, key: string, private emit: (event: VoiceEvent) => void, connect: (url: URL, options: WebSocket.ClientOptions) => WebSocket = (url, options) => new WebSocket(url, options)) {
    const url = voiceEndpoint(settings.online.endpoint); url.searchParams.set('model', settings.online.model)
    this.socket = connect(url, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 15_000, maxPayload: 1024 * 1024, followRedirects: false })
    this.ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('识别服务配置确认超时')); this.fail('识别服务配置确认超时') }, 15_000)
      const rejectReady = () => { clearTimeout(timeout); reject(new Error('识别服务连接失败')) }
      this.socket.once('error', rejectReady); this.socket.once('close', rejectReady)
      this.socket.once('open', () => this.send('session.update', { session: { input_audio_format: 'pcm', sample_rate: 16000,
        input_audio_transcription: { ...(settings.terms.length ? { corpus: { text: settings.terms.map(term => [term.word, ...term.aliases].join(' / ')).join('\n') } } : {}) },
        turn_detection: { type: 'server_vad', threshold: 0.2, silence_duration_ms: 800 },
      } }))
      this.socket.on('message', bytes => {
        try {
          const data = JSON.parse(bytes.toString())
          if (data.type === 'session.updated') { clearTimeout(timeout); this.socket.off('error', rejectReady); this.socket.off('close', rejectReady); resolve(); return }
          this.receive(data)
        } catch { this.fail('识别服务返回了无法确认的数据') }
      })
    })
    this.socket.on('error', () => this.fail('在线识别连接失败，已保留确认的片段'))
    this.socket.on('close', () => { if (!this.ended) this.fail('在线识别连接已断开，尾段尚未确认') })
  }
  private send(type: string, data: Record<string, unknown> = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error('识别连接不可用')
    this.socket.send(JSON.stringify({ event_id: randomUUID(), type, ...data }))
  }
  append(pcm: Uint8Array) {
    if (this.ended || this.finishing) throw new Error('识别会话已结束')
    if (this.socket.bufferedAmount > 2 * 1024 * 1024) { this.fail('识别网络发送队列已满'); throw new Error('识别网络发送队列已满') }
    this.send('input_audio_buffer.append', { audio: Buffer.from(pcm).toString('base64') })
  }
  private receive(data: Record<string, unknown>) {
    if (this.ended) return
    if (data.type === 'error' || data.type === 'conversation.item.input_audio_transcription.failed') { this.fail('识别服务未能完成本次转写'); return }
    if (data.type === 'session.finished') {
      const complete = this.finishing && [...this.segments.values()].every(item => item.final)
      if (!complete) this.error = '识别服务结束时仍有未确认片段'
      this.ended = true; this.resolve(complete); this.socket.close(); return
    }
    const type = data.type
    if (!['input_audio_buffer.speech_started', 'conversation.item.input_audio_transcription.text', 'conversation.item.input_audio_transcription.completed'].includes(String(type))) return
    if (typeof data.item_id !== 'string' || data.item_id.length > 200) throw new Error('Missing item identity')
    const prior = this.segments.get(data.item_id)
    if (prior?.final) return
    const text = type === 'conversation.item.input_audio_transcription.completed' ? data.transcript : type === 'conversation.item.input_audio_transcription.text' ? String(data.text ?? '') + String(data.stash ?? '') : ''
    if (typeof text !== 'string' || text.length > 64_000) throw new Error('Invalid transcription')
    const item = { sequence: prior?.sequence ?? this.segments.size, revision: (prior?.revision ?? 0) + 1, text, final: type === 'conversation.item.input_audio_transcription.completed' }
    this.segments.set(data.item_id, item)
    this.emit({ type: 'segment', sessionId: this.sessionId, id: data.item_id, ...item })
  }
  private fail(error: string) {
    if (this.ended) return
    this.error = error; this.ended = true; this.resolve(false); this.socket.terminate()
    this.emit({ type: 'failed', sessionId: this.sessionId, error })
  }
  async finish(): Promise<VoiceResult> {
    if (!this.ended && !this.finishing) { this.finishing = true; this.send('session.finish') }
    const timer = setTimeout(() => this.fail('识别服务未确认最后片段，已保留确认的文字'), 15_000)
    const complete = await this.done; clearTimeout(timer)
    return { sessionId: this.sessionId, text: [...this.segments.values()].filter(item => item.final).sort((a, b) => a.sequence - b.sequence).map(item => item.text).join(''), complete, error: this.error, usage: 'unknown' }
  }
  cancel() { this.ended = true; this.resolve(false); this.socket.terminate() }
}
