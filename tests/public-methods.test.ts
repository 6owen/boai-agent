/*
 * [OUTPUT]: 桌面 OCR 原始采集属于私有宿主入口，公共请求拒绝。
 * [OUTPUT]: 提示词列表/版本保存/删除通过原公共准入，内部方法仍拒绝。
 * [OUTPUT]: 2026-10-19 独立网页检索六项 IPC 的实际公共准入与未知方法拒绝。
 * [OUTPUT]: 桌面数据源凭据读取入口同样由实际公共准入表核对。
 * [INPUT]: Electron主进程实际使用的公共IPC准入表。
 * [OUTPUT]: 目录结果/共享技能接口可达；未知、私有及原型方法保持拒绝，完整性另由Record<Method,true>编译检查。
 * [POS]: 主进程入口合同回归，不启动Electron。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect, it } from 'vitest'
import { isPublicMethod } from '../src/main/public-methods'

it('admits catalog result reads and shared skill changes alongside the source lifecycle', () => {
  for (const method of ['listPromptTemplates', 'savePromptTemplate', 'removePromptTemplate']) expect(isPublicMethod(method), method).toBe(true)
  for (const method of ['listCatalogResults', 'saveLocalSkill', 'removeLocalSkill', 'listDataSources', 'getDataSource', 'getDataSourceCredential', 'saveDataSource', 'testDataSource', 'removeDataSource', 'setDataSourceBindings', 'getWebSearchSettings', 'saveWebSearchService', 'saveWebSearchDefault', 'getWebSearchCredential', 'testWebSearchService', 'removeWebSearchService']) expect(isPublicMethod(method), method).toBe(true)
})

it('keeps runtime internals and arbitrary names outside the desktop entry point', () => {
  for (const method of ['captureDesktopActivity', '__installRuntimePlugin', '__takeAutomationNotice', '__settleAutomationNotice', 'toString', 'constructor', '__proto__', '', 'nonexistent']) expect(isPublicMethod(method), method).toBe(false)
})
