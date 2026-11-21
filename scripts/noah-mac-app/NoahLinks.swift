import Foundation

func noahConnectionAgent(_ url: URL) -> String? {
    guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false), c.scheme == "noah", c.host == "connect", ["", "/"].contains(c.path), c.user == nil, c.password == nil, c.port == nil, c.fragment == nil else { return nil }
    let items = c.queryItems ?? []
    guard items.count <= 1, items.allSatisfy({ $0.name == "agent" }) else { return nil }
    let value = items.first?.value ?? ""
    guard value.isEmpty || value.range(of: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$", options: .regularExpression) != nil else { return nil }
    return value
}

func noahApprovalURL(_ text: String) -> URL? {
    guard let url = URL(string: text), let c = URLComponents(url: url, resolvingAgainstBaseURL: false), c.scheme == "https", c.host == "avoado.si", c.port == nil, c.user == nil, c.password == nil, c.path == "/connect/device", c.fragment == nil, c.queryItems?.count == 1, c.queryItems?.first?.name == "user_code", let value = c.queryItems?.first?.value, value.range(of: "^[A-Z2-9]{8}$", options: .regularExpression) != nil else { return nil }
    return url
}
