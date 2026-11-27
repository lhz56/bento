// bento:// links, from the "Open in Bento" bookmark or another app: a GitHub repo or file, any website, or a question.
// The link listener is set up once, but always calls the newest handlers (askLesson, for one, changes with settings).
import { useEffect, useRef } from 'react';
import { api } from '../bridge.js';
import { parseBlob, parseRepo, parseSite } from '../ui/Explore.jsx';

export default function useDeepLinks({ askLesson, openRepo, openRepoAt, openSite }) {
  const handlers = useRef({ askLesson, openRepo, openRepoAt, openSite });
  handlers.current = { askLesson, openRepo, openRepoAt, openSite };
  useEffect(() => {
    const go = (url) => {
      const latest = handlers.current;
      let linkUrl;
      try {
        linkUrl = new URL(url);
      } catch {
        return;
      }
      const what = linkUrl.searchParams.get('u') || linkUrl.searchParams.get('url') || '';
      const question = linkUrl.searchParams.get('q');
      if (linkUrl.hostname === 'ask' && question)
        return latest.askLesson(question.slice(0, 500), {});
      const blob = parseBlob(what);
      if (blob) return latest.openRepoAt(blob.full, blob.path);
      const repo = parseRepo(what);
      if (repo) return latest.openRepo(repo);
      const site = parseSite(what);
      if (site) return latest.openSite(site);
    };
    api.pendingLink?.().then((u) => u && go(u));
    return api.onDeepLink?.(go);
  }, []);
}
