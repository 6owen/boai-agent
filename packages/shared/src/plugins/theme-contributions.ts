/*
 * [OUTPUT]: v1预览/主题兼容v2运行时清单；独立API候选、配置schema和声明式发现。
 * [INPUT]: 原VS Code Plus/Base46配色，以及用户bobo项目的21套CSS色值快照。
 * [OUTPUT]: 两个内置主题插件的纯配色贡献；导入配色复用原Nord/Catppuccin身份，保留Latte和现有主题选择。
 * [POS]: 数据型扩展Adapter；不执行脚本/CSS或读取网络。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import palettes from '../appearance/base46.json' with { type: 'json' }
import { importedThemes } from '../appearance/imported-palettes'
import type { ColorMode } from '../appearance/index'
import { APPLICATION_PLUGIN_API, type ApplicationPluginManifest } from './types'

export const themePluginContributions: readonly ApplicationPluginManifest[] = [
  { id: 'boai.theme.vscode-plus', name: 'VS Code Plus 配色', description: 'VS Code Plus 浅色与深色配色。', version: '1.0.0', apiVersion: APPLICATION_PLUGIN_API,
    contributions: [{ type: 'theme', themes: [
      { id: 'vscode-plus-light', name: 'VS Code Plus', mode: 'light', background: '#f6f6f6', surface: '#ffffff', foreground: '#000000', muted: '#606060', border: '#eaeaea', accent: '#007acc' },
      { id: 'vscode-plus-dark', name: 'VS Code Plus', mode: 'dark', background: '#181818', surface: '#1e1e1e', foreground: '#cccccc', muted: '#b0b0b0', border: '#3c3c3c', accent: '#4daafc' },
    ] }] },
  { id: 'boai.theme.base46', name: 'Base46 配色', description: 'Gruvchad、Everforest、Catppuccin、Nord、GitHub、Moegi 等明暗配色。', version: '1.1.0', apiVersion: APPLICATION_PLUGIN_API,
    contributions: [{ type: 'theme', themes: [
      ...importedThemes,
      ...palettes.filter(p => !importedThemes.some(theme => theme.id === p.id)).map(p => ({ id: p.id, name: p.id === 'nord' ? 'Nord' : p.mode === 'light' ? 'Catppuccin Latte' : 'Catppuccin Mocha', mode: p.mode as ColorMode, background: p.base_16.base00, surface: p.base_16.base01, foreground: p.base_16.base05, muted: p.base_16.base05, border: p.base_16.base03, accent: p.base_16.base0D })),
    ] }] },
]
