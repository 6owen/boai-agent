/*
 * [OUTPUT]: 2026-10-11 持续原生Claude生产驱动支持本机登录/显式API、原生工具与公开过程；旧私有阶段仅作兼容回归。
 * [INPUT]: 共用原生CLI进程组监督器。
 * [OUTPUT]: Claude兼容导出；Codex与Claude共享宿主退出保护。
 * [POS]: 旧导入兼容入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
export { NATIVE_PROCESS_SUPERVISOR as CLAUDE_SUPERVISOR } from '../native-process-supervisor'
