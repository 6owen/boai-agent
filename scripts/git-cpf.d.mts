/*
 * [INPUT]: Command arguments and an injectable process runner for isolated tests.
 * [OUTPUT]: Types for the standalone git-cpf.mjs command.
 * [POS]: Development command public test boundary; no product runtime dependency.
 * [PROTOCOL]: Update scripts/.folder.md when changed.
 */
import type { ExecFileOptions } from 'node:child_process'

export function runCpf(args: string[], options?: {
  cwd?: string
  exec?: (program: string, args: string[], options: ExecFileOptions & { encoding: 'utf8' }) => Promise<{ stdout: string; stderr?: string }>
  log?: (message: string) => void
  signal?: AbortSignal
}): Promise<unknown>
