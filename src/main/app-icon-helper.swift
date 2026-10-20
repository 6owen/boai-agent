/*
 * [INPUT]: Current running BOAI .app path and one packaged PNG, or explicit reset.
 * [OUTPUT]: Finder file icon result through NSWorkspace; failures use nonzero exit.
 * [POS]: Bundled macOS helper for the current installed app icon only.
 * [PROTOCOL]: Update this Header and src/main/.folder.md when this file changes.
 */
import AppKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 2 || args.count == 3 else { fail("Invalid app icon arguments") }
let operation = args[0]
guard (operation == "reset" && args.count == 2) || (operation == "set" && args.count == 3) else { fail("Invalid app icon operation") }
let bundleURL = URL(fileURLWithPath: args[1]).standardizedFileURL.resolvingSymlinksInPath()
guard bundleURL.pathExtension == "app", let bundle = Bundle(url: bundleURL), bundle.bundleIdentifier == "com.boai.agent" else { fail("Target is not the current BOAI application") }
guard FileManager.default.fileExists(atPath: bundleURL.path) else { fail("Application bundle is unavailable") }
let icon: NSImage?
if operation == "set" {
    let iconURL = URL(fileURLWithPath: args[2]).standardizedFileURL.resolvingSymlinksInPath()
    guard iconURL.pathExtension == "png", FileManager.default.fileExists(atPath: iconURL.path), let image = NSImage(contentsOf: iconURL) else { fail("Icon PNG is unavailable") }
    icon = image
} else {
    icon = nil
}
guard NSWorkspace.shared.setIcon(icon, forFile: bundleURL.path, options: []) else { fail("macOS did not update the application file icon") }
print("ok")
