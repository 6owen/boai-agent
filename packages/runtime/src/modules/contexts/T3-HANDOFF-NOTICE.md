<!--
[INPUT]: T3 Code source at 337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17.
[OUTPUT]: Attribution, fixed source links, adaptation boundaries and preserved upstream license.
[POS]: License notice for handoff budgeting and delivery policy adaptation.
[PROTOCOL]: Update Header and contexts/.folder.md when changed.
-->
# T3 handoff source notice

Upstream: https://github.com/pingdotgg/t3code/tree/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17

Reviewed files:

- `packages/provider-core/src/server/handoffBudget.ts`
- `apps/server/src/orchestration-v2/ContextHandoffDelivery.ts`
- `apps/server/src/orchestration-v2/ProviderSessionTransitionPolicy.ts`

BOAI `handoff-budget.ts` adapts the intact-message selection order, UTF-8 capacity estimate, explicit omission metadata and reserved execution capacity. It uses BOAI public-message IDs, current-source checks and its own JSON envelope; no private tool/reasoning state is imported. Unknown model capacity stays unknown instead of assuming a model window.

BOAI `context-handoff.ts` implements persistence and receipt checks using the existing ProductStore. It adopts persistence before delivery and refusal to retry ambiguous delivery. Unlike upstream's fresh-native-thread retry guidance, BOAI preserves an unknown receipt across target/session changes and never uses a new thread to bypass uncertainty. Provider session switching remains in the original native adapter.

## Upstream license

MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
