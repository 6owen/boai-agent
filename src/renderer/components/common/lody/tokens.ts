/*
 * [INPUT]: Lody固定源码 packages/ui/src/tokens/scales.stylex.ts & colors.stylex.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/scales.stylex.ts & colors.stylex.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export const colors = {"label":"var(--foreground)","secondaryLabel":"var(--muted-foreground)","tertiaryLabel":"var(--muted-foreground)","background":"var(--background)","secondaryBackground":"var(--muted)","elevatedBackground":"var(--card)","separator":"var(--border)","hoverFill":"var(--accent)","selectedFill":"var(--accent)","accent":"var(--primary)","success":"var(--chart-2)","destructive":"var(--destructive)"} as const;
export const shadow = {"card":"var(--shadow-small)"} as const;
export const space = {"1":"4px","2":"8px","3":"12px","4":"16px","6":"24px","8":"32px","1.5":"6px"} as const;
export const radius = {"mini":"5px","small":"8px","medium":"10px","large":"14px","full":"9999px"} as const;
export const corner = {"shape":"squircle","round":"round"} as const;
export const focus = {"ringWidth":"2px"} as const;
export const duration = {"fast":"120ms","regular":"180ms","slow":"320ms"} as const;
export const ease = {"standard":"cubic-bezier(0.2, 0, 0, 1)"} as const;