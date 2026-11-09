/*
 * [OUTPUT]: 2026-11-09 bobo默认使用工作区，普通员工沿配置生成项目快照。
 * [INPUT]: Saved project choices, employee defaults and legacy message locations.
 * [OUTPUT]: Fixed work-location snapshots and admission-time path identity checks.
 * [POS]: Shared directory semantics for task, chat and native/API execution.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import path from 'node:path'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DigitalAgent, ProjectChoice, ProjectSelection } from '@boai/shared/domain'
import { workingDirectoryTarget } from './working-directory'

export function initialProjectSelection(agent?: Pick<DigitalAgent, 'defaultProjectDirectory' | 'defaultProjectDirectoryRequested'> & Partial<Pick<DigitalAgent, 'id' | 'systemRole'>>): ProjectSelection {
  return agent?.defaultProjectDirectory && !isCoreAgent({ id: agent.id ?? '', systemRole: agent.systemRole })
    ? { mode: 'directory', directory: agent.defaultProjectDirectory, requestedDirectory: agent.defaultProjectDirectoryRequested ?? agent.defaultProjectDirectory, source: 'employee-default', revision: 1 }
    : { mode: 'managed', source: 'managed', revision: 1 }
}
export function legacyProjectSelection(directory?: string): ProjectSelection {
  return directory ? { mode: 'directory', directory, requestedDirectory: directory, source: 'legacy', revision: 0 } : { mode: 'managed', source: 'legacy', revision: 0 }
}
export async function chooseProject(choice: ProjectChoice, revision: number, protectedRoots: string[]): Promise<ProjectSelection> {
  if (choice.mode === 'managed') return { mode: 'managed', source: 'explicit', revision }
  const target = await workingDirectoryTarget(choice.directory, protectedRoots)
  return { mode: 'directory', directory: target.path, requestedDirectory: path.resolve(choice.directory), source: 'explicit', revision }
}
export async function validateProjectSelection(selection: ProjectSelection, protectedRoots: string[]) {
  if (selection.mode === 'managed') return undefined
  if (!selection.directory) throw new Error('项目目录记录不完整，请重新选择')
  const target = await workingDirectoryTarget(selection.requestedDirectory ?? selection.directory, protectedRoots)
  if (target.path !== selection.directory) throw new Error('项目目录的实际目标已变化，请重新选择；未切换执行位置')
  return selection.directory
}
