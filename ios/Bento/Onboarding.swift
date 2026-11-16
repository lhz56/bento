import SwiftUI

// First run: what Bento is (Welcome), then connecting this device to Bento on a Mac (Connect). The camera, typing the
// code, and "no Mac?" each open from Connect. However the code arrives, this only opens Bento's page with the one-time
// code; the page trades it for this device's own key (see Macs.swift).

let macDownload = URL(string: "https://github.com/lhz56/bento-releases/releases/latest")!

// ---------------------------------------------------------------- Welcome

struct WelcomeView: View {
    let onNext: () -> Void
    @State private var shown = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 0) {
                    BentoHero().padding(.top, 12)
                    VStack(spacing: 10) {
                        Text("Bento Code").font(.system(size: 40, weight: .bold)).tracking(-0.5)
                        Text("See how any app is built.\nThen learn to build your own.")
                            .font(.title3).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    .padding(.top, 4)
                    VStack(alignment: .leading, spacing: 24) {
                        Feature(icon: "square.3.layers.3d.down.right", tint: Brand.orange, title: "Take apart any app",
                                text: "Its screens, parts and services in plain words, with the real code a tap away.")
                        Feature(icon: "graduationcap.fill", tint: Brand.violet, title: "Learn by building",
                                text: "Short lessons made from real projects, at your own pace.")
                        Feature(icon: "sparkles", tint: Brand.mint, title: "With the AI you already have",
                                text: "Bento uses your Claude or ChatGPT plan on your Mac. Nothing extra to pay.")
                    }
                    .padding(.top, 40).padding(.horizontal, 8)
                    .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 14)
                }
                .padding(.horizontal, 24).padding(.bottom, 24).column()
            }
            .scrollBounceBehavior(.basedOnSize)
            Button("Continue", action: onNext).buttonStyle(BigButton())
                .padding(.horizontal, 24).padding(.bottom, 12).column()
        }
        .onAppear { withAnimation(.easeOut(duration: 0.6).delay(0.5)) { shown = true } }
    }
}

private struct Feature: View {
    let icon: String; let tint: Color; let title: LocalizedStringKey; let text: LocalizedStringKey
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon).font(.system(size: 26, weight: .medium)).foregroundStyle(tint)
                .frame(width: 38, alignment: .center).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(text).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The icon taking itself apart: its three boxes lift out of the tray and float, the way Bento takes an app apart.
struct BentoHero: View {
    @State private var apart = false
    @Environment(\.accessibilityReduceMotion) private var still
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        TimelineView(.animation(paused: still || !apart)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [Brand.orange.opacity(scheme == .dark ? 0.22 : 0.16), .clear], center: .center, startRadius: 10, endRadius: 150))
                    .frame(width: 320, height: 320)
                RoundedRectangle(cornerRadius: 46, style: .continuous).fill(Brand.tray)
                    .overlay(RoundedRectangle(cornerRadius: 46, style: .continuous).strokeBorder(.white.opacity(scheme == .dark ? 0.1 : 0), lineWidth: 1))
                    .frame(width: 180, height: 180)
                    .shadow(color: .black.opacity(scheme == .dark ? 0.5 : 0.22), radius: 26, y: 16)
                    .scaleEffect(apart ? 0.9 : 1)
                piece(Brand.orange, 68, 140, at: CGPoint(x: -36, y: 0), out: CGPoint(x: -30, y: 8), turn: -7, float: wave(t, 0), dot: true)
                piece(Brand.mint, 63, 65, at: CGPoint(x: 38.5, y: -37.5), out: CGPoint(x: 26, y: -24), turn: 8, float: wave(t, 2.1))
                piece(Brand.violet, 63, 65, at: CGPoint(x: 38.5, y: 37.5), out: CGPoint(x: 30, y: 22), turn: -5, float: wave(t, 4.2))
            }
        }
        .frame(height: 280)
        .accessibilityHidden(true)
        .onAppear {
            guard !apart else { return }
            if still { apart = true; return }
            withAnimation(.spring(response: 0.85, dampingFraction: 0.62).delay(0.35)) { apart = true }
        }
    }

    private func wave(_ t: Double, _ phase: Double) -> CGFloat { apart && !still ? CGFloat(sin(t * 1.3 + phase) * 4) : 0 }

    private func piece(_ c: Color, _ w: CGFloat, _ h: CGFloat, at: CGPoint, out: CGPoint, turn: Double, float: CGFloat, dot: Bool = false) -> some View {
        RoundedRectangle(cornerRadius: 17, style: .continuous)
            .fill(LinearGradient(colors: [c.opacity(0.92), c], startPoint: .top, endPoint: .bottom))
            .overlay(alignment: .leading) { if dot { Circle().fill(.white.opacity(0.45)).frame(width: 13).padding(.leading, 20) } }
            .frame(width: w, height: h)
            .shadow(color: c.opacity(apart ? 0.45 : 0), radius: 16, y: 10)
            .rotationEffect(.degrees(apart ? turn : 0))
            .offset(x: at.x + (apart ? out.x : 0), y: at.y + (apart ? out.y : 0) + float)
    }
}

// ---------------------------------------------------------------- Connect

struct ConnectView: View {
    let canCancel: Bool
    let canBack: Bool
    let onLink: (PairLink) -> Void
    let onCancel: () -> Void
    let onBack: () -> Void
    var start: Sheet? = nil
    enum Sheet: String, Identifiable { case scan, type, name, noMac, approve; var id: String { rawValue } }
    @StateObject private var nearby = Nearby()
    @State private var sheet: Sheet?
    @State private var scanning = false
    @State private var asking: NearbyMac?
    @Environment(\.scenePhase) private var scene

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if canBack { Button(action: onBack) { Image(systemName: "chevron.left").font(.title3.weight(.semibold)).frame(width: 44, height: 44) }.accessibilityLabel("Back") }
                Spacer()
                if canCancel { Button("Cancel", action: onCancel).font(.body.weight(.medium)).frame(height: 44) }
            }
            .padding(.horizontal, 12).frame(height: 44).foregroundStyle(Color.ink)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LinkArt(mode: .flowing).frame(maxWidth: .infinity).padding(.top, 4).padding(.bottom, 26)
                    Text("Connect your Mac").font(.system(size: 34, weight: .bold)).tracking(-0.4)
                    Text("Open Bento on your Mac and turn on **Settings → Your phone and iPad**. Then tap your Mac here.")
                        .font(.body).foregroundStyle(.secondary).padding(.top, 8).fixedSize(horizontal: false, vertical: true)

                    Group_(title: "On this Wi-Fi", busy: !nearby.blocked) {
                        if nearby.blocked {
                            Row(icon: "wifi.exclamationmark", tint: Brand.orange, title: "Bento Code can’t look on your Wi-Fi",
                                text: "Allow **Local Network** for Bento Code in Settings.") {
                                if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                            }
                        } else if nearby.macs.isEmpty {
                            HStack(alignment: .top, spacing: 14) {
                                ProgressView().frame(width: 34, height: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Looking for your Mac…").font(.body.weight(.semibold))
                                    Text("It shows up here once Bento is open on it with **Your phone and iPad** turned on. Not at home? Use another way below.")
                                        .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(14)
                        } else {
                            ForEach(Array(nearby.macs.enumerated()), id: \.element.id) { i, m in
                                if i > 0 { Divider().padding(.leading, 62) }
                                Row(icon: "desktopcomputer", tint: Color.ink, title: LocalizedStringKey(m.name), text: "Tap to connect", chevron: true) {
                                    Haptics.play("tap"); asking = m
                                }
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        }
                    }

                    Group_(title: "Other ways") {
                        Row(icon: "network", tint: Brand.mint, title: "Type your Mac’s name", text: "Away from home, with Tailscale", chevron: true) { sheet = .name }
                        Divider().padding(.leading, 62)
                        Row(icon: "qrcode.viewfinder", tint: Brand.violet, title: "Scan its code", text: "The QR code in Bento’s Settings on your Mac", chevron: true) { Haptics.play("tap"); scanning = true }
                        Divider().padding(.leading, 62)
                        Row(icon: "keyboard", tint: Brand.orange, title: "Enter its code", text: "The 8 letters under that QR code", chevron: true) { sheet = .type }
                    }

                    VStack(spacing: 6) {
                        Text("Bento isn’t on your Mac yet?").font(.subheadline).foregroundStyle(.secondary)
                        ShareLink(item: macDownload, subject: Text("Bento for Mac"), message: Text("Get Bento for Mac")) {
                            Label("Send the download to my Mac", systemImage: "square.and.arrow.up").font(.subheadline.weight(.semibold))
                        }
                        .tint(Brand.orange)
                        Button("No Mac? Here’s what Bento needs") { sheet = .noMac }
                            .font(.subheadline.weight(.medium)).foregroundStyle(.secondary).frame(minHeight: 40)
                    }
                    .frame(maxWidth: .infinity).padding(.top, 26)
                }
                .padding(.horizontal, 24).padding(.bottom, 28).column()
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .fullScreenCover(isPresented: $scanning) {
            ScanScreen(onLink: { l in scanning = false; onLink(l) },
                       onType: { scanning = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { sheet = .type } })
        }
        .fullScreenCover(item: $asking) { m in
            ApproveView(mac: m, onLink: { l in asking = nil; onLink(l) }, onClose: { asking = nil }, preview: previewStep)
        }
        .sheet(item: $sheet) { s in
            switch s {
            case .type: EnterCode(onLink: { l in sheet = nil; onLink(l) })
            case .name: EnterName(onAsk: { m in sheet = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { asking = m } })
            case .noMac: NoMacSheet()
            case .scan, .approve: EmptyView()
            }
        }
        .onAppear {
            nearby.start()
            switch start {
            case .scan: scanning = true
            case .approve: asking = NearbyMac(id: "My Mac", ways: ["my-mac.tail1234.ts.net:4917"])
            case .some(let s): sheet = s
            case nil: break
            }
        }
        .onDisappear { nearby.stop() }
        #if DEBUG
        // simulator test (SIMCTL_CHILD_BENTO_AUTO_APPROVE=1): tap the first Mac that shows up
        .onChange(of: nearby.macs) { _, ms in
            if ProcessInfo.processInfo.environment["BENTO_AUTO_APPROVE"] != nil, asking == nil, let m = ms.first { asking = m }
        }
        #endif
        .onChange(of: scene) { _, s in if s == .active { nearby.start() } else if s == .background { nearby.stop() } }
    }

    private var previewStep: ApproveView.Step? {
        #if DEBUG
        if start == .approve { return .waiting("4821") }
        #endif
        return nil
    }
}

/// A titled group of rows on a card, like Settings
private struct Group_<Content: View>: View {
    let title: LocalizedStringKey
    var busy = false
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(title).font(.footnote.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
                if busy { ProgressView().controlSize(.mini) }
            }
            .padding(.leading, 16)
            VStack(spacing: 0) { content() }
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.card))
        }
        .padding(.top, 26)
    }
}

/// One tappable row: a coloured icon tile, a title and a line under it
private struct Row: View {
    let icon: String; let tint: Color; let title: LocalizedStringKey; let text: LocalizedStringKey
    var chevron = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(tint == Color.ink ? Color.paper : .white)
                    .frame(width: 34, height: 34).background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                    Text(text).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if chevron { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary) }
            }
            .padding(14).contentShape(Rectangle())
        }
        .buttonStyle(RowPress())
    }
}

private struct RowPress: ButtonStyle {
    func makeBody(configuration c: Configuration) -> some View {
        c.label.background(Color.ink.opacity(c.isPressed ? 0.06 : 0))
    }
}

/// An iPhone and a Mac with the link between them: moving dots while it connects, a check when it worked, a gap when
/// the Mac can't be reached.
struct LinkArt: View {
    enum Mode { case flowing, done, broken }
    var mode: Mode = .flowing
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone").font(.system(size: 50, weight: .thin))
            ZStack {
                switch mode {
                case .flowing:
                    TimelineView(.animation(paused: still)) { tl in
                        let t = tl.date.timeIntervalSinceReferenceDate
                        Canvas { g, size in
                            for i in 0..<5 {
                                let p = (t * 0.55 + Double(i) / 5).truncatingRemainder(dividingBy: 1)
                                let x = size.width * (1 - p), fade = sin(p * .pi)
                                g.fill(Path(ellipseIn: CGRect(x: x - 3.5, y: size.height / 2 - 3.5, width: 7, height: 7)), with: .color(Brand.orange.opacity(fade)))
                            }
                        }
                    }
                case .done:
                    Capsule().fill(Brand.mint).frame(height: 3)
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 30)).foregroundStyle(.white, Brand.mint)
                        .background(Circle().fill(Color.paper).padding(-3))
                case .broken:
                    HStack(spacing: 16) { Capsule().frame(height: 2); Capsule().frame(height: 2) }.foregroundStyle(.tertiary)
                    Image(systemName: "moon.zzz.fill").font(.system(size: 20)).foregroundStyle(.secondary)
                }
            }
            .frame(width: 92, height: 34)
            Image(systemName: "desktopcomputer").font(.system(size: 72, weight: .thin))
        }
        .foregroundStyle(Color.ink)
        .accessibilityHidden(true)
    }
}

// ---------------------------------------------------------------- typing the code

struct EnterCode: View {
    let onLink: (PairLink) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var code = ""
    @State private var bad = ""
    @FocusState private var focus: Int?
    private var clean: String { code.uppercased().filter { $0.isLetter || $0.isNumber } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Both are under the code in Bento on your Mac: **Settings → Your phone and iPad**.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    field("Your Mac’s address", "desktopcomputer") {
                        TextField("my-mac.tail1234.ts.net", text: $address)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            .textContentType(.URL).submitLabel(.next).focused($focus, equals: 0).onSubmit { focus = 1 }
                    }
                    field("Code", "key.horizontal") {
                        TextField("ABCD-EFGH", text: $code)
                            .font(.system(size: 26, weight: .semibold, design: .monospaced)).tracking(2)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .submitLabel(.go).focused($focus, equals: 1).onSubmit(typed)
                            .onChange(of: code) { _, v in
                                let c = String(v.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
                                let f = c.count > 4 ? "\(c.prefix(4))-\(c.dropFirst(4))" : c
                                if f != v { code = f }
                            }
                    }
                    if !bad.isEmpty {
                        Label(bad, systemImage: "exclamationmark.circle.fill").font(.subheadline).foregroundStyle(.red)
                    }
                    Button("Connect", action: typed).buttonStyle(BigButton()).disabled(address.isEmpty || clean.count != 8).padding(.top, 4)
                }
                .padding(24).column()
            }
            .background(Color.paper.ignoresSafeArea())
            .navigationTitle("Enter the code").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear { focus = 0 }
        }
    }

    private func field<F: View>(_ label: LocalizedStringKey, _ icon: String, @ViewBuilder _ f: () -> F) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(label, systemImage: icon).font(.footnote.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
            f().padding(.horizontal, 16).frame(minHeight: 54)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.card))
        }
    }

    /// "host", "host:port" or a pasted "http://host:port/#pair=…" link, plus the code → the same link the QR code holds
    private func typed() {
        var a = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if let l = PairLink(a) { return onLink(l) }
        a = a.replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "https://", with: "")
        a = String(a.split(separator: "/").first ?? "")
        if !a.contains(":") { a += ":4917" }
        if clean.count == 8, let l = PairLink("http://\(a)/#pair=\(clean)") { Haptics.play("success"); onLink(l) }
        else { Haptics.play("warn"); bad = "Check the address and the 8-letter code shown on your Mac." }
    }
}

// ---------------------------------------------------------------- no Mac

struct NoMacSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Image(systemName: "desktopcomputer").font(.system(size: 44, weight: .light)).foregroundStyle(Brand.orange)
                    Text("Bento runs on a Mac").font(.title.bold())
                    Text("Your own AI plan does the explaining. Bento uses it through Claude Code or Codex on your Mac, the way Anthropic and OpenAI allow, so your plan covers everything, with nothing extra to pay.")
                        .foregroundStyle(.secondary)
                    Text("This \(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") is how you take Bento with you: every project, lesson and question, wherever you are.")
                        .foregroundStyle(.secondary)
                    ShareLink(item: macDownload, subject: Text("Bento for Mac"), message: Text("Get Bento for Mac")) {
                        Label("Send the download to my Mac", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(BigButton()).padding(.top, 8)
                }
                .padding(24).column()
            }
            .background(Color.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}
