import SwiftUI
import UIKit

// First run: three pictures that move, before any setup. Each one shows what Bento does instead of saying it: an app
// taken apart into its parts, a lesson whose code runs, and a question answered by your own AI on your Mac. Swipe, or
// Continue; Skip goes straight to connecting.

struct IntroView: View {
    let onDone: () -> Void
    @State private var page = IntroView.firstPage
    private let pages = 3
    #if DEBUG
    private static var firstPage: Int { Int(ProcessInfo.processInfo.environment["BENTO_PAGE"] ?? "") ?? 0 } // screenshots
    #else
    private static var firstPage: Int { 0 }
    #endif

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image("Mark").resizable().frame(width: 28, height: 28).accessibilityHidden(true)
                Text("Bento Code").font(.headline)
                Spacer()
                Button("Skip", action: onDone).font(.body.weight(.medium)).foregroundStyle(.secondary)
                    .frame(height: 44).opacity(page < pages - 1 ? 1 : 0).disabled(page == pages - 1)
            }
            .padding(.horizontal, 24).frame(height: 48)

            TabView(selection: $page) {
                IntroPage(title: "Take apart any app", text: "See what it’s made of: its screens, logic, data and the services it uses, in plain words.") {
                    XRayArt(active: page == 0)
                }.tag(0)
                IntroPage(title: "Learn by building", text: "Short lessons made from real code. Run it right here, on your phone.") {
                    LessonArt(active: page == 1)
                }.tag(1)
                IntroPage(title: "With the AI you already have", text: "Your Claude or ChatGPT plan does the explaining, on your Mac. Nothing extra to pay.") {
                    AskArt(active: page == 2)
                }.tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .sensoryFeedback(.selection, trigger: page)

            Dots(count: pages, page: page).padding(.bottom, 18)
            Button { next() } label: {
                Text(page == pages - 1 ? "Get Started" : "Continue").contentTransition(.opacity)
            }
            .buttonStyle(BigButton())
            .padding(.horizontal, 24).padding(.bottom, 12).column()
        }
        .animation(.easeInOut(duration: 0.25), value: page)
        #if DEBUG
        // screen recordings (SIMCTL_CHILD_BENTO_DEMO=1): turn the pages by themselves
        .task {
            guard ProcessInfo.processInfo.environment["BENTO_DEMO"] != nil else { return }
            for _ in 0..<pages { try? await Task.sleep(for: .seconds(4.2)); next() }
        }
        #endif
    }

    private func next() {
        if page < pages - 1 { withAnimation(.spring(response: 0.5, dampingFraction: 0.9)) { page += 1 } } else { onDone() }
    }
}

private struct IntroPage<Art: View>: View {
    let title: LocalizedStringKey
    let text: LocalizedStringKey
    @ViewBuilder var art: () -> Art

    var body: some View {
        GeometryReader { g in
            // the picture is drawn for 340×300 and scaled to fit: smaller on a small phone, a little bigger on an iPad
            let s = min(g.size.width > 600 ? 1.35 : 1.0, (g.size.width - 32) / 340, max(0.6, (g.size.height - 210) / 300))
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                art().frame(width: 340, height: 300).scaleEffect(s).frame(width: 340 * s, height: 300 * s)
                Spacer(minLength: 18)
                VStack(spacing: 10) {
                    Text(title).font(.system(size: 32, weight: .bold)).tracking(-0.4)
                    Text(text).font(.body).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                .multilineTextAlignment(.center).padding(.horizontal, 28).frame(maxWidth: 520)
                Spacer(minLength: 12)
            }
            .frame(width: g.size.width, height: g.size.height)
        }
    }
}

struct Dots: View {
    let count: Int; let page: Int
    var body: some View {
        HStack(spacing: 7) {
            ForEach(0..<count, id: \.self) { i in
                Capsule().fill(i == page ? Color.ink : Color.ink.opacity(0.18)).frame(width: i == page ? 22 : 7, height: 7)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: page)
        .accessibilityElement().accessibilityLabel("Page \(page + 1) of \(count)")
    }
}

/// a point along a cubic curve
private func cubic(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint, _ d: CGPoint, _ t: CGFloat) -> CGPoint {
    let u = 1 - t
    return CGPoint(x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
                   y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y)
}

// ---------------------------------------------------------------- 1. an app, taken apart

/// A little app on a phone is scanned, and each piece of it is traced out to what it is: its screens, its logic, its
/// data and a service it pays through, with dots running along the lines like Bento's own diagrams.
struct XRayArt: View {
    let active: Bool
    @State private var step = 0        // 1 phone, 2 scanning, 3…6 one part each
    @State private var scan: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var still

    private struct Part { let name: LocalizedStringKey; let icon: String; let color: Color; let from: CGPoint; let at: CGPoint; let spot: CGRect }
    private var parts: [Part] { [
        Part(name: "Screens", icon: "rectangle.on.rectangle", color: Brand.orange, from: CGPoint(x: 146, y: 82), at: CGPoint(x: 206, y: 50), spot: CGRect(x: 44, y: 52, width: 102, height: 60)),
        Part(name: "Logic", icon: "gearshape.2.fill", color: Brand.violet, from: CGPoint(x: 142, y: 140), at: CGPoint(x: 206, y: 116), spot: CGRect(x: 44, y: 118, width: 98, height: 42)),
        Part(name: "Data", icon: "cylinder.split.1x2.fill", color: Brand.mint, from: CGPoint(x: 142, y: 186), at: CGPoint(x: 206, y: 182), spot: CGRect(x: 44, y: 166, width: 98, height: 42)),
        Part(name: "Payments", icon: "creditcard.fill", color: Color(red: 0.36, green: 0.56, blue: 1.0), from: CGPoint(x: 146, y: 233), at: CGPoint(x: 206, y: 248), spot: CGRect(x: 44, y: 220, width: 102, height: 26)),
    ] }

    var body: some View {
        ZStack(alignment: .topLeading) {
            phone
            // the lines, drawn out one by one, and the dots that run along them
            TimelineView(.animation(paused: still || step < 3)) { tl in
                let t = tl.date.timeIntervalSinceReferenceDate
                Canvas { g, _ in links(g, t) }
            }
            .frame(width: 340, height: 300)
            ForEach(Array(parts.enumerated()), id: \.offset) { i, p in
                HStack(spacing: 8) {
                    Image(systemName: p.icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28).background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(p.color))
                    Text(p.name).font(.subheadline.weight(.semibold))
                }
                .padding(.leading, 6).padding(.trailing, 12).frame(height: 40)
                .background(Capsule().fill(Color.card).shadow(color: .black.opacity(0.1), radius: 10, y: 4))
                .fixedSize()
                .scaleEffect(step >= 3 + i ? 1 : 0.4, anchor: .leading)
                .opacity(step >= 3 + i ? 1 : 0)
                .position(x: p.at.x + 60, y: p.at.y)
            }
        }
        .frame(width: 340, height: 300)
        .accessibilityElement().accessibilityLabel("An app taken apart into its screens, logic, data and payments")
        .task(id: active) { await play() }
    }

    private func links(_ g: GraphicsContext, _ t: Double) {
        for (i, p) in parts.enumerated() where step >= 3 + i {
            let c1 = CGPoint(x: p.from.x + 34, y: p.from.y)
            let c2 = CGPoint(x: p.at.x - 34, y: p.at.y)
            var path = Path()
            path.move(to: p.from)
            path.addCurve(to: p.at, control1: c1, control2: c2)
            g.stroke(path, with: .color(p.color.opacity(0.55)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
            for k in 0..<2 {
                let phase: Double = t * 0.55 + Double(i) * 0.21 + Double(k) * 0.5
                let f: CGFloat = still ? 0.5 : CGFloat(phase.truncatingRemainder(dividingBy: 1))
                let q = cubic(p.from, c1, c2, p.at, f)
                g.fill(Path(ellipseIn: CGRect(x: q.x - 3, y: q.y - 3, width: 6, height: 6)), with: .color(p.color))
            }
        }
    }

    private var phone: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Color.card)
                .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Color.ink.opacity(0.85), lineWidth: 2.5))
                .frame(width: 124, height: 248).offset(x: 33, y: 26)
                .shadow(color: .black.opacity(0.12), radius: 18, y: 10)
            Capsule().fill(Color.ink.opacity(0.85)).frame(width: 34, height: 9).offset(x: 78, y: 36)
            // the app's own screen: a picture, a title, two lines of words, two rows, a Pay button
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(LinearGradient(colors: [Brand.orange.opacity(0.85), Brand.violet.opacity(0.75)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 96, height: 52).offset(x: 47, y: 56)
            Capsule().fill(Color.ink.opacity(0.8)).frame(width: 70, height: 7).offset(x: 47, y: 122)
            Capsule().fill(Color.ink.opacity(0.18)).frame(width: 92, height: 6).offset(x: 47, y: 137)
            Capsule().fill(Color.ink.opacity(0.18)).frame(width: 78, height: 6).offset(x: 47, y: 149)
            ForEach(0..<2) { r in
                Circle().fill([Brand.mint, Brand.violet][r]).frame(width: 14, height: 14).offset(x: 47, y: 172 + CGFloat(r) * 20)
                Capsule().fill(Color.ink.opacity(0.18)).frame(width: 70, height: 6).offset(x: 68, y: 176 + CGFloat(r) * 20)
            }
            Capsule().fill(Color(red: 0.36, green: 0.56, blue: 1.0)).frame(width: 96, height: 22).offset(x: 47, y: 222)
            Text("Pay").font(.system(size: 11, weight: .bold)).foregroundStyle(.white).frame(width: 96, height: 22).offset(x: 47, y: 222)
            // each part lights up as it's found
            ForEach(Array(parts.enumerated()), id: \.offset) { i, p in
                RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(p.color, lineWidth: 2)
                    .frame(width: p.spot.width + 6, height: p.spot.height + 4).offset(x: p.spot.minX - 3, y: p.spot.minY - 2)
                    .opacity(step >= 3 + i ? 1 : 0)
            }
            // the scan passing down the screen
            LinearGradient(colors: [Brand.mint.opacity(0), Brand.mint.opacity(0.55), Brand.mint.opacity(0)], startPoint: .top, endPoint: .bottom)
                .frame(width: 112, height: 34).offset(x: 39, y: 30 + scan * 216)
                .opacity(step == 2 ? 1 : 0)
                .blendMode(.plusLighter)
        }
        .frame(width: 340, height: 300, alignment: .topLeading)
        .offset(x: step >= 1 ? 0 : 60)
        .opacity(step >= 1 ? 1 : 0)
    }

    private func play() async {
        guard active else { return }
        if still { step = 6; return }
        step = 0; scan = 0
        try? await Task.sleep(for: .milliseconds(150))
        withAnimation(.spring(response: 0.6, dampingFraction: 0.85)) { step = 1 }
        try? await Task.sleep(for: .milliseconds(450))
        step = 2; withAnimation(.easeInOut(duration: 1.0)) { scan = 1 }
        try? await Task.sleep(for: .milliseconds(700))
        for s in 3...6 {
            guard !Task.isCancelled else { return }
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { step = s }
            Haptics.play("select")
            try? await Task.sleep(for: .milliseconds(330))
        }
    }
}

// ---------------------------------------------------------------- 2. a lesson that runs

/// A lesson card: its code writes itself line by line, Run is pressed, and the answer comes back with a check.
struct LessonArt: View {
    let active: Bool
    @State private var lines = 0
    @State private var pressed = false
    @State private var ran = false
    @Environment(\.accessibilityReduceMotion) private var still

    private let code: [[(String, Color?)]] = [
        [("def ", Brand.violet), ("greet", nil), ("(name):", nil)],
        [("    return ", Brand.violet), ("\"Hi, \"", Brand.mint), (" + name", nil)],
        [("", nil)],
        [("print", nil), ("(greet(", nil), ("\"Lin\"", Brand.mint), ("))", nil)],
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("LESSON").font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(Brand.violet)
                Spacer()
                Label("3 min", systemImage: "clock").font(.caption2.weight(.medium)).foregroundStyle(.secondary)
            }
            Text("What is a function?").font(.title3.weight(.bold))
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(code.enumerated()), id: \.offset) { i, line in
                    Text(attributed(line)).font(.system(size: 14, weight: .medium, design: .monospaced))
                        .frame(height: 18, alignment: .leading)
                        .opacity(i < lines ? 1 : 0).offset(x: i < lines ? 0 : -8)
                }
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Brand.tray))
            .environment(\.colorScheme, .dark)
            HStack(spacing: 10) {
                Label("Run", systemImage: "play.fill").font(.subheadline.weight(.bold)).foregroundStyle(Color.paper)
                    .padding(.horizontal, 16).frame(height: 36).background(Capsule().fill(Color.ink))
                    .scaleEffect(pressed ? 0.9 : 1)
                if ran {
                    Text("Hi, Lin").font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .padding(.horizontal, 12).frame(height: 36)
                        .background(Capsule().fill(Brand.mint.opacity(0.16)))
                        .transition(.move(edge: .leading).combined(with: .opacity))
                    Spacer(minLength: 0)
                    Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(Brand.mint)
                        .transition(.scale.combined(with: .opacity))
                } else { Spacer(minLength: 0) }
            }
        }
        .padding(18).frame(width: 312)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.card).shadow(color: .black.opacity(0.12), radius: 22, y: 12))
        .frame(width: 340, height: 300)
        .accessibilityElement().accessibilityLabel("A lesson whose code runs on your phone")
        .task(id: active) { await play() }
    }

    private func attributed(_ parts: [(String, Color?)]) -> AttributedString {
        var out = AttributedString()
        for (s, c) in parts { var a = AttributedString(s); a.foregroundColor = c ?? Color(white: 0.93); out += a }
        return out
    }

    private func play() async {
        guard active else { return }
        if still { lines = code.count; ran = true; return }
        lines = 0; ran = false; pressed = false
        try? await Task.sleep(for: .milliseconds(250))
        for i in 1...code.count {
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.3)) { lines = i }
            try? await Task.sleep(for: .milliseconds(i == 3 ? 120 : 380))
        }
        try? await Task.sleep(for: .milliseconds(350))
        withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { pressed = true }
        Haptics.play("tap")
        try? await Task.sleep(for: .milliseconds(160))
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { pressed = false }
        try? await Task.sleep(for: .milliseconds(250))
        withAnimation(.spring(response: 0.5, dampingFraction: 0.75)) { ran = true }
    }
}

// ---------------------------------------------------------------- 3. your AI answers

/// A question from the phone, your Mac thinking with your own AI, and the answer arriving word by word.
struct AskArt: View {
    let active: Bool
    @State private var asked = false
    @State private var thinking = false
    @State private var words = 0
    @Environment(\.accessibilityReduceMotion) private var still
    private let answer = "When you tap Pay, the app asks Stripe for a safe checkout page. You pay there, and Stripe tells the app it worked.".split(separator: " ").map(String.init)

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Spacer(minLength: 40)
                Text("How does Stripe checkout work?").font(.body.weight(.medium)).foregroundStyle(Color.paper)
                    .padding(.horizontal, 15).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.ink))
            }
            .opacity(asked ? 1 : 0).offset(y: asked ? 0 : 16).scaleEffect(asked ? 1 : 0.9, anchor: .bottomTrailing)
            HStack(alignment: .top, spacing: 10) {
                ZStack(alignment: .bottomTrailing) {
                    Circle().fill(Color.card).frame(width: 40, height: 40).shadow(color: .black.opacity(0.1), radius: 6, y: 3)
                        .overlay(Image(systemName: "desktopcomputer").font(.system(size: 17, weight: .medium)))
                    Image(systemName: "sparkle").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 18, height: 18).background(Circle().fill(LinearGradient(colors: [Brand.orange, Brand.violet], startPoint: .topLeading, endPoint: .bottomTrailing)))
                        .offset(x: 4, y: 4)
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text("Your AI, on your Mac").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Group {
                        if words == 0 { TypingDots() }
                        else { Text(answer.prefix(words).joined(separator: " ")).font(.body) }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.card).shadow(color: .black.opacity(0.08), radius: 8, y: 3))
                }
            }
            .opacity(thinking ? 1 : 0).offset(y: thinking ? 0 : 12)
            HStack(spacing: 6) {
                ForEach(["Claude", "ChatGPT", "Gemini", "Copilot"], id: \.self) { n in
                    Text(n).font(.caption.weight(.semibold)).padding(.horizontal, 10).frame(height: 26)
                        .background(Capsule().fill(Color.ink.opacity(0.07)))
                }
            }
            .frame(maxWidth: .infinity).padding(.top, 2)
            .opacity(words >= answer.count ? 1 : 0)
        }
        .padding(.top, 22)
        .frame(width: 320, height: 300, alignment: .top)   // the answer grows downward; nothing above it moves
        .frame(width: 340, height: 300)
        .accessibilityElement().accessibilityLabel("A question answered by your own AI, on your Mac")
        .task(id: active) { await play() }
    }

    private func play() async {
        guard active else { return }
        if still { asked = true; thinking = true; words = answer.count; return }
        asked = false; thinking = false; words = 0
        try? await Task.sleep(for: .milliseconds(250))
        withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) { asked = true }
        Haptics.play("tap")
        try? await Task.sleep(for: .milliseconds(500))
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { thinking = true }
        try? await Task.sleep(for: .milliseconds(900))
        for i in 1...answer.count {
            guard !Task.isCancelled else { return }
            words = i   // no fade per word: the answer simply grows, as Bento's own answers do
            try? await Task.sleep(for: .milliseconds(70))
        }
    }
}

struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var still
    var body: some View {
        TimelineView(.animation(paused: still)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle().fill(Color.secondary).frame(width: 7, height: 7)
                        .opacity(still ? 0.6 : 0.3 + 0.7 * max(0, sin(t * 5 - Double(i) * 0.7)))
                }
            }
            .frame(height: 22)
        }
    }
}
