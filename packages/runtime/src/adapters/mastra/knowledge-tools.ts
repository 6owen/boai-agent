/*
 * [INPUT]: 共用知识工具合同与当前执行上下文。
 * [OUTPUT]: 普通问答/任务的只读Mastra工具；沿原模型步骤预算执行。
 * [POS]: 知识资料的薄SDK适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createTool } from '@mastra/core/tools'
import type { EngineContext } from '../../contracts'
import { createKnowledgeOperations } from '../../modules/resources/knowledge-tools'

export const createKnowledgeTools = (context: EngineContext) => Object.fromEntries(createKnowledgeOperations(context).map(operation => [operation.name, createTool({ id: operation.name, description: operation.description, inputSchema: operation.schema, execute: operation.execute })]))
