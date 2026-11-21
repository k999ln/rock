import SwiftUI
import AppKit
import CryptoKit

struct RuntimeAsset: Decodable { let url: String; let sha256: String; let directory: String?; let maxBytes: Int64 }
struct RuntimeManifest: Decodable { let node: RuntimeAsset; let homebrew: RuntimeAsset }
struct SetupEvent: Decodable { let state: String; let url: String?; let message: String? }

final class TransferGuard: NSObject, URLSessionDownloadDelegate {
    let limit: Int64
    init(_ limit: Int64) { self.limit = limit }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > limit || totalBytesExpectedToWrite > limit { downloadTask.cancel() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        let allowed = ["nodejs.org", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]
        guard let url = request.url, url.scheme == "https", let host = url.host, allowed.contains(host), url.user == nil, url.password == nil else { completionHandler(nil); return }
        completionHandler(request)
    }
}

@MainActor final class SetupModel: ObservableObject {
    static let shared = SetupModel()
    @Published var state = "idle"
    @Published var message = ""
    @Published var agent = ""
    @Published var busy = false
    var process: Process?
    var operation: Task<Void, Never>?
    var authorization: URL?
    var buffer = Data()
    var quitting = false
    let purple = Color(red: 0.46, green: 0.23, blue: 0.78)
    let store = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Noah/app", isDirectory: true)

    var title: String {
        switch state {
        case "preparing", "installing": return "Noahを準備しています"
        case "needs_installer", "needs_developer_tools", "installer_open": return "初回の準備"
        case "authorizing": return "このMacを承認"
        case "connecting": return "接続しています"
        case "connected": return "Macにつながりました"
        case "stopping": return "停止を確認しています"
        case "stopped": return "接続を停止しました"
        case "error": return "接続を確認してください"
        default: return "Agentを、あなたのMacへ。"
        }
    }
    var subtitle: String {
        switch state {
        case "preparing", "installing": return "必要なものを自動で準備します。初回は数分かかります。"
        case "needs_installer": return "準備ツールをインストールすると続けられます。"
        case "needs_developer_tools": return "macOSの開発ツールを入れると続けられます。"
        case "installer_open": return "macOSのインストール画面を終えて、戻ってください。"
        case "authorizing": return "開いたNoahの画面で、このMacを承認してください。"
        case "connected": return "依頼・成果・停止はNoahの画面から。"
        case "error": return message
        default: return "ターミナルの操作はいりません。"
        }
    }
    var primaryTitle: String {
        switch state {
        case "connected": return "Agentを使う"
        case "needs_installer": return "準備ツールを入れる"
        case "needs_developer_tools": return "Macの準備を始める"
        case "installer_open": return "準備を続ける"
        case "authorizing": return "本人確認を開く"
        case "error": return "もう一度接続"
        default: return "接続する"
        }
    }
    func handle(_ url: URL) {
        guard let value = noahConnectionAgent(url) else { return }
        agent = value // Navigation intent only. Opening a URL never installs, pairs or starts a job.
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.first?.makeKeyAndOrderFront(nil)
    }
    func openNoah() {
        var c = URLComponents(string: "https://avoado.si/noah/activity")!
        if !agent.isEmpty { c.queryItems = [URLQueryItem(name: "agent", value: agent)]; c.fragment = "library" }
        NSWorkspace.shared.open(c.url!)
    }
    func primary() {
        if state == "connected" { openNoah(); return }
        if state == "authorizing", let authorization { NSWorkspace.shared.open(authorization); return }
        guard !busy else { return }
        if state == "needs_installer" { installPrerequisite(); return }
        if state == "needs_developer_tools" { installDeveloperTools(); return }
        connect()
    }
    func manifest() throws -> RuntimeManifest {
        guard let url = Bundle.main.url(forResource: "runtime", withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
        return try JSONDecoder().decode(RuntimeManifest.self, from: Data(contentsOf: url))
    }
    func privateDirectory(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])
        guard values.isDirectory == true, values.isSymbolicLink != true else { throw CocoaError(.fileReadNoPermission) }
    }
    func download(_ asset: RuntimeAsset, name: String) async throws -> URL {
        try privateDirectory(store)
        let target = store.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: target.path), try hash(target) == asset.sha256 { return target }
        let session = URLSession(configuration: .ephemeral)
        defer { session.finishTasksAndInvalidate() }
        var request = URLRequest(url: URL(string: asset.url)!)
        request.timeoutInterval = 240
        let (temporary, response) = try await session.download(for: request, delegate: TransferGuard(asset.maxBytes))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        let count = (try temporary.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
        guard count > 0, count <= asset.maxBytes, try hash(temporary) == asset.sha256 else { throw CocoaError(.fileReadCorruptFile) }
        try Task.checkCancellation()
        if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
        try FileManager.default.moveItem(at: temporary, to: target)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
        return target
    }
    func hash(_ file: URL) throws -> String {
        let value = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
        guard value.isRegularFile == true, value.isSymbolicLink != true, (value.fileSize ?? 0) <= 256 * 1024 * 1024 else { throw CocoaError(.fileReadCorruptFile) }
        let input = try FileHandle(forReadingFrom: file)
        defer { try? input.close() }
        var digest = SHA256(), count = 0
        while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            count += chunk.count
            guard count <= 256 * 1024 * 1024 else { throw CocoaError(.fileReadCorruptFile) }
            digest.update(data: chunk)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }
    func execute(_ executable: String, _ args: [String]) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let child = Process()
            child.executableURL = URL(fileURLWithPath: executable); child.arguments = args
            child.standardOutput = FileHandle.nullDevice; child.standardError = FileHandle.nullDevice
            child.terminationHandler = { p in
                if p.terminationStatus == 0 { continuation.resume() } else { continuation.resume(throwing: CocoaError(.executableRuntimeMismatch)) }
            }
            do { try child.run() } catch { continuation.resume(throwing: error) }
        }
    }
    func node() async throws -> URL {
        let asset = try manifest().node
        guard let directory = asset.directory, directory.range(of: "^node-v[0-9.]+-darwin-arm64$", options: .regularExpression) != nil else { throw CocoaError(.fileReadCorruptFile) }
        let runtime = store.appendingPathComponent(directory), executable = runtime.appendingPathComponent("bin/node"), receipt = runtime.appendingPathComponent("node.sha256")
        if let expected = try? String(contentsOf: receipt, encoding: .utf8), (try? hash(executable)) == expected { return executable }
        let archive = try await download(asset, name: "node-runtime.tar.xz")
        let stage = store.appendingPathComponent("stage-" + UUID().uuidString)
        try privateDirectory(stage)
        defer { try? FileManager.default.removeItem(at: stage) }
        try await execute("/usr/bin/tar", ["-xJf", archive.path, "-C", stage.path, directory + "/bin/node", directory + "/LICENSE"])
        try Task.checkCancellation()
        let prepared = stage.appendingPathComponent(directory)
        let digest = try hash(prepared.appendingPathComponent("bin/node"))
        try digest.write(to: prepared.appendingPathComponent("node.sha256"), atomically: true, encoding: .utf8)
        if FileManager.default.fileExists(atPath: runtime.path) { try FileManager.default.removeItem(at: runtime) }
        try FileManager.default.moveItem(at: prepared, to: runtime)
        return executable
    }
    func connect() {
        guard process == nil else { return }
        busy = true; state = "preparing"; message = ""
        operation = Task {
            do {
                let executable = try await node()
                try Task.checkCancellation()
                guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileNoSuchFile) }
                let child = Process(), output = Pipe()
                child.executableURL = executable
                child.arguments = [resources.appendingPathComponent("payload/scripts/noah-mac-onboarding.mjs").path]
                child.environment = ["HOME": FileManager.default.homeDirectoryForCurrentUser.path, "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "en_US.UTF-8", "NOAH_APP_SOURCE": resources.appendingPathComponent("payload").path]
                child.standardOutput = output; child.standardError = FileHandle.nullDevice; child.standardInput = FileHandle.nullDevice
                buffer = Data()
                process = child
                do { try child.run() } catch { process = nil; throw error }
                // One reader preserves event order; EOF is drained before reporting exit.
                DispatchQueue.global(qos: .utility).async {
                    while true {
                        let data = output.fileHandleForReading.availableData
                        if data.isEmpty { break }
                        DispatchQueue.main.async { self.consume(data) }
                    }
                    child.waitUntilExit()
                    DispatchQueue.main.async {
                        self.process = nil; self.busy = false
                        if !["needs_installer", "needs_developer_tools", "error", "stopped"].contains(self.state) {
                            self.state = "error"; self.message = "接続が終了しました。もう一度お試しください。"
                        }
                        if self.quitting { NSApp.reply(toApplicationShouldTerminate: true) }
                    }
                }
            } catch {
                busy = false
                if Task.isCancelled { state = "stopped" } else { state = "error"; message = "準備できませんでした。通信と空き容量を確認してください。" }
            }
        }
    }
    func consume(_ data: Data) {
        buffer.append(data)
        if buffer.count > 65536 { process?.terminate(); state = "error"; message = "応答を確認できません。"; return }
        while let end = buffer.firstIndex(of: 10) {
            let line = buffer[..<end]; buffer.removeSubrange(...end)
            guard let event = try? JSONDecoder().decode(SetupEvent.self, from: line), ["preparing", "installing", "needs_installer", "needs_developer_tools", "authorizing", "connecting", "connected", "stopped", "error"].contains(event.state) else { continue }
            if state == "stopping" && !["stopped", "error"].contains(event.state) { continue }
            state = event.state
            if state == "error" { message = String((event.message ?? "接続できませんでした。").prefix(240)) }
            if state == "authorizing", let text = event.url, let url = noahApprovalURL(text) {
                authorization = url; NSWorkspace.shared.open(url)
            }
        }
    }
    func stop() {
        state = "stopping"
        operation?.cancel()
        if let process, process.isRunning { process.terminate() } else { busy = false; state = "stopped" }
    }
    func installDeveloperTools() {
        busy = true; state = "preparing"
        operation = Task {
            do {
                try await execute("/usr/bin/xcode-select", ["--install"])
                state = "installer_open"
            } catch { state = "error"; message = "macOSのインストール画面を確認し、終わったらもう一度接続してください。" }
            busy = false
        }
    }
    func installPrerequisite() {
        busy = true; state = "preparing"
        operation = Task {
            do {
                let package = try await download(manifest().homebrew, name: "Homebrew.pkg")
                try Task.checkCancellation()
                guard NSWorkspace.shared.open(package) else { throw CocoaError(.executableNotLoadable) }
                state = "installer_open"
            } catch { state = Task.isCancelled ? "stopped" : "error"; message = "準備ツールを開けませんでした。もう一度お試しください。" }
            busy = false
        }
    }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { if !flag { sender.windows.first?.makeKeyAndOrderFront(nil) }; return true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let model = SetupModel.shared
        if model.process?.isRunning == true { model.quitting = true; model.stop(); return .terminateLater }
        model.operation?.cancel(); return .terminateNow
    }
}

@main struct NoahMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model = SetupModel.shared
    var body: some Scene {
        WindowGroup("Noah") {
            VStack(spacing: 22) {
                if let path = Bundle.main.path(forResource: "company-mark", ofType: "png"), let logo = NSImage(contentsOfFile: path) { Image(nsImage: logo).resizable().scaledToFit().frame(width: 54, height: 54) }
                Text("Noah").font(.system(size: 17, weight: .semibold))
                VStack(spacing: 10) { Text(model.title).font(.system(size: 25, weight: .bold)); Text(model.subtitle).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true) }
                if model.busy && model.state != "connected" { ProgressView().controlSize(.small) }
                Button(model.primaryTitle) { model.primary() }.buttonStyle(.borderedProminent).tint(model.purple).controlSize(.large).disabled(model.busy && !["connected", "authorizing"].contains(model.state)).keyboardShortcut(.defaultAction)
                if model.busy || model.state == "connected" { Button(model.state == "connected" ? "接続を停止" : "キャンセル") { model.stop() }.buttonStyle(.plain).foregroundStyle(.secondary).disabled(model.state == "stopping") }
                if model.state == "connected" { Text("ウィンドウを閉じても接続は続きます。").font(.system(size: 11)).foregroundStyle(.secondary) }
            }.padding(38).frame(width: 420, height: 400).background(Color(nsColor: .windowBackgroundColor))
             .onOpenURL { model.handle($0) }
             .onAppear { NSApp.activate(ignoringOtherApps: true) }
        }.windowStyle(.hiddenTitleBar).windowResizability(.contentSize)
    }
}
