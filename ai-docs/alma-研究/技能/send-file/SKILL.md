---
name: send-file
description: "Send files, photos, audio, or videos to the current conversation (channel chat or GUI thread). MUST use whenever you need to deliver any file to the user. Covers: sending images, selfies, generated art, documents, music, videos, voice messages, screenshots, or ANY file the user asks to see. Triggers: 'send it to me', 'send it over', 'let me see', 'send me', 'show me', 'send photo', 'send file', sharing any file path. NEVER paste raw file paths in text — ALWAYS use this skill to send files. This is also the ZERO-CONTEXT-COST way to show the user an image: sending displays it in the thread WITHOUT the image entering your context, unlike Read (which costs ~1-2k tokens per image, every turn, forever). Only Read an image when you yourself need to see its content."
allowed-tools:
  - Bash
---

<!--
[INPUT]: 安装包 resources/bundled-skills/send-file/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Send File Skill

Send files directly to the current conversation. For channel chats, `ALMA_CHAT_ID` is auto-injected; for GUI threads, `ALMA_THREAD_ID` is auto-injected.

## Commands

```bash
# Send a photo/image
alma send photo /path/to/image.jpg "optional caption"

# Force target chat explicitly
alma send photo --chat 12345 /path/to/image.jpg "optional caption"

# Force target GUI thread explicitly
alma send photo --thread <threadId> /path/to/image.jpg "optional caption"

# Send a document/file
alma send file /path/to/document.pdf "optional caption"

# Send audio/music
alma send audio /path/to/song.mp3 "optional caption"

# Send a video
alma send video /path/to/video.mp4 "optional caption"

# Send a voice message (ogg format)
alma send voice /path/to/voice.ogg
```

## Type Aliases

- `photo` / `image` → sends as photo (compressed, inline preview)
- `file` / `document` / `doc` → sends as document (original quality, download)
- `audio` / `music` → sends as audio (with player UI)
- `video` → sends as video (inline player)
- `voice` → sends as voice message

## Target Resolution

- Preferred explicit flags: `--chat <chatId>` or `--thread <threadId>`
- If no explicit target is provided:
  - use `ALMA_CHAT_ID` when present
  - otherwise use `ALMA_THREAD_ID`

## GUI Thread Delivery

- GUI threads support `photo`/`image` for inline images and `file`/`document`/`doc` for downloadable original files, including spreadsheets and unsupported preview formats.
- `alma send file` creates a file card on the current assistant turn without loading file bytes into the model context. In project handoff windows, the card downloads from the original host to the current computer.
- `audio`/`video`/`voice` player delivery is only supported for channel chat targets; use `alma send file` to deliver those originals in a GUI thread.
- A stale/finished turn may return an error; never claim delivery succeeded without the CLI's positive receipt or retry into an unrelated thread.

## Tips

- **Photos** are compressed by Telegram. If quality matters, send as `file` instead.
- **Caption** is optional — omit it if not needed.
- `ALMA_CHAT_ID` / `ALMA_THREAD_ID` are set automatically in normal tool execution.
- If you want to send to another destination, pass `--chat` or `--thread` explicitly.
- Always verify the file exists before sending.

## ⚠️ IMPORTANT

When you generate an image, create a file, or produce any output the user should receive as a file:
1. Generate/create the file
2. Use `alma send` to deliver it
3. Mention what you sent in your text reply (but do NOT include the raw file path)

Do NOT just paste file paths in your reply and expect them to be auto-sent. YOU must explicitly send files.
