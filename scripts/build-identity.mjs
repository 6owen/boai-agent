/*
 * [INPUT]: 实际源码/资源/构建配置和完整dist字节。
 * [OUTPUT]: 构建前后同源/全dist哈希核对；跨次构建按输入/输出/Node比身份，记录时间不充当字节差异。
 * [POS]: 构建与开发测试共用的产物身份，不进入产品运行协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, readlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export async function buildInputHash(root = process.cwd()) {
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src', 'resources', 'scripts/build.mjs', 'scripts/build-*.mjs', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'vite.config.ts', 'tailwind.config.ts', 'tsconfig.json'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).split('\0').filter(path => path && !path.endsWith('/.folder.md')).sort()
  const digest = createHash('sha256')
  for (const path of paths) { digest.update(path + '\0'); try { digest.update(await readFile(join(root, path))) } catch (error) { if (error.code !== 'ENOENT') throw error; digest.update('<deleted>') } }
  return digest.digest('hex')
}

async function outputHash(directory) {
  const digest = createHash('sha256')
  const walk = async (directory, prefix = '') => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const path = join(directory, entry.name), key = prefix + entry.name
      if (key === 'build-identity.json') continue
      if (entry.isDirectory()) await walk(path, key + '/')
      else { digest.update(key + '\0'); digest.update(entry.isSymbolicLink() ? await readlink(path) : await readFile(path)) }
    }
  }
  await walk(directory)
  return digest.digest('hex')
}

export async function recordBuildIdentity(expected, root = process.cwd()) {
  if (await buildInputHash(root) !== expected) throw new Error('构建期间输入变化，禁止登记构建通过')
  const identity = { version: 1, inputHash: expected, outputHash: await outputHash(join(root, 'dist')), node: process.version, createdAt: new Date().toISOString() }
  await writeFile(join(root, 'dist/build-identity.json'), JSON.stringify(identity, null, 2) + '\n')
  return identity
}

export async function verifyBuildIdentity(root = process.cwd()) {
  const identity = JSON.parse(await readFile(resolve(root, 'dist/build-identity.json'), 'utf8').catch(() => { throw new Error('缺少构建身份，请先运行pnpm build') }))
  if (identity.version !== 1 || identity.inputHash !== await buildInputHash(root)) throw new Error('dist与当前源码/资源不匹配，请先运行pnpm build')
  if (identity.outputHash !== await outputHash(join(root, 'dist'))) throw new Error('dist构建字节已变化，请重新构建后测试')
  return identity
}

export function sameBuildBytes(left, right) {
  return left?.version === 1 && right?.version === 1 && ['inputHash', 'outputHash', 'node'].every(key => typeof left[key] === 'string' && left[key] === right[key])
}
