import type { CSSProperties } from 'react'

// Keep full class names literal so Tailwind includes every mask in the offline bundle.
const classes = {
  ArrowDown: 'i-carbon-arrow-down',
  ArrowLeft: 'i-carbon-arrow-left',
  ArrowRight: 'i-carbon-arrow-right',
  ArrowUp: 'i-carbon-arrow-up',
  AtSign: 'i-carbon-at',
  BookOpen: 'i-solar-book-2-outline',
  CalendarClock: 'i-solar-calendar-date-outline',
  Check: 'i-carbon-checkmark',
  ChevronLeft: 'i-carbon-chevron-left',
  ChevronRight: 'i-carbon-chevron-right',
  CircleHelp: 'i-carbon-help',
  FileText: 'i-carbon-document',
  FolderOpen: 'i-solar-folder-open-outline',
  HardDrive: 'i-carbon-data-volume',
  LoaderCircle: 'i-solar-refresh-circle-outline',
  MessageCircle: 'i-solar-chat-round-dots-outline',
  MoreHorizontal: 'i-carbon-overflow-menu-horizontal',
  PanelLeft: 'i-carbon-side-panel-open',
  PanelRight: 'i-carbon-side-panel-close',
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
export function Icon({ name, size = 20, className = '', style }: IconProps & { name: IconName }) {
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
