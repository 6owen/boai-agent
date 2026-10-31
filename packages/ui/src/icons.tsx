/*
 * [OUTPUT]: 设置语义图标：调色盘、键盘、电源、显示器、插件，继续使用离线Carbon与统一尺寸。
 * [OUTPUT]: 2026-10-27 语音录入/还原所需本地图标，沿原主题和公共图标入口。
 * [OUTPUT]: 增加本地 Carbon 数据库图标供数据源入口共用。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [INPUT]: 离线 Carbon/Solar 图标集合与图标尺寸。
 * [OUTPUT]: Solar 方框铅笔的空白会话入口图标；活动分享和图片下载图标； 消息回应点赞与复制图标；技能闪电、商店、目录与统计图标；新增执行过程 Carbon flow 图标；默认16px、允许父控件管理尺寸的 Carbon 图标、连接凭据/模型/列表切换/密钥显隐、通讯录、置顶、头像编辑/上传图标及 shadcn DOM/ref 适配。
 * [POS]: 公共离线图标真源；类名保持静态供构建提取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { CSSProperties, ComponentProps } from 'react'

// Keep full class names literal so Tailwind includes every mask in the offline bundle.
const classes = {
  Mic: 'i-carbon-microphone',
  Undo2: 'i-carbon-undo',
  Grid2X2: 'i-carbon-grid',
  ThumbsUp: 'i-carbon-thumbs-up',
  Copy: 'i-carbon-copy',
  Zap: 'i-carbon-flash',
  Store: 'i-carbon-store',
  ChartBar: 'i-carbon-chart-column',
  Package: 'i-carbon-package',
  ArrowDown: 'i-carbon-arrow-down',
  ArrowLeft: 'i-carbon-arrow-left',
  ArrowRight: 'i-carbon-arrow-right',
  ArrowUp: 'i-carbon-arrow-up',
  AtSign: 'i-carbon-at',
  BookOpen: 'i-carbon-book',
  CalendarClock: 'i-carbon-calendar',
  Clock: 'i-carbon-time',
  Home: 'i-carbon-home',
  Contact: 'i-carbon-user-profile',
  Library: 'i-carbon-notebook',
  Sliders: 'i-carbon-settings-adjust',
  Palette: 'i-carbon-color-palette',
  Keyboard: 'i-carbon-keyboard',
  Power: 'i-carbon-power',
  Monitor: 'i-carbon-screen',
  Plug: 'i-carbon-plug',
  Check: 'i-carbon-checkmark',
  ChevronDown: 'i-carbon-chevron-down',
  ChevronUp: 'i-carbon-chevron-up',
  Minus: 'i-carbon-subtract',
  CircleCheck: 'i-carbon-checkmark-outline',
  Info: 'i-carbon-information',
  TriangleAlert: 'i-carbon-warning-alt',
  OctagonX: 'i-carbon-error',
  ChevronLeft: 'i-carbon-chevron-left',
  ChevronRight: 'i-carbon-chevron-right',
  CircleHelp: 'i-carbon-help',
  Cpu: 'i-carbon-chip',
  Eye: 'i-carbon-view',
  EyeOff: 'i-carbon-view-off',
  FileText: 'i-carbon-document',
  FolderOpen: 'i-carbon-folder-open',
  HardDrive: 'i-carbon-data-volume',
  Database: 'i-carbon-data-base',
  Key: 'i-carbon-password',
  List: 'i-carbon-list',
  LoaderCircle: 'i-carbon-renew',
  MessageCircle: 'i-carbon-chat',
  MoreHorizontal: 'i-carbon-overflow-menu-horizontal',
  PanelLeft: 'i-carbon-side-panel-open',
  PanelRight: 'i-carbon-side-panel-close',
  Plus: 'i-carbon-add',
  Pin: 'i-carbon-pin',
  Pencil: 'i-carbon-edit',
  SquarePen: 'i-solar-pen-new-square-linear',
  Upload: 'i-carbon-upload',
  Share: 'i-carbon-share',
  Download: 'i-carbon-download',
  RefreshCw: 'i-carbon-renew',
  Reply: 'i-carbon-reply',
  Search: 'i-carbon-search',
  Settings: 'i-carbon-settings',
  ShieldCheck: 'i-carbon-security',
  Sparkles: 'i-carbon-magic-wand',
  Square: 'i-carbon-stop-outline',
  Terminal: 'i-carbon-terminal',
  Workflow: 'i-carbon-flow',
  Trash2: 'i-carbon-trash-can',
  Users: 'i-carbon-group',
  X: 'i-carbon-close',
} as const

type IconName = keyof typeof classes
interface IconProps { size?: number; className?: string; style?: CSSProperties }
export function Icon({ name, size, className = '', style }: IconProps & { name: IconName }) {
  return <i aria-hidden="true" className={`app-icon ${classes[name]} ${className}`} style={size === undefined ? style : { width: size, height: size, ...style }} />
}
function component(name: IconName) {
  return function LocalIcon(props: IconProps) { return <Icon name={name} {...props} /> }
}
export const Zap = component('Zap')
export const ThumbsUp = component('ThumbsUp')
export const Copy = component('Copy')
export const Store = component('Store')
export const ChartBar = component('ChartBar')
export const Package = component('Package')
export const ArrowDown = component('ArrowDown')
export const ArrowLeft = component('ArrowLeft')
export const ArrowRight = component('ArrowRight')
export const ArrowUp = component('ArrowUp')
export const AtSign = component('AtSign')
export const BookOpen = component('BookOpen')
export const CalendarClock = component('CalendarClock')
export const Clock = component('Clock')
export const Home = component('Home')
export const Contact = component('Contact')
export const Library = component('Library')
export const Sliders = component('Sliders')
export const Palette = component('Palette')
export const Keyboard = component('Keyboard')
export const Power = component('Power')
export const Monitor = component('Monitor')
export const Plug = component('Plug')
export const Check = component('Check')
export const ChevronLeft = component('ChevronLeft')
export const ChevronRight = component('ChevronRight')
export const CircleHelp = component('CircleHelp')
export const Cpu = component('Cpu')
export const Eye = component('Eye')
export const EyeOff = component('EyeOff')
export const FileText = component('FileText')
export const FolderOpen = component('FolderOpen')
export const HardDrive = component('HardDrive')
export const Database = component('Database')
export const Key = component('Key')
export const List = component('List')
export const LoaderCircle = component('LoaderCircle')
export const MessageCircle = component('MessageCircle')
export const MoreHorizontal = component('MoreHorizontal')
export const PanelLeft = component('PanelLeft')
export const PanelRight = component('PanelRight')
export const Pin = component('Pin')
export const Plus = component('Plus')
export const Pencil = component('Pencil')
export const SquarePen = component('SquarePen')
export const Upload = component('Upload')
export const Share = component('Share')
export const Download = component('Download')
export const RefreshCw = component('RefreshCw')
export const Reply = component('Reply')
export const Search = component('Search')
export const Settings = component('Settings')
export const ShieldCheck = component('ShieldCheck')
export const Sparkles = component('Sparkles')
export const Square = component('Square')
export const Terminal = component('Terminal')
export const Workflow = component('Workflow')
export const Trash2 = component('Trash2')
export const Users = component('Users')
export const X = component('X')

// shadcn controls own icon size through their slot selectors; preserve DOM/ref props.
function uiComponent(name: IconName) {
  return function UiIcon({ className = '', style, ...props }: ComponentProps<'i'>) {
    return <i aria-hidden={props['aria-label'] ? undefined : true} {...props} className={`app-icon ${classes[name]} ${className}`} style={style} />
  }
}
export const ArrowDownIcon = uiComponent('ArrowDown')
export const CheckIcon = uiComponent('Check')
export const ChevronDownIcon = uiComponent('ChevronDown')
export const ChevronLeftIcon = uiComponent('ChevronLeft')
export const ChevronRightIcon = uiComponent('ChevronRight')
export const ChevronUpIcon = uiComponent('ChevronUp')
export const CircleCheckIcon = uiComponent('CircleCheck')
export const InfoIcon = uiComponent('Info')
export const Loader2Icon = uiComponent('LoaderCircle')
export const MinusIcon = uiComponent('Minus')
export const MoreHorizontalIcon = uiComponent('MoreHorizontal')
export const OctagonXIcon = uiComponent('OctagonX')
export const PanelLeftIcon = uiComponent('PanelLeft')
export const SearchIcon = uiComponent('Search')
export const TriangleAlertIcon = uiComponent('TriangleAlert')
export const XIcon = uiComponent('X')

export const Mic = component('Mic')
export const Undo2 = component('Undo2')
