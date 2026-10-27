/*
 * [OUTPUT]: 2026-10-27 Qwen确认/重复/乱序/断流和取消协议回归源码。
 * [INPUT]: Qwen socket events, finalization, duplicate segments and interrupted audio.
 * [OUTPUT]: Ordered confirmed text, truthful partial results and cancellation without reconnect.
 * [POS]: Controlled protocol regression source; no provider or microphone access.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import type WebSocket from 'ws'
import { QwenRecognition } from '../packages/voice-input-plugin/src/qwen'
import { defaultVoiceSettings, type VoiceEvent } from '../packages/voice-input-plugin/src/protocol'
class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; sent: { type: string }[] = []; terminated = false
  send(value: string) { this.sent.push(JSON.parse(value)) }
  close() { this.readyState = 3; this.emit('close') }
  terminate() { this.terminated = true; this.close() }
  receive(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value))) }
}
function fixture() {
  const socket = new Socket(), events: VoiceEvent[] = []
  const asr = new QwenRecognition('session', defaultVoiceSettings(), 'fixture-secret', event => events.push(event), () => socket as unknown as WebSocket)
  socket.emit('open'); socket.receive({ type: 'session.updated' })
  return { socket, asr, events }
}
it('orders by speech onset, ignores duplicate finals and excludes previews from the final result', async () => {
  const { socket, asr, events } = fixture(); await asr.ready
  for (const item_id of ['a', 'b']) socket.receive({ type: 'input_audio_buffer.speech_started', item_id })
  socket.receive({ type: 'conversation.item.input_audio_transcription.text', item_id: 'a', text: '预算', stash: '一千' })
  expect(events.at(-1)).toMatchObject({ text: '预算一千', final: false })
  socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'b', transcript: '不要发布。' })
  socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: '预算1234元。' })
  socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: '重复错误' })
  const result = asr.finish(); socket.receive({ type: 'session.finished' })
  expect(await result).toMatchObject({ complete: true, text: '预算1234元。不要发布。', usage: 'unknown' })
  expect(socket.sent.map(item => item.type)).toEqual(['session.update', 'session.finish'])
})
it('keeps only confirmed segments after disconnect and never presents a partial tail as complete', async () => {
  const { socket, asr } = fixture(); await asr.ready
  socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: '保留原文' })
  socket.receive({ type: 'conversation.item.input_audio_transcription.text', item_id: 'b', text: '', stash: '未确认尾段' })
  socket.close()
  expect(await asr.finish()).toMatchObject({ complete: false, text: '保留原文', usage: 'unknown' })
  expect(socket.terminated).toBe(true)
  expect(socket.sent.map(item => item.type)).toEqual(['session.update'])
})
it('cancels a pending connection and rejects readiness without leaving its timer or socket alive', async () => {
  const socket = new Socket(), asr = new QwenRecognition('pending', defaultVoiceSettings(), 'fixture-secret', () => {}, () => socket as unknown as WebSocket)
  const rejected = asr.ready.catch(error => error)
  asr.cancel(); expect(await rejected).toBeInstanceOf(Error); expect(socket.terminated).toBe(true)
})
