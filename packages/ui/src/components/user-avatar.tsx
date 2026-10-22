/*
 * [INPUT]: React、BOAI共享组件及调用方传入的展示状态。
 * [OUTPUT]: 可在桌面与独立站点共用的展示组件。
 * [POS]: @boai/ui，无业务服务或桌面依赖。
 * [PROTOCOL]: 修改时同步Header和所属目录.folder.md。
 */
import { useState } from 'react'
export function UserAvatarView({ source, fallback, preset = false }: { source: string; fallback: string; preset?: boolean }) {
  const [failed, setFailed] = useState<string>()
  return <span className="avatar user-avatar" style={preset || failed === source ? { background: 'transparent' } : undefined} aria-hidden="true"><img src={failed === source ? fallback : source} alt="" draggable={false} onError={() => setFailed(source)} /></span>
}
