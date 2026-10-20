---
name: boai-presentations
description: "Create, revise, and validate editable PowerPoint presentations with BOAI's durable presentation tools. Use for PPT, PPTX, slide decks, pitches, reports, lessons and requests involving an attached PowerPoint file."
---
<!--
[INPUT]: Alma presentations/SKILL.md and the shared BOAI presentation/file/image tools.
[OUTPUT]: Full authoring/review workflow, scoped project discovery across turns, editable checkpoints and original delivery.
[POS]: Product skill; the host owns project paths, source permissions and dedicated visual review.
[PROTOCOL]: Update Header, .folder.md and migration ledger when changed.
-->
# Presentations

Create presentation files with BOAI's durable `presentation_*` tools. Do not generate PowerPoint XML or use an ad-hoc script when these tools are available. Use the actual tool schemas; native and script clients discover the same tools through the original employee tool protocol.

## Required workflow

1. Align on the audience, purpose, core message, desired slide count, and any required template or brand. If the request already answers these questions, proceed without asking again. Respect a request for only planning, inspection, or an unfinished draft; do not turn it into a final delivery.
2. Inspect every supplied source. For an attached PPTX, call `presentation_inspect_template` to understand its format. For PPTX, DOCX, XLSX, PDF, text, Markdown, CSV, or JSON content, call `presentation_extract_material` on the authorized source path. Extraction runs once per source content; use `offset`/`limit` and `nextOffset` to read the needed cached pages, rather than reparsing. Returned pages preserve text, notes, tables, chart data and image handles. Preserve factual claims, numbers, units, labels, caveats, and citations. Never invent missing data. An inspected template supplies theme/layout information; it does not mean the original file has been imported as an editable project. Recreate only the requested content, and do not promise an exact round trip of unsupported template features.
3. Form a STORY contract: audience, purpose, one core message, and the narrative sequence.
4. Form a DESIGN contract: visual direction, image direction, density, fonts, colors, minimum title size, and minimum body size. A user-supplied template or brand always wins over defaults. Otherwise call `presentation_list_designs` with the audience, topic, and tone. Offer four genuinely different directions when the user's visual intent is ambiguous; if the user has already specified a direction, select the best matching contract and continue.
5. Plan the page rhythm before composing pages. Call `presentation_list_layouts` using the slide message and role, then assign a returned layout ID as each slide's `layoutKey`. Use its exact zones as the starting geometry. Adjacent slides must use meaningfully different structures unless repetition is intentional. Use native slide transitions sparingly and consistently; default to fade, and reserve directional transitions for meaningful narrative movement.
6. Make a visual-asset plan: for every slide, decide whether its message is best carried by a user-provided image, an AI-generated image, an editable chart/table/diagram, or typography. Do not decorate every page by habit.
7. When a slide genuinely needs a visual and the user did not supply one, use the configured `generate_image` capability with a specific art-direction prompt, following boai-image-gen. Check actual image settings first and request a supported size near the intended aspect ratio. Use the returned authorized file path in that slide's image element. Generate a distinct image for each slide unless a shared background or brand asset is intentional. Do not separately send the asset to a channel; it belongs in the deck. `presentation_upsert_slide` imports every image automatically. Extracted images use the exact returned `material:<sourceId>/<image>` handle; never invent or open a private cache path.
8. Call `presentation_create` once with title, theme, story, design and layout. Retain its real project `id` and `revision`. A project belongs to the current employee and conversation. On a later turn, use `presentation_list` to find the existing project's real ID, then `presentation_get` to resume. If several titles match, resolve which project the user means. Do not create a replacement or scan private directories to recover a missing ID.
9. Add slides one at a time with `presentation_upsert_slide`. Pass the current project ID as `presentationId` and the latest returned `revision` as `expectedRevision`, then use the new returned revision for the next page. Every slide needs one clear purpose and a stable `layoutKey`. Each successful page atomically checkpoints the whole deck. Updating an existing slide ID replaces that complete slide, so retain elements that should stay. Other slides are preserved by the host. Compare the returned deck with the specification you just read to verify a focused edit; use `presentation_get` for a fresh readback, not shell access to private revision files. On a revision conflict, read the current project before editing again.
10. Call `presentation_validate`. Fix every error and resolve warnings that affect readability.
11. Call `presentation_review`. It renders the actual PPTX revision and uses the explicitly configured dedicated vision model for strict structured production QA. Repair every blocker and major issue using the returned slide and element IDs, then call `presentation_validate` and `presentation_review` again. Do not deliver while `passed` is false.
12. Deliver the generated `.pptx` only after final validation and visual review pass. Call `presentation_export` with the project ID and a NEW authorized `.pptx` path, then `publish_artifact` for that actual file. Export does not publish. Wait for the publication receipt and reply naturally and briefly. `presentation_render` can save PNGs to an explicitly requested new `outputDirectory` for the user or an external reviewer; publish those actual files if requested. Rendering is not approval or permission to load every slide back into the chat model.

## Capability and configuration

Check `presentation_settings` early in a file task, or discover `presentations.settings` through `boai_catalog`/`boai_call` when only checking capability. The renderer and dedicated visual model are independent settings; a configured chat model is not a selected PPT reviewer. Missing review configuration does not prevent a requested draft from being checkpointed, but it prevents reviewed final delivery. Tell the user what is missing before promising a finished deck.

If the user asks to configure this capability, discover `presentations.configure` and use the current settings `expectedRevision`, an explicitly selected `rendererPath`, and the exact chosen `vision` connection ID/current connection revision/model. Omitted settings are preserved; `null` clears that setting. Do not choose a chat model, inspect unrelated keys, or silently change the user's default. The protocol is available to Bobo/CLI; do not direct the user to a nonexistent dedicated settings panel. Saved configuration proves neither successful rendering nor successful visual review.

## Design standard

- Use a single composition rather than a grid of UI cards.
- Default to 42pt or larger for deck titles, 32pt for slide titles, and 17pt for body copy.
- Keep title slides minimal.
- Use native text, tables, charts, and diagrams so they remain editable.
- Use text `runs` for deliberate emphasis, inline links, bullets, and mixed typography. Use `code` for editable code blocks, `shape` lines with arrowheads for editable connectors, `diagram` for a self-contained vector flow/architecture diagram, `math` for crisp LaTeX equations, `icon` with names returned by `presentation_list_icons`, `svg` for custom vector marks, and `qr` only when the audience needs a scannable handoff. `backgroundGradient` creates a native PowerPoint gradient when the visual direction calls for it.
- Use images for primary visual storytelling. Do not use decorative shapes as a substitute for meaningful imagery.
- Keep charts, tables, and explanatory diagrams native and editable; never ask an image model to draw data, labels, or UI screenshots that can be represented exactly.
- Do not reuse the same image on multiple slides unless it is a background or brand asset.
- Avoid adjacent slides with the same layout. Vary scale, negative space, and visual rhythm across the deck.
- Write direct, natural copy. Avoid slogans, filler subtitles, unsupported conclusions, and formulaic three-part lists.
- Put source links and disclosures in speaker notes unless the user needs them visible on the slide.

## Failure behavior

- If a slide fails validation, repair that slide instead of rebuilding the entire deck. If a write has an unknown outcome, use `presentation_get` to inspect the original project before resubmitting.
- If the chosen chat model cannot inspect images, never pretend it reviewed rendered slides.
- If `presentation_review` reports that no dedicated vision model is available, stop visual QA and disclose that limitation. Do not bypass the capability check with `presentation_render` followed by repeated `read_image` calls. Configure the explicitly chosen vision model before requesting a new review.
- Read an image only when the current model genuinely needs that specific image as input and supports it. If a rendered slide only needs to be shown to the user, export its PNG with `presentation_render` and deliver with `publish_artifact`; publication does not inject pixels into the chat model.
- Never inspect a rendered deck by reading every slide image into one agent turn. Use `presentation_review`, which owns batching and the dedicated vision context.
- Never hide missing sources, unsupported data, failed image generation, or an unavailable renderer. Source changes/revocation invalidate cached use; re-inspect an authorized current source and preserve the prior project rather than bypassing the check.
- If no image model is configured or generation fails after a real attempt, switch that page to a strong typographic or native-data composition and disclose the limitation. Never invent an image path or claim an asset was generated.
- A failed or interrupted review is not approval. Page edits or renderer/model selection changes invalidate an earlier review. Use the current revision and current selection before final export; do not deliver a private compiler file through another path.
