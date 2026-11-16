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
    struct Problem: Error { let text: String; var old = false }

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
        if status == 401 || status == 404 { throw Problem(text: "Bento on this Mac is an older version that can’t be asked this way. Scan the code in its Settings instead, or update it.", old: true) }
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

/// Asking the Mac, full screen. The phone shows the number and a picture of the box that has just appeared on the Mac,
/// so you know exactly what to click; when you do, a check, a burst of Bento's colours, and you're in.
struct ApproveView: View {
    let mac: NearbyMac
    let onLink: (PairLink) -> Void
    let onClose: () -> Void
    var onScan: () -> Void = {}
    var preview: Step? = nil
    enum Step: Equatable { case reaching, waiting(String), allowed, denied, expired, failed(String, old: Bool) }
    @State private var step: Step = .reaching
    @State private var attempt = 0
    @State private var live: (URL, Approve.Started)?
    @State private var shown = 0          // digits that have popped in
    @State private var burst: Date?
    @State private var shake = 0
    private var device: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }
    private var code: String { if case .waiting(let c) = step { return c }; return lastCode }
    @State private var lastCode = ""
    private var failed: Bool { if case .failed = step { return true }; return [.denied, .expired].contains(step) }

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button("Cancel") { close() }.font(.body.weight(.medium)).frame(height: 44)
                        .opacity(step == .allowed ? 0 : 1).disabled(step == .allowed)
                    Spacer()
                }
                .padding(.horizontal, 20)
                GeometryReader { g in ScrollView {
                    VStack(spacing: 0) {
                        top
                        VStack(spacing: 10) {
                            Text(title).font(.system(size: 30, weight: .bold)).tracking(-0.3)
                            Text(detail).font(.body).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        .multilineTextAlignment(.center).padding(.horizontal, 12).padding(.top, 26)
                        .id(titleKey).transition(.opacity)
                        if case .waiting = step {
                            MacAlert(device: device, code: code)
                                .padding(.top, 30)
                                .transition(.opacity.combined(with: .scale(scale: 0.94)))
                        }
                    }
                    .padding(.horizontal, 24).padding(.bottom, 40)
                    .frame(minHeight: g.size.height).column()   // centred, and still scrolls with big text
                }
                .scrollBounceBehavior(.basedOnSize) }
                if failed {
                    VStack(spacing: 10) {
                        if case .failed(_, old: true) = step {
                            Button { onScan() } label: { Label("Scan its code", systemImage: "qrcode.viewfinder") }.buttonStyle(BigButton())
                        } else {
                            Button("Try Again") { attempt += 1 }.buttonStyle(BigButton())
                        }
                        Button("Back", action: close).buttonStyle(BigButton(main: false))
                    }
                    .padding(.horizontal, 24).padding(.bottom, 12).column()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            if let burst { Confetti(start: burst) }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.85), value: step)
        .task(id: attempt) { await run() }
        .interactiveDismissDisabled()
    }

    /// the number while you're asked, a big check once you're in, the link picture otherwise
    @ViewBuilder private var top: some View {
        switch step {
        case .waiting:
            HStack(spacing: 10) {
                ForEach(Array(code.enumerated()), id: \.offset) { i, ch in
                    Text(String(ch)).font(.system(size: 42, weight: .semibold, design: .rounded)).monospacedDigit()
                        .frame(width: 64, height: 80)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.card).shadow(color: .black.opacity(0.06), radius: 8, y: 3))
                        .scaleEffect(i < shown ? 1 : 0.5).opacity(i < shown ? 1 : 0)
                }
            }
            .modifier(Shake(n: shake))
            .accessibilityElement(children: .ignore).accessibilityLabel("Number \(code.map(String.init).joined(separator: " "))")
        case .allowed:
            ZStack {
                Circle().fill(Brand.mint.opacity(0.16)).frame(width: 132, height: 132)
                Image(systemName: "checkmark.circle.fill").font(.system(size: 92)).symbolRenderingMode(.palette).foregroundStyle(.white, Brand.mint)
            }
            .transition(.scale(scale: 0.3).combined(with: .opacity))
        default:
            LinkArt(mode: failed ? .broken : .flowing).transition(.opacity)
        }
    }

    private var titleKey: String { "\(step)" }
    private var title: String {
        switch step {
        case .reaching: "Finding \(mac.name)…"
        case .waiting: "Allow on your Mac"
        case .allowed: "You’re in"
        case .denied: "Your Mac said no"
        case .expired: "No answer from your Mac"
        case .failed(_, let old): old ? "Use the code instead" : "Can’t reach \(mac.name)"
        }
    }
    private var detail: LocalizedStringKey {
        switch step {
        case .reaching: "One moment."
        case .waiting: "This just appeared on **\(mac.name)**. Check the number matches, then click **Allow**."
        case .allowed: "\(mac.name) is connected. Opening Bento…"
        case .denied: "Someone clicked Don’t Allow on \(mac.name). Try again, and click Allow."
        case .expired: "Nobody clicked Allow on \(mac.name) in time. Try again, with the Mac in front of you."
        case .failed(let why, _): LocalizedStringKey(why)
        }
    }

    private func close() {
        if let (base, s) = live, case .waiting = step { Approve.cancel(base, s) }
        onClose()
    }

    private func run() async {
        if let preview { lastCode = "4821"; step = preview; await popDigits(); return }
        step = .reaching; live = nil; shown = 0; burst = nil
        guard let base = await Approve.reach(mac.ways) else {
            let tsOnly = mac.ways.allSatisfy { $0.contains(".ts.net") }
            step = .failed(tsOnly
                ? "\(mac.name) can only be reached through Tailscale. Turn on Tailscale on this \(device), then try again. Or, on the Mac, turn on **At home, on this Wi-Fi**."
                : "Make sure this \(device) is on the same Wi-Fi as \(mac.name), or that Tailscale is on for both.", old: false)
            Haptics.play("warn")
            return
        }
        do {
            let s = try await Approve.ask(base)
            live = (base, s); lastCode = s.code; step = .waiting(s.code)
            await popDigits()
            let a = try await Approve.answer(base, s)
            switch a.state {
            case "allowed":
                guard let p = a.pair, var l = PairLink("\(base.absoluteString)#pair=\(p)") else { step = .failed("Something went wrong. Try again.", old: false); return }
                l.name = a.mac ?? mac.name
                step = .allowed; Haptics.play("success")
                burst = Date()
                try await Task.sleep(for: .milliseconds(1500))
                onLink(l)
            case "denied":
                withAnimation(.default) { shake += 1 }
                Haptics.play("warn")
                try await Task.sleep(for: .milliseconds(450))
                step = .denied
            default: step = .expired
            }
        } catch is CancellationError {
        } catch let e as Approve.Problem { step = .failed(e.text, old: e.old); Haptics.play("warn")
        } catch { if !Task.isCancelled { step = .failed("Lost touch with \(mac.name). Try again.", old: false) } }
    }

    private func popDigits() async {
        for i in 1...4 {
            try? await Task.sleep(for: .milliseconds(i == 1 ? 120 : 90))
            withAnimation(.spring(response: 0.38, dampingFraction: 0.55)) { shown = i }
            Haptics.play("select")
        }
    }
}

/// A picture of the box Bento puts up on the Mac, with Allow gently pulsing, so you know what to look for and click.
struct MacAlert: View {
    let device: String
    let code: String
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var still
    private let macBlue = Color(red: 0.0, green: 0.48, blue: 1.0)

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 9) {
                Image("Mark").resizable().frame(width: 44, height: 44)
                Text("Allow “\(device)” to use Bento on this Mac?").font(.system(size: 13, weight: .bold)).multilineTextAlignment(.center)
                Text("Check that your \(device) shows \(code.map(String.init).joined(separator: " ")).").font(.system(size: 11)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                HStack(spacing: 8) {
                    Text("Don’t Allow").font(.system(size: 12, weight: .medium)).frame(maxWidth: .infinity, minHeight: 26)
                        .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.ink.opacity(0.08)))
                    Text("Allow").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 26)
                        .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(macBlue))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(macBlue.opacity(pulse ? 0 : 0.5), lineWidth: pulse ? 9 : 2).padding(-3))
                }
                .padding(.top, 5)
            }
            .padding(.horizontal, 16).padding(.vertical, 16)
            .frame(width: 252)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.card).shadow(color: .black.opacity(0.18), radius: 22, y: 10))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.ink.opacity(0.06)))
            Text("On your Mac").font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.top, 12)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("On your Mac, a box asks to allow this \(device). Click Allow.")
        .onAppear { if !still { withAnimation(.easeOut(duration: 1.3).repeatForever(autoreverses: false)) { pulse = true } } }
    }
}

/// a quick side-to-side shake, for Don't Allow
struct Shake: GeometryEffect {
    var amount: CGFloat
    init(n: Int) { amount = CGFloat(n) }
    var animatableData: CGFloat { get { amount } set { amount = newValue } }
    func effectValue(size: CGSize) -> ProjectionTransform { ProjectionTransform(CGAffineTransform(translationX: 10 * sin(amount * .pi * 4), y: 0)) }
}

/// Bento's colours bursting up from the middle, once
struct Confetti: View {
    let start: Date
    @Environment(\.accessibilityReduceMotion) private var still
    private struct Bit { let vx, vy, spin, size, delay: Double; let color: Color }
    private let bits: [Bit] = {
        var g = SystemRandomNumberGenerator()
        let colors = [Brand.orange, Brand.mint, Brand.violet, Color(red: 1, green: 0.8, blue: 0.3)]
        return (0..<70).map { i in
            Bit(vx: .random(in: -300...300, using: &g), vy: .random(in: -880...(-420), using: &g), spin: .random(in: -9...9, using: &g),
                size: .random(in: 8...15, using: &g), delay: .random(in: 0...0.12, using: &g), color: colors[i % colors.count])
        }
    }()

    var body: some View {
        if !still {
            TimelineView(.animation) { tl in
                Canvas { g, size in draw(g, size, tl.date.timeIntervalSince(start)) }
            }
            .ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
        }
    }

    private func draw(_ g: GraphicsContext, _ size: CGSize, _ t: Double) {
        for b in bits {
            let tt = t - b.delay
            guard tt > 0, tt < 2.4 else { continue }
            let x = size.width / 2 + b.vx * tt
            let y = size.height * 0.36 + b.vy * tt + 0.5 * 1100 * tt * tt
            var c = g
            c.opacity = max(0, 1 - tt / 2.4)
            c.translateBy(x: x, y: y)
            c.rotate(by: .radians(b.spin * tt))
            c.fill(Path(roundedRect: CGRect(x: -b.size / 2, y: -b.size * 0.35, width: b.size, height: b.size * 0.7), cornerRadius: 2.5), with: .color(b.color))
        }
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
