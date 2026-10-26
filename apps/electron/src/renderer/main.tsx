/*
 * [OUTPUT]: 启动时初始化持久快捷键快照与保存/退出监听。
 * [INPUT]: React、AppShell、TooltipProvider/Sonner Toaster、外观初始化与全局样式。
 * [OUTPUT]: 先初始化插件配置再解析外观，挂载桌面 Shell/Tooltip 上下文与唯一全局 Sonner 提示入口。
 * [POS]: apps/electron/src/renderer/main.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { initializeAppearance, useAppearance } from './stores/appearance'
import { initializeShortcuts } from './stores/shortcuts'
import { initializePlugins } from './stores/plugins'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '@/components/app-shell'
import './styles/global.css'

initializePlugins()
initializeAppearance()
initializeShortcuts()
function App() {
  const mode = useAppearance(state => state.preview.resolvedMode)
  return <TooltipProvider><AppShell /><Toaster theme={mode} /></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
