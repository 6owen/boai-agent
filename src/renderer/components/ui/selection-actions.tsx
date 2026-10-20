/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: Beautiful UI SelectionActions原版操作条、Button/iconoir/foundation；宿主真实选区和请求。
 * [OUTPUT]: 保留原版横向展开/输入切换与动效；24px按钮；员工Select作为同排动作，无位置/员工下方表单。
 * [POS]: 直接迁用registry源（原件与差异见reviews/2026-10-15-file-selection-popover/upstream）；仅移除演示与模拟执行，接入Base UI定位/真实状态并隔离token。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ChatBubbleQuestion, EmojiSatisfied, NavArrowRight, Scissor, Spark, TextBox } from "iconoir-react";
import { Popover } from "@base-ui/react/popover";
import { SelectionActionButton as Button } from "./selection-actions-button";
import { SelectionActionsShimmer as Shimmer } from "./selection-actions-shimmer";

export type SelectionAction = { id: string; icon: ReactNode; action?: string };
export type SelectionActionSet = { primary: SelectionAction[]; more: SelectionAction[] };
const iconProps = { width: 14, height: 14, strokeWidth: 1.8, "aria-hidden": true } as const;
const icons = {
  explain: <ChatBubbleQuestion {...iconProps} />,
  improve: <Spark {...iconProps} />,
  shorten: <Scissor {...iconProps} />,
  tone: <EmojiSatisfied {...iconProps} />,
  grammar: <TextBox {...iconProps} />,
  send: <ArrowUp width="16" height="16" strokeWidth="2.4" aria-hidden="true" />,
  chevron: <NavArrowRight {...iconProps} />,
};
const DEFAULT_ACTIONS: SelectionActionSet = {
  primary: [
    { id: "解释", icon: icons.explain, action: "解释选中内容，不修改原文件。" },
    { id: "润色", icon: icons.improve, action: "润色选中内容，保留原意，其余内容保持不变。" },
  ],
  more: [
    { id: "精简", icon: icons.shorten, action: "精简选中内容，保留关键信息，其余内容保持不变。" },
    { id: "语气", icon: icons.tone, action: "将选中内容的语气调整得更自然，保留原意，其余内容保持不变。" },
    { id: "语法", icon: icons.grammar, action: "修正选中内容的语法和错别字，其余内容保持不变。" },
  ],
};
type Mode = "idle" | "thinking";
export function SelectionActions({ anchor, open, onOpenChange, prompt, onPromptChange, onAction, disabled, pending, busy, employeeSelector, employeeRequired, children }: {
  anchor: DOMRect; open: boolean; onOpenChange(open: boolean): void;
  prompt: string; onPromptChange(prompt: string): void; onAction(instruction: string): void;
  disabled?: boolean; pending?: boolean; busy?: boolean; employeeSelector?: ReactNode; employeeRequired?: boolean; children?: ReactNode;
}) {
  return <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Portal>
      <Popover.Positioner anchor={{ getBoundingClientRect: () => anchor }} align="center" sideOffset={8} collisionPadding={16} className="isolate z-50">
        <Popover.Popup data-file-preview-actions className="beautiful-selection-actions flex w-fit max-w-[calc(100vw-32px)] flex-col items-center gap-2 outline-none" aria-label="选文修改操作" initialFocus={false} finalFocus={false}>
          <SelectionActionsBar prompt={prompt} onPromptChange={onPromptChange} onAction={onAction} disabled={disabled} pending={pending} busy={busy} employeeSelector={employeeSelector} employeeRequired={employeeRequired} />
          {children && <div data-file-edit-result className="max-h-[min(320px,50vh)] w-80 max-w-[calc(100vw-32px)] overflow-auto rounded-xl bg-bui-surface p-3 text-bui-ink shadow-bui-overlay">{children}</div>}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
function SelectionActionsBar({ prompt, onPromptChange, onAction, disabled, pending, busy, employeeSelector, employeeRequired }: {
  prompt: string; onPromptChange(prompt: string): void; onAction(instruction: string): void;
  disabled?: boolean; pending?: boolean; busy?: boolean; employeeSelector?: ReactNode; employeeRequired?: boolean;
}) {
  const mode: Mode = busy || pending ? "thinking" : "idle";
  const actions = DEFAULT_ACTIONS;
  const [typingWidth, setTypingWidth] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(!!employeeRequired);
  const barRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousModeRef = useRef<Mode>("idle");
  const lastWidthRef = useRef(0);
  const widthAnimationRef = useRef<Animation | null>(null);
  /* Intrinsic width handles the preset expansion. When the entire content
   * changes between idle, loading and confirmation, animate from the last
   * rendered width to the new intrinsic width before the browser paints. */
  useLayoutEffect(() => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (!bar || !content) return;

    const nextWidth = Math.ceil(content.getBoundingClientRect().width) + 8;
    const previousWidth =
      lastWidthRef.current || Math.ceil(bar.getBoundingClientRect().width);

    if (
      previousModeRef.current !== mode &&
      Math.abs(nextWidth - previousWidth) > 1
    ) {
      widthAnimationRef.current?.cancel();
      const animation = bar.animate(
        [
          { width: `${previousWidth}px` },
          { width: `${nextWidth}px` },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.23,1,0.32,1)",
        },
      );
      widthAnimationRef.current = animation;
      animation.onfinish = () => {
        lastWidthRef.current = nextWidth;
        widthAnimationRef.current = null;
      };
    } else {
      lastWidthRef.current = nextWidth;
    }

    previousModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (widthAnimationRef.current?.playState === "running") return;
      lastWidthRef.current =
        Math.ceil(content.getBoundingClientRect().width) + 8;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      widthAnimationRef.current?.cancel();
    };
  }, []);

  const run = (instruction: string) => {
    if (disabled || !instruction.trim()) return;
    setExpanded(false);
    onAction(instruction);
  };
  const hasPrompt = prompt.trim().length > 0;
  return <div ref={barRef} data-selection-actions-bar
    className="flex h-[32px] w-fit max-w-[calc(100vw-48px)] items-center justify-center gap-0.5 overflow-hidden rounded-full bg-bui-surface p-[4px] font-sans font-normal text-bui-ink shadow-bui-overlay"
    style={{ width: mode === "idle" && hasPrompt && typingWidth ? typingWidth : undefined, animation: "bui-pop-in 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
    <div ref={contentRef} className="flex w-fit shrink-0 items-center justify-center gap-0.5" style={{ width: mode === "idle" && hasPrompt && typingWidth ? typingWidth - 8 : undefined }}>
      {mode === "thinking" && <span role="status" className="inline-flex h-[24px] items-center gap-1.5 whitespace-nowrap px-2.5 text-[length:var(--text-ui-control)] font-normal text-bui-ink-2">
        <span className="size-3 shrink-0 rounded-full border-[1.5px] border-bui-line-strong border-t-bui-ink-2" style={{ animation: "spin 700ms linear infinite" }} />
        <Shimmer className="text-[length:var(--text-ui-control)] font-normal">{pending ? "核对修改状态…" : "员工正在处理…"}</Shimmer>
      </span>}
            {mode === "idle" && (
              <>
                <div
                  className="flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400"
                  inert={expanded}
                  style={{
                    maxWidth: expanded
                      ? 0
                      : hasPrompt && typingWidth
                        ? typingWidth - 36
                        : 145,
                    opacity: expanded ? 0 : 1,
                    transform: expanded ? "translateX(-8px)" : "translateX(0)",
                    transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                  }}
                >
                  <form
                    className="flex h-[24px] shrink-0 items-center transition-[width] duration-400"
                    style={{
                      width:
                        hasPrompt && typingWidth ? typingWidth - 36 : 145,
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(prompt.trim());
                    }}
                  >
                    <input
                      data-slot="selection-actions-input"
                      disabled={disabled}
                      maxLength={8000}
                      onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
                      value={prompt}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (!prompt.trim() && next.trim()) {
                          setTypingWidth(
                            Math.ceil(
                              barRef.current?.getBoundingClientRect().width ??
                                0,
                            ),
                          );
                        } else if (!next.trim()) {
                          setTypingWidth(null);
                        }
                        onPromptChange(next);
                      }}
                      aria-label="文件修改要求"
                      placeholder="描述修改…"
                      className="h-[24px] w-full bg-transparent pr-2.5 pl-3 text-[length:var(--text-ui-control)] text-bui-ink placeholder:text-bui-ink-3"
                    />
                  </form>
                </div>

                <div
                  className="flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,transform] duration-400"
                  inert={hasPrompt}
                  style={{
                    maxWidth: hasPrompt ? 0 : expanded ? (employeeSelector ? 590 : 462) : 224,
                    opacity: hasPrompt ? 0 : 1,
                    transform: hasPrompt ? "translateX(-8px)" : "translateX(0)",
                    transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                  }}
                >
                  {!expanded && (
                    <span className="mx-1 h-4 w-px shrink-0 bg-bui-line-strong" />
                  )}
                  {actions.primary.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant="quiet"
                      size="xs"
                      className="shrink-0"
                      disabled={disabled}
                      onClick={item.action ? () => run(item.action!) : undefined}
                    >
                      {item.icon}
                      {item.id}
                    </Button>
                  ))}

                  <div
                    className="flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,margin] duration-400"
                    inert={!expanded}
                    style={{
                      maxWidth: expanded ? (employeeSelector ? 390 : 262) : 0,
                      opacity: expanded ? 1 : 0,
                      marginLeft: expanded ? 2 : 0,
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                  {actions.more.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant="quiet"
                      size="xs"
                      className="shrink-0"
                      disabled={disabled}
                      onClick={item.action ? () => run(item.action!) : undefined}
                    >
                      {item.icon}
                      {item.id}
                    </Button>
                  ))}
                  {employeeSelector}
                  </div>

                  <span className="mx-0.5 h-4 w-px shrink-0 bg-bui-line" />
                  <button
                    data-slot="selection-actions-button"
                    type="button"
                    aria-label={expanded ? "收起修改选项" : "更多修改选项"}
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                    className="flex size-[24px] shrink-0 items-center justify-center rounded-full text-bui-ink transition-[background-color,transform] duration-200 hover:bg-bui-hover active:scale-[0.96]"
                  >
                    <span
                      className="flex transition-transform duration-400"
                      style={{
                        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                        transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                      }}
                    >
                      {icons.chevron}
                    </span>
                  </button>
                </div>

                <div
                  className="flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400"
                  inert={!hasPrompt}
                  style={{
                    maxWidth: hasPrompt ? 26 : 0,
                    opacity: hasPrompt ? 1 : 0,
                    transform: hasPrompt ? "scale(1)" : "scale(0.88)",
                    transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                  }}
                >
                  <button
                    data-slot="selection-actions-button"
                    type="button"
                    aria-label="发送文件修改"
                    disabled={disabled || !hasPrompt}
                    onClick={() => run(prompt.trim())}
                    className="flex size-[24px] shrink-0 items-center justify-center rounded-full bg-bui-ink text-bui-surface transition-[opacity,transform] duration-200 active:scale-[0.94]"
                  >
                    {icons.send}
                  </button>
                </div>
              </>
            )}
    </div>
  </div>;
}
