// "Another AI answered": when your AI couldn't and Bento asked your other one, a notice shows for a few seconds.
import { useState, useEffect } from 'react';
import { api } from '../bridge.js';

export default function useFallbackNotice() {
  const [fellBack, setFellBack] = useState(null); // { from, to }: another AI answered (Retry with another AI)
  useEffect(() => {
    let timer;
    const off = api.onFallback?.((x) => {
      setFellBack(x);
      clearTimeout(timer);
      timer = setTimeout(() => setFellBack(null), 7000);
    });
    return () => {
      off?.();
      clearTimeout(timer);
    };
  }, []);
  return { fellBack, setFellBack };
}
