import SwiftUI

@main
struct BentoApp: App {
    @StateObject private var store = MacStore()
    var body: some Scene {
        WindowGroup { Root().environmentObject(store).tint(Color("Ink")) }
    }
}

enum Phase: Equatable {
    case pair                         // no Mac yet, or adding one
    case connecting(String)           // mac id
    case connected(String, URL)       // mac id, the page to open (with a one-time #pair=… code right after scanning)
    case unreachable(String, String)  // mac id, why
}

struct Root: View {
    @EnvironmentObject var store: MacStore
    @Environment(\.scenePhase) private var scene
    @State private var phase: Phase = .pair
    @State private var showMacs = false
    @State private var away: Date?

    var body: some View {
        ZStack {
            Color("Paper").ignoresSafeArea()
            switch phase {
            case .pair:
                PairView(canCancel: store.current != nil, onLink: pair, onCancel: { if let m = store.current { connect(m) } })
            case .connecting(let id):
                VStack(spacing: 14) {
                    ProgressView().controlSize(.large)
                    Text("Connecting to \(store.macs.first { $0.id == id }?.name ?? "your Mac")…").foregroundStyle(.secondary)
                }
            case .connected(let id, let url):
                WebShell(url: url, onFail: { why in phase = .unreachable(id, why) }).ignoresSafeArea()
            case .unreachable(let id, let why):
                Unreachable(mac: store.macs.first { $0.id == id }, why: why,
                            retry: { if let m = store.current { connect(m) } }, macs: { showMacs = true })
            }
        }
        .sheet(isPresented: $showMacs) {
            MacsSheet(onPick: { m in showMacs = false; store.currentID = m.id; connect(m) },
                      onPairNew: { showMacs = false; phase = .pair })
                .environmentObject(store)
        }
        .onAppear {
            #if DEBUG
            // simulator tests: SIMCTL_CHILD_BENTO_PAIR=<pairing link> stands in for scanning the code
            if let s = ProcessInfo.processInfo.environment["BENTO_PAIR"], let l = PairLink(s) { return pair(l) }
            #endif
            if let m = store.current { connect(m) }
        }
        .onChange(of: scene) { _, s in
            // back after a while and the page had given up: try the Mac again
            if s == .background { away = Date() }
            if s == .active, let t = away, Date().timeIntervalSince(t) > 120, let m = store.current, case .unreachable = phase { connect(m) }
            if s == .active { away = nil }
        }
    }

    /// Open Bento's page with the scanned one-time code; the page trades it for this device's key and keeps that key.
    func pair(_ l: PairLink) {
        let m = store.add(l)
        Haptics.play("success")
        phase = .connected(m.id, l.url)
    }

    func connect(_ m: PairedMac) {
        phase = .connecting(m.id)
        Task {
            if await Reach.ok(m), let u = m.url { phase = .connected(m.id, u) }
            else { phase = .unreachable(m.id, "") }
        }
    }
}

struct Unreachable: View {
    let mac: PairedMac?; let why: String
    let retry: () -> Void; let macs: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Can’t reach \(mac?.name ?? "your Mac")").font(.system(size: 30, weight: .semibold))
            Text("Bento’s lessons and your projects live on your Mac, so this app needs to reach it.").foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 10) {
                Label("Your Mac is awake, and Bento is open on it.", systemImage: "desktopcomputer")
                Label("In Bento on the Mac, Settings → Your phone and iPad is turned on.", systemImage: "switch.2")
                Label("Tailscale is on here and on the Mac, or you’re on the same Wi-Fi with “Also on this Wi-Fi” on.", systemImage: "wifi")
            }.font(.callout)
            HStack {
                Button(action: retry) { Text("Try again").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large)
                Button(action: macs) { Text("Macs…").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large)
            }
            if !why.isEmpty { Text(why).font(.caption).foregroundStyle(.tertiary) }
        }
        .padding(28).frame(maxWidth: 520)
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
                            HStack {
                                Image(systemName: "desktopcomputer").foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.name).foregroundStyle(.primary)
                                    Text("\(m.host):\(String(m.port))").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                if m.id == store.current?.id { Image(systemName: "checkmark").foregroundStyle(.tint) }
                            }
                        }
                        .swipeActions { Button("Forget", role: .destructive) { store.remove(m.id) } }
                    }
                } footer: { Text("To stop this device using your Mac for good, remove it in Bento on the Mac: Settings → Your phone and iPad.") }
                Section { Button { onPairNew() } label: { Label("Pair another Mac", systemImage: "qrcode.viewfinder") } }
            }
            .navigationTitle("Your Macs").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
