---
name: image-gen
description: "Generate and edit images using AI. Use when users ask to: create/draw/generate images, edit/modify photos, change backgrounds, add elements to images, create avatars, make logos, etc. Covers requests like 'draw a cat', 'change the background to blue', 'generate a logo'. NOT for selfies — use the selfie skill for 'send a selfie', 'send me a selfie', 'take a selfie'."
allowed-tools:
    - Bash
always-inject: true
---

<!--
[INPUT]: 安装包 resources/bundled-skills/image-gen/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Image Generation & Editing Skill

Use the `alma image` command to generate or edit images. It handles API keys, model selection, and everything automatically.

## Which Model Runs (READ THIS BEFORE ADDING `--model`)

**The user's configured image model is authoritative. Do NOT pass `--model`.**

`alma image generate` / `alma image edit` already resolve the model themselves:
they use the model the user chose in Settings → Image Generation
(`imageGen.model`), and only fall back to an automatic pick when the user chose
"Auto". Adding `--model` yourself overrides that setting and silently generates
with a model the user did not ask for.

Pass `--model` in exactly two cases:

1. The user named a model in this request ("use nano-banana", "generate it with
   GPT Image").
2. The user asked to compare several models — then run the command once per
   model they asked for.

Everything else — including "the list showed a model that looks better", "the
first entry is Google", "being explicit seems safer" — is **not** a reason.
There is no "best" model to prefer; only the user's configuration decides.

This is enforced, not just advised: when you pass `--model` and the user's own
message never mentioned a model, the command **drops your flag**, generates with
the configured model, and says so on stderr. So a `--model` you volunteered will
not do what you intended — it will only add noise to the tool card.

If the configured model turns out to be unavailable, the command says so on
stderr and falls back to an automatic pick — surface that to the user instead of
passing the substitution off as what they asked for.

## List Available Models

```bash
alma image models
```

This lists enabled image models from every configured provider, and marks the
model that runs when you omit `--model` with `*`. Use it to _answer questions_
about what's available or to resolve a model the user named — not as a menu to
pick from on your own. The exact value printed under each entry is what
`--model` accepts, in the two cases above.

## Generate an Image

Image generation commonly takes longer than one minute. When invoking any
`alma image` command through the Bash tool, set the Bash tool's `timeout` input
to `300000` (five minutes). This is a Bash tool input, not text to append to the
shell command. Never omit it: an unbounded foreground Bash call may be moved to
the background after 60 seconds, separating the generated file path from the
turn that needs to send it.

```bash
alma image generate "detailed prompt describing the image"
```

That is the normal, correct form — no `--model`.

Only when the user named a model:

```bash
alma image generate --model nano-banana-2 "detailed prompt describing the image"
```

The command outputs the file path to stdout. Then use `alma send photo <path>` to deliver it to the user.

## Image Size / Aspect Ratio (OPTIONAL)

`--aspect` (alias `--size`) is an **optional** flag controlling the shape of the image. Accepts an aspect ratio:

```bash
alma image generate --aspect 16:9 "a cinematic landscape"     # widescreen
alma image generate --aspect 9:16 "a phone wallpaper"          # tall / portrait
alma image generate --aspect 1:1 "a profile avatar"           # square
```

Common ratios: `1:1` (square), `16:9` / `4:3` / `3:2` (landscape), `9:16` / `3:4` / `2:3` (portrait), or `auto`.

**Only pass `--aspect` when the user asks for a specific shape** (e.g. "make it widescreen", "a tall
phone wallpaper", "square avatar"). **Otherwise omit it** — if the user picked a ratio in the
Composer's aspect control it's applied automatically; if not, the model chooses. Decide per request,
not once. Works on both `generate` and `edit`; mapped per provider — Gemini uses the aspect ratio
directly, OpenAI GPT-Image buckets it to its nearest supported size.

## Edit an Image

```bash
alma image edit /path/to/source.jpg "describe the changes you want"
```

Only when the user named a model:

```bash
alma image edit --model gemini-2.5-flash-image /path/to/source.jpg "describe the changes you want"
```

## Selfies

For selfies, use the **selfie** skill instead — it handles face consistency, album management, and photorealistic prompting automatically.

## Tips

- Always write detailed prompts: style, setting, lighting, composition
- After generating, send the image with `alma send photo <path>` — do NOT just paste the path in text
- If you get rate limit errors, wait a moment and retry
- The command picks the model on its own from the user's settings — omit `--model` unless the user named one (see "Which Model Runs" above)
- **Always save selfies** to build up your album for better face consistency over time
- The `--reference` flag works with `generate` to inject a reference image for the AI to maintain appearance
- **NEVER assume the API is broken based on past errors.** API errors (rate limits, temporary failures) are transient. ALWAYS try the command — never tell the user "the API is down" or "the key is invalid" without actually running the command first. Each attempt is independent.
