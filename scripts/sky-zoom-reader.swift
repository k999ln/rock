// Private Sky host adapter: read one explicitly selected Zoom window; no actions or recording.
import AppKit
import ApplicationServices
import CryptoKit
import Foundation

func emit(_ data: [String: Any]) { let b = try! JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]); print(String(data: b, encoding: .utf8)!) }
struct ReadFailure: Error { let code: String }
func fail(_ code: String) throws -> Never { throw ReadFailure(code: code) }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    var v: CFTypeRef?; guard AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success else { return nil }; return v
}
func string(_ e: AXUIElement, _ name: String) -> String { (attr(e, name) as? String) ?? "" }
func hash(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }
func frame(_ e: AXUIElement) -> CGRect? {
    guard let p = attr(e, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
          let s = attr(e, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}
func appWindows(_ root: AXUIElement) -> [AXUIElement]? {
    if let items = attr(root, kAXWindowsAttribute) as? [AXUIElement], !items.isEmpty { return items }
    // Some Zoom sign-in/dialog surfaces expose a focused window but no windows list.
    if let focused = attr(root, kAXFocusedWindowAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() { return [focused as! AXUIElement] }
    return nil
}
var observed: [String: (pid: pid_t, element: AXUIElement, title: String, expires: Date)] = [:]
func handle(_ request: [String: Any]) throws {
    observed = observed.filter { $0.value.expires > Date() }
    guard let cmd = request["command"] as? String, ["status", "windows", "read"].contains(cmd) else { try fail("invalid_command") }
    let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "us.zoom.xos")
    if cmd == "status" { emit(["installedRunning": !apps.isEmpty, "accessibility": AXIsProcessTrusted()]); return }
    guard AXIsProcessTrusted() else { try fail("accessibility_permission_required") }
    guard apps.count == 1, let app = apps.first else { try fail("zoom_not_running_or_ambiguous") }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(root, 3)
    guard let windows = appWindows(root), windows.count <= 20 else { try fail("windows_unavailable") }
    if cmd == "windows" {
        if observed.count > 100 { observed.removeAll() }
        let result: [[String: Any]] = windows.enumerated().filter { (attr($0.element, kAXMinimizedAttribute) as? Bool) != true }.map {
            let key = hash(UUID().uuidString)
            observed[key] = (app.processIdentifier, $0.element, string($0.element, kAXTitleAttribute), Date().addingTimeInterval(15 * 60))
            return ["index": $0.offset, "key": key, "title": String(string($0.element, kAXTitleAttribute).prefix(240))]
        }
        emit(["pid": app.processIdentifier, "windows": result]); return
    }
    guard let key = request["key"] as? String, let bound = observed[key],
          let pid = request["pid"] as? Int32, pid == bound.pid, pid == app.processIdentifier,
          windows.contains(where: { CFEqual($0, bound.element) }),
          string(bound.element, kAXTitleAttribute) == bound.title,
          (attr(bound.element, kAXMinimizedAttribute) as? Bool) != true,
          let bounds = frame(bound.element) else { try fail("target_changed") }
    let window = bound.element
    let title = string(window, kAXTitleAttribute)
    var lines: [String] = [], count = 0, characters = 0
    let started = Date()
    func append(_ value: String) throws {
        for row in value.split(separator: "\n", omittingEmptySubsequences: false) {
            let text = row.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty, lines.last != text {
                characters += text.count + 1
                if characters > 6000 || lines.count >= 120 { try fail("visible_text_too_large") }
                lines.append(text)
            }
        }
    }
    func visit(_ e: AXUIElement, _ depth: Int, _ inMessageCell: Bool = false) throws {
        count += 1
        if count > 2000 || depth > 16 || Date().timeIntervalSince(started) > 8 { try fail("window_too_complex") }
        let role = string(e, kAXRoleAttribute)
        if ["AXSecureTextField", "AXTextField", "AXTextArea", "AXComboBox"].contains(role) { return }
        let messageCell = string(e, kAXIdentifierAttribute) == "ZMTextMessageCellView"
        if let rect = frame(e), !rect.isEmpty, bounds.intersects(rect) {
            if role == kAXStaticTextRole { try append(string(e, kAXValueAttribute)) }
            // Zoom 7.1.9 exposes sent chat bodies as AXUnknown descriptions inside
            // its native message cell. Do not read arbitrary descriptions or editable areas.
            if inMessageCell, !messageCell, role == kAXUnknownRole {
                let body = string(e, kAXDescriptionAttribute).trimmingCharacters(in: .whitespacesAndNewlines)
                if !body.isEmpty { try append(body); return }
            }
        }
        for child in (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] { try visit(child, depth + 1, inMessageCell || messageCell) }
    }
    try visit(window, 0)
    guard AXIsProcessTrusted(), !app.isTerminated,
          let current = appWindows(root), current.contains(where: { CFEqual($0, window) }),
          string(window, kAXTitleAttribute) == title,
          (attr(window, kAXMinimizedAttribute) as? Bool) != true else { try fail("target_changed") }
    guard !lines.isEmpty else { try fail("no_readable_visible_text") }
    let text = lines.joined(separator: "\n")
    emit(["text": text, "hash": hash(text), "pid": pid, "key": key, "title": String(title.prefix(240)), "readOnly": true])
}
// Keep exact AXUIElement references in this process; a matching window title is not identity.
while let line = readLine() {
    do {
        guard line.utf8.count < 2000, let data = line.data(using: .utf8),
              let request = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { try fail("invalid_command") }
        try handle(request)
    } catch let error as ReadFailure { emit(["error": error.code]) }
      catch { emit(["error": "invalid_command"]) }
    fflush(stdout)
}
