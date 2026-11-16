import SwiftUI
import UIKit
import VisionKit
import AVFoundation

/// Full-screen camera for the pairing code, the way the system's own scanners look: the picture dimmed around a
/// rounded window, white corners that turn green with a check when the code is read, and plain words on glass.
struct ScanScreen: View {
    let onLink: (PairLink) -> Void
    let onType: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var camera: Camera = .asking
    @State private var found = false
    @State private var bad = ""
    enum Camera { case asking, on, denied, none }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch camera {
            case .on: Scanner(onCode: read).ignoresSafeArea()
            case .denied, .none: EmptyView()
            case .asking:
                #if DEBUG
                if ProcessInfo.processInfo.environment["BENTO_SCREEN"] == "scan" { FakeCamera().ignoresSafeArea() }
                #endif
            }
            Viewfinder(found: found, dim: camera == .on || camera == .asking).ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44)
                    }
                    .glass(Circle()).accessibilityLabel("Close")
                }
                .padding(.horizontal, 16).padding(.top, 8)
                VStack(spacing: 6) {
                    Text(found ? "Got it" : "Scan the code on your Mac").font(.title2.bold())
                        .contentTransition(.opacity)
                    Text("In Bento on your Mac: **Settings → Your phone and iPad**").font(.subheadline).opacity(0.8)
                }
                .multilineTextAlignment(.center).padding(.horizontal, 32).padding(.top, 6)
                Spacer()
                if camera == .denied || camera == .none { blocked.padding(.horizontal, 28) ; Spacer() }
                if !bad.isEmpty && !found {
                    Label(bad, systemImage: "exclamationmark.triangle.fill").font(.subheadline.weight(.medium))
                        .padding(.horizontal, 16).padding(.vertical, 12).glass(Capsule()).padding(.horizontal, 20).padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                Button(action: onType) {
                    Label("Enter the code instead", systemImage: "keyboard").font(.headline).padding(.horizontal, 22).frame(height: 52)
                }
                .glass(Capsule()).padding(.bottom, 16)
            }
            .foregroundStyle(.white)
        }
        .preferredColorScheme(.dark)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: found)
        .animation(.easeOut(duration: 0.25), value: bad)
        .task { camera = await Self.access() }
    }

    private var blocked: some View {
        VStack(spacing: 14) {
            Image(systemName: camera == .denied ? "camera.fill" : "camera.metering.unknown").font(.system(size: 34))
            Text(camera == .denied ? "Bento can’t use the camera" : "This device can’t scan codes").font(.headline)
            Text(camera == .denied ? "Allow it in Settings to scan the code, or type the code instead." : "Type the code instead. It’s under the QR code on your Mac.")
                .font(.subheadline).opacity(0.8).multilineTextAlignment(.center)
            if camera == .denied {
                Button("Open Settings") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                    .font(.headline).padding(.horizontal, 20).frame(height: 44).glass(Capsule())
            }
        }
        .padding(24).glass(RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private func read(_ text: String) {
        guard !found else { return }
        if let l = PairLink(text) {
            found = true; Haptics.play("success")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { onLink(l) }
        } else if bad.isEmpty {
            bad = "That’s a different code. Use the one in Bento on your Mac."; Haptics.play("warn")
        }
    }

    static func access() async -> Camera {
        #if DEBUG
        if ProcessInfo.processInfo.environment["BENTO_SCREEN"] == "scan" { return .asking }
        #endif
        guard DataScannerViewController.isSupported else { return .none }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined: if !(await AVCaptureDevice.requestAccess(for: .video)) { return .denied }
        default: return .denied
        }
        return DataScannerViewController.isAvailable ? .on : .denied
    }
}

/// The dimmed picture with a rounded window in the middle, and its four corners
struct Viewfinder: View {
    let found: Bool
    var dim = true
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        GeometryReader { g in
            let side = min(g.size.width - 76, 300)
            let r = CGRect(x: (g.size.width - side) / 2, y: (g.size.height - side) / 2 - 24, width: side, height: side)
            ZStack {
                if dim {
                    Path { p in
                        p.addRect(CGRect(origin: .zero, size: g.size))
                        p.addRoundedRect(in: r, cornerSize: CGSize(width: 34, height: 34), style: .continuous)
                    }
                    .fill(Color.black.opacity(0.55), style: FillStyle(eoFill: true))
                    Corners().stroke(found ? Brand.mint : .white, style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
                        .frame(width: side, height: side)
                        .scaleEffect(found ? 0.92 : (breathe ? 1.025 : 1))
                        .position(x: r.midX, y: r.midY)
                    if found {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 72)).foregroundStyle(.white, Brand.mint)
                            .position(x: r.midX, y: r.midY).transition(.scale(scale: 0.4).combined(with: .opacity))
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear { if !still { withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { breathe = true } } }
    }
}

/// four rounded corner marks of a square
struct Corners: Shape {
    var radius: CGFloat = 34, length: CGFloat = 30
    func path(in b: CGRect) -> Path {
        var p = Path()
        let r = radius, l = length
        p.move(to: CGPoint(x: b.minX, y: b.minY + r + l)); p.addArc(tangent1End: CGPoint(x: b.minX, y: b.minY), tangent2End: CGPoint(x: b.maxX, y: b.minY), radius: r); p.addLine(to: CGPoint(x: b.minX + r + l, y: b.minY))
        p.move(to: CGPoint(x: b.maxX - r - l, y: b.minY)); p.addArc(tangent1End: CGPoint(x: b.maxX, y: b.minY), tangent2End: CGPoint(x: b.maxX, y: b.maxY), radius: r); p.addLine(to: CGPoint(x: b.maxX, y: b.minY + r + l))
        p.move(to: CGPoint(x: b.maxX, y: b.maxY - r - l)); p.addArc(tangent1End: CGPoint(x: b.maxX, y: b.maxY), tangent2End: CGPoint(x: b.minX, y: b.maxY), radius: r); p.addLine(to: CGPoint(x: b.maxX - r - l, y: b.maxY))
        p.move(to: CGPoint(x: b.minX + r + l, y: b.maxY)); p.addArc(tangent1End: CGPoint(x: b.minX, y: b.maxY), tangent2End: CGPoint(x: b.minX, y: b.minY), radius: r); p.addLine(to: CGPoint(x: b.minX, y: b.maxY - r - l))
        return p
    }
}

/// Live QR scanning with VisionKit; reports each code it sees once. Our own corners show where to aim, so VisionKit's
/// highlight and guidance are off.
struct Scanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    func makeCoordinator() -> C { C(onCode) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let v = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
                                          recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
                                          isPinchToZoomEnabled: true, isGuidanceEnabled: false, isHighlightingEnabled: false)
        v.delegate = context.coordinator
        try? v.startScanning()
        return v
    }
    func updateUIViewController(_ v: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ v: DataScannerViewController, coordinator: C) { v.stopScanning() }
    final class C: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void; var seen = Set<String>()
        init(_ f: @escaping (String) -> Void) { onCode = f }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for case .barcode(let b) in items { if let t = b.payloadStringValue, seen.insert(t).inserted { onCode(t) } }
        }
    }
}

#if DEBUG
import CoreImage.CIFilterBuiltins
/// simulator screenshots only (BENTO_SCREEN=scan): a Mac screen showing a code, where the camera would be
struct FakeCamera: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(white: 0.16), Color(white: 0.07)], startPoint: .top, endPoint: .bottom)
            RoundedRectangle(cornerRadius: 18).fill(Color(white: 0.93)).frame(width: 420, height: 300)
                .overlay { qr.map { Image(uiImage: $0).interpolation(.none).resizable().frame(width: 190, height: 190) } }
                .rotation3DEffect(.degrees(8), axis: (x: 1, y: -0.3, z: 0)).offset(y: -24).blur(radius: 0.6)
        }
    }
    private var qr: UIImage? {
        let f = CIFilter.qrCodeGenerator(); f.message = Data("http://my-mac.tail1234.ts.net:4917/#pair=ABCD2345".utf8)
        guard let o = f.outputImage, let cg = CIContext().createCGImage(o, from: o.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
#endif
