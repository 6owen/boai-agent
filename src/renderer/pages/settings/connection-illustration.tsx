/*
 * [INPUT]: 模型连接向导当前是否处于配置步骤、离线透明毛绒 WebP。
 * [OUTPUT]: 选择服务的小模型卡片与配置连接的小插头毛绒插画。
 * [POS]: 模型连接弹窗的私有装饰插画。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import select from '@/assets/connection-select.webp'
import configure from '@/assets/connection-configure.webp'

export function ConnectionIllustration({ configuring }: { configuring: boolean }) {
  return <img className="connection-illustration select-none" src={configuring ? configure : select} width={80} height={64} alt="" aria-hidden="true" draggable={false} />
}
