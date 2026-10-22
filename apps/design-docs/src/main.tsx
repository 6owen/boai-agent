/*
 * [INPUT]: React DOM、React Router、Fumadocs/BOAI样式和文档应用。
 * [OUTPUT]: 带Fumadocs框架适配的独立浏览器设计站挂载。
 * [POS]: apps/design-docs浏览器入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app'
import './styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)
