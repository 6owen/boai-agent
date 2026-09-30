/*
 * [INPUT]: 现有小狐狸、小猫和小兔 SVG 头像，以及创建团队按钮的悬停/聚焦状态。
 * [OUTPUT]: 柔和色板、圆润头像卡片、投影与加号徽章组成的可爱拟物 SVG；伙伴轻跳与徽章动画尊重减少动态效果偏好。
 * [POS]: contacts 专用的团队创建图标，复用本地头像，无远程图片或动画依赖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import cat from '@/assets/avatars/cat.svg'
import fox from '@/assets/avatars/fox.svg'
import rabbit from '@/assets/avatars/rabbit.svg'

export function TeamCreateIcon() {
  return <svg className="team-create-icon size-7" viewBox="0 0 128 128" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="66" cy="124" rx="46" ry="3" fill="#363743" opacity=".08" />
    <g className="team-create-member team-create-member-left"><g transform="rotate(-10 41 46)">
      <rect x="9" y="18" width="64" height="64" rx="14" fill="#D99765" opacity=".2" />
      <image href={fox} x="9" y="14" width="64" height="64" />
    </g></g>
    <g className="team-create-member team-create-member-right"><g transform="rotate(10 89 43)">
      <rect x="59" y="17" width="60" height="60" rx="13" fill="#D68E9F" opacity=".18" />
      <image href={rabbit} x="59" y="13" width="60" height="60" />
    </g></g>
    <g className="team-create-member team-create-member-center">
      <rect x="28" y="58" width="72" height="68" rx="16" fill="#9586B0" opacity=".2" />
      <image href={cat} x="28" y="54" width="72" height="72" />
    </g>
    <g className="team-create-spark">
      <circle cx="108" cy="101" r="15" fill="#829B8D" opacity=".18" />
      <circle cx="108" cy="98" r="15" fill="#E5EBE7" />
      <path d="M101 98h14m-7-7v14" stroke="#829B8D" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  </svg>
}
