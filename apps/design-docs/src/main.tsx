/*
 * [INPUT]: React DOM、React Router Data Router、Fumadocs/BOAI样式和文档应用。
 * [OUTPUT]: 为Fumadocs框架适配提供导航/重验证上下文的独立站点。
 * [POS]: apps/design-docs浏览器入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { App } from './app'
import './styles.css'

const router = createBrowserRouter([{ path: '*', element: <App /> }])
createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)
