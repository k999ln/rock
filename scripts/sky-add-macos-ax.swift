// Sky Add macOS device-control research probe. It is not a Sky/Broker executor.
// It only targets a foreground Zoom process and never reads AXValue while observing.
import AppKit
import ApplicationServices
import Darwin
import Foundation

private let zoomBundleID = "us.zoom.xos"
private let maximumElements = 160
private let maximumDepth = 5

private struct ElementRecord: Codable {
    let path: String
    let role: String
    let title: String
    let description: String
    let enabled: Bool
}

private struct ProbeResult: Codable {
    let status: String
    let bundleID: String
    let processID: Int32
    let windowTitle: String
    let elements: [ElementRecord]
    let truncated: Bool
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

private func approval(_ action: String) {
    guard isatty(STDIN_FILENO) == 1 else {
        fail("local_confirmation_required", "An interactive terminal is required")
    }
    fputs("Sky Add local probe: \(action). Type YES to continue: ", stderr)
    guard readLine() == "YES" else { fail("cancelled", "No local confirmation") }
}

private let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    fail("usage", "Use observe, press, or set-text")
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
            title: stringAttribute(item, kAXTitleAttribute),
            description: stringAttribute(item, kAXDescriptionAttribute),
            enabled: enabled(item)
        ))
        guard depth < maximumDepth else { return }
        for (index, child) in children(item).enumerated() {
            visit(child, path: path + [index], depth: depth + 1)
            if truncated { break }
        }
    }
    visit(window, path: [], depth: 0)
    emit(ProbeResult(status: "observed_no_content_values", bundleID: zoomBundleID,
                     processID: app.processIdentifier, windowTitle: windowTitle,
                     elements: records, truncated: truncated))
    exit(0)
}

// A fresh call and an exact focused-window, path, role, and title match are required.
// This local prompt is a research gate; production needs Broker-bound owner approval.
guard (command == "press" || command == "set-text") && args.count == 6 else {
    fail("usage", "press|set-text PATH ROLE TITLE WINDOW --execute")
}
guard args.last == "--execute" else { fail("dry_run", "No action without --execute") }
let path = args[1].split(separator: ".").compactMap { Int($0) }
guard !path.isEmpty, path.count <= maximumDepth,
      let target = element(at: path, in: window),
      windowTitle == args[4],
      stringAttribute(target, kAXRoleAttribute) == args[2],
      stringAttribute(target, kAXTitleAttribute) == args[3],
      enabled(target) else {
    fail("target_changed", "Foreground window or target no longer matches")
}

if command == "press" {
    approval("press \(args[2]) \(args[3]) in Zoom")
    let (currentApp, currentWindow, currentTitle) = foregroundZoom()
    guard currentApp.processIdentifier == app.processIdentifier,
          currentTitle == windowTitle,
          let currentTarget = element(at: path, in: currentWindow),
          stringAttribute(currentTarget, kAXRoleAttribute) == args[2],
          stringAttribute(currentTarget, kAXTitleAttribute) == args[3],
          enabled(currentTarget),
          AXUIElementPerformAction(currentTarget, kAXPressAction as CFString) == .success else {
        fail("action_failed_or_target_changed", "Press was not confirmed")
    }
    emit(["status": "press_returned_success", "readback": "not_verified"])
} else {
    guard args[2] == "AXTextField" || args[2] == "AXTextArea" else {
        fail("text_target_rejected", "Only bounded, nonsecure text fields are supported")
    }
    approval("prepare text entry into \(args[3]) in Zoom")
    fputs("Paste one line of text to enter (maximum 6000 bytes): ", stderr)
    guard let text = readLine(), !text.isEmpty, text.utf8.count <= 6000 else {
        fail("text_rejected", "Text is empty or too long")
    }
    let (currentApp, currentWindow, currentTitle) = foregroundZoom()
    guard currentApp.processIdentifier == app.processIdentifier,
          currentTitle == windowTitle,
          let currentTarget = element(at: path, in: currentWindow),
          stringAttribute(currentTarget, kAXRoleAttribute) == args[2],
          stringAttribute(currentTarget, kAXTitleAttribute) == args[3],
          enabled(currentTarget),
          AXUIElementSetAttributeValue(currentTarget, kAXValueAttribute as CFString, text as CFTypeRef) == .success else {
        fail("action_failed_or_target_changed", "Text entry was not confirmed")
    }
    emit(["status": "text_entry_returned_success", "readback": "not_verified"])
}
