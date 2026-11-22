import AppKit

// Dock entry for the standalone web service. No runtime installation, device
// authorization, local model, background job, or browser profile is started.
@MainActor final class NoahWebAppDelegate: NSObject, NSApplicationDelegate {
    private var destination = URL(string: "https://avoado.si/noah")!
    private var opened = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.openNoah() }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        if let url = urls.first,
           let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
           parts.scheme == "noah", parts.host == "connect",
           parts.user == nil, parts.password == nil, parts.port == nil,
           parts.fragment == nil, ["", "/"].contains(parts.path),
           let items = parts.queryItems, items.count == 1,
           items[0].name == "agent", let agent = items[0].value,
           agent.range(of: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$", options: .regularExpression) != nil {
            destination = URL(string: "https://avoado.si/noah/agents/\(agent)")!
        }
        openNoah()
    }

    private func openNoah() {
        guard !opened else { return }
        opened = true
        NSWorkspace.shared.open(destination)
        NSApplication.shared.terminate(nil)
    }
}

@main struct NoahWebApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = NoahWebAppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}
