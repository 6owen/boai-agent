---
name: boai-screenshot
description: "Capture a requested screen, window or region on macOS; create a small preview and deliver the real image. Also resize an existing screenshot without recapturing the desktop."
---
<!--
[INPUT]: Alma screenshot/SKILL.md, macOS screencapture/sips and BOAI command/publication tools.
[OUTPUT]: Actual capture or existing-image preview with original bytes retained and truthful delivery.
[POS]: Bound product skill using existing host permissions; no separate screen-capture service.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# Screenshot

Use the supplied `execute_command` (API employee) or native command tool. Follow its real command/directory permission flow. This skill does not grant macOS Screen Recording. For a BOAI browser page, prefer its actual `browser_tool` screenshot command; for an app accessibility task, follow `boai-computer-use` and the discovered provider schema.

## Capture the requested surface

Determine whether the user wants a new capture or an existing image processed. **Never recapture the desktop for an existing-image request.** Use only the requested window/region when specified. Do not inspect unrelated applications or enable system permissions as a workaround.

On macOS, use `/usr/sbin/screencapture` and `/usr/bin/sips`. Resolve the actual requested path first. With no requested output path, make a unique directory in the command tool's current authorized workspace, so concurrent tasks cannot overwrite one another:

```sh
capture_dir=$(mktemp -d './screenshot.XXXXXX') || exit 1
/usr/sbin/screencapture -x -t jpg "$capture_dir/original.jpg" || exit 1
/usr/bin/sips -g pixelWidth -g pixelHeight "$capture_dir/original.jpg"
```

`-x` suppresses the capture sound. `-R x,y,w,h` captures an explicitly requested, known region. `-T 3` delays capture when needed. `-w` asks the user to select a window interactively: use it only for that requested interaction, not as a background automation default. Never invent window IDs or coordinates.

A failed command or missing Screen Recording permission is not a screenshot. Report the actual failure and stop capture; do not reset TCC, prompt for permissions or run another capture utility to bypass a refusal. A valid file and dimensions prove image creation, not that the intended window's contents were visible.

## Keep previews small

Retain the full-resolution original. Before providing an image to a vision model, make a separate preview with its longest side at most 1024 pixels. Use JPEG quality 60 for ordinary screenshots; preserve PNG when the user requires lossless output or transparency. Do not stretch the image or overwrite an existing destination.

```sh
# input is the actual image; preview is a NEW file in the authorized workspace.
/usr/bin/sips --resampleHeightWidthMax 1024 --setProperty format jpeg \
  --setProperty formatOptions 60 "$input" --out "$preview" || exit 1
/usr/bin/sips -g pixelWidth -g pixelHeight "$input" "$preview"
```

Quote actual paths, preserve the original, and check the new file's format, dimensions and nonzero bytes. Do not print base64 into command output or conversation. Do not read binary images with `read_file`, which is a UTF-8 text tool.

## Inspect and deliver

Use a real available image-reading/vision tool for visual inspection; native employees may have one. The computer-use MCP and browser tools can return their own screenshots as image parts when configured. Having `sips`, an image path or a file card does not give a text-only model sight. If no supported visual input is available, state that you verified the file rather than claiming to see its contents.

Publish the requested original or preview with `publish_artifact`, following `boai-send-file`. Check its actual receipt before saying it was sent. A path in a reply is not an attachment. Do not claim Telegram or another external delivery merely because the BOAI file card exists.
