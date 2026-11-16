import SwiftUI
import UIKit

/// Looking for your Mac, the way AirDrop looks for people: this phone in the middle, rings going out, and each Mac
/// with Bento open popping up around it. Tap one to ask it.
struct Radar: View {
    let macs: [NearbyMac]
    let blocked: Bool
    let onPick: (NearbyMac) -> Void
    @Environment(\.accessibilityReduceMotion) private var still
    // where the Macs sit around the phone, in order: upper right, upper left, lower right, lower left, top
    private let angles: [Double] = [-38, 218, 38, 142, -90]

    var body: some View {
        ZStack {
            TimelineView(.animation(paused: still || blocked)) { tl in
                let t = tl.date.timeIntervalSinceReferenceDate
                Canvas { g, size in
                    let c = CGPoint(x: size.width / 2, y: size.height / 2)
                    for r in [70.0, 112.0] {
                        g.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(Color.ink.opacity(0.06)), lineWidth: 1)
                    }
                    guard !blocked else { return }
                    for i in 0..<3 {
                        let p = still ? Double(i) / 3 : (t / 2.4 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                        let r = 44 + p * 110
                        g.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)),
                                 with: .color(Brand.orange.opacity((1 - p) * 0.42)), lineWidth: 2)
                    }
                }
            }
            Circle().fill(Color.card).frame(width: 78, height: 78)
                .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
                .overlay(Image(systemName: UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone").font(.system(size: 30, weight: .light)))
                .accessibilityHidden(true)
            ForEach(Array(macs.prefix(5).enumerated()), id: \.element.id) { i, m in
                let a = angles[i] * .pi / 180
                MacBubble(mac: m) { onPick(m) }
                    .offset(x: cos(a) * 118, y: sin(a) * 96)
                    .transition(.scale(scale: 0.2).combined(with: .opacity))
            }
        }
        .frame(height: 290)
        .frame(maxWidth: .infinity)
        .animation(.spring(response: 0.5, dampingFraction: 0.62), value: macs)
        .sensoryFeedback(.impact(weight: .light), trigger: macs.count)
    }
}

private struct MacBubble: View {
    let mac: NearbyMac
    let action: () -> Void
    @State private var bob = false
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                ZStack {
                    Circle().fill(Color.ink).frame(width: 66, height: 66)
                        .shadow(color: .black.opacity(0.22), radius: 12, y: 6)
                    Image(systemName: "desktopcomputer").font(.system(size: 26, weight: .regular)).foregroundStyle(Color.paper)
                }
                Text(mac.name).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink)
                    .lineLimit(2).multilineTextAlignment(.center).frame(width: 112)
            }
            .offset(y: bob ? -3 : 3)
        }
        .buttonStyle(Pressable())
        .accessibilityLabel("Connect to \(mac.name)")
        .onAppear { if !still { withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { bob = true } } }
    }
}

struct Pressable: ButtonStyle {
    func makeBody(configuration c: Configuration) -> some View {
        c.label.scaleEffect(c.isPressed ? 0.92 : 1).animation(.spring(response: 0.25, dampingFraction: 0.7), value: c.isPressed)
    }
}

/// After a while with no Mac in sight: what to check, and the code as a way that always works
struct NotShowing: View {
    let onScan: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Not showing up?").font(.headline)
            VStack(alignment: .leading, spacing: 9) {
                tip("macwindow", "Bento is open on your Mac, with **Settings → Your phone and iPad** turned on.")
                tip("wifi", "This \(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") is on the same Wi-Fi as the Mac.")
                tip("arrow.down.circle", "An older Bento doesn’t show up here. Scan its code instead, or update it.")
            }
            Button(action: onScan) { Label("Scan its code", systemImage: "qrcode.viewfinder") }
                .buttonStyle(BigButton(main: false)).padding(.top, 4)
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.card))
    }
    private func tip(_ icon: String, _ text: LocalizedStringKey) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).frame(width: 20)
            Text(text).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}
