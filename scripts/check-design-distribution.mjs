/*
 * [INPUT]: 已构建tokens/ui、真实npm tarball和锁定消费者依赖。
 * [OUTPUT]: 仓库外安装/Node导入/类型检查/Vite构建后的独立消费者。
 * [POS]: 设计系统分发检查；仅打npm tarball，不发布或打桌面包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readdir, writeFile, readFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const run = promisify(execFile)
const root = process.cwd()
const directory = await mkdtemp(join(tmpdir(), 'boai-design-consumer-'))
try {
  const archives = join(directory, 'archives')
  await mkdir(archives)
  for (const name of ['tokens', 'ui']) await run('pnpm', ['pack', '--pack-destination', archives], { cwd: resolve(root, 'packages', name) })
  const files = await readdir(archives)
  const archive = name => {
    const matches = files.filter(file => file.startsWith(`boai-${name}-`) && file.endsWith('.tgz'))
    if (matches.length !== 1) throw new Error(`Expected one ${name} tarball`)
    return pathToFileURL(join(archives, matches[0])).href
  }
  const consumer = join(directory, 'consumer')
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
    '@boai/tokens': archive('tokens'), '@boai/ui': archive('ui'), react: '19.3.0', 'react-dom': '19.3.0',
  }, pnpm: { overrides: { '@boai/tokens': archive('tokens') } }, devDependencies: { vite: '8.3.1', '@vitejs/plugin-react': '6.1.1', '@tailwindcss/vite': '4.3.3', tailwindcss: '4.3.3', typescript: '7.0.2', '@types/react': '19.3.0', '@types/react-dom': '19.3.0' } }, null, 2))
  await writeFile(join(consumer, 'index.html'), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>')
  await writeFile(join(consumer, 'main.tsx'), `import { createRoot } from 'react-dom/client';\nimport { Button, Input, Card, CardHeader, CardTitle, CardContent, Field, FieldLabel, Skeleton } from '@boai/ui';\nimport './style.css';\ncreateRoot(document.getElementById('root')!).render(<Card><CardHeader><CardTitle>External consumer</CardTitle></CardHeader><CardContent><Field><FieldLabel htmlFor="name">Project</FieldLabel><Input id="name" placeholder="Project name" /></Field><Button>Save</Button><Button disabled>Disabled</Button><Skeleton className="h-4 w-32" /></CardContent></Card>);\n`)
  await writeFile(join(consumer, 'style.css'), "@import 'tailwindcss';\n@import '@boai/ui/styles.css';\n:root { font-family:var(--font-ui-family);font-size:var(--text-ui-body);color:var(--foreground);background:var(--background) }\nbody { padding:32px;max-width:640px;margin:auto }\n")
  await writeFile(join(consumer, 'vite.config.ts'), "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\nexport default defineConfig({plugins:[react(),tailwindcss()]});\n")
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, types: ['vite/client'], lib: ['ES2022', 'DOM'] }, include: ['main.tsx'] }))
  await run('pnpm', ['install', '--ignore-scripts'], { cwd: consumer, maxBuffer: 4 * 1024 * 1024 })
  await run(process.execPath, ['--input-type=module', '-e', "const t=await import('@boai/tokens'); if(t.foundationVariables('light')['--text-ui-body']!=='13px') throw Error('Missing public token defaults')"], { cwd: consumer })
  await run('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: consumer })
  await run('pnpm', ['exec', 'vite', 'build'], { cwd: consumer })
  const destination = resolve(root, '.local/design-consumer')
  await rm(destination, { recursive: true, force: true })
  await cp(join(consumer, 'dist'), destination, { recursive: true })
  const packageData = JSON.parse(await readFile(join(consumer, 'node_modules/@boai/ui/package.json'), 'utf8'))
  if (Object.values(packageData.dependencies).some(version => version.startsWith('workspace:'))) throw new Error('Tarball still references workspace dependencies')
  process.stdout.write('Design tarballs installed, type-checked and built outside the workspace.\n')
} finally {
  await rm(directory, { recursive: true, force: true })
}
