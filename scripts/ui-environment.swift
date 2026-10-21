// [INPUT]: 当前macOS CoreText固定中文字体的CoreText实际解析。
// [OUTPUT]: 固定字体解析路径及版本；显示器由Electron同API单独核对，避免AppKit工作区差异。
// [POS]: UI环境预检；与Chromium实际字体诊断配合，不替代像素比较。
// [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
import Foundation
import CoreText

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
let bytes = try JSONSerialization.data(withJSONObject: ["fonts": rows], options: [.sortedKeys])
print(String(data: bytes, encoding: .utf8)!)
