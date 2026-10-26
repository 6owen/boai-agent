/*
 * [INPUT]: 本地或商店提供的技能说明文本与项目共享 Markdown/Shiki 组件。
 * [OUTPUT]: 正文相同时跳过 Markdown/Shiki 重渲染；去除技能 frontmatter 的正文、共享语法高亮与表格排版，禁用 HTML、远程图片和隐式外链导航。
 * [POS]: library 技能正文共用展示。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { memo } from 'react'
import { Markdown } from '@/components/common/markdown'

export const SkillMarkdown = memo(function SkillMarkdown({ content }: { content: string }) {
  return <div className="markdown skill-markdown"><Markdown components={{ img: ({ alt }) => <span>{alt ? `[图片：${alt}]` : '[图片未加载]'}</span>, a: ({ children }) => <span>{children}</span> }}>{content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')}</Markdown></div>
})
