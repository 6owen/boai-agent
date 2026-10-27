/*
 * [INPUT]: Public fields from the installed Claude init shape and private extension fields.
 * [OUTPUT]: Skill/plugin discovery survives normalization without leaking plugin paths, credentials or arbitrary fields.
 * [POS]: Native parity regression for Claude execution receipts; not a real-model acceptance test.
 * [PROTOCOL]: Update tests/.folder.md when changing this test.
 */
import { expect, it } from 'vitest'
import { claudePublicInfo } from '../packages/runtime/src/adapters/claude/conversation'

it('retains native skill and plugin identities while excluding private initialization fields', () => {
  const actual = claudePublicInfo({
    skills: ['parity-native', 'kata-code:project-toolchain', null, { name: 'private' }],
    plugins: [{ name: 'kata-code', source: 'kata-code@6owen-kata', version: '0.0.0', path: '/private/plugin', apiKey: 'PRIVATE_KEY' }, { path: '/invalid' }],
    tools: ['Skill'], agents: ['general-purpose'],
    apiKey: 'PRIVATE_KEY', account: { email: 'private@example.test' },
  })
  expect(actual).toEqual({
    skills: ['parity-native', 'kata-code:project-toolchain'],
    plugins: [{ name: 'kata-code', source: 'kata-code@6owen-kata', version: '0.0.0' }],
    tools: ['Skill'], agents: [{ name: 'general-purpose' }],
  })
  expect(JSON.stringify(actual)).not.toMatch(/PRIVATE_KEY|\/private\/|private@example/)
})

it('keeps optional native directories absent for older or incomplete CLI frames', () => {
  expect(claudePublicInfo({ commands: [{ name: 'hello', description: 'public' }] })).toEqual({ commands: [{ name: 'hello', description: 'public' }] })
  expect(claudePublicInfo({ skills: 'invalid', plugins: null })).toEqual({})
})
