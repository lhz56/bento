// How the screens reach the rest of Bento: window.bento, the main process on the Mac (electron/preload.cjs) or the
// Mac over the network on a phone (src/remote.js), and a stand-in (src/mock.js) in a plain browser.
import { mockBridge } from './mock.js';

/** The main process (electron/preload.cjs), the Mac on a phone, or the stand-in for the browser version. */
export const api = /** @type {BentoBridge} */ (window.bento || mockBridge);
