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
    @State private var again: NearbyMac?    // the Mac forgot this device: Connect asks it again

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            switch phase {
            case .welcome:
                IntroView(onDone: { welcomed = true; go(.pair) })
                    .transition(.asymmetric(insertion: .opacity, removal: .move(edge: .leading).combined(with: .opacity)))
            case .pair:
                ConnectView(canCancel: store.current != nil, canBack: store.current == nil, onLink: pair,
                            // (a Mac that forgot this device would only send it straight back here: pick from the list instead)
                            onCancel: { if again != nil { showMacs = true } else if let m = store.current { connect(m) } },
                            onBack: { go(.welcome) }, start: openWith, again: again)
                    .id(again?.id ?? "")
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
            case .connecting(let id):
                LoadingCover(title: "Connecting to \(name(id))…").transition(.opacity)
            case .connected(let id, let url):
                ZStack {
                    WebShell(url: url, onLoad: { withAnimation(.easeOut(duration: 0.35)) { loaded = true } },
                             onFail: { why in go(.unreachable(id, why)) },
                             onAsk: { what in
                                 switch what {
                                 case "macs": showMacs = true
                                 case "unpaired":
                                     // removed in that Mac's Settings: ask it again with Allow, rather than a page asking for a code
                                     guard let m = store.macs.first(where: { $0.id == id }) else { return go(.pair) }
                                     Haptics.play("warn")
                                     again = NearbyMac(id: m.name, ways: ["\(m.host):\(m.port)"])
                                     go(.pair)
                                 default: break
                                 }
                             })
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
            MacsSheet(live: liveID, onPick: { m in
                          showMacs = false
                          // the Mac already on screen: nothing to do
                          if m.id == liveID { return }
                          again = nil; store.currentID = m.id; connect(m) },
                      onPairNew: { showMacs = false; again = nil; go(.pair) })
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

    /// the Mac whose Bento is on screen right now
    private var liveID: String? { if case .connected(let id, _) = phase { return id }; return nil }

    private var deviceWord: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }
    private func name(_ id: String) -> String { store.macs.first { $0.id == id }?.name ?? "your Mac" }

    private func go(_ p: Phase) {
        if case .connected = p { loaded = false }
        phase = p
    }

    /// Open Bento's page with the scanned one-time code; the page trades it for this device's key and keeps that key.
    func pair(_ l: PairLink) {
        again = nil
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
                    Text("Check these three things. Bento Code connects by itself the moment it can.")
                        .foregroundStyle(.secondary).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
                    VStack(spacing: 0) {
                        Check(icon: "power", tint: Brand.orange, title: "The Mac is on and awake",
                              text: "**Keep this Mac awake** in Bento helps.")
                        Divider().padding(.leading, 58)
                        Check(icon: "macwindow", tint: Brand.violet, title: "Bento is open on it",
                              text: "With **Your phone and iPad** turned on.")
                        Divider().padding(.leading, 58)
                        Check(icon: "network", tint: Brand.mint, title: "Same Wi-Fi, or Tailscale",
                              text: "Away from home, Tailscale on both.")
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

/// Every Mac this device has connected to: the one on screen, switching to another, adding one, forgetting one.
struct MacsSheet: View {
    @EnvironmentObject var store: MacStore
    var live: String? = nil
    let onPick: (PairedMac) -> Void; let onPairNew: () -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(store.macs) { m in
                        Button { Haptics.play("select"); onPick(m) } label: {
                            HStack(spacing: 14) {
                                ZStack {
                                    Circle().fill(m.id == live ? Color.ink : Color.ink.opacity(0.08)).frame(width: 40, height: 40)
                                    Image(systemName: "desktopcomputer").font(.system(size: 17, weight: .medium))
                                        .foregroundStyle(m.id == live ? Color.paper : Color.ink)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.name).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                                    if m.id == live {
                                        Label("Connected", systemImage: "circle.fill").labelStyle(Dot()).font(.subheadline).foregroundStyle(Brand.mint)
                                    } else {
                                        Text(m.host).font(.subheadline).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                                    }
                                }
                                Spacer(minLength: 0)
                                if m.id != live { Text("Switch").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.orange) }
                            }
                            .padding(.vertical, 4)
                        }
                        .accessibilityLabel(m.id == live ? "\(m.name), connected" : "Switch to \(m.name)")
                        .swipeActions { Button("Forget", role: .destructive) { store.remove(m.id) } }
                    }
                } header: { Text("This \(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") can use") }
                  footer: { Text("Swipe left to forget a Mac here. To stop a device for good, remove it on that Mac: Settings → Your phone and iPad.") }
                Section {
                    Button { onPairNew() } label: {
                        Label { Text("Connect another Mac").foregroundStyle(Color.ink) } icon: { Image(systemName: "plus.circle.fill").foregroundStyle(Brand.orange) }
                    }
                }
            }
            .navigationTitle("Your Macs").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.fontWeight(.semibold) } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

/// a small dot before a status word, as in Settings
private struct Dot: LabelStyle {
    func makeBody(configuration c: Configuration) -> some View {
        HStack(spacing: 6) { c.icon.font(.system(size: 7)); c.title }
    }
}
