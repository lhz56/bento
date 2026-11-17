import SwiftUI
import WebKit
import UIKit

/// Bento's page from the Mac, edge to edge: the same app as on the Mac, so every Bento update there shows up here too.
/// The shell only adds what a web page can't do well: remembering Macs, scanning the code, and opening links outside.
struct WebShell: UIViewRepresentable {
    let url: URL
    var onLoad: () -> Void = {}
    var onFail: (String) -> Void = { _ in }
    /// what the page asks of the app: "macs" (show Your Macs), "unpaired" (the Mac forgot this device: connect again)
    var onAsk: (String) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        // persistent storage: the page keeps this device's key there, like Safari does (never synced, never in iCloud)
        cfg.websiteDataStore = .default()
        cfg.allowsInlineMediaPlayback = true
        cfg.defaultWebpagePreferences.preferredContentMode = .mobile
        // "BentoApp" tells the page it's in the app (no "Add to Home Screen" tip; edge swipes on, as in a Home Screen copy)
        cfg.applicationNameForUserAgent = "BentoApp/1.0 Mobile/15E148 Safari/604.1"
        // the page's line to the app (src/ui/touch.js: native()); a weak hop, so the web view never keeps itself alive
        cfg.userContentController.add(WeakHandler(context.coordinator), name: "bento")
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.isOpaque = false
        wv.backgroundColor = UIColor(named: "Paper")
        wv.scrollView.backgroundColor = UIColor(named: "Paper")
        wv.scrollView.contentInsetAdjustmentBehavior = .never // the page handles safe areas itself (viewport-fit=cover)
        wv.allowsBackForwardNavigationGestures = false
        wv.allowsLinkPreview = false
        wv.navigationDelegate = context.coordinator
        wv.uiDelegate = context.coordinator
        // a tap on the status bar: the page's own scrolling parts go back to their top (the web view itself never scrolls)
        wv.scrollView.delegate = context.coordinator
        #if DEBUG
        if #available(iOS 16.4, *) { wv.isInspectable = true }
        // simulator tests: SIMCTL_CHILD_BENTO_PILOT=<a .js file> drives the page (taps, scrolls) and asks for pictures
        if let f = ProcessInfo.processInfo.environment["BENTO_PILOT"], let js = try? String(contentsOfFile: f, encoding: .utf8) {
            wv.configuration.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        #endif
        wv.load(URLRequest(url: url))
        context.coordinator.loaded = url
        return wv
    }

    static func dismantleUIView(_ wv: WKWebView, coordinator: Coordinator) {
        wv.configuration.userContentController.removeScriptMessageHandler(forName: "bento")
    }

    func updateUIView(_ wv: WKWebView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.loaded != url { context.coordinator.loaded = url; wv.load(URLRequest(url: url)) }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
        var parent: WebShell
        var loaded: URL?
        init(_ p: WebShell) { parent = p }

        /// The status bar was tapped. What's on screen scrolls inside the page, so the page takes it (touch.js: __bentoTop).
        func scrollViewShouldScrollToTop(_ sv: UIScrollView) -> Bool {
            (sv.superview as? WKWebView)?.evaluateJavaScript("window.__bentoTop && window.__bentoTop()")
            return false
        }

        /// Only Bento's own page (the Mac it came from) can ask: a haptic tick, the Macs sheet, connecting again.
        func userContentController(_ uc: WKUserContentController, didReceive m: WKScriptMessage) {
            guard m.frameInfo.isMainFrame, let u = m.frameInfo.request.url, u.host == loaded?.host, u.port == loaded?.port,
                  let body = m.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "haptic":
                let kind = body["kind"] as? String ?? "select"
                Haptics.play(["light": "tap", "success": "success", "warn": "warn"][kind] ?? "select")
            case "macs", "unpaired": parent.onAsk(type)
            #if DEBUG
            case "shot": print("BENTO_SHOT \(body["name"] as? String ?? "")"); fflush(stdout)
            #endif
            default: break
            }
        }

        /// Bento's own page (this Mac, this port) stays here. Frames inside it (a lesson's web page on the next port)
        /// are the page's business and still under its Content-Security-Policy. Any other page the app itself would
        /// open (an article, GitHub, mail) goes to Safari or its own app instead.
        func webView(_ wv: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let u = a.request.url else { return decisionHandler(.cancel) }
            if a.targetFrame.map({ !$0.isMainFrame }) == true { return decisionHandler(.allow) }
            if ["about", "blob", "data"].contains(u.scheme ?? "") { return decisionHandler(.allow) }
            if u.host == loaded?.host, u.port == loaded?.port, u.scheme == loaded?.scheme { return decisionHandler(.allow) }
            if ["http", "https", "mailto"].contains(u.scheme ?? "") { UIApplication.shared.open(u) }
            decisionHandler(.cancel)
        }
        // window.open (Bento's "open in browser"): Safari, never a second web view inside the app
        func webView(_ wv: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let u = a.request.url, ["http", "https", "mailto"].contains(u.scheme ?? "") { UIApplication.shared.open(u) }
            return nil
        }
        // the page has loaded: give it a moment to draw, then the cover over it can go
        func webView(_ wv: WKWebView, didFinish n: WKNavigation!) {
            let done = parent.onLoad
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { done() }
        }
        func webView(_ wv: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
            if (e as NSError).code != NSURLErrorCancelled { parent.onFail(e.localizedDescription) }
        }
        // iOS can end the page's process in the background; bring it straight back
        func webViewWebContentProcessDidTerminate(_ wv: WKWebView) { wv.reload() }
        // Bento's page never needs the camera or microphone
        func webView(_ wv: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(.deny)
        }
        func webView(_ wv: WKWebView, runJavaScriptAlertPanelWithMessage msg: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
            present(msg, [("OK", .default, { completionHandler() })])
        }
        func webView(_ wv: WKWebView, runJavaScriptConfirmPanelWithMessage msg: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            present(msg, [("Cancel", .cancel, { completionHandler(false) }), ("OK", .default, { completionHandler(true) })])
        }
        private func present(_ msg: String, _ actions: [(String, UIAlertAction.Style, () -> Void)]) {
            let a = UIAlertController(title: nil, message: msg, preferredStyle: .alert)
            for (t, s, f) in actions { a.addAction(UIAlertAction(title: t, style: s) { _ in f() }) }
            let root = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }.first
            var top = root; while let p = top?.presentedViewController { top = p }
            if let top { top.present(a, animated: true) } else { actions.first?.2() }
        }
    }
}

/// WKUserContentController holds its handlers strongly; this keeps the coordinator (and the web view) free to go.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ uc: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(uc, didReceive: m) }
}
