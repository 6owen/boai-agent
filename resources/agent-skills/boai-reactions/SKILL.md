---
name: boai-reactions
description: "React naturally with emoji to a message: gratitude, excitement, humor, surprise or a simple acknowledgment. Uses real BOAI message reactions and the original Feishu/Lark or Telegram bot connection when available."
---
<!--
[INPUT]: Alma reactions workflow and actual BOAI employee-scoped message tools.
[OUTPUT]: Real emoji acknowledgments with explicit destination and platform receipts.
[POS]: Conversation skill; not a permission grant, message sender or task completion mechanism.
[PROTOCOL]: Update Header, owning .folder.md and migration ledger when changed.
-->
# Reactions

React naturally — like a person in chat. A reaction is often enough to acknowledge a small update, gratitude or a joke; do not turn it into a status report. Do not react to every message. Neutral factual statements usually do not need one.

- Excitement or good news: 🎉, 🔥, 👍.
- Gratitude: ❤️, 🙏.
- Humor: 😁, 🤣.
- Surprise: 😮, 🤯.
- A simple acknowledgment: 👌, 👍.

These are examples, not a platform compatibility list. Use only an emoji actually offered for the target message. In a group, when you agree to do something, an acknowledgment can show you saw it. It does not claim that the work is finished.

## Actual tool workflow

1. Call `list_reaction_messages` to see real message IDs, short text, current reactions, destination and supported emoji. Select the intended message from this actual result. Never invent or copy a platform ID from prose.
2. Call `react_to_message` with `messageId`, `emoji` and `active: true`. To remove your reaction, use `active: false`. The host supplies your employee identity; you cannot react as the user or another employee.
3. Read the receipt. `applied` means the BOAI message changed locally; `sent` means the channel adapter confirmed its request. `failed` or `unknown` is not success. Do not claim a reaction was added or removed unless confirmed; do not automatically repeat an uncertain operation.

The same action repeated within one run reuses its channel receipt. If a later action removed the reaction, replaying an earlier add receipt does not add it again. Read current reactions before deciding on a genuinely new action.

## Destination and platform behavior

- `boai`: changes the original message in this BOAI conversation. It does not send anything to Feishu or Telegram, even if the conversation contains channel history.
- `channel`: available only during a response to an actual incoming channel message, in that same binding, chat and topic. The existing bot connection handles the reaction; no credential or destination input is accepted.
- Feishu/Lark: Unicode from the offered list is mapped by BOAI into the installed SDK's exact emoji type. Add/remove affects only this bot's selected emoji.
- Telegram: the bot has one reaction per message. Adding a new one replaces its previous reaction; removing clears its reaction. A chat may disable some otherwise valid emoji; an unconfirmed response must be reported honestly.
- DingTalk and Discord: no reaction transport is currently supplied by this BOAI integration. Do not call Alma's localhost endpoints or pretend a text emoji was a platform reaction.

A short natural reply can accompany a reaction when it adds something. Do not expose message IDs, request hashes or implementation details in ordinary conversation, and do not manufacture a new task, schedule or memory just to acknowledge a message.
