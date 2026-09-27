/*
 * [INPUT]: Renderer TypeScript/TSX 源码与本地图标约束。
 * [OUTPUT]: 禁止从其他图标库导入的 no-restricted-imports 门禁。
 * [POS]: UI 基础组件及后续 shadcn 安装后的静态检查。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import parser from '@babel/eslint-parser'

export default [{
  files: ['src/renderer/**/*.{ts,tsx}'],
  languageOptions: { parser, parserOptions: { requireConfigFile: false, sourceType: 'module', babelOptions: { babelrc: false, configFile: false, plugins: [['@babel/plugin-syntax-typescript', { isTSX: true }]] } } },
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['lucide-react', 'lucide-react/*', '@tabler/icons-react', '@phosphor-icons/react', 'react-icons', 'react-icons/*', '@iconify/react'], message: '使用 @/components/icons 的本地 Solar/Carbon 图标；安装 shadcn 后需适配生成的图标。' }],
    }],
  },
}]
