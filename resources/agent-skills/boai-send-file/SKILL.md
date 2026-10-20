---
name: boai-send-file
description: "Deliver a real file to the current conversation with publish_artifact. Use for documents, generated images, screenshots, spreadsheets, audio or any file the user asks to receive."
---
<!--
[INPUT]: Alma send-file original and BOAI API/native artifact publication contracts.
[OUTPUT]: Actual file cards backed by original bytes, with truthful delivery and channel scope.
[POS]: Product delivery workflow; no Alma CLI or inferred external recipients.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# Send File

When producing or sharing a file, explicitly publish it through the supplied `publish_artifact` tool. Mention the useful filename and result in your reply; the host displays the actual file card. Do not paste a raw filesystem path and call that delivery.

## Deliver

1. Create or identify the actual file using authorized tools. Confirm it exists and is the intended result. For a newly produced document, verify relevant content and the user's required format.
2. Read the actual `publish_artifact` schema. Supply path and optional name. API tasks can publish an allowed self:/ file or an authorized absolute business file; the host stages a managed copy. Native tasks use the exact path rules supplied in their runtime. Do not guess a workspace or overwrite the source to satisfy publication.
3. Check the returned artifact and receipt. Failure, cancellation or unknown state is not delivery. Do not redirect to an unrelated conversation to work around a stale execution.
4. If this is a claimed Work, use the actual artifact ID as delivery evidence in the existing `report_work` flow when required. Publish only once per intended output; a report does not create another attachment.

For an explicitly authorized revision, use only the actual revisionRequestId or replacesArtifactId provided by the host and accepted by the current tool. Keep the original versions; never invent a replacement identity.

## Media and destinations

The same publication path can deliver supported image/document/audio/video bytes as file cards; preview support depends on the actual format. Publishing a file does not generate an image or convert audio into a platform voice message. Read an image only when you need to inspect it, not merely to send its bytes.

Publication is scoped to the current authorized conversation. In a channel-origin task, delivery follows that original route and platform support; do not assume a local GUI publication was sent externally. Sending a pre-existing file to another channel requires its actual explicit publishing operation, source and recipient checks. BOAI does not provide Alma's `--chat`/`--thread` flags or photo compression/voice aliases through this skill.

If publication is not supplied in this phase, state that concrete limitation or use the existing authorized task execution path. Never fabricate a link, an attachment, or a successful external send.
