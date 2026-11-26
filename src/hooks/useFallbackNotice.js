import { useState, useEffect } from 'react';
import { api } from '../bridge.js';

// "Another AI answered": when your AI couldn't and Bento asked your other one, a notice shows for a few seconds.
export default function useFallbackNotice() {
  const [fellBack, setFellBack] = useState(null); // { from, to }: another AI answered (Retry with another AI)
  useEffect(() => {
    let t;
    const off = api.onFallback?.((x) => {
      setFellBack(x);
      clearTimeout(t);
      t = setTimeout(() => setFellBack(null), 7000);
    });
    return () => {
      off?.();
      clearTimeout(t);
    };
  }, []);
  return { fellBack, setFellBack };
}
