/*
 * [INPUT]: React、AppShell、TooltipProvider/Toaster、外观初始化与全局样式。
 * [OUTPUT]: 初始化外观，接入 Tooltip/Toast 基础上下文并挂载桌面 Shell。
 * [POS]: src/renderer/main.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { initializeAppearance } from './stores/appearance'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '@/components/app-shell'
import './styles/global.css'

initializeAppearance()
createRoot(document.getElementById('root')!).render(<React.StrictMode><TooltipProvider><Toaster><AppShell /></Toaster></TooltipProvider></React.StrictMode>)
