---
name: boai-memory-management
description: "Recall preferences, past decisions, source messages and dates through BOAI’s authorized memory and history. Preserve attribution, correction/forget barriers, and original event time."
---
<!--
[INPUT]: Alma bundled memory-management/SKILL.md and current BOAI capability contracts.
[OUTPUT]: Executable BOAI workflow, preserving source intent and explicit differences.
[POS]: Bound product employee skill, not a developer tool or permission grant.
[PROTOCOL]: Update parent .folder.md and migration ledger on change.
-->

# Memory Management

Remember the person and the work, not just the latest message. Use the existing employee memory; never make a second memory database or write generated MEMORY.md projections as authority.

## Recall before guessing

1. Call `search_memory` with concrete keywords, names or the relevant agreement. It returns this employee's authorized, relevant memories and source IDs. Try a second, more specific query if needed.
2. Distinguish an actual source statement from a model inference. Preserve who said it, in which context, and whether it was a plan or an accomplished action.
3. In an owner-authorized Bobo management chat, `boai_catalog` → `sessions.messages` can read the referenced conversation in pages. Use actual conversation IDs and sequence cursors. Never use a management catalog to bypass a forgotten source or a conversation-only restriction. For ordinary employees, use only the history tool actually supplied.
4. Search is bounded and relevance-ranked. “No result” is not proof no such conversation exists. Say what was and wasn't found; do not invent a shared memory.

## Dates and evidence

Resolve “yesterday”, “last Friday” and “next month” against the original message timestamp and timezone, not today's retrieval time. Keep an event date separate from the date the memory was saved. If the original date is unavailable, retain the uncertainty. A planned trip is not a completed trip; an intention to contact someone is not a sent message.

## Store and correct

BOAI's existing post-conversation memory extraction and reflection maintain memory from actual authorized messages. Explicit important preferences and corrections should remain clear in the conversation so that process can retain their source. Do not claim a memory was saved unless a real operation or subsequent recall proves it. Use the supplied `remember_memory` tool for an explicit current-user quote when available; it requires the actual source message and stores it with provenance. Do not save invented lifestyle, dreams or personal facts for the sake of a lively persona.

The user can inspect, edit and forget memory in the employee's Memory page. CLI owner memory management uses only real exposed operations; Alma's `memory add/delete`, archives and people-profile files are not BOAI commands. Deletion/forget must use the existing memory service so version invalidation, derived views and ongoing runs respect it. Never repair a forget by copying the forgotten source into a new note.

## Privacy and coverage

An employee's memory belongs to that employee. Conversation-only/material-derived entries stay in their allowed conversation, even if Bobo has broad application administration. Group participants' facts must remain attributed. Do not dump all management entries into a model prompt. For full-history questions, follow all relevant pages and disclose any gaps; recent context or one search page is not exhaustive coverage.
