import { useState, useRef } from 'react';
import { haptic } from '../touch.js';

// The dividers inside the code panel: between the code and what it does (split), dragged with a mouse or a finger.
export default function useDividers() {
  const [split, setSplit] = useState(0.56);
  // ---- drag the stage divider
  const deskRef = useRef(null);
  const dragDiv = (e) => {
    e.preventDefault();
    const rect = deskRef.current.getBoundingClientRect();
    const mv = (ev) =>
      setSplit(Math.min(0.82, Math.max(0.22, (ev.clientY - rect.top) / rect.height)));
    const up = () => {
      removeEventListener('mousemove', mv);
      removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', mv);
    addEventListener('mouseup', up);
  };
  // (with a finger: the bar follows it, and settles with a tick at the three sizes a phone wants: more code, even, more output)
  const touchDiv = (e) => {
    if (e.touches.length !== 1) return;
    const el = e.currentTarget;
    const rect = deskRef.current.getBoundingClientRect();
    let y = e.touches[0].clientY;
    el.classList.add('held');
    haptic('light');
    const mv = (ev) => {
      ev.preventDefault();
      y = ev.touches[0].clientY;
      setSplit(Math.min(0.82, Math.max(0.22, (y - rect.top) / rect.height)));
    };
    const up = () => {
      el.classList.remove('held');
      el.removeEventListener('touchmove', mv);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
      const f = (y - rect.top) / rect.height;
      const snap = [0.3, 0.56, 0.78].reduce((a, c) => (Math.abs(c - f) < Math.abs(a - f) ? c : a));
      deskRef.current.classList.add('settling');
      setSplit(snap);
      haptic('select');
      setTimeout(() => deskRef.current?.classList.remove('settling'), 420);
    };
    el.addEventListener('touchmove', mv, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
  };
  return { deskRef, dragDiv, split, touchDiv };
}
