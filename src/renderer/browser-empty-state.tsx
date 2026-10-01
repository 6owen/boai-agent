/*
 * [INPUT]: 原空态卡片与当前独立浏览器入口。
 * [OUTPUT]: 保留原版居中视觉和示例文案；不自动创建会话/Work 或读取系统剪贴板。
 * [POS]: src/renderer/browser-empty-state.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserEmptyStateCard } from '@/components/browser/BrowserEmptyStateCard'
import './styles/global.css'
import './components/browser/browser-ui.css'
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="h-screen w-screen bg-background overflow-auto"><BrowserEmptyStateCard title="浏览器已准备" description="这个独立浏览器属于当前员工和会话。员工会在获准的任务中使用它，你也可以接管进行登录或操作。" prompts={[{short:'查阅公开网页并附上来源',full:'在聊天中向员工提出查阅网页的任务。'},{short:'在专用浏览器中手动登录',full:'从工具栏菜单选择“我来操作”后登录。'}]} showExamplePrompts={true} showSafetyHint={true} /></div></React.StrictMode>)
