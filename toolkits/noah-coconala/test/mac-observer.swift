import AppKit
import CoreGraphics
import Foundation

// Read only foreground PID and visible window owner PIDs. Never capture contents, titles or input.
let stop = CommandLine.arguments[1]
let pidFile = CommandLine.arguments[2]
var observations: [(pid_t, Set<Int>)] = []
while !FileManager.default.fileExists(atPath: stop) {
    guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
          let front = NSWorkspace.shared.frontmostApplication?.processIdentifier else { exit(2) }
    let owners = Set(windows.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }.compactMap { $0[kCGWindowOwnerPID as String] as? Int })
    observations.append((front, owners))
    if observations.count == 1 { print("ready"); fflush(stdout) }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
}
let browserPids = Set(try String(contentsOfFile: pidFile, encoding: .utf8).split(separator: "\n").compactMap { Int($0) })
let changes = zip(observations, observations.dropFirst()).filter { $0.0.0 != $0.1.0 }.count
let foreground = observations.filter { browserPids.contains(Int($0.0)) }.count
let visible = observations.filter { !$0.1.isDisjoint(with: browserPids) }.count
let sawWindows = observations.contains { !$0.1.isEmpty }
print("{\"samples\":\(observations.count),\"browserProcesses\":\(browserPids.count),\"frontAppChanges\":\(changes),\"agentForegroundSamples\":\(foreground),\"agentWindowSamples\":\(visible),\"sawWindows\":\(sawWindows)}")
