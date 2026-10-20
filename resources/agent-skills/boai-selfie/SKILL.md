---
name: boai-selfie
description: "Generate self-portraits with your established appearance and saved face references. Save user-approved reference images, inspect your private album, or deliver an approved original to the owner. Use for selfies/自拍/自己的照片; use boai-image-gen for general image work."
---
<!--
[INPUT]: Alma selfie/SKILL.md, actual SOUL appearance and BOAI host-bound album/image tools.
[OUTPUT]: Reference-consistent generated portraits and explicit user-approved private album retention.
[POS]: Product workflow; raw album access is enforced by the host, not by invented shell paths.
[PROTOCOL]: Update Header, .folder.md and migration ledger when changed.
-->
# Selfies and appearance references

A selfie here is a generated portrait of your digital character. Keep a natural voice, but don't invent a real body, a camera you used, a place you physically visited or a private-life event to explain the picture. A requested café scene is a picture setting, not evidence that you went to a café.

## Established appearance

Use **every configured appearance detail from SOUL.md**: face, hair, clothing, style, makeup and accessories. Put the actual details in `take_selfie.appearance`; the image provider cannot read SOUL. Don't guess a gender, ethnicity, age or fixed face from your name or from a generic default. If neither an approved reference nor appearance exists, ask the owner to define the image first. Your text-chat persona need not be given a human body.

The host can reuse approved references across private conversations of the same employee. It randomly chooses one active reference unless an actual `referenceId` is supplied. Use the current album, never a remembered or deleted ID/path. Reference use helps consistency; it does not guarantee an identical face without actual visual review.

## Create a fresh portrait

First check `inspect_image_generation` or the actual `images.settings` business operation. Image generation uses the explicitly configured image model, independently of the chat model. If missing, say what is missing briefly; don't select a provider, try unrelated keys, or claim a picture was created. There is no dedicated image-settings panel yet: Bobo/CLI use `images.configure`, and the existing connection editor only stores model connections.

Use `take_selfie` for the actual generation:

- `prompt`: the requested scene, pose and expression. Vary composition naturally when the request leaves it open; use your actual current emotion only when relevant.
- `appearance`: all actually established SOUL details. A saved reference may supply the face when no textual appearance is configured.
- `style`: default is a photorealistic portrait with natural lighting. Honor a requested illustration, cartoon or other style explicitly instead of forcing a photographic body.
- `path`: a NEW authorized file, normally `self:/runs/<actual-run-id>/selfie.png`. Use the real supplied run ID.
- `size`: omit unless requested; the configured default applies. Optional `referenceId` must come from the actual album of this employee.

The host selects and uploads the private reference itself; do not export an album original just to use it in a group. It creates one fresh result, never automatically saves it to the album, and blocks a provider result that simply returns identical album bytes to a group/channel. Do not switch to another model, run a separate unrestricted service or retry a request whose paid outcome is unknown. A provider error is not a generated portrait.

Use `publish_artifact` to deliver the actual new file. Wait for its receipt. Reply briefly; don't dump hashes, tool parameters, revisions or sampling details.

## Save only an approved image

Don't save every new picture. Save when the owner explicitly asks to keep it or clearly accepts **that specific image as your appearance/reference** (for example, “这张好看，就用这个形象”). Your own praise or a vague unrelated compliment is not approval.

Use `save_selfie` with the actual authorized image `path` and an optional short `label`. The host records the current owner message as approval provenance. This must happen in the owner's BOAI private conversation with this employee. A generated image isn't automatically approved, and a label isn't a change to SOUL. Maximum input is 8 MiB PNG/JPEG/WebP; if larger, preserve the original and prepare a separate authorized preview before saving. Duplicate bytes are not added again.

The album survives changing or clearing a conversation because saving it is a separate persistent choice. Deleting the employee removes their album. Saving a file copies its approved bytes; later source-file changes do not overwrite the saved reference.

## Inspect, deliver or remove originals

- `list_selfies` returns current count, `latestId`, metadata and album `revision`. It does not return file paths or pixels and does not require a file Work. Bobo/owner CLI can also use `selfies.list` with the appropriate employee identity.
- If the owner asks for an existing album picture in this private conversation, use `export_selfie` with its real ID and a new task path whose suffix matches the listed MIME. Then use `publish_artifact`. This is an original copy, not a new selfie.
- `delete_selfie` removes an explicitly selected reference using its ID and current album revision. `selfies.remove` is the same business operation for Bobo/CLI. It does not erase already delivered chat files. If cleanup is pending, explain that the reference is disabled but its changed/on-disk file could not be cleaned; don't claim physical deletion succeeded.

Raw album metadata, saving, deletion and original export are restricted to the owner in a BOAI private chat. **Never export originals to groups or other people.** Current channel bindings don't establish the owner identity required for raw album access, so raw channel export is unavailable; don't work around it with shell paths or copied private files. Groups/channels can request a fresh portrait through `take_selfie`. Ordinary OS access from a separately authorized native program is not a reason to bypass this product boundary.

There is no “secret/private/exclusive edition” workflow. Don't market album originals that way. Do not invent an album, an approval, a successful upload/delivery, or a visual review that never happened.
