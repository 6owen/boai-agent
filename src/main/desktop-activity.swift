/*
[INPUT]: Explicit screen/OCR command or separately enabled input-monitor process.
[OUTPUT]: Foreground OCR, optional JPEG and aggregate key/click counts; no typed characters or key codes.
[OUTPUT]: OCR failures retain captured window metadata and optional image with ocr=false; no stale text is reused.
[POS]: macOS capture/OCR adapter; permissions are requested only on explicit commands.
[PROTOCOL]: Update Header and main/.folder.md when changed.
*/
import Cocoa
import ScreenCaptureKit
import Vision
import Carbon

func emit(_ value: [String: Any], line: Bool = false) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
        if line { FileHandle.standardOutput.write(Data([10])) }
    }
}
func foreground(_ excluded: Set<String>) -> (NSRunningApplication, String)? {
    guard !IsSecureEventInputEnabled(), let front = NSWorkspace.shared.frontmostApplication else { return nil }
    let bundle = front.bundleIdentifier ?? ""
    guard !excluded.contains(bundle), bundle != "com.apple.loginwindow" else { return nil }
    let ordered = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    let title = ordered.first { ($0[kCGWindowOwnerPID as String] as? Int32) == front.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0 }?[kCGWindowName as String] as? String ?? ""
    if ["incognito", "private browsing", "隐身", "无痕", "隐私浏览"].contains(where: { title.lowercased().contains($0) }) { return nil }
    return (front, title)
}
// Alma's separate prohibited helper approach: aggregate counts, never characters/modifiers/coordinates.
@MainActor func monitor(_ excluded: Set<String>) {
    guard AXIsProcessTrusted(), CGPreflightScreenCaptureAccess() else { exit(2) }
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    var locked = false
    var pending: [String: [String: Any]] = [:]
    let parent = getppid()
    let observer = NSEvent.addGlobalMonitorForEvents(matching: [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown]) { event in
        guard !locked, let (front, _) = foreground(excluded) else { return }
        let bundle = front.bundleIdentifier ?? ""
        var value = pending[bundle] ?? ["app": front.localizedName ?? bundle, "bundleId": bundle, "keypresses": 0, "clicks": 0]
        let key = event.type == .keyDown ? "keypresses" : "clicks"
        value[key] = (value[key] as? Int ?? 0) + 1
        value["capturedAt"] = ISO8601DateFormatter().string(from: Date())
        pending[bundle] = value
    }
    guard observer != nil else { exit(3) }
    let center = DistributedNotificationCenter.default()
    center.addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { _ in locked = true; pending.removeAll() }
    center.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in locked = false }
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
        guard getppid() == parent, AXIsProcessTrusted(), CGPreflightScreenCaptureAccess() else { exit(0) }
        for value in pending.values { emit(value, line: true) }
        pending.removeAll()
    }
    app.run()
}
@main struct ActivityCapture {
    @MainActor static func main() async {
        let args = CommandLine.arguments
        let command = args.count > 1 ? args[1] : "status"
        let options = args.count > 2 ? (try? JSONSerialization.jsonObject(with: Data(args[2].utf8))) as? [String: Any] ?? [:] : [:]
        let excluded = Set(options["excludedApps"] as? [String] ?? [])
        if command == "monitor" { monitor(excluded); return }
        let supported: Bool
        if #available(macOS 14.0, *) { supported = true } else { supported = false }
        var status: [String: Any] = ["supported": supported, "permission": CGPreflightScreenCaptureAccess(), "accessibilityPermission": AXIsProcessTrusted()]
        if command == "status" { emit(status); return }
        if command == "request" { status["permission"] = CGRequestScreenCaptureAccess(); emit(status); return }
        if command == "request-input" {
            status["accessibilityPermission"] = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
            emit(status); return
        }
        if command == "open-screen-settings" || command == "open-input-settings" {
            let pane = command == "open-screen-settings" ? "Privacy_ScreenCapture" : "Privacy_Accessibility"
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") { NSWorkspace.shared.open(url) }
            emit(status); return
        }
        guard command == "sample" || command == "probe", supported, CGPreflightScreenCaptureAccess() else { emit(["skipped": "permission"]); return }
        guard let (front, title) = foreground(excluded) else { emit(["skipped": "excluded-or-secure"]); return }
        let idleMs = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .null) * 1000
        let typingIdleMs = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown) * 1000
        var result: [String: Any] = ["permission": true, "accessibilityPermission": AXIsProcessTrusted(), "app": front.localizedName ?? "", "bundleId": front.bundleIdentifier ?? "", "title": String(title.prefix(1000)), "idleMs": min(idleMs, 1e12), "typingIdleMs": min(typingIdleMs, 1e12)]
        if command == "probe" { emit(result); return }
        guard idleMs < (options["idleThresholdMs"] as? Double ?? 300000) else { emit(["skipped": "idle"]); return }
        if #available(macOS 14.0, *) {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                let ordered = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
                let ids = ordered.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == front.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0 }.compactMap { $0[kCGWindowNumber as String] as? UInt32 }
                guard let id = ids.first, let window = content.windows.first(where: { $0.windowID == id }) else { emit(["skipped": "no-window"]); return }
                let config = SCStreamConfiguration()
                let scale = min(2.0, 2200 / max(window.frame.width, 1), 1600 / max(window.frame.height, 1))
                config.width = max(1, Int(window.frame.width * scale)); config.height = max(1, Int(window.frame.height * scale))
                config.showsCursor = false
                let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: window), configuration: config)
                guard let (current, _) = foreground(excluded), current.processIdentifier == front.processIdentifier else { emit(["skipped": "focus-changed"]); return }
                result["ocr"] = false
                if options["enableOcr"] as? Bool ?? true {
                    do {
                        let request = VNRecognizeTextRequest()
                        request.recognitionLevel = .accurate
                        let languages = options["ocrLanguages"] as? [String] ?? ["zh-Hans", "en-US"]
                        let available = try request.supportedRecognitionLanguages()
                        if languages.allSatisfy({ available.contains($0) }) {
                            request.recognitionLanguages = languages; request.usesLanguageCorrection = true
                            try VNImageRequestHandler(cgImage: image).perform([request])
                            result["text"] = String((request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n").prefix(18000))
                            result["ocr"] = true
                        } else {
                            result["ocrError"] = "当前识别服务不支持所选语言，已保留窗口记录。"
                        }
                    } catch {
                        result["ocrError"] = "文字识别暂不可用，已保留窗口记录。"
                    }
                }
                // Low resolution grayscale is used only for change detection, not persisted.
                var pixels = [UInt8](repeating: 0, count: 32 * 24)
                pixels.withUnsafeMutableBytes { bytes in
                    if let context = CGContext(data: bytes.baseAddress, width: 32, height: 24, bitsPerComponent: 8, bytesPerRow: 32, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) {
                        context.draw(image, in: CGRect(x: 0, y: 0, width: 32, height: 24))
                    }
                }
                result["fingerprint"] = Data(pixels).base64EncodedString()
                if options["saveScreenshots"] as? Bool == true {
                    let quality = Double(options["jpegQuality"] as? Int ?? 55) / 100
                    guard let jpeg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: quality]) else { emit(["error": "无法编码桌面截图。"]); return }
                    result["image"] = jpeg.base64EncodedString()
                }
                result["capturedAt"] = ISO8601DateFormatter().string(from: Date())
                emit(result)
            } catch { emit(["error": "无法读取当前窗口：\(error.localizedDescription)"]) }
        }
    }
}
