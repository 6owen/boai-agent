---
name: boai-image-gen
description: "Generate or edit images using the user's configured image model. Use for pictures, illustrations, image editing, portraits and reference-based visual work. Check the actual BOAI image capability before claiming it is unavailable."
---
<!--
[INPUT]: Alma image-gen/SKILL.md, user intent and actual BOAI image settings/tool receipts.
[OUTPUT]: Configured image generation/editing and original publication; appearance albums use boai-selfie, with no automatic reference save.
[POS]: Product skill using the common host task/CLI protocol, not Alma's private CLI.
[PROTOCOL]: Update Header, .folder.md and migration ledger when changed.
-->
# Image generation

Follow the user's image request. Do not substitute a written image prompt for a requested picture when a configured image service is available.

## Use the configured image model

Read `images.settings` through `boai_catalog`/`boai_call`, or use `inspect_image_generation` in a task. Image settings are independent from the chat model. A ready configuration is not proof the remote provider has been tested.

The saved connection/model is authoritative. Never silently choose Auto, another provider, or the conversation's model. If no selection exists, briefly explain that an image connection/model must be selected. Do not try every saved API key. Do not read Alma's private settings or use an invented `alma` command.

When explicitly asked to configure image generation, discover `connections.list` and `images.configure`. Use the existing saved connection, its current revision and the exact user-selected model. Save with the current image settings revision, then read back. `protocol` is `openai-images`; it requires an API root such as a provider's `/v1` endpoint. `responseFormat` defaults to `native` for GPT Image, whose API returns base64 without a `response_format` parameter. Set `b64_json` only for a compatible provider that explicitly requires that parameter. The current image selection is configured through this business protocol (Bobo or CLI); there is no dedicated image-settings panel yet. Do not direct the user to a nonexistent panel. The existing model-connection editor only stores the connection. A saved configuration is not a successful generation test. Do not print or request API keys in chat; the existing connection editor manages them.

This implementation does not yet provide Gemini image APIs, automatic model selection or temporary per-call model overrides. A one-off request for a different provider must not change the persistent default without the user's instruction.

## Generate or edit the real image

Use `generate_image` in the authorized file task. Native/script clients can discover and invoke the same original employee tool; there is no separate owner credential or arbitrary HTTP command workflow.

- `prompt`: include the requested subject, composition, style, text and necessary constraints. For edits say precisely what changes and what stays.
- `path`: a **new** output in the supplied current run directory, normally `self:/runs/<actual-run-id>/image.png`. Use the actual run ID. Respect a requested authorized business path.
- `references`: for editing, supply actual source file paths from the authorized task, in order. Up to four PNG/JPEG/WebP images, 8 MiB total. Don't invent paths or send URLs. Read the originals with `read_image` when the configured vision model supports them; do not claim visual inspection if it rejects image input.
- `size`: omit unless requested or an explicit format calls for it; the configured default otherwise applies. Use a supported `WIDTHxHEIGHT` value or `auto`. For models with fixed buckets, match the requested shape to a supported bucket and explain a necessary approximation; do not pretend an unsupported ratio was honored.
- `background`: use `transparent` when requested; otherwise omit. `quality` is optional. Provider support is authoritative.

The tool requests one image, checks returned raster bytes and writes a new file without overwriting an existing one. It does not send the image to an external channel. It returns actual source/model, hash and optional provider usage. Base64 PNG/JPEG/WebP responses are supported; arbitrary returned download URLs and streaming partial images are not. PNG is the typical default; an unexpected format/suffix mismatch is reported, never silently mislabeled.

For timeouts or cancellation the remote outcome can be unknown. Do not repeat the same generation to get a nicer result or work around an error. Check the original tool result/file; ask before initiating a new paid attempt if the original outcome is unknown. A refusal or transport error is not a created picture.

## Deliver

Publish the saved file using `publish_artifact` and wait for its receipt. Give a short natural reply with the actual file result; don't dump model IDs, hashes, tool arguments or every request constraint. Never claim the image was sent before publication succeeds. Image quality, exact text and appearance consistency need actual visual review.

For a requested self-portrait, respect any actual appearance defined in SOUL and frame it as a generated portrait. Don't invent a real body, camera, trip, meal or private-life event. For persistent appearance references, read boai-selfie and use the actual list_selfies/save_selfie/take_selfie tools. The album is managed independently; this general image-generation tool never auto-saves a portrait. Only a successful album receipt proves it was saved.
