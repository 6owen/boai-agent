/*
 * [INPUT]: 模型连接向导当前是否处于配置步骤、全局语义颜色。
 * [OUTPUT]: 选择服务的小模型卡片与配置连接的小插头 SVG 插画。
 * [POS]: 模型连接弹窗的私有装饰插画。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export function ConnectionIllustration({ configuring }: { configuring: boolean }) {
  return <svg className="connection-illustration" viewBox="0 0 80 64" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="40" cy="57" rx="23" ry="4" fill="var(--primary)" opacity=".08" />
    <circle cx="40" cy="31" r="27" fill="var(--primary)" opacity=".06" />
    <g stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 15v6m-3-3h6M68 39v6m-3-3h6" opacity=".5" />
      {configuring ? <>
        <path d="M34 12v9m12-9v9" strokeWidth="4" />
        <path d="M40 48v3a7 7 0 0 0 14 0v-3" />
        <rect x="25" y="21" width="30" height="28" rx="11" fill="var(--card)" />
        <path d="M51 45h6v3a3 3 0 0 1-6 0z" fill="var(--card)" />
        <path d="m60 15 3 3 6-7" />
      </> : <>
        <rect x="8" y="22" width="23" height="29" rx="7" transform="rotate(-12 8 22)" fill="var(--muted)" stroke="var(--border)" />
        <rect x="49" y="18" width="23" height="29" rx="7" transform="rotate(12 49 18)" fill="var(--muted)" stroke="var(--border)" />
        <rect x="22" y="15" width="36" height="37" rx="12" fill="var(--card)" />
        <path d="M35 21h10M30 52v3m20-3v3" opacity=".5" />
      </>}
      <path d="M33 31v3m14-3v3" strokeWidth="3" />
      <path d="M36 39q4 4 8 0" />
    </g>
    <ellipse cx="29" cy="38" rx="3" ry="2" fill="var(--primary)" opacity=".16" />
    <ellipse cx="51" cy="38" rx="3" ry="2" fill="var(--primary)" opacity=".16" />
  </svg>
}
