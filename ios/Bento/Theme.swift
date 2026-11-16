import SwiftUI
import UIKit

// Bento's look on iPhone and iPad: the page's own paper and ink (light and dark, Assets.xcassets), the three colours of
// the icon, and a few native pieces every screen shares.
extension Color {
    static let paper = Color("Paper")   // the page's background, so the app and Bento's page meet without a seam
    static let ink = Color("Ink")       // text and the main button
    static let card = Color("Card")     // grouped rows on the paper
}

enum Brand {
    static let orange = Color(red: 1.00, green: 0.42, blue: 0.24)   // #FF6B3D, Bento's accent
    static let mint = Color(red: 0.25, green: 0.79, blue: 0.62)
    static let violet = Color(red: 0.56, green: 0.46, blue: 1.00)
    static let tray = Color(red: 0.11, green: 0.105, blue: 0.12)     // the icon's dark box
}

/// The big pill buttons at the bottom of a screen: ink on paper for the main one, a soft tint for the other.
struct BigButton: ButtonStyle {
    var main = true
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration c: Configuration) -> some View {
        c.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 54)
            .foregroundStyle(main ? Color.paper : Color.ink)
            .background(Capsule().fill(main ? Color.ink : Color.ink.opacity(0.07)))
            .contentShape(Capsule())
            .opacity(enabled ? (c.isPressed ? 0.8 : 1) : 0.35)
            .scaleEffect(c.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.75), value: c.isPressed)
    }
}

/// Liquid Glass where the system has it (iOS 26), frosted material before that. Used over the camera.
struct Glass<S: Shape>: ViewModifier {
    let shape: S
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular.interactive(), in: shape)
        } else {
            content.background(.ultraThinMaterial, in: shape)
        }
    }
}
extension View {
    func glass<S: Shape>(_ shape: S) -> some View { modifier(Glass(shape: shape)) }
    /// a screen's content column: comfortable on an iPhone, centred and not too wide on an iPad
    func column(_ width: CGFloat = 540) -> some View { frame(maxWidth: width).frame(maxWidth: .infinity) }
}

enum Haptics {
    static func play(_ kind: String) {
        switch kind {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warn": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "tap": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        default: UISelectionFeedbackGenerator().selectionChanged()
        }
    }
}
