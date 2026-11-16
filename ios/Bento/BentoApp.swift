import SwiftUI

@main
struct BentoApp: App {
    @StateObject private var store = MacStore()
    var body: some Scene {
        WindowGroup { Root().environmentObject(store).tint(Color.ink) }
    }
}

enum Phase: Equatable {
    case welcome                      // first run: what Bento is
    case pair                         // no Mac yet, or adding one
    case connecting(String)           // mac id
    case connected(String, URL)       // mac id, the page to open (with a one-time #pair=… code right after scanning)
    case unreachable(String, String)  // mac id, why
}

struct Root: View {
    @EnvironmentObject var store: MacStore
    @Environment(\.scenePhase) private var scene
    @AppStorage("welcomed") private var welcomed = false
    @State private var phase: Phase = .welcome
    @State private var showMacs = false
    @State private var away: Date?
    @State private var loaded = false      // Bento's page has drawn, so the cover can go
    @State private var pairing = false     // that page is trading a fresh code for this device's key
    @State private var started = false
    @State private var openWith: ConnectView.Sheet?

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            switch phase {
            case .welcome:
                IntroView(onDone: { welcomed = true; go(.pair) })
                    .transition(.asymmetric(insertion: .opacity, removal: .move(edge: .leading).combined(with: .opacity)))
            case .pair:
                ConnectView(canCancel: store.current != nil, canBack: store.current == nil, onLink: pair,
                            onCancel: { if let m = store.current { connect(m) } }, onBack: { go(.welcome) }, start: openWith)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
            case .connecting(let id):
                LoadingCover(title: "Connecting to \(name(id))…").transition(.opacity)
            case .connected(let id, let url):
                ZStack {
                    WebShell(url: url, onLoad: { withAnimation(.easeOut(duration: 0.35)) { loaded = true } },
                             onFail: { why in go(.unreachable(id, why)) })
                        .ignoresSafeArea()
                    if !loaded {
                        // right after pairing the link is already made: say so, rather than "connecting" again
                        LoadingCover(title: pairing ? "Opening Bento…" : "Connecting to \(name(id))…",
                                     detail: pairing ? "This \(deviceWord) now has its own key. \(name(id)) keeps only a fingerprint of it." : nil,
                                     mode: pairing ? .done : .flowing)
                            .transition(.opacity)
                    }
                }
                .transition(.opacity)
            case .unreachable(let id, let why):
                Unreachable(mac: store.macs.first { $0.id == id }, why: why,
                            retry: { if let m = store.current { connect(m) } }, macs: { showMacs = true })
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.9), value: phase)
        .sheet(isPresented: $showMacs) {
            MacsSheet(onPick: { m in showMacs = false; store.currentID = m.id; connect(m) },
                      onPairNew: { showMacs = false; go(.pair) })
                .environmentObject(store)
        }
        .onAppear {
            guard !started else { return }
            started = true
            #if DEBUG
            // simulator tests: SIMCTL_CHILD_BENTO_PAIR=<pairing link> stands in for scanning the code,
            // SIMCTL_CHILD_BENTO_SCREEN=welcome|connect|scan|type|name|approve|nomac|connecting|unreachable opens that screen
            let env = ProcessInfo.processInfo.environment
            if let s = env["BENTO_PAIR"], let l = PairLink(s) { return pair(l) }
            if let s = env["BENTO_SCREEN"] { return debugScreen(s) }
            #endif
            if let m = store.current { connect(m) } else { phase = welcomed ? .pair : .welcome }
        }
        .onChange(of: scene) { _, s in
            // back after a while and the page had given up: try the Mac again
            if s == .background { away = Date() }
            if s == .active, let t = away, Date().timeIntervalSince(t) > 120, let m = store.current, case .unreachable = phase { connect(m) }
            if s == .active { away = nil }
        }
        // can't reach the Mac: keep quietly trying, so the app picks up by itself the moment the Mac wakes
        .task(id: phase) {
            guard case .unreachable(let id, _) = phase else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled, case .unreachable = phase, let m = store.macs.first(where: { $0.id == id }) else { return }
                if await Reach.ok(m), let u = m.url { go(.connected(m.id, u)); return }
            }
        }
    }

    private var deviceWord: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }
    private func name(_ id: String) -> String { store.macs.first { $0.id == id }?.name ?? "your Mac" }

    private func go(_ p: Phase) {
        if case .connected = p { loaded = false }
        phase = p
    }

    /// Open Bento's page with the scanned one-time code; the page trades it for this device's key and keeps that key.
    func pair(_ l: PairLink) {
        let m = store.add(l)
        Haptics.play("success")
        pairing = true
        go(.connected(m.id, l.url))
    }

    func connect(_ m: PairedMac) {
        pairing = false
        go(.connecting(m.id))
        Task {
            if await Reach.ok(m), let u = m.url { go(.connected(m.id, u)) }
            else { go(.unreachable(m.id, "")) }
        }
    }

    #if DEBUG
    private func debugScreen(_ s: String) {
        let demo = PairedMac(name: "My Mac", host: "my-mac.tail1234.ts.net", port: 4917)
        switch s {
        case "connect": phase = .pair
        case "scan", "type", "nomac", "name", "approve":
            openWith = ["scan": .scan, "type": .type, "nomac": .noMac, "name": .name, "approve": .approve][s]; phase = .pair
        case "connecting": store.adopt(demo); pairing = true; phase = .connecting(demo.id)
        case "unreachable": store.adopt(demo); phase = .unreachable(demo.id, "")
        default: phase = .welcome
        }
    }
    #endif
}

/// What shows while Bento's page loads from the Mac: the iPhone and the Mac with the link moving between them.
struct LoadingCover: View {
    let title: String
    var detail: String? = nil
    var mode: LinkArt.Mode = .flowing
    var body: some View {
        VStack(spacing: 30) {
            LinkArt(mode: mode)
            VStack(spacing: 8) {
                Text(title).font(.title3.weight(.semibold))
                if let detail { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
            }
            .multilineTextAlignment(.center).padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.paper.ignoresSafeArea())
    }
}

struct Unreachable: View {
    let mac: PairedMac?; let why: String
    let retry: () -> Void; let macs: () -> Void
    private var name: String { mac?.name ?? "your Mac" }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LinkArt(mode: .broken).frame(maxWidth: .infinity).padding(.top, 36).padding(.bottom, 30)
                    Text("Can’t reach \(name)").font(.system(size: 30, weight: .bold)).tracking(-0.3)
                    Text("Bento does its work on your Mac, so this \(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") needs to reach it. Check these:")
                        .foregroundStyle(.secondary).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
                    VStack(spacing: 0) {
                        Check(icon: "power", tint: Brand.orange, title: "Your Mac is on and awake",
                              text: "Bento’s **Keep this Mac awake** setting stops it from sleeping while it’s plugged in.")
                        Divider().padding(.leading, 58)
                        Check(icon: "macwindow", tint: Brand.violet, title: "Bento is open on it",
                              text: "And **Settings → Your phone and iPad** is on.")
                        Divider().padding(.leading, 58)
                        Check(icon: "network", tint: Brand.mint, title: "You’re on the same Wi-Fi, or using Tailscale",
                              text: "Away from home, turn on Tailscale here and on the Mac.")
                    }
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.card))
                    .padding(.top, 22)
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Trying again by itself…").font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity).padding(.top, 18)
                    if !why.isEmpty { Text(why).font(.caption).foregroundStyle(.tertiary).frame(maxWidth: .infinity).padding(.top, 6) }
                }
                .padding(.horizontal, 24).padding(.bottom, 20).column()
            }
            .scrollBounceBehavior(.basedOnSize)
            VStack(spacing: 10) {
                Button("Try Again", action: retry).buttonStyle(BigButton())
                Button("Your Macs", action: macs).buttonStyle(BigButton(main: false))
            }
            .padding(.horizontal, 24).padding(.bottom, 12).column()
        }
    }
}

private struct Check: View {
    let icon: String; let tint: Color; let title: LocalizedStringKey; let text: LocalizedStringKey
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 30, height: 30).background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(tint))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold))
                Text(text).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
    }
}

struct MacsSheet: View {
    @EnvironmentObject var store: MacStore
    let onPick: (PairedMac) -> Void; let onPairNew: () -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(store.macs) { m in
                        Button { onPick(m) } label: {
                            HStack(spacing: 14) {
                                Image(systemName: "desktopcomputer").font(.title3).foregroundStyle(.secondary).frame(width: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.name).foregroundStyle(.primary)
                                    Text("\(m.host):\(String(m.port))").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                if m.id == store.current?.id { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(.tint) }
                            }
                        }
                        .swipeActions { Button("Forget", role: .destructive) { store.remove(m.id) } }
                    }
                } footer: { Text("To stop this device using a Mac for good, remove it in Bento on that Mac: Settings → Your phone and iPad.") }
                Section { Button { onPairNew() } label: { Label("Connect another Mac", systemImage: "qrcode.viewfinder") } }
            }
            .navigationTitle("Your Macs").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
