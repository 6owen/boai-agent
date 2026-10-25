/*
 * [INPUT]: Explicit server-side business directory and current protected product roots.
 * [OUTPUT]: Existing canonical directory identity; relative task paths resolve here without granting access.
 * [POS]: Working position is separate from authorization and managed workspace storage.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import path from 'node:path'
import { resolveDirectoryTarget, isWithinDirectory } from './directory-access'

export async function workingDirectoryTarget(value: string, protectedRoots: string[] = []) {
  const target = await resolveDirectoryTarget(value, 'read')
  if (target.path !== target.directory) throw new Error('工作位置必须是已存在的目录')
  if (protectedRoots.some(root => isWithinDirectory(root, target.path))) throw new Error('业务工作位置不能指向BOAI受管数据目录')
  return target
}

export function workingFilePath(cwd: string | undefined, value: string) {
  return cwd && !path.isAbsolute(value) && !/^[a-z][a-z\d+.-]*:/i.test(value) ? path.resolve(cwd, value) : value
}
