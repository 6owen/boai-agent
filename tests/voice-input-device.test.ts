// @vitest-environment jsdom
/*
 * [INPUT]: Controlled MediaDevices permissions, exact devices and cancellation signals.
 * [OUTPUT]: No device fallback, physical tracks close on late permission and explicit cancellation.
 * [POS]: Voice microphone contract tests; no real microphone or audio model.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { openVoiceMicrophone } from '../packages/voice-input-plugin/src/capture'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function fixture(deviceId = 'usb') {
  const stop = vi.fn(), track = { stop, getSettings: () => ({ deviceId }) }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
  const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  return { stop, stream, getUserMedia }
}
it('selects the exact saved microphone and physically closes it on cancel', async () => {
  const f = fixture(), controller = new AbortController()
  const mic = await openVoiceMicrophone(controller.signal, 'usb')
  expect(f.getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'usb' }, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
  controller.abort(); expect(f.stop).toHaveBeenCalledOnce(); mic.close()
})
it('rejects missing devices without retrying the system default', async () => {
  const f = fixture(); f.getUserMedia.mockRejectedValue(new DOMException('not found', 'OverconstrainedError'))
  await expect(openVoiceMicrophone(new AbortController().signal, 'usb')).rejects.toThrow('重新选择')
  expect(f.getUserMedia).toHaveBeenCalledOnce()
})
it('closes a late permission result after the initiating page was cancelled', async () => {
  const f = fixture(), controller = new AbortController()
  let resolve!: (stream: MediaStream) => void
  f.getUserMedia.mockImplementation(() => new Promise<MediaStream>(done => { resolve = done }))
  const pending = openVoiceMicrophone(controller.signal, 'usb'); controller.abort(); resolve(f.stream)
  await expect(pending).rejects.toThrow(); expect(f.stop).toHaveBeenCalledOnce()
})
it('rejects a browser returning a different device, and default selection omits exact constraints', async () => {
  const f = fixture('other')
  await expect(openVoiceMicrophone(new AbortController().signal, 'usb')).rejects.toThrow('设备已变化')
  expect(f.stop).toHaveBeenCalledOnce()
  const mic = await openVoiceMicrophone(new AbortController().signal)
  expect(f.getUserMedia.mock.calls.at(-1)?.[0].audio).not.toHaveProperty('deviceId'); mic.close()
})
