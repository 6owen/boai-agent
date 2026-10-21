// [INPUT]: 当前macOS CoreText固定中文字体及AppKit实际显示器。
// [OUTPUT]: 字体/全部显示器逻辑尺寸和缩放、主屏工作区；副屏工作区跨API不一致故不登记，不含设备ID。
// [POS]: UI环境预检；与Chromium实际字体诊断配合，不替代像素比较。
// [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
import Foundation
import CoreText
import AppKit

var rows: [[String: String]] = []
func record(_ requested: String, _ resolution: String, _ font: CTFont) {
    let url = CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL
    rows.append(["requested": requested, "resolution": resolution, "postscript": CTFontCopyPostScriptName(font) as String, "family": CTFontCopyFamilyName(font) as String, "version": CTFontCopyName(font, kCTFontVersionNameKey) as String? ?? "", "path": url?.path ?? ""])
}
for name in ["PingFangSC-Regular", "PingFangSC-Medium", "PingFangSC-Semibold"] {
    let descriptor = CTFontDescriptorCreateWithAttributes([kCTFontNameAttribute: name] as CFDictionary)
    let matches = CTFontDescriptorCreateMatchingFontDescriptors(descriptor, Set([kCTFontNameAttribute as String]) as CFSet) as? [CTFontDescriptor] ?? []
    for match in matches {
        record(name, "matching-descriptor", CTFontCreateWithFontDescriptor(match, 14, nil))
    }
    record(name, "default-name", CTFontCreateWithName(name as CFString, 14, nil))
}
record("PingFang SC", "default-family", CTFontCreateWithName("PingFang SC" as CFString, 14, nil))
let displays: [[String: Any]] = NSScreen.screens.enumerated().map { index, screen in
    var row: [String: Any] = ["width": Int(screen.frame.width), "height": Int(screen.frame.height),
                            "scaleFactor": screen.backingScaleFactor, "primary": index == 0]
    if index == 0 {
        row["workWidth"] = Int(screen.visibleFrame.width)
        row["workHeight"] = Int(screen.visibleFrame.height)
    }
    return row
}
guard !displays.isEmpty else { fatalError("UI environment requires a connected display") }
let bytes = try JSONSerialization.data(withJSONObject: ["fonts": rows, "displays": displays], options: [.sortedKeys])
print(String(data: bytes, encoding: .utf8)!)
