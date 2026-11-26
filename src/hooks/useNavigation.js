import { useEffect, useRef, useLayoutEffect } from 'react';
import { api } from '../bridge.js';
import { t } from '../i18n.js';
import { TOUCH } from '../platform.js';
import { isRoot, forgetScroll, restoreScroll, enter } from '../ui/Phone.jsx';
import { groupOf, lastTab, GROUPS } from '../ui/Side.jsx';
import { useTouch, STANDALONE } from '../ui/touch.js';

// Moving between screens. Each screen is a step in the page's history, so Back returns to the last one (Safari's
// swipe on a phone or iPad; ⌘[ and ⌘], the mouse's side buttons and the menu on the Mac). On a phone each page
// slides in and comes back at the spot you left it, and phoneTitle is the title in its top bar.
export default function useNavigation({
  atlasKey,
  atlases,
  current,
  currentId,
  drawer,
  phone,
  setAtlasKey,
  setCurrentId,
  setDrawer,
  setPane,
  setScrolled,
  setSiteKey,
  setView,
  setViewRaw,
  siteKey,
  view,
}) {
  useEffect(() => {
    setPane('story');
  }, [currentId]);
  useEffect(() => {
    setDrawer(false);
    setScrolled(false);
  }, [view, currentId, atlasKey, siteKey]);
  // each screen is a step in the page's history: Back returns to the last one (Safari's swipe back on a phone or iPad;
  // ⌘[ and ⌘], the mouse's side buttons and the menu on the Mac)
  useEffect(() => {
    const st = { bento: 1, view, currentId, atlasKey, siteKey };
    const cur = history.state;
    if (
      cur?.bento &&
      cur.view === view &&
      cur.currentId === currentId &&
      cur.atlasKey === atlasKey &&
      cur.siteKey === siteKey
    )
      return;
    if (!cur?.bento) history.replaceState({ ...st, depth: 0 }, '');
    else history.pushState({ ...st, depth: (cur.depth || 0) + 1 }, '');
  }, [view, currentId, atlasKey, siteKey]);
  // which way the next page arrives (Phone.jsx: enter): set by Back; Safari's own swipe back has animated already
  const navDir = useRef(null);
  useEffect(() => {
    const back = (e) => {
      const state = e.state;
      if (!state?.bento) return;
      if (navDir.current !== 'pop') navDir.current = STANDALONE ? 'pop' : 'none';
      setCurrentId(state.currentId ?? null);
      setAtlasKey(state.atlasKey ?? null);
      setSiteKey(state.siteKey ?? null);
      setViewRaw(state.view || 'home');
    };
    addEventListener('popstate', back);
    return () => removeEventListener('popstate', back);
  }, []);
  const goBack = () => {
    navDir.current = 'pop';
    if (api.remote && history.state?.depth > 0) history.back();
    else setView(lastTab(groupOf(view) || GROUPS[0]));
  };
  // each page on a phone: it slides in, and Back or a tab returns you to the spot you left it at
  const page = `${view}:${view === 'lesson' ? currentId : view === 'atlas' ? atlasKey : view === 'site' ? siteKey : ''}`;
  const shownPage = useRef({ page, root: isRoot(view) });
  useLayoutEffect(() => {
    const was = shownPage.current;
    if (was.page === page) return;
    const root = isRoot(view);
    shownPage.current = { page, root };
    const dir = navDir.current || (was.root && root ? 'tab' : root ? 'pop' : 'push');
    navDir.current = null;
    if (!phone) return;
    const main = document.getElementById('content');
    if (dir === 'push') forgetScroll(page);
    else restoreScroll(page, main);
    enter(main, dir);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useTouch(TOUCH, {
    phone,
    back: goBack,
    canBack: () => !isRoot(view),
    atRoot: () => isRoot(view),
    drawerOpen: () => drawer,
    openDrawer: () => setDrawer(true),
    closeDrawer: () => setDrawer(false),
    swipe: STANDALONE || sessionStorage.getItem('bento.swipe') === '1',
  });
  const phoneTitle =
    view === 'lesson'
      ? current?.title || current?.q || ''
      : view === 'atlas'
        ? (atlases[atlasKey]?.name || '').split('/').pop()
        : view === 'site'
          ? siteKey
          : view === 'compare'
            ? t('Compare')
            : t(groupOf(view)?.label || '');
  return { goBack, page, phoneTitle };
}
