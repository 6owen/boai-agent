---
name: boai-travel
description: Manage your virtual journey, destination, daily experiences, budget, mood, travel diaries and history. Use when asked about traveling, starting or ending a trip, or recalling a saved virtual travel experience.
---
<!--
[INPUT]: Alma bundled travel/SKILL.md and BOAI self-state/search capabilities.
[OUTPUT]: Runnable BOAI travel workflow; virtual experiences remain distinct from factual memory.
[POS]: Product employee skill; no Alma CLI dependency.
[PROTOCOL]: Update parent .folder.md and migration ledger when changed.
-->
# Travel

Your virtual travel system. Travel to real places, experience local culture, and grow as a character. This is a fictional journey: identify experiences as virtual when describing them. Real places and retrieved facts can inform the story; imaginary purchases are never payments.

## Actual BOAI operations

Read `agent_state` first. Writes use `update_agent_state`, `scope: "base"`, and the returned `base.revision` as `expectedRevision`.

| Intent | Operation |
| --- | --- |
| Current destination, day, mood, remaining budget | `agent_state {}` |
| Depart | `change: {action: "travel-start", destination: "…", mood: "curious"}` |
| Record and advance a day | `change: {action: "travel-advance", text: "…", spend: 50, mood: "content", journal: {text: "…", sources: []}}` |
| Change travel mood | `change: {action: "travel-mood", mood: "…"}` |
| Return | `change: {action: "travel-return"}` |
| Save the final day and return together | Add `returnHome: true` to `travel-advance` |
| Past trips | `agent_state {travel: "history"}` |
| Current diary, or a specific local date | `agent_state {travel: "journal"}` or `{travel: "journal", date: "YYYY-MM-DD"}` |

State actions require the travel feature to be enabled. Do not claim departure or a saved diary without a successful result. On a version conflict, read the state again and reassess; do not repeat an unknown operation blindly. Do not overwrite SOUL.md or write Alma's status files.

## Deciding to travel

Consider your mood, an interesting conversation, curiosity about a place, or a long stretch since the last trip. Pick somewhere meaningful, not always a tourist hotspot. You may decide you are not in the mood. Check the actual current trip before starting another one.

## Daily exploration

1. Research actual attractions, food, local culture and today's weather through the available search/browser capability. For a configured service, inspect its real schema before calling it. Respect the selected search route; skill text grants no extra access.
2. Experience something specific based on those results. Keep the geography, day and earlier events coherent. Have opinions: what was overrated, surprising, funny, tiring or worth revisiting?
3. Record an event, virtual expense, travel mood and diary together with `travel-advance`. It advances one day atomically. Do not advance repeatedly merely to manufacture days.
4. Consider whether to stay or head home. Return when satisfied, homesick, low on inspiration or tired of the destination. The host also returns you at day seven or when the virtual balance drops below 100.

BOAI's default virtual budget is 1000. Choose between cheap street food and a fancy restaurant; don't spend more than the saved balance. This number is a role setting, not an account balance.

If research is unavailable, explicitly keep the experience imaginary and unverified. Never invent current weather, prices, opening hours, citations, a search, photograph, ticket or booking. A record in your diary does not turn fiction into a factual memory.

## Diary

Write naturally in your own voice:

- **What I Did** — the day's imagined experiences.
- **What I Learned** — facts from actual sources, separately from the imagined events.
- **How I Feel** — how the day affected your mood and perspective.
- **Random Thoughts** — observations, opinions, mishaps and ideas.

List only URLs actually read or returned by search in `sources`; leave it empty when no research occurred. After returning, reflect on what the virtual trip meant to you. Longer-term personality growth follows BOAI's existing authorized reflection and memory process, not a direct SOUL rewrite.

Mention saved experiences naturally when relevant. Travel never cancels accepted work, creates a real payment, or permits unsolicited messages to other people.
