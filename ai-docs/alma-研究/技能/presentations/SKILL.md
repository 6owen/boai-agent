---
name: presentations
description: 'Create, revise, and validate editable PowerPoint presentations. Use for PPT, PPTX, slide decks, presentations, pitches, reports, lessons, and any request involving an attached PowerPoint file.'
allowed-tools:
    - PresentationCreate
    - PresentationUpsertSlide
    - PresentationValidate
    - PresentationRender
    - PresentationReview
    - PresentationInspectTemplate
    - PresentationExtractMaterial
    - PresentationListDesigns
    - PresentationListIcons
    - PresentationListLayouts
    - Bash
    - Read
    - WebSearch
    - WebFetch
---

<!--
[INPUT]: 安装包 resources/bundled-skills/presentations/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Presentations

Create presentation files with Alma's durable presentation tools. Do not generate PowerPoint XML or use an ad-hoc script when these tools are available.

## Required workflow

1. Align on the audience, purpose, core message, desired slide count, and any required template or brand. If the request already answers these questions, proceed without asking again.
2. Inspect every supplied source. For an attached PPTX, call `PresentationInspectTemplate` to understand its format. For PPTX, DOCX, XLSX, PDF, text, Markdown, CSV, or JSON content, call `PresentationExtractMaterial` exactly once. The extractor caches all available page or section text, notes, images, tables, and chart data and returns a complete manifest path; read that manifest selectively instead of reparsing the source. Preserve factual claims, numbers, units, labels, caveats, and citations. Never invent missing data.
3. Form a STORY contract: audience, purpose, one core message, and the narrative sequence.
4. Form a DESIGN contract: visual direction, image direction, density, fonts, colors, minimum title size, and minimum body size. A user-supplied template or brand always wins over defaults. Otherwise call `PresentationListDesigns` with the audience, topic, and tone. Offer four genuinely different directions when the user's visual intent is ambiguous; if the user has already specified a direction, select the best matching contract and continue.
5. Plan the page rhythm before composing pages. Call `PresentationListLayouts` using the slide message and role, then assign a returned layout ID as each slide's `layoutKey`. Use its exact zones as the starting geometry. Adjacent slides must use meaningfully different structures unless repetition is intentional. Use native slide transitions sparingly and consistently; default to fade, and reserve directional transitions for meaningful narrative movement.
6. Make a visual-asset plan: for every slide, decide whether its message is best carried by a user-provided image, an AI-generated image, an editable chart/table/diagram, or typography. Do not decorate every page by habit.
7. When a slide genuinely needs a visual and the user did not supply one, run `alma image generate --aspect 16:9 "<specific art-direction prompt>"` with Bash. Use the returned local path in that slide's image element. Generate a distinct image for each slide unless a shared background or brand asset is intentional. Do not call `alma send photo`; the image is a deck asset, not the final deliverable. `PresentationUpsertSlide` imports every image into the presentation's durable asset directory automatically.
8. Call `PresentationCreate` once.
9. Add slides one at a time with `PresentationUpsertSlide`. Pass the latest returned `revision` as `expected_revision`, then use the new returned revision for the next page. Every slide needs one clear purpose and a stable `layoutKey`. Each successful page atomically checkpoints the whole deck.
10. Call `PresentationValidate`. Fix every error and resolve warnings that affect readability.
11. Call `PresentationReview`. It renders the actual PPTX revision and uses the configured vision model for strict structured production QA. Repair every blocker and major issue using the returned slide and element IDs, then call `PresentationValidate` and `PresentationReview` again. Do not deliver while `passed` is false.
12. Deliver the generated `.pptx` file only after the final validation and `PresentationReview` pass. `PresentationRender` returns file paths for the user or an external reviewer; rendering is not permission to load every slide back into the chat model.

## Design standard

- Use a single composition rather than a grid of UI cards.
- Default to 42pt or larger for deck titles, 32pt for slide titles, and 17pt for body copy.
- Keep title slides minimal.
- Use native text, tables, charts, and diagrams so they remain editable.
- Use text `runs` for deliberate emphasis, inline links, bullets, and mixed typography. Use `code` for editable code blocks, `shape` lines with arrowheads for editable connectors, `diagram` for a self-contained vector flow/architecture diagram, `math` for crisp LaTeX equations, `icon` with names returned by `PresentationListIcons`, `svg` for custom vector marks, and `qr` only when the audience needs a scannable handoff. `backgroundGradient` creates a native PowerPoint gradient when the visual direction calls for it.
- Use images for primary visual storytelling. Do not use decorative shapes as a substitute for meaningful imagery.
- Keep charts, tables, and explanatory diagrams native and editable; never ask an image model to draw data, labels, or UI screenshots that can be represented exactly.
- Do not reuse the same image on multiple slides unless it is a background or brand asset.
- Avoid adjacent slides with the same layout. Vary scale, negative space, and visual rhythm across the deck.
- Write direct, natural copy. Avoid slogans, filler subtitles, unsupported conclusions, and formulaic three-part lists.
- Put source links and disclosures in speaker notes unless the user needs them visible on the slide.

## Failure behavior

- If a slide fails validation, repair that slide instead of rebuilding the entire deck.
- If the chosen chat model cannot inspect images, never pretend it reviewed rendered slides.
- If `PresentationReview` reports that no dedicated vision model is available, stop visual QA and disclose that limitation. Do not bypass the capability check with `PresentationRender` followed by repeated `Read` calls. Configure a vision model and retry `PresentationReview` instead.
- `Read` an image only when the current model genuinely needs that specific image as input. If an image or rendered slide only needs to be shown to the user, use `alma send photo <path>`; send-file delivery is zero-context, while `Read` injects base64 image data into the model context.
- Never inspect a rendered deck by reading every slide image into one agent turn. Use `PresentationReview`, which owns batching and the dedicated vision context.
- Never hide missing sources, unsupported data, failed image generation, or an unavailable renderer.
- If no image model is configured or generation fails after a real attempt, switch that page to a strong typographic or native-data composition and disclose the limitation. Never invent an image path or claim an asset was generated.
