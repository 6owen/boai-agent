/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: typography真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { CSSProperties } from 'react'
import { typographyRoles } from '@boai/tokens'

export default function TypographyExample() {
  const roles = ['caption', 'secondary', 'body', 'heading', 'title', 'pageTitle', 'hero'] as const
  return <div className="typography-specimen">{roles.map(role => <div key={role}><code>ui.{role}</code><span style={{ fontSize: `var(--text-ui-${role})` } as CSSProperties}>把注意力留给工作 <small>Design with care.</small></span><span className="example-hint">{Math.round(typographyRoles.ui[role] * 100)}%</span></div>)}</div>
}
