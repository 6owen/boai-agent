---
name: boai-web-search
description: "Search the live web for current facts, recommendations and research, using the employee’s actual web-search preference and tools. Read original pages before precise attribution."
---
<!--
[INPUT]: Alma bundled web-search/SKILL.md and current BOAI capability contracts.
[OUTPUT]: Executable BOAI workflow, preserving source intent and explicit differences.
[POS]: Bound product employee skill, not a developer tool or permission grant.
[PROTOCOL]: Update parent .folder.md and migration ledger on change.
-->

# Web Search

Search when the user asks to search, asks about current information, or reliable outside evidence is needed. Use the current date supplied by the runtime; do not hardcode a year. Follow the employee’s actual selected search mode.

## Choose the real search path

1. If `inspect_web_search` and `call_web_search` are supplied and the current selection allows a service, inspect the exact service ID from the tool catalog. Call the returned search tool with its actual schema. Do not assume an endpoint or provider tool name.
2. If the current selection is BOAI browser, use `browser_tool`: `navigate` to a search engine URL with an encoded query, then `snapshot`. Open the relevant result and inspect its page. Do not silently switch a browser selection to a paid API.
3. If a service is unavailable, explain the actual failure and use an allowed fallback. A disabled search preference means do not search. Missing tools are not proof that all internet access is impossible: inspect the supplied browser and source catalogs.

## Search well

- Use concrete names and distinguishing terms. Vary an unsuccessful query instead of repeating it unchanged.
- For timely questions include the relevant date and distinguish publication date from event date.
- Prefer primary sources for factual or technical claims. Compare independent sources when the question calls for it.
- Search snippets are leads, not proof you read the whole article. Use the web-fetch skill to read relevant pages before quoting or making a detailed claim.
- Cite the URLs actually returned/read. Never invent citations, statistics, search results or a successful request.
- Stop at sufficient evidence and answer the user’s question in ordinary language. Search need not become a long report.

## Login and verification

BOAI’s browser is the first browser path. It uses the application's existing login profile. On a login wall or CAPTCHA, report what actually appeared and let the user handle it; re-snapshot after they confirm. Do not bypass verification, manipulate their external browser, or guess cookies. Alma-specific WebSearch/Chrome Relay/PinchTab commands are not BOAI commands.
