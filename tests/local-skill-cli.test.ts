/*
 * [INPUT]: Desktop local skill requests and an isolated npx stand-in.
 * [OUTPUT]: CLI argument scope, exact skill targeting, exit-code interpretation, cancellation and progress before exit.
 * [POS]: Regression coverage for the desktop skills CLI host.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { LocalSkillCli, localSkillCliRequest } from '../apps/electron/src/main/local-skill-cli'
import { isMainWindowMethod } from '../apps/electron/src/main/main-window-methods'
import { isPublicMethod } from '@boai/shared/ipc/public-methods'

test('local skill execution is main-window-only and takes catalog IDs rather than shell text', () => {
  expect(isMainWindowMethod('localSkillCli')).toBe(true)
  expect(isPublicMethod('localSkillCli')).toBe(false)
  const requestId = randomUUID()
  expect(localSkillCliRequest.safeParse({ action: 'check', requestId }).success).toBe(true)
  expect(localSkillCliRequest.safeParse({ action: 'update', requestId }).success).toBe(false)
  expect(localSkillCliRequest.safeParse({ action: 'update', requestId, id: '--all' }).success).toBe(false)
  expect(localSkillCliRequest.safeParse({ action: 'check', requestId, command: 'whoami' }).success).toBe(false)
})

test.skipIf(process.platform === 'win32')('runs one global command or the exact selected skill and keeps CLI outcomes distinct', async () => {
  const home = await mkdtemp(join(tmpdir(), 'boai-local-skill-cli-'))
  const cli = new LocalSkillCli(home)
  try {
    vi.stubEnv('PATH', [home, process.env.PATH].join(delimiter))
    await writeFile(join(home, 'npx'), `#!/bin/sh
printf '%s\\n' "$@"
if [ "$3" = check ] && [ -z "$7" ]; then
  printf '↑ report has an update\\n1 skill(s) can be updated; run npx skills update to install\\n'
  exit 1
fi
if [ "$7" = unavailable ]; then
  printf 'No installed skills found matching: unavailable\\n'
elif [ "$7" = failed ]; then
  printf '  ✗ Failed to check skills from example\\n'
elif [ "$7" = report ] && [ "$3" = update ]; then
  printf '✓ Updated 1 skill(s)\\n'
fi
`, { mode: 0o755 })
    const checking = cli.run('check')
    expect(cli.run('check')).toBe(checking)
    expect(await checking).toMatchObject({ status: 'available', output: expect.stringContaining('--yes\nskills@1.9.0\ncheck\n--global\n--yes\n↑ report') })
    expect(await cli.run('check', 'report')).toMatchObject({ status: 'completed', output: expect.stringContaining('check\n--global\n--yes\n--\nreport') })
    expect(await cli.run('check', 'unavailable')).toMatchObject({ status: 'unsupported' })
    expect(await cli.run('check', 'failed')).toMatchObject({ status: 'failed' })
    expect(await cli.run('update', 'report')).toMatchObject({ status: 'completed', output: expect.stringContaining('update\n--global\n--yes\n--\nreport\n✓ Updated 1 skill(s)') })
    expect(() => cli.run('update', '--all')).toThrow('技能目录名')

    await writeFile(join(home, 'npx'), `#!/bin/sh
printf 'Fetching\\r\\n'
printf 'Checking source\\n' >&2
while [ ! -f release ]; do sleep 0.05; done
printf 'Finished\\n'
`)
    const progress = vi.fn()
    const inProgress = cli.run('check', 'report', progress)
    const command = 'npx --yes skills@1.9.0 check --global --yes -- report'
    expect(progress).toHaveBeenCalledWith({ command, output: '' })
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith({ command, output: expect.stringContaining('Checking source\n') }))
    const joined = vi.fn()
    expect(cli.run('check', 'report', joined)).toBe(inProgress)
    expect(joined).toHaveBeenCalledWith({ command, output: expect.stringContaining('Fetching\n') })
    await writeFile(join(home, 'release'), '')
    expect(await inProgress).toMatchObject({ command, status: 'completed', output: expect.stringContaining('Finished') })

    await writeFile(join(home, 'npx'), '#!/bin/sh\nexec sleep 30\n')
    const stopped = cli.run('check')
    await expect(cli.stopCheck()).resolves.toMatchObject({ status: 'cancelled' })
    await expect(stopped).resolves.toMatchObject({ status: 'cancelled' })
  } finally {
    await cli.close()
    vi.unstubAllEnvs()
    await rm(home, { recursive: true, force: true })
  }
})
