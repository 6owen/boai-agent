/*
 * [INPUT]: 员工配置中的技能/知识资源或数据源身份，以及Shell原资源详情导航。
 * [OUTPUT]: 共用资源详情导航上下文，调用方负责原草稿守卫和关闭编辑弹窗。
 * [POS]: 员工资源选择与全局资源库详情之间的导航接口，不修改绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属.folder.md。
 */
import { createContext } from 'react'

export type EmployeeResourceTarget = { kind: 'resource' | 'source'; id: string; name: string }
export const EmployeeResourceNavigation = createContext<((target: EmployeeResourceTarget) => void) | null>(null)
