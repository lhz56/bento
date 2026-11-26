'use strict';
/* global window, document, parent -- the reporter below runs in a lesson's page, not in Node */
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

// the tag added to every lesson page the app serves (play:// in electron/ipc/files.cjs)
const PLAY_SHIM = `<script>(${playPageReporter.toString()})();</script>`;

module.exports = { PLAY_SHIM };
