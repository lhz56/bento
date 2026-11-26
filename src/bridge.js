import { mockBridge } from './mock.js';

/** The main process (electron/preload.cjs), the Mac on a phone, or the stand-in for the browser version. */
export const api = /** @type {BentoBridge} */ (window.bento || mockBridge);
