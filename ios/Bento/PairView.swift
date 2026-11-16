import SwiftUI
import VisionKit

/// First run, or adding a Mac: scan the code in Bento on the Mac (Settings → Your phone and iPad), or type its address
/// and code. Either way this only opens Bento's page with the one-time code; the page does the pairing itself.
struct PairView: View {
    let canCancel: Bool
    let onLink: (PairLink) -> Void
    let onCancel: () -> Void
    @State private var address = ""
    @State private var code = ""
    @State private var bad = ""
    private var canScan: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }
    private var device: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Image("Mark").resizable().frame(width: 44, height: 44)
                    Spacer()
                    if canCancel { Button("Cancel", action: onCancel) }
                }
                Text("Bento, on this \(device)").font(.system(size: 32, weight: .semibold))
                Text("Your Mac does the work, with the AI you already have. Pair this \(device) once, and use it at home or anywhere with Tailscale.")
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 8) {
                    step(1, "On your Mac, open **Bento → Settings → Your phone and iPad**, and turn it on.")
                    step(2, canScan ? "Point this camera at the code on the Mac’s screen." : "Type the address and code shown on the Mac.")
                }
                if canScan {
                    Scanner { text in
                        if let l = PairLink(text) { Haptics.play("select"); onLink(l) }
                        else { bad = "That isn’t a Bento pairing code. Use the code in Settings → Your phone and iPad on your Mac." }
                    }
                    .frame(height: 300).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                DisclosureGroup("Type it instead") {
                    VStack(spacing: 10) {
                        TextField("Address, e.g. my-mac.tail1234.ts.net", text: $address)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            .padding(12).background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
                        HStack {
                            TextField("Code, e.g. ABCD-EFGH", text: $code)
                                .textInputAutocapitalization(.characters).autocorrectionDisabled()
                                .padding(12).background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
                            Button("Pair", action: typed).buttonStyle(.borderedProminent).disabled(address.isEmpty || code.isEmpty)
                        }
                    }.padding(.top, 8)
                }
                if !bad.isEmpty { Text(bad).font(.callout).foregroundStyle(.red) }
            }
            .padding(28).frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
    }

    /// "host", "host:port" or a pasted "http://host:port/#pair=…" link, plus the code → the same link the QR code holds
    private func typed() {
        var a = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if let l = PairLink(a) { return onLink(l) }
        a = a.replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "https://", with: "")
        a = String(a.split(separator: "/").first ?? "")
        if !a.contains(":") { a += ":4917" }
        let c = code.uppercased().filter { $0.isLetter || $0.isNumber }
        if let l = PairLink("http://\(a)/#pair=\(c)"), c.count == 8 { onLink(l) }
        else { bad = "Check the address and the 8-character code shown on your Mac." }
    }

    private func step(_ n: Int, _ s: LocalizedStringKey) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(n)").font(.caption.bold()).frame(width: 22, height: 22).background(Circle().stroke(.secondary.opacity(0.4)))
            Text(s)
        }
    }
}

/// Live QR scanning with VisionKit; reports each code it sees once.
struct Scanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    func makeCoordinator() -> C { C(onCode) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let v = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .fast, isHighlightingEnabled: true)
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
