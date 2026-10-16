/*
 * [INPUT]: Renderer TypeScript/TSX 源码与本地图标约束。
 * [OUTPUT]: 本地图标导入和全局Sonner错误反馈门禁，禁止业务DOM内联alert报错。
 * [POS]: UI 基础组件及后续 shadcn 安装后的静态检查。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import parser from '@babel/eslint-parser'

export default [{
  files: ['src/renderer/**/*.{ts,tsx}'],
  languageOptions: { parser, parserOptions: { requireConfigFile: false, sourceType: 'module', babelOptions: { babelrc: false, configFile: false, plugins: [['@babel/plugin-syntax-typescript', { isTSX: true }]] } } },
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'JSXAttribute[name.name="role"] Literal[value="alert"]',
      message: '操作/加载/校验错误统一使用 shadcn Sonner toast.error 或 ErrorToast，禁止在业务 DOM 中插入报错。',
    }],
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['lucide-react', 'lucide-react/*', '@tabler/icons-react', '@phosphor-icons/react', 'react-icons', 'react-icons/*', '@iconify/react'], message: '使用 @/components/icons 的本地 Solar/Carbon 图标；安装 shadcn 后需适配生成的图标。' }],
    }],
  },
}]
