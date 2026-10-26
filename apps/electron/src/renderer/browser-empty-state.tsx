/*
 * [INPUT]: 原空态卡片与当前独立浏览器入口。
 * [OUTPUT]: 保留普通浏览器居中视觉和网页/登录说明，无接管或菜单提示；不自动创建会话/Work 或读取系统剪贴板。
 * [POS]: apps/electron/src/renderer/browser-empty-state.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserEmptyStateCard } from '@/components/browser/BrowserEmptyStateCard'
import './styles/global.css'
import './components/browser/browser-ui.css'
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="h-screen w-screen bg-background overflow-auto"><BrowserEmptyStateCard title="浏览器已准备" description="在顶部地址栏输入网址即可浏览。这个独立浏览器属于当前员工和会话。" prompts={[{short:'查阅公开网页并附上来源',full:'在聊天中向员工提出查阅网页的任务。'},{short:'在专用浏览器中手动登录',full:'在地址栏输入网站网址后登录。'}]} showExamplePrompts={true} /></div></React.StrictMode>)
