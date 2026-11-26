// The scripts added to a lesson's web page in the browser version (web.js). The Mac app adds the same reporter
// (electron/play-shim.cjs); keep the two in step.

// Runs inside a lesson's web page (its own origin or a sandboxed frame), never in Bento's: it reports the page's
// console output and errors to Bento, and outlines the element under the pointer so Bento can light up its line.
// Written in ES5 on purpose: it is turned into a string with toString() and runs in whatever page the lesson made.
function playPageReporter() {
  var send = function (kind, args) {
    try {
      var text = Array.prototype.map
        .call(args, function (x) {
          try {
            return typeof x === 'string' ? x : JSON.stringify(x);
          } catch (e) {
            return String(x);
          }
        })
        .join(' ');
      parent.postMessage({ bentoPlay: 1, k: kind, s: text }, '*');
    } catch (e) {}
  };
  ['log', 'info', 'warn', 'error'].forEach(function (kind) {
    var original = console[kind];
    console[kind] = function () {
      send(kind, arguments);
      original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    send('error', [e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]);
  });
  /** @type {(HTMLElement & { __o?: string }) | null} */
  var last = null;
  var tellLine = function (line) {
    try {
      parent.postMessage({ bentoPlay: 1, k: 'hover', line: line }, '*');
    } catch (x) {}
  };
  document.addEventListener(
    'mouseover',
    function (e) {
      var target = /** @type {Element} */ (e.target);
      var el = /** @type {HTMLElement & { __o?: string }} */ (
        target.closest && target.closest('[data-bl]')
      );
      if (el === last) return;
      if (last) last.style.outline = last.__o || '';
      last = el;
      if (el) {
        el.__o = el.style.outline;
        el.style.outline = '2px solid rgba(124,92,255,.7)';
        tellLine(+el.getAttribute('data-bl'));
      }
    },
    true,
  );
  document.addEventListener('mouseleave', function () {
    if (last) {
      last.style.outline = last.__o || '';
      last = null;
    }
    tellLine(0);
  });
}

// A sandboxed frame has no localStorage; lesson pages that use it get an in-memory stand-in.
function memoryStorage() {
  try {
    localStorage.length;
  } catch (e) {
    var items = {};
    var stand = {
      getItem: function (k) {
        return k in items ? items[k] : null;
      },
      setItem: function (k, v) {
        items[k] = String(v);
      },
      removeItem: function (k) {
        delete items[k];
      },
      clear: function () {
        items = {};
      },
      key: function (i) {
        return Object.keys(items)[i] || null;
      },
      get length() {
        return Object.keys(items).length;
      },
    };
    try {
      Object.defineProperty(window, 'localStorage', { value: stand });
    } catch (x) {}
  }
}

const asScript = (fn) => `<script>(${fn.toString()})();</script>`;
export const PLAY_SHIM = asScript(memoryStorage) + asScript(playPageReporter);
