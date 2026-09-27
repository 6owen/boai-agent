/*
 * [INPUT]: 离线 Solar / Carbon 图标集合与图标尺寸。
 * [OUTPUT]: 默认18px的业务图标及由基础组件控制尺寸的 shadcn 图标适配。
 * [POS]: Renderer 图标真源；类名保持静态供构建提取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { CSSProperties, ComponentProps } from 'react'

// Keep full class names literal so Tailwind includes every mask in the offline bundle.
const classes = {
  ArrowDown: 'i-carbon-arrow-down',
  ArrowLeft: 'i-carbon-arrow-left',
  ArrowRight: 'i-carbon-arrow-right',
  ArrowUp: 'i-carbon-arrow-up',
  AtSign: 'i-carbon-at',
  BookOpen: 'i-solar-book-2-outline',
  CalendarClock: 'i-solar-calendar-date-outline',
  Clock: 'i-solar-clock-circle-bold',
  Home: 'i-carbon-home',
  Library: 'i-solar-notebook-minimalistic-outline',
  Sliders: 'i-solar-tuning-2-linear',
  Check: 'i-carbon-checkmark',
  ChevronDown: 'i-carbon-chevron-down',
  ChevronUp: 'i-carbon-chevron-up',
  Minus: 'i-carbon-subtract',
  CircleCheck: 'i-solar-check-circle-outline',
  Info: 'i-carbon-information',
  TriangleAlert: 'i-carbon-warning-alt',
  OctagonX: 'i-carbon-error',
  ChevronLeft: 'i-carbon-chevron-left',
  ChevronRight: 'i-carbon-chevron-right',
  CircleHelp: 'i-carbon-help',
  FileText: 'i-carbon-document',
  FolderOpen: 'i-solar-folder-open-outline',
  HardDrive: 'i-carbon-data-volume',
  LoaderCircle: 'i-solar-refresh-circle-outline',
  MessageCircle: 'i-solar-chat-round-dots-outline',
  MoreHorizontal: 'i-carbon-overflow-menu-horizontal',
  PanelLeft: 'i-solar-panel-left-linear',
  PanelRight: 'i-solar-panel-right-linear',
  Plus: 'i-carbon-add',
  RefreshCw: 'i-carbon-renew',
  Reply: 'i-carbon-reply',
  Search: 'i-carbon-search',
  Settings: 'i-solar-settings-outline',
  ShieldCheck: 'i-solar-shield-check-outline',
  Sparkles: 'i-solar-magic-stick-2-linear',
  Square: 'i-carbon-stop-outline',
  Terminal: 'i-carbon-terminal',
  Trash2: 'i-carbon-trash-can',
  Users: 'i-carbon-group',
  X: 'i-carbon-close',
} as const

type IconName = keyof typeof classes
interface IconProps { size?: number; className?: string; style?: CSSProperties }
export function Icon({ name, size = 18, className = '', style }: IconProps & { name: IconName }) {
  return <i aria-hidden="true" className={`app-icon ${classes[name]} ${className}`} style={{ width: size, height: size, ...style }} />
}
function component(name: IconName) {
  return function LocalIcon(props: IconProps) { return <Icon name={name} {...props} /> }
}
export const ArrowDown = component('ArrowDown')
export const ArrowLeft = component('ArrowLeft')
export const ArrowRight = component('ArrowRight')
export const ArrowUp = component('ArrowUp')
export const AtSign = component('AtSign')
export const BookOpen = component('BookOpen')
export const CalendarClock = component('CalendarClock')
export const Clock = component('Clock')
export const Home = component('Home')
export const Library = component('Library')
export const Sliders = component('Sliders')
export const Check = component('Check')
export const ChevronLeft = component('ChevronLeft')
export const ChevronRight = component('ChevronRight')
export const CircleHelp = component('CircleHelp')
export const FileText = component('FileText')
export const FolderOpen = component('FolderOpen')
export const HardDrive = component('HardDrive')
export const LoaderCircle = component('LoaderCircle')
export const MessageCircle = component('MessageCircle')
export const MoreHorizontal = component('MoreHorizontal')
export const PanelLeft = component('PanelLeft')
export const PanelRight = component('PanelRight')
export const Plus = component('Plus')
export const RefreshCw = component('RefreshCw')
export const Reply = component('Reply')
export const Search = component('Search')
export const Settings = component('Settings')
export const ShieldCheck = component('ShieldCheck')
export const Sparkles = component('Sparkles')
export const Square = component('Square')
export const Terminal = component('Terminal')
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
