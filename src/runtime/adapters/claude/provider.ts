/*
 * [OUTPUT]: 2026-10-10 Claude来源校验委托shared纯协议，前后端同一规则；认证和模型调用仍归运行时。
 * [INPUT]: 员工明确选择的既有模型连接及模型覆盖。
 * [OUTPUT]: Anthropic协议来源/模型；DeepSeek仅映射已知官方端点，其他OpenAI协议不推断兼容。
 * [POS]: Claude模型来源校验，不读取密钥、不调用模型、不回退Mastra。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export { claudeProvider } from '../../../shared/domain/claude-provider'
