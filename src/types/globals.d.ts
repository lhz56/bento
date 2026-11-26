// What Bento adds to the browser's globals. Only for the type checker (npm run typecheck).

/** The bridge to the main process (electron/preload.cjs), or to the Mac over the network on a phone (remote.js). */
type BentoBridge = Record<string, any>;

interface Window {
  bento?: BentoBridge;
  /** on a phone or iPad, the connection to the Mac that window.bento goes through (remote.js) */
  bentoRemote?: any;
  /** live variables from a running Python program, for the stepping view */
  bentoLive?: any;
  /** scroll-to-top hook for the phone's tab bar */
  __bentoTop?: () => void;
  /** hooks for scripts/pregen-*.mjs, which drive the real app to pre-write shipped lessons */
  __openIdea?: (id: string) => void;
  __ask?: (q: string, o?: object) => void;
  __openLesson?: (id: string) => void;
  __missingStops?: () => any[];
  __genStop?: (id: string) => Promise<any>;
  /** iOS: the native app's message handlers */
  webkit?: any;
}

interface Navigator {
  /** iOS Safari: true when opened from the Home Screen */
  standalone?: boolean;
}

declare namespace WebAssembly {
  /** JS Promise Integration (Pyodide uses it to let Python await) */
  const Suspending: any;
}
