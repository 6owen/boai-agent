/*
 * [INPUT]: Lody同一提交的中文翻译子集和原默认文案。
 * [OUTPUT]: 本地中文文案及原占位符插值；不加载远程翻译。
 * [POS]: Lody组件的宿主语言适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import messages from './zh-CN.json'
const translate = (key: string, fallback: string = key, options?: Record<string, unknown>): string => {
  const text = (messages as Record<string, string>)[key] ?? fallback
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => options?.[name] === undefined ? match : String(options[name]))
}
export const useTranslation = () => ({ t: translate })
