/*
 * [INPUT]: 已保存员工连接与原生返回的模型能力。
 * [OUTPUT]: 网关从当前模型目录提供原始档位，丢失能力仍可返回默认； 推理选项不跨连接猜测，切换模型/推理保留本机权限，未知档位只按实际目录裁剪。
 * [POS]: Composer配置投影回归，不调用模型。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect, it } from 'vitest'
import { composerEffortPatch, composerEfforts, composerModelPatch } from '../src/renderer/pages/conversations/composer-model-state'
import type { Connection, DigitalAgent } from '../src/shared/domain'
const native = { id: 'a', modelId: 'native-model', executionBackend: { kind: 'codex-local', profileId: 'p' }, nativeOptions: { effort: 'high', codexApprovalPolicy: 'on-request', codexSandbox: 'workspace-write' } } as DigitalAgent
it('uses only actual native effort metadata and preserves permission options', () => {
  expect(composerEfforts(native, undefined, [])).toEqual([])
  expect(composerEfforts(native, undefined, [{ value: 'native-model', supportedEffortLevels: ['low', 'medium', 'high'] }])).toEqual(['', 'low', 'medium', 'high'])
  expect(composerEffortPatch(native, 'medium')).toEqual({ nativeOptions: { ...native.nativeOptions, effort: 'medium' } })
  expect(composerEffortPatch(native, '')).toEqual({ nativeOptions: { ...native.nativeOptions, effort: undefined } })
})
it('clears an unsupported effort only when the new model reports its capabilities', () => {
  expect(composerModelPatch(native, { value: 'next' })).toEqual({ modelId: 'next' })
  expect(composerModelPatch(native, { value: 'next', supportedEffortLevels: ['low'] })).toEqual({ modelId: 'next', nativeOptions: { ...native.nativeOptions, effort: undefined } })
})
it('keeps API effort support within the verified provider contract', () => {
  const agent = { ...native, executionBackend: { kind: 'mastra-model' }, modelId: 'deepseek-v4-pro' } as DigitalAgent
  const connection = { provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com', defaultModel: agent.modelId } as Connection
  expect(composerEfforts(agent, connection, [])).toEqual(['auto', 'off', 'low', 'high', 'max'])
  expect(composerEfforts(agent, { ...connection, baseUrl: 'https://gateway.example.com' }, [])).toEqual([])
  expect(composerEffortPatch(agent, 'low')).toEqual({ thinkingLevel: 'low' })
})

it('projects gateway raw effort levels for the exact selected model and lets stale preferences return to default', () => {
  const agent = { ...native, executionBackend: { kind: 'mastra-model' }, modelId: '', thinkingLevel: 'xhigh' } as DigitalAgent
  const connection = { provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'vendor/model', gateway: { kind: 'magpie', protocol: 'responses', auth: 'local' } } as Connection
  const models = [{ value: 'vendor/model', supportedEffortLevels: ['none', 'medium', 'xhigh', 'future_effort'] }, { value: 'other', supportedEffortLevels: ['low'] }]
  expect(composerEfforts(agent, connection, models)).toEqual(['auto', 'none', 'medium', 'xhigh', 'future_effort'])
  expect(composerEfforts(agent, connection, [])).toEqual(['auto'])
  expect(composerEfforts({ ...agent, thinkingLevel: 'auto' }, connection, [])).toEqual([])
  expect(composerEfforts(agent, { ...connection, gateway: { ...connection.gateway!, protocol: 'messages' } }, models)).toEqual(['auto', 'none', 'medium', 'xhigh', 'future_effort'])
  expect(composerModelPatch(agent, models[1])).toEqual({ modelId: 'other', thinkingLevel: 'auto' })
  expect(composerEffortPatch(agent, 'future_effort')).toEqual({ thinkingLevel: 'future_effort' })
})
