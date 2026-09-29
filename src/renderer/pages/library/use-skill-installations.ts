/*
 * [INPUT]: 持久来源列表与资源变更事件。
 * [OUTPUT]: 商店条目通过 provider/itemId 匹配实际安装副本，不按名称推断。
 * [POS]: 资料库商店的安装状态 Hook。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { SkillInstallation } from '@shared/domain/skills'

export function useSkillInstallations(api: DesktopApi) {
  const [installations, setInstallations] = useState<SkillInstallation[]>([]), [error, setError] = useState('')
  useEffect(() => {
    let alive = true, generation = 0
    const reload = async () => {
      const request = ++generation
      try { const result = await api.request('listSkillInstallations', undefined); if (alive && request === generation) { setInstallations(result); setError('') } }
      catch (error) { if (alive && request === generation) setError(String(error)) }
    }
    void reload()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') void reload() })
    return () => { alive = false; unsubscribe() }
  }, [api])
  return { installations, error }
}
