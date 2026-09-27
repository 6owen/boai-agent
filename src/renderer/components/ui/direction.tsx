/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: direction 基础组件及其可组合的样式/变体。
 * [POS]: components/ui 的 direction 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export {
  DirectionProvider,
  useDirection,
} from "@base-ui/react/direction-provider"
