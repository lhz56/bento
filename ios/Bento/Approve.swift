import SwiftUI
import UIKit
import Network

// "Approve on Mac": find Bento on a Mac nearby, ask it, and click Allow on the Mac. Both screens show the same 4-digit
// number so you know it's your phone asking. Allow hands this app a one-time code, which Bento's page then trades for
// this device's own key, exactly as when you scan the QR code (electron/host.cjs; the Mac's dialog is in main.cjs).

/// A Mac with Bento open and phone access on, found by Bonjour on this Wi-Fi
struct NearbyMac: Identifiable, Hashable {
    let id: String          // the Mac's own name, e.g. "My Mac"
    var name: String { id }
    let ways: [String]      // how to reach it, best first: "host:port" (its Tailscale name, then its Wi-Fi address)
}

@MainActor
final class Nearby: ObservableObject {
    @Published private(set) var macs: [NearbyMac] = []
    @Published private(set) var blocked = false   // this app isn't allowed on the local network
    private var browser: NWBrowser?

    func start() {
        guard browser == nil else { return }
        #if DEBUG
        if ProcessInfo.processInfo.environment["BENTO_FAKE_NEARBY"] != nil {
            macs = [NearbyMac(id: "My Mac", ways: ["my-mac.tail1234.ts.net:4917"])]; return
        }
        #endif
        let b = NWBrowser(for: .bonjourWithTXTRecord(type: "_bento._tcp", domain: nil), using: .tcp)
        b.browseResultsChangedHandler = { [weak self] results, _ in
            var seen = Set<String>()
            let found = results.compactMap(Nearby.mac).filter { seen.insert($0.id).inserted }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            Task { @MainActor in withAnimation(.snappy) { self?.macs = found } }
        }
        b.stateUpdateHandler = { [weak self] st in
            var denied = false
            if case .waiting(let e) = st, case .dns(let code) = e, code == -65570 { denied = true } // kDNSServiceErr_PolicyDenied
            Task { @MainActor in self?.blocked = denied }
        }
        b.start(queue: .main)
        browser = b
    }
    func stop() { browser?.cancel(); browser = nil }

    nonisolated static func mac(_ r: NWBrowser.Result) -> NearbyMac? {
        guard case let .service(name, _, _, _) = r.endpoint, case let .bonjour(txt) = r.metadata else { return nil }
        var keys = ["ts", "lan"]
        #if DEBUG
        keys.append("local") // a test copy of Bento on this Mac, seen from the Simulator
        #endif
        let ways = keys.compactMap { txt[$0] }.filter(valid)
        return ways.isEmpty ? nil : NearbyMac(id: name, ways: ways)
    }
    nonisolated static func valid(_ hp: String) -> Bool { hp.range(of: "^[A-Za-z0-9.-]{1,253}:[0-9]{2,5}$", options: .regularExpression) != nil }
}

/// The three calls to Bento's server on the Mac
enum Approve {
    struct Started: Decodable { let id: String; let secret: String; let code: String; let mac: String? }
    struct Answer: Decodable { let state: String; let pair: String?; let mac: String? }
    struct Problem: Error { let text: String }

    /// the first way to the Mac that answers, as Bento's address
    static func reach(_ ways: [String]) async -> URL? {
        for w in ways {
            let p = w.split(separator: ":"); guard p.count == 2, let port = Int(p[1]) else { continue }
            let m = PairedMac(name: "", host: String(p[0]), port: port)
            if await Reach.ok(m, timeout: 3) { return m.url }
        }
        return nil
    }

    static func ask(_ base: URL) async throws -> Started {
        let pad = await MainActor.run { UIDevice.current.userInterfaceIdiom == .pad }
        let (d, status) = try await post(base, "connect", ["name": pad ? "iPad" : "iPhone", "kind": pad ? "tablet" : "phone"], wait: 10)
        if status == 200, let s = try? JSONDecoder().decode(Started.self, from: d) { return s }
        // a Mac whose Bento predates Approve on Mac answers like any unknown call: "pair first"
        if status == 401 || status == 404 { throw Problem(text: "Bento on this Mac needs an update for this. Until then, scan the code in its Settings.") }
        throw Problem(text: (try? JSONDecoder().decode([String: String].self, from: d))?["error"] ?? "Your Mac didn’t take the request. Try again.")
    }

    /// Wait for the answer on the Mac (each call waits up to 25 seconds there)
    static func answer(_ base: URL, _ s: Started) async throws -> Answer {
        while true {
            try Task.checkCancellation()
            let (d, status) = try await post(base, "connect/state", ["id": s.id, "secret": s.secret], wait: 40)
            if status == 404 { return Answer(state: "expired", pair: nil, mac: nil) }
            guard status == 200, let a = try? JSONDecoder().decode(Answer.self, from: d) else { throw Problem(text: "Lost touch with your Mac. Try again.") }
            if a.state != "waiting" { return a }
        }
    }

    /// The phone gave up: the Mac's dialog closes
    static func cancel(_ base: URL, _ s: Started) {
        Task.detached { _ = try? await post(base, "connect/cancel", ["id": s.id, "secret": s.secret], wait: 5) }
    }

    private static func post(_ base: URL, _ route: String, _ body: [String: String], wait: TimeInterval) async throws -> (Data, Int) {
        var q = URLRequest(url: base.appending(path: "api/\(route)"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: wait)
        q.httpMethod = "POST"
        q.setValue("application/json", forHTTPHeaderField: "content-type")
        q.httpBody = try JSONEncoder().encode(body)
        let (d, r) = try await URLSession.shared.data(for: q)
        return (d, (r as? HTTPURLResponse)?.statusCode ?? 0)
    }
}

/// Asking the Mac, full screen: the number to compare, then a check when you click Allow.
struct ApproveView: View {
    let mac: NearbyMac
    let onLink: (PairLink) -> Void
    let onClose: () -> Void
    var preview: Step? = nil
    enum Step: Equatable { case reaching, waiting(String), allowed, denied, expired, failed(String) }
    @State private var step: Step = .reaching
    @State private var attempt = 0
    @State private var live: (URL, Approve.Started)?
    private var device: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(step == .allowed ? "" : "Cancel") { close() }.font(.body.weight(.medium)).frame(height: 44).disabled(step == .allowed)
                Spacer()
            }
            .padding(.horizontal, 20)
            GeometryReader { g in ScrollView {
                VStack(spacing: 0) {
                    LinkArt(mode: art).animation(.spring(response: 0.4), value: art)
                    VStack(spacing: 10) {
                        Text(title).font(.system(size: 30, weight: .bold)).tracking(-0.3)
                        Text(detail).font(.body).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    .multilineTextAlignment(.center).padding(.top, 34).padding(.horizontal, 12)
                    .contentTransition(.opacity)
                    if case .waiting(let code) = step {
                        HStack(spacing: 10) {
                            ForEach(Array(code.enumerated()), id: \.offset) { _, ch in
                                Text(String(ch)).font(.system(size: 40, weight: .semibold, design: .rounded)).monospacedDigit()
                                    .frame(width: 62, height: 76)
                                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.card))
                            }
                        }
                        .padding(.top, 30)
                        .accessibilityElement(children: .ignore).accessibilityLabel("Number \(code.map(String.init).joined(separator: " "))")
                        .transition(.scale(scale: 0.9).combined(with: .opacity))
                        Text("Check that your Mac shows the same number.").font(.footnote).foregroundStyle(.secondary).padding(.top, 14)
                    }
                    if step == .reaching { ProgressView().controlSize(.large).padding(.top, 30) }
                }
                .padding(.horizontal, 24).padding(.bottom, 40)
                .frame(minHeight: g.size.height).column()   // centred on the screen, and still scrolls with big text
            }
            .scrollBounceBehavior(.basedOnSize) }
            if [.denied, .expired].contains(step) || { if case .failed = step { return true }; return false }() {
                VStack(spacing: 10) {
                    Button("Try Again") { attempt += 1 }.buttonStyle(BigButton())
                    Button("Back", action: close).buttonStyle(BigButton(main: false))
                }
                .padding(.horizontal, 24).padding(.bottom, 12).column()
            }
        }
        .background(Color.paper.ignoresSafeArea())
        .animation(.spring(response: 0.45, dampingFraction: 0.85), value: step)
        .task(id: attempt) { await run() }
        .interactiveDismissDisabled()
    }

    private var art: LinkArt.Mode { step == .allowed ? .done : [.denied, .expired].contains(step) ? .broken : { if case .failed = step { return .broken }; return .flowing }() }
    private var title: String {
        switch step {
        case .reaching: "Finding \(mac.name)…"
        case .waiting: "Allow on your Mac"
        case .allowed: "You’re connected"
        case .denied: "Your Mac said no"
        case .expired: "No answer from your Mac"
        case .failed: "Can’t reach \(mac.name)"
        }
    }
    private var detail: LocalizedStringKey {
        switch step {
        case .reaching: "One moment."
        case .waiting: "On **\(mac.name)**, click **Allow**."
        case .allowed: "Opening Bento…"
        case .denied: "Someone clicked Don’t Allow on \(mac.name). Try again, and click Allow."
        case .expired: "Nobody clicked Allow on \(mac.name) in time. Try again, with the Mac in front of you."
        case .failed(let why): LocalizedStringKey(why)
        }
    }

    private func close() {
        if let (base, s) = live, case .waiting = step { Approve.cancel(base, s) }
        onClose()
    }

    private func run() async {
        if let preview { step = preview; return }
        step = .reaching; live = nil
        guard let base = await Approve.reach(mac.ways) else {
            let tsOnly = mac.ways.allSatisfy { $0.contains(".ts.net") }
            step = .failed(tsOnly
                ? "\(mac.name) can only be reached through Tailscale. Turn on Tailscale on this \(device), then try again. Or, on the Mac, turn on **Also on this Wi-Fi**."
                : "Make sure this \(device) is on the same Wi-Fi as \(mac.name), or that Tailscale is on for both.")
            return
        }
        do {
            let s = try await Approve.ask(base)
            live = (base, s); step = .waiting(s.code); Haptics.play("tap")
            let a = try await Approve.answer(base, s)
            switch a.state {
            case "allowed":
                guard let p = a.pair, var l = PairLink("\(base.absoluteString)#pair=\(p)") else { step = .failed("Something went wrong. Try again."); return }
                l.name = a.mac ?? mac.name
                step = .allowed; Haptics.play("success")
                try await Task.sleep(for: .milliseconds(900))
                onLink(l)
            case "denied": step = .denied; Haptics.play("warn")
            default: step = .expired
            }
        } catch is CancellationError {
        } catch let e as Approve.Problem { step = .failed(e.text)
        } catch { if !Task.isCancelled { step = .failed("Lost touch with \(mac.name). Try again.") } }
    }
}

/// Away from home: type the Mac's Tailscale name (or any address it's on), then ask it the same way
struct EnterName: View {
    let onAsk: (NearbyMac) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Find it in Bento on your Mac, under **Settings → Your phone and iPad**. With Tailscale on here and on the Mac, this works from anywhere.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Your Mac’s name or address", systemImage: "desktopcomputer").font(.footnote.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
                        TextField("my-mac", text: $name)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).submitLabel(.go)
                            .focused($focused).onSubmit(go)
                            .padding(.horizontal, 16).frame(minHeight: 54)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.card))
                    }
                    Button("Ask to Connect", action: go).buttonStyle(BigButton()).disabled(way == nil)
                }
                .padding(24).column()
            }
            .background(Color.paper.ignoresSafeArea())
            .navigationTitle("Type your Mac’s name").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear { focused = true }
        }
    }

    /// "my-mac", "my-mac.tail1234.ts.net", "192.168.1.20" or any of them with a port or http://
    private var way: String? {
        var a = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        a = a.replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "https://", with: "")
        a = String(a.split(separator: "/").first ?? "")
        if !a.contains(":") { a += ":4917" }
        return Nearby.valid(a) ? a : nil
    }
    private func go() {
        guard let w = way else { return }
        let host = String(w.split(separator: ":")[0])
        onAsk(NearbyMac(id: MacStore.guessName(host), ways: [w]))
    }
}
