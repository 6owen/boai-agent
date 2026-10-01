/*
 * [INPUT]: 有界用户关键词与已授权来源文本；固定中文/英文精确匹配规则。
 * [OUTPUT]: 空白分词、多词 AND、保留连续中文子串及可解释的固定字段/短语得分；所有 SQL 参数仅为绑定数据，不使用英文 tokenizer 或模型。
 * [POS]: 个人搜索的纯确定性匹配合同；索引不决定授权，排序不依赖可变全库词频。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { SEARCH_INDEX_LIMITS } from '../../../shared/domain/reading'

export function searchTerms(keyword: string): string[] {
  const terms = [...new Set(keyword.trim().toLowerCase().split(/\s+/u).filter(Boolean))]
  if (!terms.length || terms.length > SEARCH_INDEX_LIMITS.terms) throw new Error('搜索最多 12 个关键词，多个关键词需全部命中')
  return terms
}

/** Exact Chinese substrings retain their meaning; whitespace expresses AND across name and body. */
export function firstSearchMatch(content: string, keyword: string): number {
  const lower = content.toLowerCase(), positions = searchTerms(keyword).map(term => lower.indexOf(term)).filter(index => index >= 0)
  return positions.length ? Math.min(...positions) : 0
}

export function searchRankingSql(keyword: string) {
  const terms = searchTerms(keyword), args: (string | number)[] = [], scores: string[] = []
  for (const term of terms) {
    scores.push("CASE WHEN instr(lower(COALESCE(i.text,'')),?)>0 THEN CASE WHEN i.kind IN ('material','artifact','conversation') THEN 120 ELSE 80 END ELSE 0 END"); args.push(term)
    scores.push("CASE WHEN instr(lower(COALESCE(i.body,'')),?)>0 THEN 40 ELSE 0 END"); args.push(term)
    scores.push("CASE WHEN instr(substr(lower(COALESCE(i.body,i.text,'')),instr(lower(COALESCE(i.body,i.text,'')),?)+length(?)),?)>0 THEN 4 ELSE 0 END"); args.push(term, term, term)
  }
  scores.push("CASE WHEN instr(lower(COALESCE(i.text,'')),lower(?))>0 OR instr(lower(COALESCE(i.body,'')),lower(?))>0 THEN 20 ELSE 0 END"); args.push(keyword.trim(), keyword.trim())
  return { sql: scores.join('+'), args, terms }
}
