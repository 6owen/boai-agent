/*
 * [INPUT]: React、AppShell、外观初始化与全局样式。
 * [OUTPUT]: 初始化外观并直接挂载桌面 Shell。
 * [POS]: src/renderer/main.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { initializeAppearance } from './stores/appearance'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '@/components/app-shell'
import './styles/global.css'

initializeAppearance()
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppShell /></React.StrictMode>)
