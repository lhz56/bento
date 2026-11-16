import Foundation

// A Mac this device uses Bento on. Bento's lessons, projects and AI all live on the Mac; this app is a window onto the
// page Bento serves there (electron/host.cjs).
//
// What this app keeps is only WHERE the Mac is (an address and port), never a secret. Pairing happens in Bento's own
// page, exactly as in Safari: the QR code's one-time code is traded for this device's own key, which the page keeps in
// its storage for that address. The Mac keeps only a hash of it, and removing the device on the Mac ends it at once.
struct PairedMac: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name: String
    var host: String
    var port: Int
    var paired = Date()

    var url: URL? {
        var c = URLComponents(); c.scheme = "http"; c.host = host; c.port = port; c.path = "/"
        return c.url
    }
}

/// What the QR code in Bento's Settings on the Mac says: http://<host>:<port>/#pair=<8-character code>
struct PairLink {
    let url: URL; let host: String; let port: Int
    var name: String? = nil   // the Mac's own name, when it told us (Approve on Mac)
    init?(_ text: String) {
        guard let u = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), u.scheme == "http",
              let host = u.host, !host.isEmpty, let port = u.port,
              let frag = u.fragment, frag.hasPrefix("pair="),
              String(frag.dropFirst(5)).range(of: "^[0-9A-Za-z-]{4,20}$", options: .regularExpression) != nil
        else { return nil }
        url = u; self.host = host; self.port = port
    }
}

@MainActor
final class MacStore: ObservableObject {
    @Published private(set) var macs: [PairedMac] = []
    @Published var currentID: String? { didSet { UserDefaults.standard.set(currentID, forKey: "current") } }
    var current: PairedMac? { macs.first { $0.id == currentID } ?? macs.first }

    init() {
        if let d = UserDefaults.standard.data(forKey: "macs"), let m = try? JSONDecoder().decode([PairedMac].self, from: d) { macs = m }
        currentID = UserDefaults.standard.string(forKey: "current")
    }

    /// pairing the same Mac again (same address and port) replaces its old entry
    @discardableResult func add(_ l: PairLink) -> PairedMac {
        macs.removeAll { $0.host == l.host && $0.port == l.port }
        let m = PairedMac(name: l.name ?? MacStore.guessName(l.host), host: l.host, port: l.port)
        macs.append(m); currentID = m.id; save()
        return m
    }
    #if DEBUG
    /// simulator screenshots: a pretend Mac for this run only (never saved)
    func adopt(_ m: PairedMac) { macs = [m]; currentID = m.id }
    #endif
    func remove(_ id: String) { macs.removeAll { $0.id == id }; if currentID == id { currentID = macs.first?.id }; save() }
    private func save() { UserDefaults.standard.set(try? JSONEncoder().encode(macs), forKey: "macs") }

    /// "my-mac.tail1234.ts.net" → "My Mac"; a bare Wi-Fi address → "Mac"
    static func guessName(_ host: String) -> String {
        if host.first?.isNumber == true { return "Mac" }
        return host.split(separator: ".").first.map { $0.replacingOccurrences(of: "-", with: " ").capitalized } ?? "Mac"
    }
}

/// Is the Mac answering right now? Asks for Bento's public web manifest, so nothing secret is sent while probing.
enum Reach {
    static func ok(_ mac: PairedMac, timeout: TimeInterval = 4) async -> Bool {
        var c = URLComponents(); c.scheme = "http"; c.host = mac.host; c.port = mac.port; c.path = "/manifest.webmanifest"
        guard let u = c.url else { return false }
        let r = URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        return (try? await URLSession.shared.data(for: r)).map { ($0.1 as? HTTPURLResponse)?.statusCode == 200 } ?? false
    }
}
