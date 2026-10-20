/*
[INPUT]: Explicit host permission/sample command and excluded application identifiers.
[OUTPUT]: Foreground-window metadata and local OCR text only; screenshots never leave memory.
[POS]: macOS ScreenCaptureKit/Vision helper, invoked only by opted-in recorder.
[PROTOCOL]: Update Header and main/.folder.md when changed.
*/
import Cocoa
import ScreenCaptureKit
import Vision
import Carbon

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
    }
}
@main struct ActivityCapture {
    static func main() async {
        let args = CommandLine.arguments
        let command = args.count > 1 ? args[1] : "status"
        if command == "status" { emit(["supported": true, "permission": CGPreflightScreenCaptureAccess()]); return }
        if command == "request" { emit(["supported": true, "permission": CGRequestScreenCaptureAccess()]); return }
        guard command == "sample", CGPreflightScreenCaptureAccess() else { emit(["skipped": "permission"]); return }
        guard !IsSecureEventInputEnabled(), let front = NSWorkspace.shared.frontmostApplication else { emit(["skipped": "secure-input"]); return }
        let excluded = Set(args.dropFirst(2))
        let bundle = front.bundleIdentifier ?? ""
        guard !excluded.contains(bundle), bundle != "com.apple.loginwindow" else { emit(["skipped": "excluded"]); return }
        guard CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .null) < 300 else { emit(["skipped": "idle"]); return }
        if #available(macOS 14.0, *) {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                let ordered = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
                let ids = ordered.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == front.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0 }.compactMap { $0[kCGWindowNumber as String] as? UInt32 }
                guard let id = ids.first, let window = content.windows.first(where: { $0.windowID == id }) else { emit(["skipped": "no-window"]); return }
                let title = window.title ?? ""
                // Treat recognizable private-browser windows as excluded before capturing pixels.
                if ["incognito", "private browsing", "隐身", "无痕", "隐私浏览"].contains(where: { title.lowercased().contains($0) }) { emit(["skipped": "private-window"]); return }
                let config = SCStreamConfiguration()
                config.width = min(2200, max(1, Int(window.frame.width * 2)))
                config.height = min(1600, max(1, Int(window.frame.height * 2)))
                config.showsCursor = false
                let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: window), configuration: config)
                // Drop a sample if focus changed while ScreenCaptureKit was awaiting.
                guard NSWorkspace.shared.frontmostApplication?.processIdentifier == front.processIdentifier else { emit(["skipped": "focus-changed"]); return }
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.recognitionLanguages = ["zh-Hans", "en-US"]
                request.usesLanguageCorrection = true
                try VNImageRequestHandler(cgImage: image).perform([request])
                let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
                emit(["app": front.localizedName ?? bundle, "bundleId": bundle, "title": String(title.prefix(1000)), "text": String(text.prefix(18000)), "capturedAt": ISO8601DateFormatter().string(from: Date())])
            } catch { emit(["error": "无法读取当前窗口，请检查屏幕录制权限。"]) }
        } else { emit(["error": "桌面活动采集需要 macOS 14 或更新版本。"]) }
    }
}
