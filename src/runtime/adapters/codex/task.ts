/*
 * [INPUT]: 本机Codex员工已认领Work及宿主任务上下文。
 * [OUTPUT]: 通过共同宿主任务适配提供原boai动态工具；原权限、业务回执和提示保持。
 * [POS]: Codex任务桥入口；共同工具规则位于adapters/native-task.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { EngineContext } from '../../contracts'
import { createNativeTask } from '../native-task'

export function createCodexTask(context: EngineContext) { return createNativeTask(context, 'Codex') }
