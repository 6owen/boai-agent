/*
 [INPUT]: 明确隔离根目录及新清单路径；macOS文件元数据、ACL和xattr。
 [OUTPUT]: 私有目录/数据清单/副本时间恢复；独立容量统计包含临时控制副本和xattr，均不跟随链接。
 [POS]: 个人升级离线快照工具；调用方负责维护准入、实际退出及受管进程生命周期。
 [PROTOCOL]: 一旦本文件变化，必须同步更新Header并检查scripts/.folder.md。
 */
import Foundation
import Darwin
import CryptoKit

struct Failure: Error, CustomStringConvertible { let description: String; init(_ value: String) { description = value } }
func check(_ value: Bool, _ operation: String) throws { if !value { throw Failure("\(operation): errno \(errno)") } }
func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
func reserved(_ name: String) -> Bool {
    name.precomposedStringWithCompatibilityMapping.unicodeScalars.filter { !$0.properties.isDefaultIgnorableCodePoint }.map(String.init).joined().uppercased().hasPrefix(".BOAI-PROFILE-LOCKS-")
}
func attributeNames(_ path: String) throws -> [String] {
    let count = listxattr(path, nil, 0, XATTR_NOFOLLOW)
    try check(count >= 0, "listxattr")
    var names = [UInt8](repeating: 0, count: count)
    let actual = names.withUnsafeMutableBytes { listxattr(path, $0.baseAddress?.assumingMemoryBound(to: CChar.self), count, XATTR_NOFOLLOW) }
    try check(actual == count, "xattr list changed")
    return try names.split(separator: 0).map { raw -> String in
        guard let name = String(bytes: raw, encoding: .utf8) else { throw Failure("xattr name is not UTF8") }
        return name
    }.sorted { $0.utf8.lexicographicallyPrecedes($1.utf8) }
}
func attributes(_ path: String) throws -> [[String: Any]] {
    return try attributeNames(path).map { name -> [String: Any] in
        let length = getxattr(path, name, nil, 0, 0, XATTR_NOFOLLOW)
        try check(length >= 0, "getxattr size")
        var value = Data(count: length)
        let read = value.withUnsafeMutableBytes { getxattr(path, name, $0.baseAddress, length, 0, XATTR_NOFOLLOW) }
        try check(read == length, "xattr changed")
        return ["name": name, "bytes": length, "sha256": digest(value)]
    }
}
func acl(_ path: String) throws -> String {
    // acl_get_link_np also returns nil/ENOENT when FILESEC_ACL is absent.
    // Inspect property presence separately, after a successful no-follow stat.
    guard let security = filesec_init() else { throw Failure("filesec_init failed") }
    defer { filesec_free(security) }
    var metadata = stat(), present: Int32 = 0
    try check(lstatx_np(path, &metadata, security) == 0, "lstatx_np")
    try check(filesec_query_property(security, FILESEC_ACL, &present) == 0, "filesec_query_property")
    if present == 0 { return "" }
    var result: acl_t?
    try check(filesec_get_property(security, FILESEC_ACL, &result) == 0, "filesec_get_property")
    guard let value = result else { throw Failure("ACL property is present without data") }
    defer { acl_free(UnsafeMutableRawPointer(value)) }
    var length: ssize_t = 0
    guard let text = acl_to_text(value, &length) else { throw Failure("acl_to_text: errno \(errno)") }
    defer { acl_free(text) }
    guard let result = String(bytes: UnsafeBufferPointer(start: UnsafeRawPointer(text).assumingMemoryBound(to: UInt8.self), count: length), encoding: .utf8) else { throw Failure("ACL is not UTF8") }
    return result
}
func info(_ path: String) throws -> stat { var result = stat(); try check(lstat(path, &result) == 0, "lstat"); return result }
func fileHash(_ path: String, _ expected: stat) throws -> String {
    let fd = open(path, O_RDONLY | O_NOFOLLOW)
    try check(fd >= 0, "open regular file"); defer { close(fd) }
    var actual = stat(); try check(fstat(fd, &actual) == 0 && actual.st_ino == expected.st_ino && actual.st_dev == expected.st_dev, "file identity changed")
    var hash = SHA256(), buffer = [UInt8](repeating: 0, count: 1024 * 1024)
    while true {
        let count = read(fd, &buffer, buffer.count)
        try check(count >= 0, "read regular file")
        if count == 0 { break }
        hash.update(data: Data(buffer.prefix(count)))
    }
    try check(fstat(fd, &actual) == 0 && actual.st_size == expected.st_size && actual.st_mtimespec.tv_sec == expected.st_mtimespec.tv_sec && actual.st_mtimespec.tv_nsec == expected.st_mtimespec.tv_nsec, "file changed during hash")
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
}
func inventory(_ root: String) throws -> [String: Any] {
    guard (try info(root)).st_mode & S_IFMT == S_IFDIR else { throw Failure("root must be a real directory") }
    var entries: [[String: Any]] = [], controls: [String] = [], groups: [String: [String]] = [:], counts: [String: UInt16] = [:]
    func walk(_ path: String, _ relative: String) throws {
        let item = try info(path), kind = item.st_mode & S_IFMT
        var row: [String: Any] = ["path": relative, "mode": item.st_mode & 0o7777, "uid": item.st_uid, "gid": item.st_gid, "flags": item.st_flags, "mtime": "\(item.st_mtimespec.tv_sec):\(item.st_mtimespec.tv_nsec)", "birthtime": "\(item.st_birthtimespec.tv_sec):\(item.st_birthtimespec.tv_nsec)", "acl": try acl(path), "xattrs": try attributes(path)]
        switch kind {
        case S_IFDIR:
            row["type"] = "directory"; entries.append(row)
            let names = try FileManager.default.contentsOfDirectory(atPath: path).sorted { $0.utf8.lexicographicallyPrecedes($1.utf8) }
            for name in names {
                let key = relative == "." ? name : relative + "/" + name
                if reserved(name) { controls.append(key); continue }
                try walk(path + "/" + name, key)
            }
        case S_IFREG:
            row["type"] = "file"; row["bytes"] = item.st_size; row["sha256"] = try fileHash(path, item); entries.append(row)
            let key = "\(item.st_dev):\(item.st_ino)"; groups[key, default: []].append(relative); counts[key] = item.st_nlink
        case S_IFLNK:
            row["type"] = "link"; row["target"] = try FileManager.default.destinationOfSymbolicLink(atPath: path); entries.append(row)
        default: throw Failure("special file cannot be snapshotted: \(relative)")
        }
    }
    try walk(root, ".")
    for (key, paths) in groups { if Int(counts[key]!) != paths.count { throw Failure("file has hard links outside the snapshot: \(paths[0])") } }
    let links = groups.values.filter { $0.count > 1 }.map { $0.sorted() }.sorted { $0[0].utf8.lexicographicallyPrecedes($1[0].utf8) }
    return ["version": 1, "entries": entries, "controls": controls.sorted(), "hardlinks": links]
}
func capacity(_ root: String) throws -> [String: Any] {
    guard (try info(root)).st_mode & S_IFMT == S_IFDIR else { throw Failure("root must be a real directory") }
    var total: Int64 = 0
    func add(_ value: Int64) throws {
        guard value >= 0, value <= 9_007_199_254_740_991 - total else { throw Failure("snapshot capacity exceeds supported size") }
        total += value
    }
    func walk(_ path: String) throws {
        let item = try info(path), kind = item.st_mode & S_IFMT
        guard kind == S_IFDIR || kind == S_IFREG || kind == S_IFLNK else { throw Failure("special file cannot be copied") }
        if kind != S_IFDIR { try add(item.st_size) }
        for name in try attributeNames(path) {
            let length = getxattr(path, name, nil, 0, 0, XATTR_NOFOLLOW)
            try check(length >= 0, "capacity xattr size"); try add(Int64(length))
        }
        // ditto temporarily copies these too. Run out of process so the lock holder
        // never opens/closes a second descriptor for an authority database inode.
        if kind == S_IFDIR { for name in try FileManager.default.contentsOfDirectory(atPath: path) { try walk(path + "/" + name) } }
    }
    try walk(root)
    return ["version": 1, "totalBytes": total]
}
func restoreTimes(_ root: String, _ catalog: String) throws {
    guard (try info(root)).st_mode & S_IFMT == S_IFDIR else { throw Failure("root must be a real directory") }
    guard let data = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: catalog))) as? [String: Any], data["version"] as? Int == 1, let rows = data["entries"] as? [[String: Any]] else { throw Failure("invalid catalog") }
    func parsedTime(_ text: String) throws -> timespec {
        let parts = text.split(separator: ":")
        guard parts.count == 2, let seconds = Int(parts[0]), let nanos = Int(parts[1]), nanos >= 0 && nanos < 1_000_000_000 else { throw Failure("invalid time") }
        return timespec(tv_sec: seconds, tv_nsec: nanos)
    }
    for row in rows.reversed() {
        guard let key = row["path"] as? String, let text = row["mtime"] as? String, let birth = row["birthtime"] as? String, let kind = row["type"] as? String, let expected = ["directory": S_IFDIR, "file": S_IFREG, "link": S_IFLNK][kind] else { throw Failure("invalid node") }
        let parts = key.split(separator: "/", omittingEmptySubsequences: false)
        guard key == "." || !parts.isEmpty && parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !reserved(String($0)) }) else { throw Failure("unsafe directory") }
        var path = root
        if key != "." { for (index, part) in parts.enumerated() { path += "/" + part; let type = (try info(path)).st_mode & S_IFMT; guard type == (index == parts.count - 1 ? expected : S_IFDIR) else { throw Failure("node traverses a link or changed type") } } }
        var times = [timespec(tv_sec: 0, tv_nsec: Int(UTIME_OMIT)), try parsedTime(text)]
        try check(utimensat(AT_FDCWD, path, &times, AT_SYMLINK_NOFOLLOW) == 0, "restore mtime")
        // Setting an older mtime can clamp APFS creation time. Set birthtime last.
        var attributes = attrlist(), creation = try parsedTime(birth)
        attributes.bitmapcount = UInt16(ATTR_BIT_MAP_COUNT); attributes.commonattr = UInt32(ATTR_CMN_CRTIME)
        try check(setattrlist(path, &attributes, &creation, MemoryLayout<timespec>.size, UInt32(FSOPT_NOFOLLOW)) == 0, "restore creation time")
    }
}
do {
    let args = CommandLine.arguments
    guard args.count == 4, args[2].hasPrefix("/"), args[3].hasPrefix("/") else { throw Failure("usage: profile-files inventory|capacity|restore-times|private-root absolute-root absolute-output") }
    if args[1] == "private-root" {
        let metadata = try info(args[2])
        guard metadata.st_mode & S_IFMT == S_IFDIR, metadata.st_uid == getuid(), metadata.st_mode & 0o077 == 0, try acl(args[2]).isEmpty else { throw Failure("snapshot directory must be private, owned and without ACL grants") }
    } else if args[1] == "inventory" || args[1] == "capacity" {
        let value = args[1] == "inventory" ? try inventory(args[2]) : try capacity(args[2])
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        let fd = open(args[3], O_WRONLY | O_CREAT | O_EXCL, 0o600)
        try check(fd >= 0, "create inventory"); defer { close(fd) }
        try data.withUnsafeBytes { bytes in var offset = 0; while offset < bytes.count { let count = write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset); try check(count > 0, "write inventory"); offset += count } }
        try check(fsync(fd) == 0, "sync inventory")
    } else if args[1] == "restore-times" { try restoreTimes(args[2], args[3]) }
    else { throw Failure("unknown profile-files command") }
} catch { FileHandle.standardError.write(Data("profile-files: \(error)\n".utf8)); exit(1) }
