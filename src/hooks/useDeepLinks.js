import { useEffect } from 'react';
import { api } from '../bridge.js';
import { parseBlob, parseRepo, parseSite } from '../ui/Explore.jsx';

// bento:// links, from the "Open in Bento" bookmark or another app: a GitHub repo or file, any website, or a question.
export default function useDeepLinks({ askLesson, openRepo, openRepoAt, openSite }) {
  useEffect(() => {
    const go = (url) => {
      let linkUrl;
      try {
        linkUrl = new URL(url);
      } catch {
        return;
      }
      const what = linkUrl.searchParams.get('u') || linkUrl.searchParams.get('url') || '';
      const q = linkUrl.searchParams.get('q');
      if (linkUrl.hostname === 'ask' && q) return askLesson(q.slice(0, 500), {});
      const blob = parseBlob(what);
      if (blob) return openRepoAt(blob.full, blob.path);
      const repo = parseRepo(what);
      if (repo) return openRepo(repo);
      const site = parseSite(what);
      if (site) return openSite(site);
    };
    api.pendingLink?.().then((u) => u && go(u));
    return api.onDeepLink?.(go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {};
}
