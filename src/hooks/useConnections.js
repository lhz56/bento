import { useState, useRef, useEffect } from 'react';
import { api } from '../bridge.js';
import { pyState, warmPython } from '../runtime/runner.js';

// What's connected: the AI tools this Mac has (and whether each is signed in), your GitHub account, and
// whether Python has finished loading in the background.
export default function useConnections() {
  const [providers, setProviders] = useState(null);
  const providersRef = useRef(null);
  providersRef.current = providers;
  const [user, setUser] = useState(null);
  const [pyReady, setPyReady] = useState(pyState.ready);
  useEffect(() => {
    api
      .providers()
      .then((found) => {
        setProviders(found);
        if (found.gh)
          api
            .ghMe()
            .then(setUser)
            .catch(() => {});
      })
      .catch(() => setProviders({ scanFailed: true }));
    const onPython = (r) => setPyReady(r);
    pyState.listeners.add(onPython);
    warmPython();
    return () => {
      pyState.listeners.delete(onPython);
    };
  }, []);
  return { providers, providersRef, pyReady, setProviders, user };
}
