/*
 * [INPUT]: Desktop local skill requests and an isolated npx stand-in.
 * [OUTPUT]: CLI argument scope, exact skill targeting, exit-code interpretation, available names, bulk update scope, cancellation, live progress and single-pass enumeration of installed skill names.
 * [POS]: Regression coverage for the desktop skills CLI host.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
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
  expect(localSkillCliRequest.safeParse({ action: 'update-all', requestId }).success).toBe(true)
  expect(localSkillCliRequest.safeParse({ action: 'update-all', requestId, id: 'local:' + 'a'.repeat(64) }).success).toBe(false)
  expect(localSkillCliRequest.safeParse({ action: 'update', requestId, id: '--all' }).success).toBe(false)
  expect(localSkillCliRequest.safeParse({ action: 'check', requestId, command: 'whoami' }).success).toBe(false)
})

test.skipIf(process.platform === 'win32')('runs one global command or the exact selected skill and keeps CLI outcomes distinct', async () => {
  const home = await mkdtemp(join(tmpdir(), 'boai-local-skill-cli-'))
  const archive = join(home, 'skills-cli.tgz')
  const cli = new LocalSkillCli(archive, home)
  try {
    vi.stubEnv('PATH', [home, process.env.PATH].join(delimiter))
    await writeFile(join(home, 'npx'), `#!/bin/sh
printf '%s\\n' "$npm_config_package" "$@"
if [ "$3" = check ] && [ -z "$7" ]; then
  printf '↑ report has an update\\n1 skill(s) can be updated; run npx skills update to install\\n'
  exit 1
fi
if [ "$3" = update ] && [ -z "$7" ]; then
  printf '  ✓ Updated report\\n✓ Updated 1 skill(s)\\n'
  exit 0
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
    expect(await checking).toMatchObject({ status: 'available', availableSkills: ['report'], output: expect.stringContaining(`${archive}\n--yes\nskills\ncheck\n--global\n--yes\n↑ report`) })
    expect(await cli.run('check', 'report')).toMatchObject({ status: 'completed', output: expect.stringContaining('check\n--global\n--yes\n--\nreport') })
    expect(await cli.run('check', 'unavailable')).toMatchObject({ status: 'unsupported' })
    expect(await cli.run('check', 'failed')).toMatchObject({ status: 'failed' })
    expect(await cli.run('update', 'report')).toMatchObject({ status: 'completed', output: expect.stringContaining('update\n--global\n--yes\n--\nreport\n✓ Updated 1 skill(s)') })
    expect(await cli.run('update-all')).toMatchObject({ status: 'completed', command: 'npx --yes skills update --global --yes', updatedSkills: ['report'] })
    expect(() => cli.run('update', '--all')).toThrow('技能目录名')

    await writeFile(join(home, 'npx'), `#!/bin/sh
printf 'Fetching\\r\\n'
printf 'Checking source\\n' >&2
while [ ! -f release ]; do sleep 0.05; done
printf 'Finished\\n'
`)
    const progress = vi.fn()
    const inProgress = cli.run('check', 'report', progress)
    const command = 'npx --yes skills check --global --yes -- report'
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

test('the pinned skills CLI checks canonical and agent-only skills without rereading the agent directory for every skill', async () => {
  const home = await mkdtemp(join(tmpdir(), 'boai-skill-inventory-'))
  const names = ['alpha', 'beta', 'agent-only', 'missing']
  const hash = 'a'.repeat(40)
  try {
    for (const [directory, name] of [
      ['.agents/skills/alpha', 'alpha'], ['.agents/skills/beta', 'beta'], ['.claude/skills/old-folder', 'agent-only'],
    ]) {
      const path = join(home, directory)
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture\n---\n`)
    }
    const skills = Object.fromEntries(names.map(name => [name, {
      source: 'fixture/skills', sourceType: 'github', skillPath: `${name}/SKILL.md`, skillFolderHash: hash,
    }]))
    await writeFile(join(home, '.agents/.skill-lock.json'), JSON.stringify({ version: 3, skills }))
    const tree = names.flatMap(name => [
      { type: 'tree', path: name, sha: hash }, { type: 'blob', path: `${name}/SKILL.md`, sha: hash },
    ])
    const preload = join(home, 'measure.mjs')
    await writeFile(preload, `
      import fs from 'node:fs/promises'
      import { syncBuiltinESMExports } from 'node:module'
      const read = fs.readFile
      fs.readFile = function(path, ...args) {
        if (path === ${JSON.stringify(join(home, '.claude/skills/old-folder/SKILL.md'))}) console.log('read agent-only skill')
        return read.call(this, path, ...args)
      }
      syncBuiltinESMExports()
      globalThis.fetch = async () => Response.json({ sha: '${hash}', tree: ${JSON.stringify(tree)} })
    `)
    const cli = createRequire(import.meta.url).resolve('skills/bin/cli.mjs')
    // The CLI returns 1 when it finds a genuine update.
    const { error, stdout } = await new Promise<{ error: Error | null; stdout: string }>(resolve => {
      execFile(process.execPath, ['--import', pathToFileURL(preload).href, cli, 'check', '--global', '--yes'], {
        cwd: home, env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH, NO_COLOR: '1', DISABLE_TELEMETRY: '1' },
      }, (error, stdout) => resolve({ error, stdout }))
    })
    expect(error).toMatchObject({ code: 1 })
    expect(stdout).toContain('[1/1] fixture/skills: fetched')
    expect(stdout.indexOf('[1/1]')).toBeLessThan(stdout.indexOf('Checking skills from source: fixture/skills'))
    expect(stdout).toContain('↑ missing has an update')
    expect(stdout).toContain('1 skill(s) can be updated;')
    expect(stdout.split('read agent-only skill').length - 1).toBe(1)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
