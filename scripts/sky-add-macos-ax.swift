// Private Zoom AX probe: observe and stage an unsent draft. No send or press action.
// This is not a Sky/Broker executor; recipient proof and owner/job binding remain separate.
import AppKit
import ApplicationServices
import CryptoKit
import Darwin
import Foundation

private let zoomBundleID = "us.zoom.xos"
private let maximumElements = 160
private let maximumDepth = 5

private struct ElementRecord: Codable {
    let path: String
    let role: String
    let title: String
    let identifier: String
    let enabled: Bool
}

private struct ProbeResult: Codable {
    let status: String
    let bundleID: String
    let processID: Int32
    let windowTitle: String
    let elements: [ElementRecord]
    let truncated: Bool
    let observedAtMs: Int64
    let expiresAtMs: Int64
}

private func sha256(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}

private func messageSnapshot(_ root: AXUIElement) -> (count: Int, hash: String) {
    var count = 0, visited = 0, parts: [String] = []
    func visit(_ element: AXUIElement, _ depth: Int, _ insideCell: Bool) {
        visited += 1
        if visited > 2000 || depth > 16 { return }
        let cell = stringAttribute(element, kAXIdentifierAttribute) == "ZMTextMessageCellView"
        if cell { count += 1 }
        let role = stringAttribute(element, kAXRoleAttribute)
        if insideCell || cell {
            if role == kAXStaticTextRole { parts.append(stringAttribute(element, kAXValueAttribute)) }
            if role == kAXUnknownRole { parts.append(stringAttribute(element, kAXDescriptionAttribute)) }
        }
        for child in children(element) { visit(child, depth + 1, insideCell || cell) }
    }
    visit(root, 0, false)
    return (count, sha256(parts.joined(separator: "\n")))
}

private func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

private func stringAttribute(_ element: AXUIElement, _ name: String) -> String {
    (attribute(element, name) as? String) ?? ""
}

private func children(_ element: AXUIElement) -> [AXUIElement] {
    (attribute(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

private func enabled(_ element: AXUIElement) -> Bool {
    (attribute(element, kAXEnabledAttribute) as? Bool) ?? false
}

private func emit<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    if let bytes = try? encoder.encode(value), let line = String(data: bytes, encoding: .utf8) {
        print(line)
    }
}

private func fail(_ code: String, _ message: String) -> Never {
    emit(["status": code, "message": message])
    exit(1)
}

private func foregroundZoom() -> (NSRunningApplication, AXUIElement, String) {
    guard let app = NSWorkspace.shared.frontmostApplication,
          app.bundleIdentifier == zoomBundleID else {
        fail("wrong_foreground_app", "Zoom must be the foreground app")
    }
    guard AXIsProcessTrusted() else {
        fail("accessibility_permission_required", "Grant Accessibility permission to the local Sky runner")
    }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    guard let window = attribute(root, kAXFocusedWindowAttribute) else {
        fail("window_unavailable", "Focused Zoom window is unavailable")
    }
    let focused = window as! AXUIElement
    return (app, focused, stringAttribute(focused, kAXTitleAttribute))
}

private func element(at path: [Int], in root: AXUIElement) -> AXUIElement? {
    var current = root
    for index in path {
        let items = children(current)
        guard index >= 0 && index < items.count else { return nil }
        current = items[index]
    }
    return current
}

private func approval() {
    guard isatty(STDIN_FILENO) == 1 else {
        fail("local_confirmation_required", "An interactive terminal is required")
    }
    fputs("Check that this is your own Zoom chat. Type SELF to stage an UNSENT draft: ", stderr)
    guard readLine() == "SELF" else { fail("cancelled", "Owner did not confirm the self-only chat") }
}

private let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    fail("usage", "Use observe, stage-draft, or verify-draft")
}

let (app, window, windowTitle) = foregroundZoom()
if command == "observe" {
    var records: [ElementRecord] = []
    var truncated = false
    func visit(_ item: AXUIElement, path: [Int], depth: Int) {
        if records.count >= maximumElements { truncated = true; return }
        records.append(ElementRecord(
            path: path.map(String.init).joined(separator: "."),
            role: stringAttribute(item, kAXRoleAttribute),
            title: String(stringAttribute(item, kAXTitleAttribute).prefix(120)),
            identifier: String(stringAttribute(item, kAXIdentifierAttribute).prefix(120)),
            enabled: enabled(item)
        ))
        guard depth < maximumDepth else { return }
        for (index, child) in children(item).enumerated() {
            visit(child, path: path + [index], depth: depth + 1)
            if truncated { break }
        }
    }
    visit(window, path: [], depth: 0)
    let observedAt = Int64(Date().timeIntervalSince1970 * 1000)
    emit(ProbeResult(status: "observed_no_content_values", bundleID: zoomBundleID,
                     processID: app.processIdentifier, windowTitle: windowTitle,
                     elements: records, truncated: truncated,
                     observedAtMs: observedAt, expiresAtMs: observedAt + 60_000))
    exit(0)
}

// Observation staleness is limited to 60 seconds. The timestamp is not a signed Broker lease.
let stage = command == "stage-draft"
guard stage || command == "verify-draft",
      args.count == (stage ? 9 : 12), args.last == (stage ? "--execute" : "--verify"),
      let pid = Int32(args[6]), pid == app.processIdentifier,
      let observedAt = Int64(args[7]),
      Int64(Date().timeIntervalSince1970 * 1000) - observedAt >= 0,
      Int64(Date().timeIntervalSince1970 * 1000) - observedAt <= 60_000 else {
    fail("lease_or_usage_invalid", "Select the exact Zoom field again")
}
let path = args[1].split(separator: ".").compactMap { Int($0) }
guard !path.isEmpty, path.count <= maximumDepth,
      path.map(String.init).joined(separator: ".") == args[1],
      windowTitle == args[5], let target = element(at: path, in: window),
      ["AXTextField", "AXTextArea"].contains(args[2]),
      stringAttribute(target, kAXRoleAttribute) == args[2],
      stringAttribute(target, kAXTitleAttribute) == args[3],
      stringAttribute(target, kAXIdentifierAttribute) == args[4],
      enabled(target), attribute(target, kAXValueAttribute) is String else {
    fail("target_changed", "The Zoom draft field no longer matches the selected field")
}
func sameTarget() -> Bool {
    let (currentApp, currentWindow, currentTitle) = foregroundZoom()
    guard currentApp.processIdentifier == app.processIdentifier, currentTitle == windowTitle,
          CFEqual(currentWindow, window), let currentTarget = element(at: path, in: currentWindow),
          CFEqual(currentTarget, target), stringAttribute(currentTarget, kAXRoleAttribute) == args[2],
          stringAttribute(currentTarget, kAXTitleAttribute) == args[3],
          stringAttribute(currentTarget, kAXIdentifierAttribute) == args[4], enabled(currentTarget) else { return false }
    return true
}
if stage {
    var settable = DarwinBoolean(false)
    guard AXUIElementIsAttributeSettable(target, kAXValueAttribute as CFString, &settable) == .success,
          settable.boolValue, stringAttribute(target, kAXValueAttribute).isEmpty else {
        fail("draft_field_unavailable", "Do not replace an existing draft or a protected field")
    }
    approval()
    fputs("Paste one line (maximum 6000 bytes; no send action): ", stderr)
    guard let text = readLine(), !text.isEmpty, text.utf8.count <= 6000,
          !text.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else {
        fail("text_rejected", "Draft text is empty, too long or contains control characters")
    }
    guard sameTarget(), stringAttribute(target, kAXValueAttribute).isEmpty else {
        fail("target_changed", "The selected field changed before writing")
    }
    let before = messageSnapshot(window)
    guard AXUIElementSetAttributeValue(target, kAXValueAttribute as CFString, text as CFTypeRef) == .success else {
        fail("write_result_unknown", "Inspect the Zoom field manually; do not retry automatically")
    }
    Thread.sleep(forTimeInterval: 0.3)
    guard sameTarget(), stringAttribute(target, kAXValueAttribute) == text else {
        fail("readback_unknown", "Inspect the Zoom field manually; do not retry automatically")
    }
    let after = messageSnapshot(window)
    guard before.count == after.count, before.hash == after.hash else {
        fail("message_list_changed", "The chat changed; inspect manually before continuing")
    }
    emit(["status": "draft_same_field_readback", "draftSha256": sha256(text),
          "messageSnapshotSha256": after.hash, "messageCount": String(after.count), "pid": String(pid),
          "sendActionInvoked": "false", "recipientVerifiedByOwner": "manual",
          "deliveryIndependentlyVerified": "false"])
} else {
    let expectedTextHash = args[8], expectedMessagesHash = args[9]
    let expectedMessageCount = Int(args[10])
    guard expectedTextHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
          expectedMessagesHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
          expectedMessageCount != nil, expectedMessageCount! >= 0,
          sameTarget(), sha256(stringAttribute(target, kAXValueAttribute)) == expectedTextHash else {
        fail("draft_readback_mismatch", "Inspect the Zoom field manually")
    }
    let messages = messageSnapshot(window)
    guard messages.hash == expectedMessagesHash, messages.count == expectedMessageCount else {
        fail("message_list_changed", "The chat changed; inspect manually")
    }
    emit(["status": "draft_second_readback", "draftSha256": expectedTextHash,
          "messageSnapshotSha256": messages.hash, "messageCount": String(messages.count), "pid": String(pid),
          "sendActionInvoked": "false", "recipientVerifiedByOwner": "manual",
          "deliveryIndependentlyVerified": "false"])
}
